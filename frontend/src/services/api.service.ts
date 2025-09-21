import {
  createErrorContext,
  getRetryDelay,
  isRetryableError,
  reportError,
} from "../utils/errorHandling";
import { SlotItem } from "../utils/slotClassifier";

// API Configuration
const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_URL || "http://localhost:3001",
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

// Custom API Error class
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = "INTERNAL_ERROR",
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
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
        const context = createErrorContext("ApiClient", "HTTP_REQUEST");
        reportError(error, context);
        return Promise.reject(error);
      },
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
    this.loadingCallbacks.forEach((callback) =>
      callback({ ...this.loadingStates })
    );
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

    let config: RequestConfig = {
      method: method.toUpperCase(),
      url,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      timeout: options.timeout || this.timeout,
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    // Apply request interceptors
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
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);

        const response = await fetch(config.url, {
          method: config.method,
          headers: config.headers,
          body: config.body,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new ApiError(
            errorData.error?.message ||
              `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            errorData.error?.code || "HTTP_ERROR"
          );
        }

        let result = await response.json();

        // Apply response interceptors
        for (const interceptor of this.responseInterceptors) {
          if (interceptor.onResponse) {
            result = await interceptor.onResponse(result);
          }
        }

        this.setLoading(loadingKey, false);
        return result;
      } catch (error) {
        lastError =
          error instanceof ApiError
            ? error
            : new ApiError(
                error instanceof Error ? error.message : "Network error",
                0,
                "NETWORK_ERROR"
              );

        // One-time DNS/NETWORK fallback to same-origin or localhost:3001
        const isNetworkError = lastError.code === "NETWORK_ERROR";
        const isAbsolute = /^https?:\/\//i.test(this.baseUrl);
        if (isNetworkError && !fallbackTried && isAbsolute) {
          fallbackTried = true;
          const sameOrigin =
            (typeof window !== "undefined" ? window.location.origin : "") || "";
          const fallbackBase = sameOrigin || "http://localhost:3001";
          url = `${fallbackBase}${endpoint}`;
          config.url = url;
          // immediate retry with fallback URL
          continue;
        }

        // Apply response error interceptors
        for (const interceptor of this.responseInterceptors) {
          if (interceptor.onResponseError) {
            lastError = await interceptor.onResponseError(lastError);
          }
        }

        // Don't retry if it's not a retryable error
        if (!isRetryableError(lastError)) {
          break;
        }

        // Don't retry on the last attempt
        if (attempt === this.retries) {
          break;
        }

        // Wait before retrying with smart delay calculation
        const delay = getRetryDelay(lastError, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.setLoading(loadingKey, false);
    throw lastError!;
  }

  // HTTP methods
  async get<T>(endpoint: string, options?: Partial<RequestConfig>): Promise<T> {
    return this.makeRequest<T>("GET", endpoint, undefined, options);
  }

  async post<T>(
    endpoint: string,
    data?: any,
    options?: Partial<RequestConfig>
  ): Promise<T> {
    return this.makeRequest<T>("POST", endpoint, data, options);
  }

  async put<T>(
    endpoint: string,
    data?: any,
    options?: Partial<RequestConfig>
  ): Promise<T> {
    return this.makeRequest<T>("PUT", endpoint, data, options);
  }

  async delete<T>(
    endpoint: string,
    options?: Partial<RequestConfig>
  ): Promise<T> {
    return this.makeRequest<T>("DELETE", endpoint, undefined, options);
  }

  // Utility methods
  isLoading(method?: string, endpoint?: string): boolean {
    if (method && endpoint) {
      const key = this.getLoadingKey(method, endpoint);
      return this.loadingStates[key] || false;
    }
    return Object.values(this.loadingStates).some((loading) => loading);
  }

  getLoadingStates(): LoadingState {
    return { ...this.loadingStates };
  }

  // 슬롯별 추천 API들
  async getInternalRecommendations(
    slotName: string,
    item: SlotItem
  ): Promise<{
    slot_name: string;
    recommendations: any[];
    source: string;
    position: number;
  }> {
    return this.post(`/api/recommend/internal/${slotName}`, item);
  }

  async getExternalRecommendations(
    slotName: string,
    item: SlotItem
  ): Promise<{
    slot_name: string;
    recommendations: any[];
    source: string;
    description: string;
    embedding_length: number;
  }> {
    return this.post(`/api/recommend/external/${slotName}`, { image: item });
  }

  async recommendByPositions(request: {
    positions: number[];
    items: any[];
    min_price?: number;
    max_price?: number;
    exclude_tags?: string[];
    final_k?: number;
    use_llm_rerank?: boolean;
  }): Promise<any> {
    return this.post("/api/recommend/by-positions", request);
  }

  // 비동기 병렬 추천 처리
  async getRecommendationsForSlots(
    clothingSlots: Record<string, SlotItem | null>
  ): Promise<{
    internalRecommendations: Record<string, any[]>;
    externalRecommendations: Record<string, any[]>;
  }> {
    const { internalSlots, externalSlots } =
      this.categorizeSlots(clothingSlots);

    // 내부 슬롯 추천들 (병렬)
    const internalPromises = Object.entries(internalSlots).map(
      ([slotName, item]) =>
        this.getInternalRecommendations(slotName, item).catch((error) => {
          console.error(
            `Internal recommendation failed for ${slotName}:`,
            error
          );
          return {
            slot_name: slotName,
            recommendations: [],
            source: "internal",
            position: 0,
          };
        })
    );

    // 외부 슬롯 추천들 (병렬)
    const externalPromises = Object.entries(externalSlots).map(
      ([slotName, item]) =>
        this.getExternalRecommendations(slotName, item).catch((error) => {
          console.error(
            `External recommendation failed for ${slotName}:`,
            error
          );
          return {
            slot_name: slotName,
            recommendations: [],
            source: "external",
            description: "",
            embedding_length: 0,
          };
        })
    );

    // 모든 추천을 병렬로 실행
    const [internalResults, externalResults] = await Promise.all([
      Promise.all(internalPromises),
      Promise.all(externalPromises),
    ]);

    // 결과를 슬롯별로 정리
    const internalRecommendations: Record<string, any[]> = {};
    const externalRecommendations: Record<string, any[]> = {};

    internalResults.forEach((result) => {
      internalRecommendations[result.slot_name] = result.recommendations;
    });

    externalResults.forEach((result) => {
      externalRecommendations[result.slot_name] = result.recommendations;
    });

    return {
      internalRecommendations,
      externalRecommendations,
    };
  }

  // 슬롯 분류 헬퍼 함수
  private categorizeSlots(clothingSlots: Record<string, SlotItem | null>): {
    internalSlots: Record<string, SlotItem>;
    externalSlots: Record<string, SlotItem>;
  } {
    const internalSlots: Record<string, SlotItem> = {};
    const externalSlots: Record<string, SlotItem> = {};

    for (const [slotName, item] of Object.entries(clothingSlots)) {
      if (!item) continue;

      if (item.isExternal || (item.base64 && !item.pos && !item.id)) {
        externalSlots[slotName] = item;
      } else if (item.pos !== undefined || (item.id && !item.isExternal)) {
        internalSlots[slotName] = item;
      }
    }

    return { internalSlots, externalSlots };
  }
}

// Create and export singleton instance
export const apiClient = new ApiClient();

// Export types for external use
export type { RequestConfig, RequestInterceptor, ResponseInterceptor };
