import { isRetryableError, getRetryDelay, createErrorContext, reportError } from '../utils/errorHandling';

// API Configuration
const DEFAULT_BACKEND_FALLBACK = 'http://localhost:3001';

const resolveBaseUrl = (): string => {
    const raw = (import.meta.env.VITE_API_URL as string) || '';
    const trimmed = raw.trim();
    if (trimmed) {
        return trimmed.replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined') {
        return '';
    }
    return DEFAULT_BACKEND_FALLBACK;
};

const API_CONFIG = {
    baseUrl: resolveBaseUrl(),
    timeout: 30000,
    retries: 3,
    retryDelay: 1000,
};

// Custom API Error class
export class ApiError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code: string = 'INTERNAL_ERROR',
        public details?: any
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

// Request/Response interceptor types
interface RequestInterceptor {
    onRequest?: (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
    onRequestError?: (error: Error) => Promise<Error>;
}

interface ResponseInterceptor {
    onResponse?: <T>(response: T) => T | Promise<T>;
    onResponseError?: (error: ApiError) => Promise<ApiError>;
}

interface RequestConfig {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    timeout: number;
}

// Loading state management
type LoadingState = {
    [key: string]: boolean;
};

class ApiClient {
    private baseUrl: string;
    private timeout: number;
    private retries: number;

    private requestInterceptors: RequestInterceptor[] = [];
    private responseInterceptors: ResponseInterceptor[] = [];
    private loadingStates: LoadingState = {};
    private loadingCallbacks: ((loading: LoadingState) => void)[] = [];

    constructor(config = API_CONFIG) {
        this.baseUrl = config.baseUrl;
        this.timeout = config.timeout;
        this.retries = config.retries;

        // Add default error handling interceptor
        this.addResponseInterceptor({
            onResponseError: async (error: ApiError) => {
                // Report error with context
                const context = createErrorContext('ApiClient', 'HTTP_REQUEST');
                reportError(error, context);
                return Promise.reject(error);
            }
        });
    }

    // Interceptor management
    addRequestInterceptor(interceptor: RequestInterceptor) {
        this.requestInterceptors.push(interceptor);
    }

    addResponseInterceptor(interceptor: ResponseInterceptor) {
        this.responseInterceptors.push(interceptor);
    }

    // Loading state management
    onLoadingChange(callback: (loading: LoadingState) => void) {
        this.loadingCallbacks.push(callback);
    }

    private setLoading(key: string, loading: boolean) {
        this.loadingStates[key] = loading;
        this.loadingCallbacks.forEach(callback => callback({ ...this.loadingStates }));
    }

    private getLoadingKey(method: string, url: string): string {
        return `${method.toUpperCase()}_${url}`;
    }

    // Core HTTP method with retry logic
    private async makeRequest<T>(
        method: string,
        endpoint: string,
        data?: any,
        options: Partial<RequestConfig> = {}
    ): Promise<T> {
        let url = `${this.baseUrl}${endpoint}`;
        const loadingKey = this.getLoadingKey(method, endpoint);
        let fallbackTried = false;

        const upperMethod = method.toUpperCase();
        const defaultHeaders: Record<string, string> = { ...options.headers };

        let config: RequestConfig = {
            method: upperMethod,
            url,
            headers: defaultHeaders,
            timeout: options.timeout || this.timeout,
        };

        if (data !== undefined) {
            config.body = JSON.stringify(data);
            config.headers = { 'Content-Type': 'application/json', ...config.headers };
        }

        for (const interceptor of this.requestInterceptors) {
            if (interceptor.onRequest) {
                try {
                    config = await interceptor.onRequest(config);
                } catch (error) {
                    if (interceptor.onRequestError) {
                        await interceptor.onRequestError(error as Error);
                    }
                    throw error;
                }
            }
        }

        this.setLoading(loadingKey, true);

        let lastError: ApiError;

        for (let attempt = 0; attempt <= this.retries; attempt++) {
            let controller: AbortController | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;

            try {
                controller = new AbortController();
                timeoutId = setTimeout(() => {
                    if (controller) {
                        controller.abort();
                    }
                }, config.timeout);

                const response = await fetch(config.url, {
                    method: config.method,
                    headers: config.headers,
                    body: config.body,
                    signal: controller.signal,
                    keepalive: upperMethod === 'GET' ? true : false,
                });

                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new ApiError(
                        errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
                        response.status,
                        errorData.error?.code || 'HTTP_ERROR'
                    );
                }

                let result = await response.json();

                for (const interceptor of this.responseInterceptors) {
                    if (interceptor.onResponse) {
                        result = await interceptor.onResponse(result);
                    }
                }

                this.setLoading(loadingKey, false);
                return result;

            } catch (error) {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }

                const abortError = error instanceof DOMException && error.name === 'AbortError';
                const abortedMessage = error instanceof Error && error.message === 'signal is aborted without reason';
                if (abortError || abortedMessage) {
                    lastError = new ApiError('Request timed out', 408, 'REQUEST_TIMEOUT');
                } else {
                    lastError = error instanceof ApiError
                        ? error
                        : new ApiError(
                            error instanceof Error ? error.message : 'Network error',
                            0,
                            'NETWORK_ERROR'
                        );
                }

                const networkLike = lastError.code === 'NETWORK_ERROR' || lastError.code === 'REQUEST_TIMEOUT';
                const isAbsolute = /^https?:\/\//i.test(this.baseUrl);
                if (networkLike && !fallbackTried && isAbsolute) {
                    fallbackTried = true;
                    const sameOrigin = (typeof window !== 'undefined' ? window.location.origin : '') || '';
                    const fallbackBase = sameOrigin || DEFAULT_BACKEND_FALLBACK;
                    url = `${fallbackBase}${endpoint}`;
                    config.url = url;
                    continue;
                }

                for (const interceptor of this.responseInterceptors) {
                    if (interceptor.onResponseError) {
                        lastError = await interceptor.onResponseError(lastError);
                    }
                }

                if (!isRetryableError(lastError)) {
                    break;
                }

                if (attempt === this.retries) {
                    break;
                }

                const delay = getRetryDelay(lastError, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            } finally {
                if (timeoutId !== null) {
                    clearTimeout(timeoutId);
                }
            }
        }

        this.setLoading(loadingKey, false);
        throw lastError!;
    }

    // HTTP methods
    async get<T>(endpoint: string, options?: Partial<RequestConfig>): Promise<T> {
        return this.makeRequest<T>('GET', endpoint, undefined, options);
    }

    async post<T>(endpoint: string, data?: any, options?: Partial<RequestConfig>): Promise<T> {
        return this.makeRequest<T>('POST', endpoint, data, options);
    }

    async put<T>(endpoint: string, data?: any, options?: Partial<RequestConfig>): Promise<T> {
        return this.makeRequest<T>('PUT', endpoint, data, options);
    }

    async delete<T>(endpoint: string, options?: Partial<RequestConfig>): Promise<T> {
        return this.makeRequest<T>('DELETE', endpoint, undefined, options);
    }

    // Utility methods
    isLoading(method?: string, endpoint?: string): boolean {
        if (method && endpoint) {
            const key = this.getLoadingKey(method, endpoint);
            return this.loadingStates[key] || false;
        }
        return Object.values(this.loadingStates).some(loading => loading);
    }

    getLoadingStates(): LoadingState {
        return { ...this.loadingStates };
    }
}

// Create and export singleton instance
export const apiClient = new ApiClient();

// Export types for external use
export type { RequestInterceptor, ResponseInterceptor, RequestConfig };
