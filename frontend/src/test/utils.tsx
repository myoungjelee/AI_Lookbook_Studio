// Test utilities for React components and hooks
import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Custom render function that includes providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="test-wrapper">
        {children}
    </div>
);

const customRender = (
    ui: ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

// Re-export everything
export * from '@testing-library/react';
export { customRender as render };

// Setup user event
export const user = userEvent.setup();

// Mock file utilities
export const createMockFile = (name = 'test.jpg', type = 'image/jpeg', size = 1024) => {
    const file = new File(['test content'], name, { type });
    Object.defineProperty(file, 'size', { value: size });
    return file;
};

export const createMockFileReader = (result: string) => {
    const mockFileReader = {
        readAsDataURL: vi.fn(),
        result,
        onload: null as ((event: any) => void) | null,
        onerror: null as ((event: any) => void) | null,
    };

    mockFileReader.readAsDataURL.mockImplementation(() => {
        setTimeout(() => {
            if (mockFileReader.onload) {
                mockFileReader.onload({ target: mockFileReader });
            }
        }, 0);
    });

    return mockFileReader;
};

// Mock API responses
export function mockApiResponse<T>(data: T, delay = 0): Promise<T> {
    return new Promise((resolve) => {
        setTimeout(() => resolve(data), delay);
    });
}

export function mockApiError(message = 'API Error', status = 500, delay = 0): Promise<never> {
    return new Promise((_, reject) => {
        setTimeout(() => {
            const error = new Error(message) as any;
            error.status = status;
            reject(error);
        }, delay);
    });
}

// Mock image data
export const mockImageData = {
    base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=',
    mimeType: 'image/jpeg' as const,
    file: createMockFile(),
};

// Mock virtual try-on data
export const mockVirtualTryOnData = {
    person: mockImageData,
    clothingItems: {
        top: mockImageData,
        pants: null,
        shoes: null,
    },
    generatedImage: 'data:image/jpeg;base64,generated-image-data',
};

// Mock recommendation data
export const mockRecommendations = {
    top: [
        {
            id: 'top-1',
            title: 'Casual T-Shirt',
            price: 29.99,
            imageUrl: 'https://example.com/top1.jpg',
            tags: ['casual', 'cotton'],
            category: 'top' as const,
        },
        {
            id: 'top-2',
            title: 'Formal Shirt',
            price: 59.99,
            imageUrl: 'https://example.com/top2.jpg',
            tags: ['formal', 'cotton'],
            category: 'top' as const,
        },
    ],
    pants: [
        {
            id: 'pants-1',
            title: 'Casual Jeans',
            price: 79.99,
            imageUrl: 'https://example.com/pants1.jpg',
            tags: ['casual', 'denim'],
            category: 'pants' as const,
        },
    ],
    shoes: [],
    accessories: [],
};

// Wait for async operations
export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Mock intersection observer for components that use it
export const mockIntersectionObserver = () => {
    const mock = vi.fn();
    mock.mockReturnValue({
        observe: () => null,
        unobserve: () => null,
        disconnect: () => null,
    });
    window.IntersectionObserver = mock as unknown as typeof window.IntersectionObserver;
    window.IntersectionObserverEntry = vi.fn() as unknown as typeof IntersectionObserverEntry;
};

// Mock resize observer for components that use it
export const mockResizeObserver = () => {
    const mock = vi.fn();
    mock.mockReturnValue({
        observe: () => null,
        unobserve: () => null,
        disconnect: () => null,
    });
    window.ResizeObserver = mock as unknown as typeof window.ResizeObserver;
    window.ResizeObserverEntry = vi.fn() as unknown as typeof ResizeObserverEntry;
};
