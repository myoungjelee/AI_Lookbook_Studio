import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../../services/api.service";
import { imageProxy } from "../../../services/imageProxy.service";
import { likesService } from "../../../services/likes.service";
import { manageStorageSpace } from "../../../services/storage.service";
import { tryOnHistory } from "../../../services/tryon_history.service";
import { virtualTryOnService } from "../../../services/virtualTryOn.service";
import type {
  ApiFile,
  ClothingItems,
  RecommendationItem,
  RecommendationOptions,
  UploadedImage,
} from "../../../types";
import { Button, Card, Input, toast, useToast } from "../../ui";
import { RecommendationDisplay } from "../recommendations/RecommendationDisplay";
import { StyleTipsCard } from "../tips/StyleTipsCard";
import { ClothingItemOverlay } from "./ClothingItemOverlay";
import { CombineButton } from "./CombineButton";
import { ImageUploader } from "./ImageUploader";
import { ModelPicker } from "./ModelPicker";
import { ResultDisplay } from "./ResultDisplay";
import { SnsShareDialog } from "./SnsShareDialog";
import { TryOnHistory } from "./TryOnHistory";
import { videoHistory } from "../../../services/video_history.service";

// Simple feature-flag helper (treats undefined as ON)
const isFeatureEnabled = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  const normalized = String(value).trim().toLowerCase();
  return !(
    normalized === "0" ||
    normalized === "false" ||
    normalized === "off"
  );
};

// Local helper: loosely normalize catalog categories into canonical buckets
type CategoryBucket = "top" | "pants" | "shoes" | "outer" | "accessories";
const normalizeCategoryLoose = (raw: string): CategoryBucket => {
  const s = (raw || "").toLowerCase();
  const has = (arr: string[]) => arr.some((k) => s.includes(k));
  if (
    has([
      "outer",
      "coat",
      "jacket",
      "outerwear",
      "padding",
      "puffer",
      "아우터",
      "패딩",
      "점퍼",
    ])
  )
    return "outer";
  if (
    has([
      "top",
      "tee",
      "t-shirt",
      "shirt",
      "sweater",
      "hood",
      "hoodie",
      "blouse",
      "상의",
    ])
  )
    return "top";
  if (
    has([
      "pants",
      "bottom",
      "skirt",
      "trouser",
      "jean",
      "slacks",
      "하의",
      "바지",
      "치마",
    ])
  )
    return "pants";
  if (has(["shoe", "sneaker", "boots", "loafer", "heels", "신발", "운동화"]))
    return "shoes";
  return "accessories";
};

// Clean category normalization (adds proper Korean synonyms)
const normalizeCategory = (raw: string): CategoryBucket => {
  const s = (raw || "").toLowerCase();
  const has = (arr: string[]) => arr.some((k) => s.includes(k));
  if (
    has([
      "outer",
      "coat",
      "jacket",
      "outerwear",
      "padding",
      "puffer",
      "아우터",
      "코트",
      "재킷",
      "자켓",
      "패딩",
      "점퍼",
      "파카",
    ])
  )
    return "outer";
  if (
    has([
      "top",
      "tee",
      "t-shirt",
      "shirt",
      "sweater",
      "hood",
      "hoodie",
      "blouse",
      "상의",
      "티",
      "티셔츠",
      "셔츠",
      "스웨터",
      "후드",
      "후디",
      "블라우스",
    ])
  )
    return "top";
  if (
    has([
      "pants",
      "bottom",
      "skirt",
      "trouser",
      "jean",
      "slacks",
      "하의",
      "치마",
      "스커트",
      "바지",
      "청바지",
      "슬랙스",
      "팬츠",
    ])
  )
    return "pants";
  if (
    has([
      "shoe",
      "shoes",
      "sneaker",
      "sneakers",
      "boots",
      "loafer",
      "loafers",
      "heels",
      "신발",
      "운동화",
      "스니커즈",
      "부츠",
      "로퍼",
      "구두",
      "힐",
    ])
  )
    return "shoes";
  return "accessories";
};

export const VirtualTryOnUI: React.FC = () => {
  // 초기 상태를 localStorage에서 복원
  // ?곹깭瑜?localStorage?먯꽌 蹂듭썝
  const [personImage, setPersonImage] = useState<UploadedImage | null>(null);
  const [topImage, setTopImage] = useState<UploadedImage | null>(null);
  const [pantsImage, setPantsImage] = useState<UploadedImage | null>(null);
  const [shoesImage, setShoesImage] = useState<UploadedImage | null>(null);
  const [outerImage, setOuterImage] = useState<UploadedImage | null>(null);
  const [personSource, setPersonSource] = useState<
    "model" | "upload" | "unknown"
  >(() => {
    try {
      const saved = localStorage.getItem("virtualTryOn_personSource");
      return (saved as "model" | "upload" | "unknown") || "unknown";
    } catch {
      return "unknown";
    }
  });
  const [topLabel, setTopLabel] = useState<string | undefined>(() => {
    try {
      const saved = localStorage.getItem("virtualTryOn_topLabel");
      return saved || undefined;
    } catch {
      return undefined;
    }
  });
  const [pantsLabel, setPantsLabel] = useState<string | undefined>(() => {
    try {
      const saved = localStorage.getItem("virtualTryOn_pantsLabel");
      return saved || undefined;
    } catch {
      return undefined;
    }
  });
  const [shoesLabel, setShoesLabel] = useState<string | undefined>(() => {
    try {
      const saved = localStorage.getItem("virtualTryOn_shoesLabel");
      return saved || undefined;
    } catch {
      return undefined;
    }
  });
  const [outerLabel, setOuterLabel] = useState<string | undefined>(() => {
    try {
      const saved = localStorage.getItem("virtualTryOn_outerLabel");
      return saved || undefined;
    } catch {
      return undefined;
    }
  });
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingRecommendations, setIsLoadingRecommendations] =
    useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const { addToast } = useToast();
  const [shareOpen, setShareOpen] = useState<boolean>(false);
  // Video generation state
  const [videoPrompt, setVideoPrompt] = useState<string>(
    (import.meta as any).env?.VITE_VIDEO_PROMPT ||
      "Create an 8-second lookbook video for this outfit."
  );
  const [videoStatus, setVideoStatus] = useState<
    "idle" | "starting" | "polling" | "completed" | "error"
  >("idle");
  const [videoGenId, setVideoGenId] = useState<number>(0);
  const [videoOperationName, setVideoOperationName] = useState<string | null>(
    null
  );
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(0);
  const toPlayable = (u: string) =>
    u && u.startsWith("gs://")
      ? `/api/try-on/video/stream?uri=${encodeURIComponent(u)}`
      : u;
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const videoPollTimeoutRef = useRef<number | null>(null);
  const videoDefaults = {
    aspectRatio: (import.meta as any).env?.VITE_VIDEO_ASPECT || "9:16",
    durationSeconds: (import.meta as any).env?.VITE_VIDEO_DURATION || "4",
    resolution: (import.meta as any).env?.VITE_VIDEO_RESOLUTION || "720p",
  } as const;
  const promptLocked = isFeatureEnabled(
    (import.meta as any).env?.VITE_VIDEO_PROMPT_LOCK
  );
  const shareFeatureEnabled = isFeatureEnabled(
    (import.meta as any).env?.VITE_FEATURE_SHARE
  );
  const videoFeatureEnabled = isFeatureEnabled(
    (import.meta as any).env?.VITE_FEATURE_VIDEO
  );
  const isSafari =
    typeof navigator !== "undefined"
      ? (() => {
          const ua = navigator.userAgent.toLowerCase();
          return (
            ua.includes("safari") &&
            !ua.includes("chrome") &&
            !ua.includes("android")
          );
        })()
      : false;
  // UI highlight states
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [selectedTopId, setSelectedTopId] = useState<string | null>(null);
  const [selectedPantsId, setSelectedPantsId] = useState<string | null>(null);
  const [selectedShoesId, setSelectedShoesId] = useState<string | null>(null);
  const [selectedOuterId, setSelectedOuterId] = useState<string | null>(null);

  // 슬롯 hover 상태
  const [hoveredSlot, setHoveredSlot] = useState<
    "outer" | "top" | "pants" | "shoes" | null
  >(null);
  const [isFullScreen, setIsFullScreen] = useState(false); // 풀스크린 상태 추가

  // 풀스크린이 열릴 때 hoveredSlot 초기화
  useEffect(() => {
    if (isFullScreen) {
      setHoveredSlot(null);
    }
  }, [isFullScreen]);

  // ?먮낯 ?곹뭹 ?곗씠?????
  const [originalItems, setOriginalItems] = useState<{
    outer?: RecommendationItem;
    top?: RecommendationItem;
    pants?: RecommendationItem;
    shoes?: RecommendationItem;
  }>({});

  // Restore slot selections from localStorage snapshot when coming back (catalog items only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("app:tryon:slots:v1");
      if (!raw) return;
      const snap: Partial<
        Record<"outer" | "top" | "pants" | "shoes", RecommendationItem | null>
      > = JSON.parse(raw);
      const tasks: Array<Promise<any>> = [];
      if (!outerImage && snap.outer)
        tasks.push(addToSlotForced(snap.outer as RecommendationItem, "outer"));
      if (!topImage && snap.top)
        tasks.push(addToSlotForced(snap.top as RecommendationItem, "top"));
      if (!pantsImage && snap.pants)
        tasks.push(addToSlotForced(snap.pants as RecommendationItem, "pants"));
      if (!shoesImage && snap.shoes)
        tasks.push(addToSlotForced(snap.shoes as RecommendationItem, "shoes"));
      if (tasks.length)
        Promise.allSettled(tasks).then(() =>
          console.log("✅ 슬롯 스냅샷 복원 완료")
        );
    } catch (e) {
      console.warn("슬롯 스냅샷 복원 실패:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist slot selections (catalog items only) to localStorage
  // Guard: avoid writing an all-null snapshot on initial mount
  useEffect(() => {
    try {
      const hasAny = !!(
        originalItems.outer ||
        originalItems.top ||
        originalItems.pants ||
        originalItems.shoes
      );
      if (hasAny) {
        const snapshot = {
          outer: originalItems.outer || null,
          top: originalItems.top || null,
          pants: originalItems.pants || null,
          shoes: originalItems.shoes || null,
        };
        localStorage.setItem("app:tryon:slots:v1", JSON.stringify(snapshot));
      } else {
        localStorage.removeItem("app:tryon:slots:v1");
      }
    } catch {
      // ignore storage errors
    }
  }, [originalItems]);

  // Reflect history evaluations (scores) for current generated image
  const [historyTick, setHistoryTick] = useState<number>(0);
  useEffect(() => {
    const unsub = tryOnHistory.subscribe(() => setHistoryTick((x) => x + 1));
    return () => {
      unsub();
    };
  }, []);
  const currentScore = React.useMemo(() => {
    if (!generatedImage) return null;
    const outs = tryOnHistory.outputs();
    const found = outs.find((o) => o.image === generatedImage);
    return found && typeof found.evaluation?.score === "number"
      ? found.evaluation!.score
      : null;
  }, [generatedImage, historyTick]);
  // Video: polling helpers and lifecycle
  const clearVideoPoll = useCallback(() => {
    if (videoPollTimeoutRef.current !== null) {
      window.clearTimeout(videoPollTimeoutRef.current);
      videoPollTimeoutRef.current = null;
    }
    setVideoProgress(null);
  }, []);

  const pollVideoStatus = useCallback(
    (operationName: string, attempt: number = 0) => {
      const execute = async () => {
        try {
          const status = await virtualTryOnService.fetchVideoStatus(
            operationName
          );
          let progress: number | null = null;
          const rawProgress = (status as any).progressPercent;
          if (typeof rawProgress === "number") {
            progress = rawProgress;
          } else if (typeof rawProgress === "string") {
            const parsed = Number(rawProgress);
            if (!Number.isNaN(parsed)) {
              progress = parsed;
            }
          }
          setVideoProgress(progress);
          if (status.done) {
            clearVideoPoll();
            setVideoStatus("completed");
            {
              const urls = Array.isArray((status as any).videoUris)
                ? (status as any).videoUris
                : [];
              const dataUris = Array.isArray((status as any).videoDataUris)
                ? (status as any).videoDataUris
                : [];
              setVideoUrls([...urls, ...dataUris]);
            }
            setVideoProgress(progress ?? 100);
            return;
          }
          setVideoStatus("polling");
          const delay = Math.min(2000 + attempt * 500, 6000);
          videoPollTimeoutRef.current = window.setTimeout(() => {
            pollVideoStatus(operationName, attempt + 1);
          }, delay);
        } catch (err) {
          clearVideoPoll();
          setVideoProgress(null);
          setVideoStatus("error");
          setVideoError(
            err instanceof Error ? err.message : "Failed to fetch video status."
          );
        }
      };
      void execute();
    },
    [clearVideoPoll]
  );

  useEffect(
    () => () => {
      clearVideoPoll();
    },
    [clearVideoPoll]
  );

  useEffect(() => {
    if (!generatedImage) {
      clearVideoPoll();
      setVideoStatus("idle");
      setVideoOperationName(null);
      setVideoError(null);
      setVideoUrls([]);
      setVideoProgress(null);
    }
  }, [generatedImage, clearVideoPoll]);

  // When a video completes, persist to local video history once
  const savedForGenRef = React.useRef<number | null>(null);
  useEffect(() => {
    if (
      videoStatus === "completed" &&
      videoUrls.length > 0 &&
      savedForGenRef.current !== videoGenId
    ) {
      try {
        const remote = videoUrls.filter(
          (u) => typeof u === "string" && !u.startsWith("data:")
        );
        const clipsToSave = (
          remote.length > 0 ? remote : videoUrls.slice(0, 1)
        ).slice(0, 4);
        videoHistory.add({
          clips: clipsToSave,
          prompt: videoPrompt,
          params: {
            aspect: videoDefaults.aspectRatio,
            duration: videoDefaults.durationSeconds,
            resolution: videoDefaults.resolution,
          },
          sourceImage: generatedImage || undefined,
        });
        savedForGenRef.current = videoGenId;
      } catch {
        // ignore
      }
    }
  }, [
    videoStatus,
    videoUrls,
    videoPrompt,
    videoDefaults.aspectRatio,
    videoDefaults.durationSeconds,
    videoDefaults.resolution,
    generatedImage,
    videoGenId,
  ]);

  useEffect(() => {
    if (!videoFeatureEnabled) {
      clearVideoPoll();
      setVideoStatus("idle");
      setVideoOperationName(null);
      setVideoError(null);
      setVideoUrls([]);
      setVideoProgress(null);
    }
  }, [videoFeatureEnabled, clearVideoPoll]);

  const handleStartVideoGeneration = useCallback(async () => {
    if (!generatedImage) {
      addToast(
        toast.info("Generate a try-on image first.", undefined, {
          duration: 1600,
        })
      );
      return;
    }
    const trimmed = (
      promptLocked
        ? (import.meta as any).env?.VITE_VIDEO_PROMPT || videoPrompt
        : videoPrompt
    ).trim();
    if (!trimmed) {
      addToast(
        toast.info("Enter a prompt for the video.", undefined, {
          duration: 1600,
        })
      );
      return;
    }
    clearVideoPoll();
    setVideoError(null);
    setVideoUrls([]);
    setVideoOperationName(null);
    setVideoProgress(0);
    setVideoStatus("starting");
    setVideoGenId((x) => x + 1);
    try {
      const res = await virtualTryOnService.startVideoGeneration({
        prompt: trimmed,
        imageData: generatedImage,
        parameters: {
          aspectRatio: String(videoDefaults.aspectRatio),
          durationSeconds: String(videoDefaults.durationSeconds),
          resolution: String(videoDefaults.resolution),
        },
      });
      const op = res.operationName;
      setVideoOperationName(op);
      setVideoStatus("polling");
      addToast(
        toast.success("Video generation started. Hang tight!", undefined, {
          duration: 1800,
        })
      );
      videoPollTimeoutRef.current = window.setTimeout(() => {
        pollVideoStatus(op);
      }, 1500);
    } catch (err) {
      clearVideoPoll();
      const message =
        err instanceof Error
          ? err.message
          : "Video generation failed. Please try again later.";
      setVideoStatus("error");
      setVideoError(message);
      addToast(toast.error(message, undefined, { duration: 2200 }));
    }
  }, [generatedImage, videoPrompt, clearVideoPoll, pollVideoStatus, addToast]);

  const handleCancelVideoPolling = useCallback(() => {
    clearVideoPoll();
    setVideoStatus("idle");
    setVideoOperationName(null);
    setVideoError(null);
    setVideoUrls([]);
    setVideoProgress(null);
  }, [clearVideoPoll]);

  // Likes feed for quick fitting
  const [likedItems, setLikedItems] = useState<RecommendationItem[]>([]);
  useEffect(() => {
    setLikedItems(likesService.getAll());
    const unsub = likesService.subscribe(setLikedItems);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "app:likes:v1") setLikedItems(likesService.getAll());
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsub();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // 인물 이미지는 복원하지 않음 (용량 문제로 비활성)

  // 상태는 localStorage에 메타데이터만 저장 (인물 이미지는 제외)
  useEffect(() => {
    if (personImage) {
      // 인물 이미지를 업로드한 경우 출처를 저장
      localStorage.setItem("virtualTryOn_personSource", personSource);
    } else {
      localStorage.removeItem("virtualTryOn_personImage");
    }
  }, [personImage, personSource]);

  useEffect(() => {
    // 라벨이 있으면 localStorage에 저장
    if (topLabel) {
      localStorage.setItem("virtualTryOn_topLabel", topLabel);
    } else {
      localStorage.removeItem("virtualTryOn_topLabel");
    }
  }, [topLabel]);

  useEffect(() => {
    // 라벨이 있으면 localStorage에 저장
    if (pantsLabel) {
      localStorage.setItem("virtualTryOn_pantsLabel", pantsLabel);
    } else {
      localStorage.removeItem("virtualTryOn_pantsLabel");
    }
  }, [pantsLabel]);

  useEffect(() => {
    // 라벨이 있으면 localStorage에 저장
    if (shoesLabel) {
      localStorage.setItem("virtualTryOn_shoesLabel", shoesLabel);
    } else {
      localStorage.removeItem("virtualTryOn_shoesLabel");
    }
  }, [shoesLabel]);

  useEffect(() => {
    // 라벨이 있으면 localStorage에 저장
    if (outerLabel) {
      localStorage.setItem("virtualTryOn_outerLabel", outerLabel);
    } else {
      localStorage.removeItem("virtualTryOn_outerLabel");
    }
  }, [outerLabel]);

  // 카탈로그 카드에서 전달된 상품을 자동으로 슬롯에 배치
  const hasProcessedRef = useRef(false);

  useEffect(() => {
    const handlePendingItem = async () => {
      try {
        // 여러 아이템을 한 번에 처리 (배치 방식)
        const pendingItemsStr = localStorage.getItem(
          "app:pendingVirtualFittingItems"
        );
        if (pendingItemsStr) {
          console.log("?щ윭 ?꾩씠??泥섎━ ?쒖옉");
          const pendingItems = JSON.parse(pendingItemsStr);
          hasProcessedRef.current = true;

          for (const item of pendingItems) {
            await addCatalogItemToSlot(item);
          }

          addToast(
            toast.success(
              `${pendingItems.length} items queued for fitting`,
              undefined,
              { duration: 2000 }
            )
          );
          localStorage.removeItem("app:pendingVirtualFittingItems");
          return;
        }

        // ?⑥씪 ?꾩씠??泥섎━ (湲곗〈 諛⑹떇)
        const pendingItemStr = localStorage.getItem(
          "app:pendingVirtualFittingItem"
        );
        if (!pendingItemStr) return;

        const pendingItem = JSON.parse(pendingItemStr);

        // 5분을 초과하면 만료된 항목으로 간주
        if (Date.now() - pendingItem.timestamp > 5 * 60 * 1000) {
          localStorage.removeItem("app:pendingVirtualFittingItem");
          return;
        }

        // 카테고리명으로 적절한 슬롯을 선택
        const cat = (pendingItem.category || "").toLowerCase();

        // 백엔드와 동일한 카테고리 매핑 로직을 재사용
        const slot: "top" | "pants" | "shoes" | "outer" | null =
          cat === "outer"
            ? "outer"
            : cat === "top"
            ? "top"
            : cat === "pants"
            ? "pants"
            : cat === "shoes"
            ? "shoes"
            : null;

        console.log("寃곗젙???щ’:", slot);
        if (!slot) {
          console.log("카테고리를 해석하지 못함:", cat);
          localStorage.removeItem("app:pendingVirtualFittingItem");
          return;
        }

        if (!pendingItem.imageUrl) {
          console.log("이미지 URL이 없습니다");
          localStorage.removeItem("app:pendingVirtualFittingItem");
          return;
        }

        // 처리 시작 시각을 설정
        hasProcessedRef.current = true;

        console.log("이미지 변환 시작");
        // 이미지 데이터를 UploadedImage 형태로 변환
        const uploadedImage = await imageProxy.toUploadedImage(
          pendingItem.imageUrl,
          pendingItem.title
        );
        console.log("?대?吏 蹂???꾨즺:", uploadedImage);

        // addCatalogItemToSlot을 호출해 메타데이터와 함께 저장
        console.log("addCatalogItemToSlot 호출, 슬롯:", slot);
        await addCatalogItemToSlot(pendingItem);

        addToast(
          toast.success(`Queued for fitting: ${pendingItem.title}`, undefined, {
            duration: 2000,
          })
        );

        // 泥섎━ ?꾨즺 ??localStorage?먯꽌 ?쒓굅
        localStorage.removeItem("app:pendingVirtualFittingItem");
        console.log("상품이 자동으로 슬롯에 들어갔습니다:", slot);
      } catch (error) {
        console.error("상품 자동 배치 실패:", error);
        localStorage.removeItem("app:pendingVirtualFittingItem");
        hasProcessedRef.current = false; // 실패 시 다시 처리할 수 있도록 초기화
      }
    };

    handlePendingItem();

    // 저장소 정리 실행
    manageStorageSpace();

    return () => {
      // cleanup
    };
  }, []); // 의존성 배열은 비워 둔다

  // Recommendation filter options
  const [minPrice, setMinPrice] = useState<string>("");
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [excludeTagsInput, setExcludeTagsInput] = useState<string>("");

  // Random items to show before recommendations are available
  type GenderFilter = "all" | "male" | "female";
  const [vtGender, setVtGender] = useState<GenderFilter>("all");
  const [randomItemsByCat, setRandomItemsByCat] = useState<{
    top: RecommendationItem[];
    pants: RecommendationItem[];
    shoes: RecommendationItem[];
    outer: RecommendationItem[];
  }>({ top: [], pants: [], shoes: [], outer: [] });
  const [isLoadingRandom, setIsLoadingRandom] = useState<boolean>(false);
  const fetchRandom = useCallback(
    async (limit: number = 12) => {
      try {
        setIsLoadingRandom(true);
        const per = Math.max(1, Math.floor(limit / 4)); // 4개 카테고리에 균등 분배
        const gparam =
          vtGender && vtGender !== "all" ? `&gender=${vtGender}` : "";
        const [tops, pants, shoes, outers] = await Promise.all([
          apiClient
            .get<RecommendationItem[]>(
              `/api/recommend/random?limit=${per}&category=top${gparam}`
            )
            .catch(() => [] as RecommendationItem[]),
          apiClient
            .get<RecommendationItem[]>(
              `/api/recommend/random?limit=${per}&category=pants${gparam}`
            )
            .catch(() => [] as RecommendationItem[]),
          apiClient
            .get<RecommendationItem[]>(
              `/api/recommend/random?limit=${per}&category=shoes${gparam}`
            )
            .catch(() => [] as RecommendationItem[]),
          apiClient
            .get<RecommendationItem[]>(
              `/api/recommend/random?limit=${per}&category=outer${gparam}`
            )
            .catch(() => [] as RecommendationItem[]),
        ]);
        setRandomItemsByCat({ top: tops, pants, shoes, outer: outers });
      } catch (e) {
        // ignore silently
        setRandomItemsByCat({ top: [], pants: [], shoes: [], outer: [] });
      } finally {
        setIsLoadingRandom(false);
      }
    },
    [vtGender]
  );
  useEffect(() => {
    // Fetch once on mount; keep until proper recommendations arrive
    fetchRandom(12);
  }, [fetchRandom]);

  const convertToApiFile = (uploadedImage: UploadedImage): ApiFile => ({
    base64: uploadedImage.base64,
    mimeType: uploadedImage.mimeType,
  });

  // toDataUrl 함수는 품질 저하 때문에 사용하지 않음 (이미지 데이터는 그대로 유지)
  // mode: 'delta' logs only provided overrides; 'snapshot' logs full current state
  const recordInput = useCallback(
    (
      overrides?: Partial<{
        person: UploadedImage | null;
        top: UploadedImage | null;
        pants: UploadedImage | null;
        shoes: UploadedImage | null;
        outer: UploadedImage | null;
      }>,
      labels?: Partial<{
        top: string;
        pants: string;
        shoes: string;
        outer: string;
      }>,
      mode: "delta" | "snapshot" = "delta",
      sourceOverride?: "model" | "upload" | "unknown",
      productIds?: Partial<{
        top: string;
        pants: string;
        shoes: string;
        outer: string;
      }>,
      products?: Partial<{
        top: RecommendationItem;
        pants: RecommendationItem;
        shoes: RecommendationItem;
        outer: RecommendationItem;
      }>
    ) => {
      const src = sourceOverride ?? personSource;
      // Skip only when the event is a person change coming from AI model
      if (src === "model" && overrides && "person" in overrides) return;
      // For non-person events while using AI model, avoid labeling as 'model' to hide AI model traces
      const recordPerson: "model" | "upload" | "unknown" =
        src === "model" && !(overrides && "person" in overrides)
          ? "unknown"
          : src;
      tryOnHistory.addInput({
        person: recordPerson,
        topLabel: labels?.top ?? (mode === "delta" ? undefined : topLabel),
        pantsLabel:
          labels?.pants ?? (mode === "delta" ? undefined : pantsLabel),
        shoesLabel:
          labels?.shoes ?? (mode === "delta" ? undefined : shoesLabel),
        outerLabel:
          labels?.outer ?? (mode === "delta" ? undefined : outerLabel),
        // 이미지 메타데이터는 히스토리에만 저장해 용량 사용을 줄임
        topProductId: productIds?.top,
        pantsProductId: productIds?.pants,
        shoesProductId: productIds?.shoes,
        outerProductId: productIds?.outer,
        // 추천된 상품 정보도 함께 보존 (이미지 URL 포함)
        topProduct: products?.top ?? originalItems.top,
        pantsProduct: products?.pants ?? originalItems.pants,
        shoesProduct: products?.shoes ?? originalItems.shoes,
        outerProduct: products?.outer ?? originalItems.outer,
      });
    },
    [personSource, topLabel, pantsLabel, shoesLabel, outerLabel, originalItems]
  );

  const handleCombineClick = useCallback(async () => {
    const hasAnyClothing = !!(
      topImage ||
      pantsImage ||
      shoesImage ||
      outerImage
    );
    const hasAllClothing = !!(topImage && pantsImage && shoesImage);
    const allowWithoutPerson = !personImage && hasAllClothing;
    const allowWithPerson = !!personImage && hasAnyClothing;
    if (!(allowWithoutPerson || allowWithPerson)) {
      setError("Upload a person photo or select top, pants, and shoes.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    setRecommendations(null);

    try {
      // 현재 슬롯에 실제로 있는 아이템들만 가져가기
      // 상태가 아닌 실제 DOM에서 확인하여 최신 상태 보장
      const clothingItems: ClothingItems = {
        top: topImage ? convertToApiFile(topImage) : null,
        pants: pantsImage ? convertToApiFile(pantsImage) : null,
        shoes: shoesImage ? convertToApiFile(shoesImage) : null,
        outer: outerImage ? convertToApiFile(outerImage) : null,
      };

      // 디버깅: 전체 의류 아이템 상태 확인
      console.log("Try-on request payload:", {
        personImage: !!personImage,
        clothingItems: {
          top: !!topImage,
          pants: !!pantsImage,
          shoes: !!shoesImage,
          outer: !!outerImage,
        },
        clothingItemsData: clothingItems,
        outerImage: outerImage,
        outerInClothingItems: clothingItems.outer,
        outerImageNull: outerImage === null,
        outerImageUndefined: typeof outerImage === "undefined",
      });

      const result = await virtualTryOnService.combineImages({
        person: personImage ? convertToApiFile(personImage) : null,
        clothingItems,
      });

      if (result.generatedImage) {
        setGeneratedImage(result.generatedImage);
        // Record output history (data URI)
        await tryOnHistory.addOutput(result.generatedImage);

        // Fetch recommendations after virtual fitting
        setIsLoadingRecommendations(true);
        try {
          // 1) Try pos-based recommendation when originalItems are available
          const selected: Array<{
            slot: "top" | "pants" | "shoes" | "outer";
            item: RecommendationItem;
          }> = [] as any;
          if (originalItems.top)
            selected.push({ slot: "top", item: originalItems.top! });
          if (originalItems.pants)
            selected.push({ slot: "pants", item: originalItems.pants! });
          if (originalItems.shoes)
            selected.push({ slot: "shoes", item: originalItems.shoes! });
          if (originalItems.outer)
            selected.push({ slot: "outer", item: originalItems.outer! });

          const positions: number[] = [];
          const itemsPayload: any[] = [];
          for (const s of selected) {
            const idNum = Number(s.item.id);
            const posNum = Number.isFinite(s.item.pos as any)
              ? Number(s.item.pos)
              : Number.isFinite(idNum)
              ? idNum
              : NaN;
            if (!Number.isFinite(posNum)) continue; // skip if no numeric pos
            positions.push(posNum as number);
            itemsPayload.push({
              pos: posNum as number,
              category: s.item.category,
              title: s.item.title,
              tags: s.item.tags,
              price: s.item.price,
              brand: (s.item as any).brandName,
              productUrl: s.item.productUrl,
              imageUrl: s.item.imageUrl,
            });
          }

          const toCategoryRecs = (arr: RecommendationItem[]) => {
            const buckets: any = {
              top: [],
              pants: [],
              shoes: [],
              outer: [],
              accessories: [],
            };
            for (const it of arr) {
              const key = normalizeCategory(String(it.category || ""));
              buckets[key].push(it);
            }
            return buckets;
          };

          if (positions.length > 0) {
            try {
              const byPos =
                await virtualTryOnService.getRecommendationsByPositions({
                  positions,
                  items: itemsPayload,
                  // Explicitly pass dressed categories to ensure all appear
                  categories: selected.map((s) => s.slot),
                  final_k: 3,
                  use_llm_rerank: true,
                });
              setRecommendations(toCategoryRecs(byPos));
            } catch (e) {
              // Fallback to image-based when vector recommender is unavailable
              const options: RecommendationOptions = {};
              if (minPrice) options.minPrice = Number(minPrice);
              if (maxPrice) options.maxPrice = Number(maxPrice);
              const trimmed = excludeTagsInput.trim();
              if (trimmed)
                options.excludeTags = trimmed
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);

              const usedClothingItems: any = {};
              if (topImage) usedClothingItems.top = clothingItems.top;
              if (pantsImage) usedClothingItems.pants = clothingItems.pants;
              if (shoesImage) usedClothingItems.shoes = clothingItems.shoes;
              if (outerImage) usedClothingItems.outer = clothingItems.outer;

              const recommendationsResult =
                await virtualTryOnService.getRecommendationsFromFitting({
                  person: null,
                  clothingItems: usedClothingItems,
                  generatedImage: result.generatedImage,
                  options,
                  selectedProductIds: null,
                });
              setRecommendations(recommendationsResult.recommendations as any);
            }
          } else {
            // 2) Fallback to image-based from-fitting when pos not available (uploaded images etc.)
            const options: RecommendationOptions = {};
            if (minPrice) options.minPrice = Number(minPrice);
            if (maxPrice) options.maxPrice = Number(maxPrice);
            const trimmed = excludeTagsInput.trim();
            if (trimmed)
              options.excludeTags = trimmed
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean);

            // 입힌 아이템만 추천하도록 필터링 (아예 필드를 제외)
            const usedClothingItems: any = {};
            if (topImage) usedClothingItems.top = clothingItems.top;
            if (pantsImage) usedClothingItems.pants = clothingItems.pants;
            if (shoesImage) usedClothingItems.shoes = clothingItems.shoes;
            if (outerImage) usedClothingItems.outer = clothingItems.outer;

            const recommendationsResult =
              await virtualTryOnService.getRecommendationsFromFitting({
                person: null,
                clothingItems: usedClothingItems,
                generatedImage: result.generatedImage,
                options,
                selectedProductIds: null,
              });

            setRecommendations(recommendationsResult.recommendations as any);
          }
        } catch (recError) {
          console.error("Failed to get recommendations:", recError);
        } finally {
          setIsLoadingRecommendations(false);
        }
      } else {
        setError(
          "The AI could not generate an image. Please try again with different images."
        );
      }
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred."
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    personImage,
    topImage,
    pantsImage,
    shoesImage,
    outerImage,
    minPrice,
    maxPrice,
    excludeTagsInput,
  ]);

  const canCombine =
    (!!personImage && (topImage || pantsImage || shoesImage || outerImage)) ||
    (!personImage && !!(topImage && pantsImage && shoesImage));

  // Helper: add a catalog/recommendation item into proper slot
  const addCatalogItemToSlot = useCallback(
    async (item: RecommendationItem, showToast: boolean = true) => {
      console.log("🔔🔔🔔 addCatalogItemToSlot 호출됨! 🔔🔔🔔");
      console.log("🔔 상품 정보:", {
        id: item.id,
        title: item.title,
        category: item.category,
        imageUrl: item.imageUrl,
      });

      const cat = (item.category || "").toLowerCase();
      console.log("🔔 카테고리 소문자 변환:", cat);

      // 백엔드와 동일한 카테고리 매핑 로직 사용
      const slot: "top" | "pants" | "shoes" | "outer" | null = (() => {
        const match = (keywordList: string[]): boolean =>
          keywordList.some((keyword) => cat.includes(keyword));

        if (
          match([
            "outer",
            "coat",
            "jacket",
            "outerwear",
            "맨투맨",
            "아우터",
            "패딩",
          ])
        ) {
          return "outer";
        }
        if (match(["top", "tee", "shirt", "sweater", "상의", "블라우스"])) {
          return "top";
        }
        if (
          match([
            "pants",
            "bottom",
            "skirt",
            "trouser",
            "하의",
            "데님",
            "슬랙스",
          ])
        ) {
          return "pants";
        }
        if (match(["shoe", "sneaker", "boots", "신발", "스니커즈"])) {
          return "shoes";
        }
        return null;
      })();

      console.log("🔔 매핑된 slot:", slot);

      if (!slot) {
        console.error("❌ 카테고리 매핑 실패:", item.category);
        return;
      }
      if (!item.imageUrl) {
        addToast(toast.error("Image URL is missing."));
        return;
      }
      try {
        console.log("🔔 이미지 변환 시작...");
        const up = await imageProxy.toUploadedImage(item.imageUrl, item.title);
        console.log("🔔 이미지 변환 완료:", up);

        // 원본 상품 메타데이터 저장
        setOriginalItems((prev) => ({
          ...prev,
          [slot]: item,
        }));

        console.log("🔔 recordInput 호출 전:", { slot, item });

        if (slot === "top") {
          setTopImage(up);
          setTopLabel(item.title);
          setSelectedTopId(String(item.id));
          recordInput(
            { top: up },
            { top: item.title },
            "delta",
            undefined,
            { top: String(item.id) },
            { top: item }
          );
        }
        if (slot === "pants") {
          setPantsImage(up);
          setPantsLabel(item.title);
          setSelectedPantsId(String(item.id));
          recordInput(
            { pants: up },
            { pants: item.title },
            "delta",
            undefined,
            { pants: String(item.id) },
            { pants: item }
          );
        }
        if (slot === "shoes") {
          setShoesImage(up);
          setShoesLabel(item.title);
          setSelectedShoesId(String(item.id));
          recordInput(
            { shoes: up },
            { shoes: item.title },
            "delta",
            undefined,
            { shoes: String(item.id) },
            { shoes: item }
          );
        }
        if (slot === "outer") {
          setOuterImage(up);
          setOuterLabel(item.title);
          setSelectedOuterId(String(item.id));
          recordInput(
            { outer: up },
            { outer: item.title },
            "delta",
            undefined,
            { outer: String(item.id) },
            { outer: item }
          );
        }

        console.log("🔔 recordInput 호출 완료");
        if (showToast) {
          addToast(
            toast.success(
              `Added: ${item.title}. Use Try It On to apply.`,
              undefined,
              { duration: 1800 }
            )
          );
        }
      } catch (e: any) {
        console.error("❌ 이미지 처리 실패:", e);
        addToast(toast.error("Failed to add item", e?.message));
      }
    },
    [
      addToast,
      setTopImage,
      setPantsImage,
      setShoesImage,
      setOuterImage,
      setTopLabel,
      setPantsLabel,
      setShoesLabel,
      setOuterLabel,
      setSelectedOuterId,
      setOriginalItems,
    ]
  );
  // Helper wrapper: force slot without relying on category text
  const addToSlotForced = useCallback(
    (item: RecommendationItem, slot: "top" | "pants" | "shoes" | "outer") => {
      console.log("🔔🔔🔔 addToSlotForced 호출됨! 🔔🔔🔔");
      console.log("🔔 랜덤 아이템 클릭:", { item: item.title, slot });
      // Reuse existing logic by overriding category for mapping
      return addCatalogItemToSlot({ ...(item as any), category: slot } as any);
    },
    [addCatalogItemToSlot]
  );

  // 의류 이미지와 좋아요 토글 처리
  const handleClothingLike = useCallback(
    (slot: "outer" | "top" | "pants" | "shoes") => {
      const label =
        slot === "outer"
          ? outerLabel
          : slot === "top"
          ? topLabel
          : slot === "pants"
          ? pantsLabel
          : shoesLabel;

      if (label) {
        const productId =
          slot === "outer"
            ? selectedOuterId
            : slot === "top"
            ? selectedTopId
            : slot === "pants"
            ? selectedPantsId
            : selectedShoesId;

        // 상품 ID가 있으면(카탈로그에서 가져온 항목) 그대로 사용
        if (productId) {
          // 원본 상품 메타데이터 저장
          const originalItem = originalItems[slot];
          const item: RecommendationItem = originalItem
            ? {
                ...originalItem,
                id: productId,
                imageUrl:
                  slot === "outer"
                    ? outerImage?.previewUrl || originalItem.imageUrl
                    : slot === "top"
                    ? topImage?.previewUrl || originalItem.imageUrl
                    : slot === "pants"
                    ? pantsImage?.previewUrl || originalItem.imageUrl
                    : shoesImage?.previewUrl || originalItem.imageUrl,
              }
            : {
                id: productId,
                title: label,
                price: 0,
                imageUrl:
                  slot === "outer"
                    ? outerImage?.previewUrl || ""
                    : slot === "top"
                    ? topImage?.previewUrl || ""
                    : slot === "pants"
                    ? pantsImage?.previewUrl || ""
                    : shoesImage?.previewUrl || "",
                category: slot,
                tags: [],
              };

          const wasAdded = likesService.toggle(item);
          if (wasAdded) {
            addToast(
              toast.success("Added to likes", label, { duration: 1500 })
            );
          } else {
            addToast(
              toast.success("Removed from likes", label, { duration: 1500 })
            );
          }
        } else {
          // 업로드된 사용자 이미지 (고정 ID 사용)
          const item: RecommendationItem = {
            id: "uploaded-" + slot,
            title: label,
            price: 0,
            imageUrl:
              slot === "outer"
                ? outerImage?.previewUrl || ""
                : slot === "top"
                ? topImage?.previewUrl || ""
                : slot === "pants"
                ? pantsImage?.previewUrl || ""
                : shoesImage?.previewUrl || "",
            category: slot,
            tags: [],
          };

          const wasAdded = likesService.toggle(item);
          if (wasAdded) {
            addToast(
              toast.success("Added to likes", label, { duration: 1500 })
            );
          } else {
            addToast(
              toast.success("Removed from likes", label, { duration: 1500 })
            );
          }
        }
      }
    },
    [
      outerLabel,
      topLabel,
      pantsLabel,
      shoesLabel,
      outerImage,
      topImage,
      pantsImage,
      shoesImage,
      selectedOuterId,
      selectedTopId,
      selectedPantsId,
      selectedShoesId,
      originalItems,
      addToast,
    ]
  );

  const handleClothingBuy = useCallback(
    (slot: "outer" | "top" | "pants" | "shoes") => {
      const label =
        slot === "outer"
          ? outerLabel
          : slot === "top"
          ? topLabel
          : slot === "pants"
          ? pantsLabel
          : shoesLabel;

      if (label) {
        // 원본 상품 페이지에 URL이 있는지 확인
        const originalItem = originalItems[slot];
        if (originalItem?.productUrl) {
          // ?ㅼ젣 ?곹뭹 URL???덉쑝硫??대떦 ?섏씠吏濡??대룞
          window.open(originalItem.productUrl, "_blank");
          addToast(
            toast.success("Opened product page", originalItem.title, {
              duration: 2000,
            })
          );
        } else {
          // 업로드된 이미지라면 기본 쇼핑 페이지로 이동
          // ?낅줈?쒕맂 ?대?吏?닿굅??URL???놁쑝硫??쇳븨 ?섏씠吏濡??대룞
          window.open("https://www.musinsa.com", "_blank");
          addToast(
            toast.info(
              "Opening shopping page",
              "Check Musinsa for similar items.",
              { duration: 2000 }
            )
          );
        }
      }
    },
    [outerLabel, topLabel, pantsLabel, shoesLabel, originalItems, addToast]
  );

  return (
    <div className="flex flex-col items-center bg-[var(--page-bg)] pt-[88px] sm:pt-[96px] md:pt-[104px] px-4 sm:px-6 lg:px-8 pb-20">
      <div className="w-full">
        <main className="mx-auto w-full max-w-screen-xl xl:max-w-[1400px] 2xl:max-w-[1600px]">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-10 items-start">
            {/* Input Section */}
            <div className="lg:col-span-8 order-1 bg-white p-6 xl:p-7 rounded-2xl shadow-sm border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 왼쪽 영역: Person + AI 샘플 */}
                <div className="md:col-span-1 space-y-2 border-r border-gray-200 pr-4">
                  <ImageUploader
                    id="person-image"
                    title="Person"
                    description="Upload a full-body photo."
                    onImageUpload={(img) => {
                      setPersonImage(img);
                      setPersonSource(img ? "upload" : "unknown");
                      setSelectedModelId(null);
                      recordInput(
                        { person: img },
                        undefined,
                        "delta",
                        img ? "upload" : "unknown"
                      );
                    }}
                    externalImage={personImage}
                    active={!!personImage && personSource === "upload"}
                    isFullScreen={isFullScreen}
                  />
                  <ModelPicker
                    direction="vertical"
                    selectedId={
                      personSource === "model"
                        ? selectedModelId || undefined
                        : undefined
                    }
                    onSelectModel={(id) => setSelectedModelId(id)}
                    onPick={(img) => {
                      setPersonImage(img);
                      setPersonSource("model");
                      recordInput({ person: img }, undefined, "delta", "model");
                    }}
                  />
                </div>

                {/* 오른쪽 영역: 의류 4칸 */}
                <div className="md:col-span-2 pl-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-sm font-medium text-gray-700">
                      카테고리 아이템
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setOuterImage(null);
                        setTopImage(null);
                        setPantsImage(null);
                        setShoesImage(null);
                        setOuterLabel(undefined);
                        setTopLabel(undefined);
                        setPantsLabel(undefined);
                        setShoesLabel(undefined);
                        setSelectedOuterId(null);
                        setSelectedTopId(null);
                        setSelectedPantsId(null);
                        setSelectedShoesId(null);
                        setOriginalItems({});
                        addToast(
                          toast.success("All slots cleared", undefined, {
                            duration: 1500,
                          })
                        );
                      }}
                      disabled={
                        !outerImage && !topImage && !pantsImage && !shoesImage
                      }
                    >
                      전체 비우기
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div
                      onMouseEnter={() => outerImage && setHoveredSlot("outer")}
                      onMouseLeave={() => setHoveredSlot(null)}
                    >
                      <ImageUploader
                        id="outer-image"
                        title="Outer"
                        description="Upload a photo of outerwear."
                        onImageUpload={(img) => {
                          setOuterImage(img);
                          const label = img ? "Uploaded outer" : undefined;
                          setOuterLabel(label);
                          recordInput(
                            { outer: img },
                            { outer: label },
                            "delta"
                          );
                        }}
                        externalImage={outerImage}
                        active={!!outerImage}
                        isFullScreen={isFullScreen}
                        overlay={
                          <ClothingItemOverlay
                            isVisible={hoveredSlot === "outer" && !isFullScreen}
                            onLike={() => handleClothingLike("outer")}
                            onBuy={() => handleClothingBuy("outer")}
                            onRemove={() => {
                              console.log("🔍 아우터 제거 시작");
                              setOuterImage(null);
                              setOuterLabel(undefined);
                              setSelectedOuterId(null);
                              setOriginalItems((prev) => ({
                                ...prev,
                                outer: undefined,
                              }));
                              // 생성된 이미지도 초기화하여 이전 결과가 남아있지 않도록 함
                              setGeneratedImage(null);
                              console.log("🔍 아우터 제거 완료");
                            }}
                            itemTitle={outerLabel || "Outer"}
                            isLiked={
                              selectedOuterId
                                ? likesService.isLiked(selectedOuterId)
                                : likesService.isLiked("uploaded-outer")
                            }
                          />
                        }
                      />
                    </div>
                    <div
                      onMouseEnter={() => topImage && setHoveredSlot("top")}
                      onMouseLeave={() => setHoveredSlot(null)}
                    >
                      <ImageUploader
                        id="top-image"
                        title="Top"
                        description="Upload a photo of a top."
                        onImageUpload={(img) => {
                          setTopImage(img);
                          const label = img ? "Uploaded top" : undefined;
                          setTopLabel(label);
                          recordInput({ top: img }, { top: label }, "delta");
                        }}
                        externalImage={topImage}
                        active={!!topImage}
                        isFullScreen={isFullScreen}
                        overlay={
                          <ClothingItemOverlay
                            isVisible={hoveredSlot === "top" && !isFullScreen}
                            onLike={() => handleClothingLike("top")}
                            onBuy={() => handleClothingBuy("top")}
                            onRemove={() => {
                              console.log("🔍 상의 제거 시작");
                              setTopImage(null);
                              setTopLabel(undefined);
                              setSelectedTopId(null);
                              setOriginalItems((prev) => ({
                                ...prev,
                                top: undefined,
                              }));
                              setGeneratedImage(null);
                              console.log("🔍 상의 제거 완료");
                            }}
                            itemTitle={topLabel || "Top"}
                            isLiked={
                              selectedTopId
                                ? likesService.isLiked(selectedTopId)
                                : likesService.isLiked("uploaded-top")
                            }
                          />
                        }
                      />
                    </div>
                    <div
                      onMouseEnter={() => pantsImage && setHoveredSlot("pants")}
                      onMouseLeave={() => setHoveredSlot(null)}
                    >
                      <ImageUploader
                        id="pants-image"
                        title="Pants"
                        description="Upload a photo of pants."
                        onImageUpload={(img) => {
                          setPantsImage(img);
                          const label = img ? "Uploaded pants" : undefined;
                          setPantsLabel(label);
                          recordInput(
                            { pants: img },
                            { pants: label },
                            "delta"
                          );
                        }}
                        externalImage={pantsImage}
                        active={!!pantsImage}
                        isFullScreen={isFullScreen}
                        overlay={
                          <ClothingItemOverlay
                            isVisible={hoveredSlot === "pants" && !isFullScreen}
                            onLike={() => handleClothingLike("pants")}
                            onBuy={() => handleClothingBuy("pants")}
                            onRemove={() => {
                              console.log("🔍 하의 제거 시작");
                              setPantsImage(null);
                              setPantsLabel(undefined);
                              setSelectedPantsId(null);
                              setOriginalItems((prev) => ({
                                ...prev,
                                pants: undefined,
                              }));
                              setGeneratedImage(null);
                              console.log("🔍 하의 제거 완료");
                            }}
                            itemTitle={pantsLabel || "Pants"}
                            isLiked={
                              selectedPantsId
                                ? likesService.isLiked(selectedPantsId)
                                : likesService.isLiked("uploaded-pants")
                            }
                          />
                        }
                      />
                    </div>
                    <div
                      onMouseEnter={() => shoesImage && setHoveredSlot("shoes")}
                      onMouseLeave={() => setHoveredSlot(null)}
                    >
                      <ImageUploader
                        id="shoes-image"
                        title="Shoes"
                        description="Upload a photo of shoes."
                        onImageUpload={(img) => {
                          setShoesImage(img);
                          const label = img ? "Uploaded shoes" : undefined;
                          setShoesLabel(label);
                          recordInput(
                            { shoes: img },
                            { shoes: label },
                            "delta"
                          );
                        }}
                        externalImage={shoesImage}
                        active={!!shoesImage}
                        isFullScreen={isFullScreen}
                        overlay={
                          <ClothingItemOverlay
                            isVisible={hoveredSlot === "shoes" && !isFullScreen}
                            onLike={() => handleClothingLike("shoes")}
                            onBuy={() => handleClothingBuy("shoes")}
                            onRemove={() => {
                              console.log("🔍 신발 제거 시작");
                              setShoesImage(null);
                              setShoesLabel(undefined);
                              setSelectedShoesId(null);
                              setOriginalItems((prev) => ({
                                ...prev,
                                shoes: undefined,
                              }));
                              setGeneratedImage(null);
                              console.log("🔍 신발 제거 완료");
                            }}
                            itemTitle={shoesLabel || "Shoes"}
                            isLiked={
                              selectedShoesId
                                ? likesService.isLiked(selectedShoesId)
                                : likesService.isLiked("uploaded-shoes")
                            }
                          />
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Histories section separated from upload card */}
            <div className="lg:col-span-8 order-3">
              <TryOnHistory
                onApply={useCallback(
                  async (payload: {
                    person?: string;
                    top?: string;
                    pants?: string;
                    shoes?: string;
                    topLabel?: string;
                    pantsLabel?: string;
                    shoesLabel?: string;
                    outerLabel?: string;
                    topProduct?: RecommendationItem;
                    pantsProduct?: RecommendationItem;
                    shoesProduct?: RecommendationItem;
                    outerProduct?: RecommendationItem;
                  }) => {
                    console.log("🔔 히스토리에서 적용 시도:", payload);

                    // 히스토리에서 가져온 상품들을 addCatalogItemToSlot으로 처리

                    if (payload.topProduct) {
                      console.log("🔔 상의 적용:", payload.topProduct.title);
                      await addCatalogItemToSlot(payload.topProduct, false);
                    }
                    if (payload.pantsProduct) {
                      console.log("🔔 하의 적용:", payload.pantsProduct.title);
                      await addCatalogItemToSlot(payload.pantsProduct, false);
                    }
                    if (payload.shoesProduct) {
                      console.log("🔔 신발 적용:", payload.shoesProduct.title);
                      await addCatalogItemToSlot(payload.shoesProduct, false);
                    }
                    if (payload.outerProduct) {
                      console.log(
                        "🔔 아우터 적용:",
                        payload.outerProduct.title
                      );
                      await addCatalogItemToSlot(payload.outerProduct, false);
                    }

                    // 히스토리에서 적용 완료 토스트
                    addToast(
                      toast.success("히스토리에서 적용했습니다", undefined, {
                        duration: 1500,
                      })
                    );
                  },
                  [addCatalogItemToSlot, addToast]
                )}
              />
            </div>

            {/* Action and Result Section */}
            <div
              id="result-panel"
              className="lg:col-span-4 order-2 flex flex-col gap-6 xl:gap-7 lg:sticky lg:top-32 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto self-start"
            >
              <CombineButton
                onClick={handleCombineClick}
                disabled={!canCombine || isLoading}
                isLoading={isLoading}
              />
              <ResultDisplay
                generatedImage={generatedImage}
                isLoading={isLoading}
                error={error}
                score={currentScore ?? undefined}
                onFullScreenChange={setIsFullScreen}
              />
              {/* Style Tips below result */}
              <StyleTipsCard generatedImage={generatedImage || undefined} />
              {/* Share button (feature flag default ON) */}
              {shareFeatureEnabled && (
                <>
                  <div>
                    <Button
                      disabled={!generatedImage}
                      onClick={() => setShareOpen(true)}
                    >
                      Save share image
                    </Button>
                  </div>
                  <SnsShareDialog
                    open={shareOpen}
                    onClose={() => setShareOpen(false)}
                    image={generatedImage || undefined}
                  />
                </>
              )}
              {videoFeatureEnabled && (
                <Card className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold text-gray-800">
                      Create video clip
                    </h3>
                    <p className="text-sm text-gray-500">
                      Turn the generated look into a short clip.
                    </p>
                    {isSafari && (
                      <p className="text-xs text-amber-600">
                        Safari에서는 다운로드가 제한될 수 있어요. Chrome 또는
                        Edge 사용을 권장합니다.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label
                      className="text-xs font-medium text-gray-500 uppercase tracking-wide"
                      htmlFor="video-prompt"
                    >
                      Prompt
                    </label>
                    <Input
                      id="video-prompt"
                      value={videoPrompt}
                      onChange={(e) => setVideoPrompt(e.target.value)}
                      placeholder="Describe the tone or mood for the clip"
                      disabled={
                        promptLocked ||
                        videoStatus === "starting" ||
                        videoStatus === "polling"
                      }
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      onClick={handleStartVideoGeneration}
                      disabled={
                        !generatedImage ||
                        videoStatus === "starting" ||
                        videoStatus === "polling"
                      }
                      loading={
                        videoStatus === "starting" || videoStatus === "polling"
                      }
                    >
                      Generate video
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelVideoPolling}
                      disabled={
                        videoStatus !== "starting" && videoStatus !== "polling"
                      }
                    >
                      Cancel
                    </Button>
                    {(videoStatus === "starting" ||
                      videoStatus === "polling") && (
                      <span className="text-xs text-gray-500">
                        Generating...
                      </span>
                    )}
                    {videoStatus === "completed" && videoUrls.length === 0 && (
                      <span className="text-xs text-gray-500">
                        No download link returned.
                      </span>
                    )}
                  </div>
                  {typeof videoProgress === "number" && (
                    <p className="text-xs text-gray-500">
                      Progress:{" "}
                      {Math.min(100, Math.max(0, Math.round(videoProgress)))}%
                    </p>
                  )}
                  {videoOperationName && (
                    <p className="text-xs text-gray-400 break-all">
                      Operation: {videoOperationName}
                    </p>
                  )}
                  {videoError && (
                    <p className="text-sm text-red-500">{videoError}</p>
                  )}
                  {videoUrls.length > 0 && (
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-medium text-gray-700">
                          Preview
                        </p>
                        <div className="w-full rounded-lg overflow-hidden bg-black">
                          <video
                            key={selectedVideoIndex}
                            src={toPlayable(videoUrls[selectedVideoIndex])}
                            controls
                            playsInline
                            className="w-full h-auto"
                          />
                        </div>
                      </div>
                      {videoUrls.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                          {videoUrls.map((_, idx) => (
                            <button
                              key={idx}
                              className={`px-2 py-1 text-xs rounded-full border ${
                                idx === selectedVideoIndex
                                  ? "bg-[#111111] text-white"
                                  : "bg-white text-gray-700"
                              }`}
                              onClick={() => setSelectedVideoIndex(idx)}
                            >
                              Clip {idx + 1}
                            </button>
                          ))}
                        </div>
                      )}
                      <p className="text-sm font-medium text-gray-700">
                        Download
                      </p>
                      <ul className="space-y-1">
                        {videoUrls.map((url, idx) => (
                          <li
                            key={url}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="text-xs text-gray-500">
                              Clip {idx + 1}
                            </span>
                            <a
                              className="text-sm text-blue-600 underline"
                              href={toPlayable(url)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              )}
              {/* ModelPicker moved to left sidebar in input section */}
              {likedItems.length > 0 && (
                <Card className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Quick add from likes
                  </h3>
                  <div className="overflow-x-auto whitespace-nowrap flex gap-4 pb-1">
                    {likedItems.map((item) => {
                      const cat = (item.category ?? "").toLowerCase();

                      let slot: "top" | "pants" | "shoes" | "outer" | null =
                        null;
                      if (cat.includes("outer")) slot = "outer";
                      else if (cat.includes("top")) slot = "top";
                      else if (cat.includes("pant")) slot = "pants";
                      else if (cat.includes("shoe")) slot = "shoes";

                      if (!slot) return null;

                      const handleAdd = async () => {
                        if (!item.imageUrl) {
                          addToast(toast.error("Image URL is missing."));
                          return;
                        }
                        try {
                          const uploaded = await imageProxy.toUploadedImage(
                            item.imageUrl,
                            item.title
                          );
                          if (slot === "top") {
                            setTopImage(uploaded);
                            setTopLabel(item.title);
                            recordInput(
                              { top: uploaded },
                              { top: item.title },
                              "delta",
                              undefined,
                              { top: String(item.id) }
                            );
                          }
                          if (slot === "pants") {
                            setPantsImage(uploaded);
                            setPantsLabel(item.title);
                            recordInput(
                              { pants: uploaded },
                              { pants: item.title },
                              "delta",
                              undefined,
                              { pants: String(item.id) }
                            );
                          }
                          if (slot === "shoes") {
                            setShoesImage(uploaded);
                            setShoesLabel(item.title);
                            recordInput(
                              { shoes: uploaded },
                              { shoes: item.title },
                              "delta",
                              undefined,
                              { shoes: String(item.id) }
                            );
                          }
                          if (slot === "outer") {
                            setOuterImage(uploaded);
                            setOuterLabel(item.title);
                            recordInput(
                              { outer: uploaded },
                              { outer: item.title },
                              "delta",
                              undefined,
                              { outer: String(item.id) }
                            );
                          }

                          addToast(
                            toast.success(
                              "Added to fitting queue",
                              `${item.title} -> ${slot}`,
                              { duration: 2000 }
                            )
                          );

                          if (!personImage) {
                            addToast(
                              toast.info(
                                "Choose a model first",
                                "Select a base model to apply outfits automatically.",
                                { duration: 1800 }
                              )
                            );
                          }
                        } catch (error: any) {
                          addToast(
                            toast.error(
                              "Failed to load liked item",
                              error?.message
                            )
                          );
                        }
                      };

                      // ✅ JSX는 handleAdd 밖에서 반환
                      return (
                        <div key={item.id} className="inline-block w-40">
                          <div
                            className="aspect-square rounded-lg overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200 cursor-pointer"
                            onClick={handleAdd}
                            title={`Tap to use this liked ${slot}`}
                          >
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt={item.title}
                                className="w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <p
                            className="mt-1 text-xs text-gray-600 truncate"
                            title={item.title}
                          >
                            {item.title}
                          </p>
                          <div className="mt-1">
                            <Button size="sm" onClick={handleAdd}>
                              Use ({slot})
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}

              {/* Recommendations Section */}
              {(recommendations || isLoadingRecommendations) && (
                <div className="mt-8">
                  {isLoadingRecommendations ? (
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                        <span className="ml-3 text-gray-600">
                          異붿쿇 ?곹뭹??遺덈윭?ㅻ뒗 以?..
                        </span>
                      </div>
                    </div>
                  ) : recommendations ? (
                    <RecommendationDisplay
                      recommendations={recommendations}
                      onItemClick={addCatalogItemToSlot}
                    />
                  ) : null}
                </div>
              )}
              {/* LLM 평가: 히스토리 선택 최소 수 */}
              {/* HistoryEvaluator removed per request */}
              {/* Fallback random items before recommendations are available (hidden here; moved to bottom full-width) */}
              {!recommendations && !isLoadingRecommendations && (
                <div className="mt-8 hidden">
                  <Card>
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-2xl font-bold text-gray-800">
                        랜덤 아이템
                      </h2>
                      <Button
                        size="sm"
                        onClick={() => fetchRandom(12)}
                        loading={isLoadingRandom}
                      >
                        새로고침
                      </Button>
                    </div>
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          상의
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {randomItemsByCat.top.map((item) => (
                            <Card
                              key={item.id}
                              className="cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() => addToSlotForced(item, "top")}
                              padding="sm"
                            >
                              <div
                                className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                                  selectedTopId === String(item.id)
                                    ? "ring-2 ring-blue-500"
                                    : ""
                                }`}
                              >
                                {item.imageUrl && (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <p
                                className="text-xs text-gray-700 truncate"
                                title={item.title}
                              >
                                {item.title}
                              </p>
                            </Card>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          하의
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {randomItemsByCat.pants.map((item) => (
                            <Card
                              key={item.id}
                              className="cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() => addToSlotForced(item, "pants")}
                              padding="sm"
                            >
                              <div
                                className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                                  selectedPantsId === String(item.id)
                                    ? "ring-2 ring-blue-500"
                                    : ""
                                }`}
                              >
                                {item.imageUrl && (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <p
                                className="text-xs text-gray-700 truncate"
                                title={item.title}
                              >
                                {item.title}
                              </p>
                            </Card>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          아우터
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {randomItemsByCat.outer.map((item) => (
                            <Card
                              key={item.id}
                              className="cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() => addToSlotForced(item, "outer")}
                              padding="sm"
                            >
                              <div
                                className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                                  selectedOuterId === String(item.id)
                                    ? "ring-2 ring-blue-500"
                                    : ""
                                }`}
                              >
                                {item.imageUrl && (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <p
                                className="text-xs text-gray-700 truncate"
                                title={item.title}
                              >
                                {item.title}
                              </p>
                            </Card>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-800 mb-2">
                          신발
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          {randomItemsByCat.shoes.map((item) => (
                            <Card
                              key={item.id}
                              className="cursor-pointer hover:shadow-lg transition-shadow"
                              onClick={() => addToSlotForced(item, "shoes")}
                              padding="sm"
                            >
                              <div
                                className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                                  selectedShoesId === String(item.id)
                                    ? "ring-2 ring-blue-500"
                                    : ""
                                }`}
                              >
                                {item.imageUrl && (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                  />
                                )}
                              </div>
                              <p
                                className="text-xs text-gray-700 truncate"
                                title={item.title}
                              >
                                {item.title}
                              </p>
                            </Card>
                          ))}
                        </div>
                      </div>
                      {randomItemsByCat.top.length +
                        randomItemsByCat.pants.length +
                        randomItemsByCat.shoes.length ===
                        0 && (
                        <div className="text-center text-gray-500 py-6">
                          아이템을 불러올 수 없거나 결과가 없습니다.
                        </div>
                      )}
                    </div>
                  </Card>
                </div>
              )}
              {/* close result panel */}
            </div>
            {/* close grid container */}
          </div>
          {/* 좌측 세로 젠더 필터 버튼 (사이버 피팅 화면에도 적용) */}
          <div className="hidden md:flex fixed left-4 top-1/2 -translate-y-1/2 z-30">
            <div className="flex flex-col gap-2 rounded-full border border-[var(--divider)] bg-white/90 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-white/70">
              {(
                [
                  { key: "all", label: "전체" },
                  { key: "male", label: "남성" },
                  { key: "female", label: "여성" },
                ] as { key: "all" | "male" | "female"; label: string }[]
              ).map(({ key, label }) => {
                const active = vtGender === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setVtGender(key)}
                    className={[
                      "px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 text-left",
                      active
                        ? "bg-black text-white shadow-sm"
                        : "text-[var(--text-strong)] hover:bg-gray-100",
                    ].join(" ")}
                    title={`${label} 상품만 보기`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Bottom full-width Random Items section */}
          <section className="mt-10">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-800">
                  랜덤 아이템
                </h2>
                <Button
                  size="sm"
                  onClick={() => fetchRandom(12)}
                  loading={isLoadingRandom}
                >
                  새로고침
                </Button>
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    상의
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {randomItemsByCat.top.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => addToSlotForced(item, "top")}
                        padding="sm"
                      >
                        <div
                          className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                            selectedTopId === String(item.id)
                              ? "ring-2 ring-blue-500"
                              : ""
                          }`}
                        >
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <p
                          className="text-xs text-gray-700 truncate"
                          title={item.title}
                        >
                          {item.title}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    하의
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {randomItemsByCat.pants.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => addToSlotForced(item, "pants")}
                        padding="sm"
                      >
                        <div
                          className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                            selectedPantsId === String(item.id)
                              ? "ring-2 ring-blue-500"
                              : ""
                          }`}
                        >
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <p
                          className="text-xs text-gray-700 truncate"
                          title={item.title}
                        >
                          {item.title}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    아우터
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {randomItemsByCat.outer.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => addToSlotForced(item, "outer")}
                        padding="sm"
                      >
                        <div
                          className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                            selectedOuterId === String(item.id)
                              ? "ring-2 ring-blue-500"
                              : ""
                          }`}
                        >
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <p
                          className="text-xs text-gray-700 truncate"
                          title={item.title}
                        >
                          {item.title}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">
                    신발
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {randomItemsByCat.shoes.map((item) => (
                      <Card
                        key={item.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow"
                        onClick={() => addToSlotForced(item, "shoes")}
                        padding="sm"
                      >
                        <div
                          className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${
                            selectedShoesId === String(item.id)
                              ? "ring-2 ring-blue-500"
                              : ""
                          }`}
                        >
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <p
                          className="text-xs text-gray-700 truncate"
                          title={item.title}
                        >
                          {item.title}
                        </p>
                      </Card>
                    ))}
                  </div>
                </div>
                {randomItemsByCat.top.length +
                  randomItemsByCat.pants.length +
                  randomItemsByCat.shoes.length ===
                  0 && (
                  <div className="text-center text-gray-500 py-6">
                    아이템을 불러올 수 없거나 결과가 없습니다.
                  </div>
                )}
              </div>
            </Card>
          </section>
        </main>
      </div>
    </div>
  );
};