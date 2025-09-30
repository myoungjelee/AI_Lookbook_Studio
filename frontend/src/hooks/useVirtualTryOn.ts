import { useCallback, useEffect, useState } from "react";
import { virtualTryOnService } from "../services";
import {
  ApiFile,
  CategoryRecommendations,
  ClothingItems,
  RecommendationRequest,
  RecommendationResponse,
  UploadedImage,
  VirtualTryOnRequest,
  VirtualTryOnResponse,
  VirtualTryOnState,
} from "../types";
import { useApi, useMultipleApi } from "./useApi";

// Hook options
interface UseVirtualTryOnOptions {
  autoRecommend?: boolean; // Automatically get recommendations after generation
  onGenerationSuccess?: (response: VirtualTryOnResponse) => void;
  onRecommendationSuccess?: (response: RecommendationResponse) => void;
  onError?: (error: Error) => void;
}

// Hook return type
interface UseVirtualTryOnReturn {
  // State
  state: VirtualTryOnState;

  // Loading states
  isGenerating: boolean;
  isLoadingRecommendations: boolean;
  isLoading: boolean;

  // Error states
  generationError: string | null;
  recommendationError: string | null;

  // Actions
  setPersonImage: (image: UploadedImage | null) => void;
  setClothingItem: (
    type: keyof VirtualTryOnState["clothingItems"],
    image: UploadedImage | null
  ) => void;
  generateImage: () => Promise<VirtualTryOnResponse | null>;
  getRecommendations: (
    fromFitting?: boolean
  ) => Promise<RecommendationResponse | null>;
  reset: () => void;
  resetGeneration: () => void;
  resetRecommendations: () => void;
}

/**
 * Utility function to convert UploadedImage to ApiFile
 */
function toApiFile(image: UploadedImage | null): ApiFile | null {
  if (!image) return null;
  return {
    base64: image.base64,
    mimeType: image.mimeType,
  };
}

/**
 * Utility function to convert clothing items to API format
 */
function toApiClothingItems(
  clothingItems: VirtualTryOnState["clothingItems"]
): ClothingItems {
  return {
    top: toApiFile(clothingItems.top),
    pants: toApiFile(clothingItems.pants),
    shoes: toApiFile(clothingItems.shoes),
    outer: toApiFile(clothingItems.outer),
  };
}

/**
 * Custom hook for virtual try-on functionality with integrated state management
 * @param options - Configuration options
 * @returns Virtual try-on state and actions
 */
export function useVirtualTryOn(
  options: UseVirtualTryOnOptions = {}
): UseVirtualTryOnReturn {
  const {
    autoRecommend = false,
    onGenerationSuccess,
    onRecommendationSuccess,
    onError,
  } = options;

  // Local state for images and UI
  const [state, setState] = useState<VirtualTryOnState>({
    personImage: null,
    clothingItems: {
      top: null,
      pants: null,
      shoes: null,
      outer: null,
    },
    generatedImage: null,
    recommendations: null,
    isLoading: false,
    error: null,
  });

  // API hooks for individual operations
  const generation = useApi(
    (request: VirtualTryOnRequest) =>
      virtualTryOnService.combineImages(request),
    {
      onSuccess: (response: VirtualTryOnResponse) => {
        setState((prev) => ({
          ...prev,
          generatedImage: response.generatedImage,
        }));
        if (onGenerationSuccess) {
          onGenerationSuccess(response);
        }
      },
      onError: (error) => {
        if (onError) {
          onError(error);
        }
      },
    }
  );

  const recommendations = useMultipleApi({
    fromUpload: (request: RecommendationRequest) =>
      virtualTryOnService.getRecommendations(request),
    fromFitting: (request: RecommendationRequest) =>
      virtualTryOnService.getRecommendationsFromFitting(request),
  });

  // Update loading state when API states change
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isLoading: generation.loading || recommendations.loading,
      error:
        generation.error ||
        recommendations.errors.fromUpload ||
        recommendations.errors.fromFitting,
    }));
  }, [
    generation.loading,
    generation.error,
    recommendations.loading,
    recommendations.errors,
  ]);

  // Auto-recommend after successful generation
  useEffect(() => {
    if (
      autoRecommend &&
      generation.success &&
      generation.data &&
      !recommendations.loading
    ) {
      getRecommendations(true);
    }
  }, [autoRecommend, generation.success, generation.data]);

  // State setters
  const setPersonImage = useCallback((image: UploadedImage | null) => {
    setState((prev) => ({
      ...prev,
      personImage: image,
      // Clear generated image and recommendations when person changes
      generatedImage: null,
      recommendations: null,
    }));
  }, []);

  const setClothingItem = useCallback(
    (
      type: keyof VirtualTryOnState["clothingItems"],
      image: UploadedImage | null
    ) => {
      setState((prev) => ({
        ...prev,
        clothingItems: {
          ...prev.clothingItems,
          [type]: image,
        },
        // Clear generated image and recommendations when clothing changes
        generatedImage: null,
        recommendations: null,
      }));
    },
    []
  );

  // Generate virtual try-on image
  const generateImage =
    useCallback(async (): Promise<VirtualTryOnResponse | null> => {
      const clothingValues = Object.values(state.clothingItems);
      const clothingCount = clothingValues.filter(
        (item) => item !== null
      ).length;

      // Allow generation when either:
      // - person image is provided and at least one clothing item
      // - OR no person image, but all three clothing items are provided
      if (!state.personImage && clothingCount < 3) {
        throw new Error(
          "Provide a person image or all three clothing items (top, pants, shoes)."
        );
      }
      if (state.personImage && clothingCount < 1) {
        throw new Error("At least one clothing item is required");
      }

      const request: VirtualTryOnRequest = {
        person: toApiFile(state.personImage),
        clothingItems: toApiClothingItems(state.clothingItems),
      };

      try {
        const response = await generation.execute(request);
        return response;
      } catch (error) {
        console.error("Generation failed:", error);
        return null;
      }
    }, [state.personImage, state.clothingItems, generation.execute]);

  // Get recommendations
  const getRecommendations = useCallback(
    async (fromFitting = false): Promise<RecommendationResponse | null> => {
      let request: RecommendationRequest;

      if (fromFitting && state.generatedImage) {
        // Get recommendations based on generated image
        // Also send original clothing slots so backend can gate categories correctly
        request = {
          person: null,
          clothingItems: toApiClothingItems(state.clothingItems),
          generatedImage: state.generatedImage,
          options: null,
          selectedProductIds: null,
        };
      } else if (
        state.personImage ||
        Object.values(state.clothingItems).some((item) => item !== null)
      ) {
        // Get recommendations based on uploaded images
        request = {
          person: toApiFile(state.personImage),
          clothingItems: toApiClothingItems(state.clothingItems),
          generatedImage: null,
          options: null,
          selectedProductIds: null,
        };
      } else {
        throw new Error(
          "Either person image, clothing items, or generated image is required"
        );
      }

      // selectedIds 관련 로직은 현재 사용하지 않으므로 제거

      try {
        const response = fromFitting
          ? await recommendations.execute.fromFitting(request)
          : await recommendations.execute.fromUpload(request);

        // Update state with recommendations
        setState((prev) => ({
          ...prev,
          recommendations: Array.isArray(response.recommendations)
            ? null // Handle legacy format if needed
            : (response.recommendations as CategoryRecommendations),
        }));

        if (onRecommendationSuccess) {
          onRecommendationSuccess(response);
        }

        return response;
      } catch (error) {
        console.error("Recommendations failed:", error);
        return null;
      }
    },
    [
      state.personImage,
      state.clothingItems,
      state.generatedImage,
      recommendations.execute,
      onRecommendationSuccess,
    ]
  );

  // Reset functions
  const reset = useCallback(() => {
    setState({
      personImage: null,
      clothingItems: {
        top: null,
        pants: null,
        shoes: null,
        outer: null,
      },
      generatedImage: null,
      recommendations: null,
      isLoading: false,
      error: null,
    });
    generation.reset();
    recommendations.reset();
  }, [generation.reset, recommendations.reset]);

  const resetGeneration = useCallback(() => {
    setState((prev) => ({
      ...prev,
      generatedImage: null,
    }));
    generation.reset();
  }, [generation.reset]);

  const resetRecommendations = useCallback(() => {
    setState((prev) => ({
      ...prev,
      recommendations: null,
    }));
    recommendations.reset();
  }, [recommendations.reset]);

  return {
    // State
    state,

    // Loading states
    isGenerating: generation.loading,
    isLoadingRecommendations: recommendations.loading,
    isLoading: state.isLoading,

    // Error states
    generationError: generation.error,
    recommendationError:
      recommendations.errors.fromUpload || recommendations.errors.fromFitting,

    // Actions
    setPersonImage,
    setClothingItem,
    generateImage,
    getRecommendations,
    reset,
    resetGeneration,
    resetRecommendations,
  };
}
