import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '../../../services/api.service';
import { imageProxy } from '../../../services/imageProxy.service';
import { likesService } from '../../../services/likes.service';
import { manageStorageSpace } from '../../../services/storage.service';
import { tryOnHistory } from '../../../services/tryon_history.service';
import { virtualTryOnService } from '../../../services/virtualTryOn.service';
import type { ApiFile, ClothingItems, RecommendationItem, UploadedImage } from '../../../types';
import { normalizeCategoryLoose } from '../../../utils/category';
import { Button, Card, Input, toast, useToast } from '../../ui';
import { Header } from '../layout/Header';
import { RecommendationDisplay } from '../recommendations/RecommendationDisplay';
import { StyleTipsCard } from '../tips/StyleTipsCard';
import { ClothingItemOverlay } from './ClothingItemOverlay';
import { CombineButton } from './CombineButton';
import { ImageUploader } from './ImageUploader';
import { ModelPicker } from './ModelPicker';
import { ResultDisplay } from './ResultDisplay';
import { SnsShareDialog } from './SnsShareDialog';
import { TryOnHistory } from './TryOnHistory';
// Simple feature-flag helper (treats undefined as ON)
const isFeatureEnabled = (value: unknown): boolean => {
  if (value === undefined || value === null) return true;
  const normalized = String(value).trim().toLowerCase();
  return !(normalized === '0' || normalized === 'false' || normalized === 'off');
};

export const VirtualTryOnUI: React.FC = () => {
    // ?곹깭瑜?localStorage?먯꽌 蹂듭썝
    const [personImage, setPersonImage] = useState<UploadedImage | null>(null);
    const [topImage, setTopImage] = useState<UploadedImage | null>(null);
    const [pantsImage, setPantsImage] = useState<UploadedImage | null>(null);
    const [shoesImage, setShoesImage] = useState<UploadedImage | null>(null);
    const [outerImage, setOuterImage] = useState<UploadedImage | null>(null);
    const [personSource, setPersonSource] = useState<'model' | 'upload' | 'unknown'>(() => {
        try {
            const saved = localStorage.getItem('virtualTryOn_personSource');
            return (saved as 'model' | 'upload' | 'unknown') || 'unknown';
        } catch { return 'unknown'; }
    });
    const [topLabel, setTopLabel] = useState<string | undefined>(() => {
        try {
            const saved = localStorage.getItem('virtualTryOn_topLabel');
            return saved || undefined;
        } catch { return undefined; }
    });
    const [pantsLabel, setPantsLabel] = useState<string | undefined>(() => {
        try {
            const saved = localStorage.getItem('virtualTryOn_pantsLabel');
            return saved || undefined;
        } catch { return undefined; }
    });
    const [shoesLabel, setShoesLabel] = useState<string | undefined>(() => {
        try {
            const saved = localStorage.getItem('virtualTryOn_shoesLabel');
            return saved || undefined;
        } catch { return undefined; }
    });
    const [outerLabel, setOuterLabel] = useState<string | undefined>(() => {
        try {
            const saved = localStorage.getItem('virtualTryOn_outerLabel');
            return saved || undefined;
        } catch { return undefined; }
    });
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<any>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isLoadingRecommendations, setIsLoadingRecommendations] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const { addToast } = useToast();
    const [shareOpen, setShareOpen] = useState<boolean>(false);
    // Video generation state
    const [videoPrompt, setVideoPrompt] = useState<string>((import.meta as any).env?.VITE_VIDEO_PROMPT || 'Create an 8-second lookbook video for this outfit.');
    const [videoStatus, setVideoStatus] = useState<'idle' | 'starting' | 'polling' | 'completed' | 'error'>('idle');
    const [videoOperationName, setVideoOperationName] = useState<string | null>(null);
    const [videoError, setVideoError] = useState<string | null>(null);
    const [videoUrls, setVideoUrls] = useState<string[]>([]);
const [selectedVideoIndex, setSelectedVideoIndex] = useState<number>(0);
const toPlayable = (u: string) => (u && u.startsWith('gs://')) ? `/api/try-on/video/stream?uri=${encodeURIComponent(u)}` : u;
    const [videoProgress, setVideoProgress] = useState<number | null>(null);
    const videoPollTimeoutRef = useRef<number | null>(null);
    const videoDefaults = {
        aspectRatio: (import.meta as any).env?.VITE_VIDEO_ASPECT || '9:16',
        durationSeconds: (import.meta as any).env?.VITE_VIDEO_DURATION || '4',
        resolution: (import.meta as any).env?.VITE_VIDEO_RESOLUTION || '720p',
    } as const;
    const promptLocked = isFeatureEnabled((import.meta as any).env?.VITE_VIDEO_PROMPT_LOCK);
    const shareFeatureEnabled = isFeatureEnabled((import.meta as any).env?.VITE_FEATURE_SHARE);
    const videoFeatureEnabled = isFeatureEnabled((import.meta as any).env?.VITE_FEATURE_VIDEO);
    const isSafari = typeof navigator !== 'undefined'
        ? (() => {
            const ua = navigator.userAgent.toLowerCase();
            return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('android');
        })()
        : false;
    // UI highlight states
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [selectedTopId, setSelectedTopId] = useState<string | null>(null);
    const [selectedPantsId, setSelectedPantsId] = useState<string | null>(null);
    const [selectedShoesId, setSelectedShoesId] = useState<string | null>(null);
    const [selectedOuterId, setSelectedOuterId] = useState<string | null>(null);
    
    // ?몃쾭 ?ㅻ쾭?덉씠 ?곹깭
    const [hoveredSlot, setHoveredSlot] = useState<'outer' | 'top' | 'pants' | 'shoes' | null>(null);
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

    // Restore slot selections and person image from localStorage snapshot when coming back
    useEffect(() => {
        try {
            const raw = localStorage.getItem('app:tryon:slots:v1');
            if (!raw) return;
            const snap: any = JSON.parse(raw);
            const tasks: Array<Promise<any>> = [];
            
            // 복원할 사람 이미지가 있고 현재 사람 이미지가 없을 때만 복원
            if (!personImage && snap.person) {
                setPersonImage(snap.person);
                setPersonSource(snap.personSource || 'unknown');
            }
            
            // 의류 아이템들 복원
            if (!outerImage && snap.outer) tasks.push(addToSlotForced(snap.outer as RecommendationItem, 'outer'));
            if (!topImage && snap.top) tasks.push(addToSlotForced(snap.top as RecommendationItem, 'top'));
            if (!pantsImage && snap.pants) tasks.push(addToSlotForced(snap.pants as RecommendationItem, 'pants'));
            if (!shoesImage && snap.shoes) tasks.push(addToSlotForced(snap.shoes as RecommendationItem, 'shoes'));
            
            if (tasks.length) Promise.allSettled(tasks).then(() => console.log('✅ 슬롯 스냅샷 복원 완료'));
        } catch (e) {
            console.warn('슬롯 스냅샷 복원 실패:', e);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist slot selections and person image to localStorage
    // Guard: avoid writing an all-null snapshot on initial mount
    useEffect(() => {
        try {
            const hasAny = !!(originalItems.outer || originalItems.top || originalItems.pants || originalItems.shoes || personImage);
            if (hasAny) {
                const snapshot = {
                    person: personImage ? {
                        previewUrl: personImage.previewUrl,
                        base64: personImage.base64,
                        mimeType: personImage.mimeType
                    } : null,
                    personSource: personSource,
                    outer: originalItems.outer || null,
                    top: originalItems.top || null,
                    pants: originalItems.pants || null,
                    shoes: originalItems.shoes || null,
                };
                localStorage.setItem('app:tryon:slots:v1', JSON.stringify(snapshot));
            } else {
                localStorage.removeItem('app:tryon:slots:v1');
            }
        } catch {
            // ignore storage errors
        }
    }, [originalItems, personImage, personSource]);

    // Reflect history evaluations (scores) for current generated image
    const [historyTick, setHistoryTick] = useState<number>(0);
    useEffect(() => {
        const unsub = tryOnHistory.subscribe(() => setHistoryTick((x) => x + 1));
        return () => { unsub(); };
    }, []);
    const currentScore = React.useMemo(() => {
        if (!generatedImage) return null;
        const outs = tryOnHistory.outputs();
        const found = outs.find(o => o.image === generatedImage);
        return (found && typeof found.evaluation?.score === 'number') ? found.evaluation!.score : null;
    }, [generatedImage, historyTick]);
    // Video: polling helpers and lifecycle
    const clearVideoPoll = useCallback(() => {
        if (videoPollTimeoutRef.current !== null) {
            window.clearTimeout(videoPollTimeoutRef.current);
            videoPollTimeoutRef.current = null;
        }
        setVideoProgress(null);
    }, []);

    const pollVideoStatus = useCallback((operationName: string, attempt: number = 0) => {
        const execute = async () => {
            try {
                const status = await virtualTryOnService.fetchVideoStatus(operationName);
                let progress: number | null = null;
                const rawProgress = (status as any).progressPercent;
                if (typeof rawProgress === 'number') {
                    progress = rawProgress;
                } else if (typeof rawProgress === 'string') {
                    const parsed = Number(rawProgress);
                    if (!Number.isNaN(parsed)) {
                        progress = parsed;
                    }
                }
                setVideoProgress(progress);
                if (status.done) {
                    clearVideoPoll();
                    setVideoStatus('completed');
                    { const urls = Array.isArray((status as any).videoUris) ? (status as any).videoUris : []; const dataUris = Array.isArray((status as any).videoDataUris) ? (status as any).videoDataUris : []; setVideoUrls([...urls, ...dataUris]); }
                    setVideoProgress(progress ?? 100);
                    return;
                }
                setVideoStatus('polling');
                const delay = Math.min(2000 + attempt * 500, 6000);
                videoPollTimeoutRef.current = window.setTimeout(() => {
                    pollVideoStatus(operationName, attempt + 1);
                }, delay);
            } catch (err) {
                clearVideoPoll();
                setVideoProgress(null);
                setVideoStatus('error');
                setVideoError(err instanceof Error ? err.message : 'Failed to fetch video status.');
            }
        };
        void execute();
    }, [clearVideoPoll]);

    useEffect(() => () => { clearVideoPoll(); }, [clearVideoPoll]);

    useEffect(() => {
        if (!generatedImage) {
            clearVideoPoll();
            setVideoStatus('idle');
            setVideoOperationName(null);
            setVideoError(null);
            setVideoUrls([]);
            setVideoProgress(null);
        }
    }, [generatedImage, clearVideoPoll]);

    useEffect(() => {
        if (!videoFeatureEnabled) {
            clearVideoPoll();
            setVideoStatus('idle');
            setVideoOperationName(null);
            setVideoError(null);
            setVideoUrls([]);
            setVideoProgress(null);
        }
    }, [videoFeatureEnabled, clearVideoPoll]);

    const handleStartVideoGeneration = useCallback(async () => {
        if (!generatedImage) {
            addToast(toast.info('Generate a try-on image first.', undefined, { duration: 1600 }));
            return;
        }
        const trimmed = (promptLocked ? ((import.meta as any).env?.VITE_VIDEO_PROMPT || videoPrompt) : videoPrompt).trim();
        if (!trimmed) {
            addToast(toast.info('Enter a prompt for the video.', undefined, { duration: 1600 }));
            return;
        }
        clearVideoPoll();
        setVideoError(null);
        setVideoUrls([]);
        setVideoOperationName(null);
        setVideoProgress(0);
        setVideoStatus('starting');
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
            setVideoStatus('polling');
            addToast(toast.success('Video generation started. Hang tight!', undefined, { duration: 1800 }));
            videoPollTimeoutRef.current = window.setTimeout(() => { pollVideoStatus(op); }, 1500);
        } catch (err) {
            clearVideoPoll();
            const message = err instanceof Error ? err.message : 'Video generation failed. Please try again later.';
            setVideoStatus('error');
            setVideoError(message);
            addToast(toast.error(message, undefined, { duration: 2200 }));
        }
    }, [generatedImage, videoPrompt, clearVideoPoll, pollVideoStatus, addToast]);

    const handleCancelVideoPolling = useCallback(() => {
        clearVideoPoll();
        setVideoStatus('idle');
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
        const onStorage = (e: StorageEvent) => { if (e.key === 'app:likes:v1') setLikedItems(likesService.getAll()); };
        window.addEventListener('storage', onStorage);
        return () => { unsub(); window.removeEventListener('storage', onStorage); };
    }, []);

    // ?대?吏 蹂듭썝 鍮꾪솢?깊솕 (?⑸웾 臾몄젣濡??명빐)


    // ?곹깭瑜?localStorage?????(?대?吏 ?쒖쇅, ?쇰꺼留????
    useEffect(() => {
        if (personImage) {
            // ?대?吏????ν븯吏 ?딄퀬 ?쇰꺼留????
            localStorage.setItem('virtualTryOn_personSource', personSource);
        } else {
            localStorage.removeItem('virtualTryOn_personImage');
        }
    }, [personImage, personSource]);

    useEffect(() => {
        // ?대?吏????ν븯吏 ?딄퀬 ?쇰꺼留????
        if (topLabel) {
            localStorage.setItem('virtualTryOn_topLabel', topLabel);
        } else {
            localStorage.removeItem('virtualTryOn_topLabel');
        }
    }, [topLabel]);

    useEffect(() => {
        // ?대?吏????ν븯吏 ?딄퀬 ?쇰꺼留????
        if (pantsLabel) {
            localStorage.setItem('virtualTryOn_pantsLabel', pantsLabel);
        } else {
            localStorage.removeItem('virtualTryOn_pantsLabel');
        }
    }, [pantsLabel]);

    useEffect(() => {
        // ?대?吏????ν븯吏 ?딄퀬 ?쇰꺼留????
        if (shoesLabel) {
            localStorage.setItem('virtualTryOn_shoesLabel', shoesLabel);
        } else {
            localStorage.removeItem('virtualTryOn_shoesLabel');
        }
    }, [shoesLabel]);

    useEffect(() => {
        // ?대?吏????ν븯吏 ?딄퀬 ?쇰꺼留????
        if (outerLabel) {
            localStorage.setItem('virtualTryOn_outerLabel', outerLabel);
        } else {
            localStorage.removeItem('virtualTryOn_outerLabel');
        }
    }, [outerLabel]);


    // ?곹뭹 移대뱶?먯꽌 ?꾨떖???곹뭹???먮룞?쇰줈 移몄뿉 ?ｊ린
    const hasProcessedRef = useRef(false);
    
    useEffect(() => {
        const handlePendingItem = async () => {
            
            try {
                // ?щ윭 ?꾩씠??泥섎━ (?덈줈??諛⑹떇)
                const pendingItemsStr = localStorage.getItem('app:pendingVirtualFittingItems');
                if (pendingItemsStr) {
                    console.log('?щ윭 ?꾩씠??泥섎━ ?쒖옉');
                    const pendingItems = JSON.parse(pendingItemsStr);
                    hasProcessedRef.current = true;

                    for (const item of pendingItems) {
                        await addCatalogItemToSlot(item);
                    }

                    addToast(toast.success(`${pendingItems.length} items queued for fitting`, undefined, { duration: 2000 }));
                    localStorage.removeItem('app:pendingVirtualFittingItems');
                    return;
                }

                // ?⑥씪 ?꾩씠??泥섎━ (湲곗〈 諛⑹떇)
                const pendingItemStr = localStorage.getItem('app:pendingVirtualFittingItem');
                if (!pendingItemStr) return;

                const pendingItem = JSON.parse(pendingItemStr);

                // 5遺??대궡???곹뭹留?泥섎━ (?ㅻ옒???곗씠??諛⑹?)
                if (Date.now() - pendingItem.timestamp > 5 * 60 * 1000) {
                    localStorage.removeItem('app:pendingVirtualFittingItem');
                    return;
                }

                // 移댄뀒怨좊━???곕씪 ?곸젅??移몄뿉 ?ｊ린
                const cat = (pendingItem.category || '').toLowerCase();
                
                
                // 諛깆뿏?쒖? ?숈씪??移댄뀒怨좊━ 留ㅽ븨 濡쒖쭅 ?ъ슜
                const slot: 'top' | 'pants' | 'shoes' | 'outer' | null = 
                    (cat === 'outer') ? 'outer'
                    : (cat === 'top') ? 'top'
                    : (cat === 'pants') ? 'pants'
                    : (cat === 'shoes') ? 'shoes'
                    : null;

                console.log('寃곗젙???щ’:', slot);
                if (!slot) {
                    console.log('移댄뀒怨좊━瑜??몄떇?????놁쓬:', cat);
                    localStorage.removeItem('app:pendingVirtualFittingItem');
                    return;
                }

                if (!pendingItem.imageUrl) {
                    console.log('?대?吏 URL???놁쓬');
                    localStorage.removeItem('app:pendingVirtualFittingItem');
                    return;
                }

                // 泥섎━ ?쒖옉 ?뚮옒洹??ㅼ젙
                hasProcessedRef.current = true;

                console.log('?대?吏 蹂???쒖옉');
                // ?대?吏瑜?UploadedImage ?뺤떇?쇰줈 蹂??
                const uploadedImage = await imageProxy.toUploadedImage(pendingItem.imageUrl, pendingItem.title);
                console.log('?대?吏 蹂???꾨즺:', uploadedImage);
                
                // addCatalogItemToSlot???ъ슜?댁꽌 ?먮낯 ?곗씠?곕룄 ?④퍡 ???
                console.log('addCatalogItemToSlot ?몄텧 ?쒖옉, ?щ’:', slot);
                await addCatalogItemToSlot(pendingItem);

                addToast(toast.success(`Queued for fitting: ${pendingItem.title}`, undefined, { duration: 2000 }));
                
                // 泥섎━ ?꾨즺 ??localStorage?먯꽌 ?쒓굅
                localStorage.removeItem('app:pendingVirtualFittingItem');
                console.log('?곹뭹???먮룞?쇰줈 移몄뿉 ?ㅼ뼱媛붿뒿?덈떎:', slot);

            } catch (error) {
                console.error('?먮룞 ?곹뭹 異붽? ?ㅽ뙣:', error);
                localStorage.removeItem('app:pendingVirtualFittingItem');
                hasProcessedRef.current = false; // ?ㅽ뙣 ???뚮옒洹?由ъ뀑
            }
        };

        handlePendingItem();
        
        // ?ㅽ넗由ъ? ?뺣━ ?ㅽ뻾
        manageStorageSpace();
        
        return () => {
            // cleanup
        };
    }, []); // ?섏〈??諛곗뿴??鍮?諛곗뿴濡?蹂寃?

    // Recommendation filter options
    const [minPrice, setMinPrice] = useState<string>('');
    const [maxPrice, setMaxPrice] = useState<string>('');
    const [excludeTagsInput, setExcludeTagsInput] = useState<string>('');

    // Random items to show before recommendations are available
    const [randomItemsByCat, setRandomItemsByCat] = useState<{ top: RecommendationItem[]; pants: RecommendationItem[]; shoes: RecommendationItem[]; outer: RecommendationItem[] }>({ top: [], pants: [], shoes: [], outer: [] });
    const [isLoadingRandom, setIsLoadingRandom] = useState<boolean>(false);
    const fetchRandom = useCallback(async (limit: number = 12) => {
        try {
            setIsLoadingRandom(true);
            const per = Math.max(1, Math.floor(limit / 4)); // 4媛?移댄뀒怨좊━濡??섎늻湲?
            const [tops, pants, shoes, outers] = await Promise.all([
                apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${per}&category=top`).catch(() => [] as RecommendationItem[]),
                apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${per}&category=pants`).catch(() => [] as RecommendationItem[]),
                apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${per}&category=shoes`).catch(() => [] as RecommendationItem[]),
                apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${per}&category=outer`).catch(() => [] as RecommendationItem[]),
            ]);
            setRandomItemsByCat({ top: tops, pants, shoes, outer: outers });
        } catch (e) {
            // ignore silently
            setRandomItemsByCat({ top: [], pants: [], shoes: [], outer: [] });
        } finally {
            setIsLoadingRandom(false);
        }
    }, []);
    useEffect(() => {
        // Fetch once on mount; keep until proper recommendations arrive
        fetchRandom(12);
    }, [fetchRandom]);

    const convertToApiFile = (uploadedImage: UploadedImage): ApiFile => ({
        base64: uploadedImage.base64,
        mimeType: uploadedImage.mimeType,
    });

    // helpers for history
    // toDataUrl ?⑥닔?????댁긽 ?ъ슜?섏? ?딆쓬 (?대?吏 ????덊븿)
    // mode: 'delta' logs only provided overrides; 'snapshot' logs full current state
    const recordInput = useCallback((
        overrides?: Partial<{ person: UploadedImage | null; top: UploadedImage | null; pants: UploadedImage | null; shoes: UploadedImage | null; outer: UploadedImage | null; }>,
        labels?: Partial<{ top: string; pants: string; shoes: string; outer: string }>,
        mode: 'delta' | 'snapshot' = 'delta',
        sourceOverride?: 'model' | 'upload' | 'unknown',
        productIds?: Partial<{ top: string; pants: string; shoes: string; outer: string }>,
        products?: Partial<{ top: RecommendationItem; pants: RecommendationItem; shoes: RecommendationItem; outer: RecommendationItem }>,
    ) => {

        console.log('🔔 recordInput 호출됨:', { overrides, labels, mode, productIds });
        // 이미지 변수들은 더 이상 사용하지 않음 (용량 절약)
        const src = sourceOverride ?? personSource;
        // Skip only when the event is a person change coming from AI model
        if (src === 'model' && overrides && 'person' in overrides) return;
        // For non-person events while using AI model, avoid labeling as 'model' to hide AI model traces
        const recordPerson: 'model' | 'upload' | 'unknown' = (src === 'model' && !(overrides && 'person' in overrides)) ? 'unknown' : src;
        tryOnHistory.addInput({
            person: recordPerson,
            topLabel: labels?.top ?? (mode === 'delta' ? undefined : topLabel),
            pantsLabel: labels?.pants ?? (mode === 'delta' ? undefined : pantsLabel),
            shoesLabel: labels?.shoes ?? (mode === 'delta' ? undefined : shoesLabel),
            outerLabel: labels?.outer ?? (mode === 'delta' ? undefined : outerLabel),
            // ?대?吏????ν븯吏 ?딆쓬 (?⑸웾 ?덉빟)
            topProductId: productIds?.top,
            pantsProductId: productIds?.pants,
            shoesProductId: productIds?.shoes,
            outerProductId: productIds?.outer,
            // ?곹뭹 ?곗씠?곕룄 ???(?대?吏 URL ?ы븿)
            topProduct: products?.top ?? originalItems.top,
            pantsProduct: products?.pants ?? originalItems.pants,
            shoesProduct: products?.shoes ?? originalItems.shoes,
            outerProduct: products?.outer ?? originalItems.outer,
        });
        console.log('🔔 tryOnHistory.addInput 호출 완료');
    }, [personSource, topLabel, pantsLabel, shoesLabel, outerLabel, originalItems]);

    const handleCombineClick = useCallback(async () => {
        const hasAnyClothing = !!(topImage || pantsImage || shoesImage || outerImage);
        // 사람 없어도 의류 1개 이상이면 진행(기본 3종 제한 해제)
        const allowWithoutPerson = !personImage && hasAnyClothing;
        const allowWithPerson = !!personImage && hasAnyClothing;
        if (!(allowWithoutPerson || allowWithPerson)) {
            setError("의류 이미지 1개 이상 또는 인물 사진을 제공해 주세요.");
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
            console.log('🔍 합성 요청 데이터:', {
                personImage: personImage ? '있음' : '없음',
                clothingItems: {
                    top: topImage ? '있음' : '없음',
                    pants: pantsImage ? '있음' : '없음', 
                    shoes: shoesImage ? '있음' : '없음',
                    outer: outerImage ? '있음' : '없음'
                },
                clothingItemsData: clothingItems,
                outerImage: outerImage,
                outerInClothingItems: clothingItems.outer,
                outerImageNull: outerImage === null,
                outerImageUndefined: outerImage === undefined
            });


            // Dress/Skirt heuristic from pants metadata/labels
            const bottomText = (
                (originalItems.pants?.title || '') + ' ' +
                ((originalItems.pants?.tags || []).join(' ')) + ' ' +
                (originalItems.pants?.category || '') + ' ' +
                (pantsLabel || '')
            ).toLowerCase();
            const hasDressTok = ['dress','onepiece','one-piece','ops','원피스'].some(t=>bottomText.includes(t));
            const hasSkirtTok = ['skirt','스커트','치마','플리츠','테니스','랩'].some(t=>bottomText.includes(t));
            const isDress = hasDressTok;
            const isSkirt = !hasDressTok && hasSkirtTok;

            // Identity lock when person image present
            const identityPrompt = personImage ? (
                'IDENTITY LOCK: Use the provided PERSON image only. Ignore any faces/skin/limbs in garment photos. ' +
                'Do not change the person\'s facial identity, body shape, pose, or expression. Do not copy the garment model\'s pose.'
            ) : undefined;

            // 하의가 드레스/스커트인 경우: 바지 금지. 스커트+상의 없음이면 기본 흰티 지시
            const bottomPrompt = (isDress || isSkirt) ? (
                [
                    `BOTTOM TYPE: ${isDress ? 'ONE-PIECE DRESS' : 'SKIRT'}.`,
                    'Do NOT generate trousers, leggings, or shorts.',
                    `Keep the ${isDress ? 'dress' : 'skirt'} silhouette and hem length consistent with the reference; do not convert to pants.`,
                    (isDress ? 'OVERRIDE MAPPING: Use the provided BOTTOM reference as a ONE-PIECE DRESS (bodice + skirt). Segment the upper part as the bodice to cover the torso, and the lower part as the skirt from the waist downward. Do not ignore this garment.' : ''),
                    (isDress ? 'If ONE-PIECE, treat it as both TOP and PANTS; do not invent a separate top. Remove the base TOP from the PERSON image so that only the dress bodice/neckline remains visible (strapless or off-shoulder allowed).' : ''),
                    (isSkirt && !topImage ? 'If TOP is missing with a SKIRT, add a plain white crew-neck short-sleeve T-shirt as TOP. No logos or graphics.' : ''),
                ].filter(Boolean).join(' ')
            ) : undefined;

            // 상의/하의 기본값(프롬프트 방식) — 드레스일 땐 하의 기본값 금지
            const topMissingPrompt = (!topImage && !isDress) ? (
                'If TOP is missing, add a plain white crew-neck short-sleeve T-shirt as the TOP. No logos or graphics. Natural cotton texture.'
            ) : undefined;
            const pantsMissingPrompt = (!pantsImage && !isDress) ? (
                'If PANTS are missing, add neutral straight-fit trousers in black or dark gray that pair well with the selected garments. No shorts or leggings.'
            ) : (isDress ? 'Under a ONE-PIECE dress, do NOT add any trousers or leggings.' : undefined);

            const fittingPrompt = (
                'Fit garments to the BASE PERSON with realistic warp and perspective; ' +
                'follow neckline/shoulders/waist/hips; respect arm/hand occlusion; ' +
                'add soft shadows and seamless blending; no flat pasting or rectangular cutouts.'
            );
            const fullBodyPrompt = personImage ? (
                'FULL-BODY VIEW: Show the full person head-to-toe. If the source photo is cropped, extend the canvas and synthesize missing lower body and legs with consistent anatomy, perspective, and lighting.'
            ) : undefined;

            const layeringPrompt = 'Apply garments in order: TOP, OUTER, then BOTTOM (pants or dress), then SHOES. Do not add accessories from reference photos.';
            const referenceExclusionPrompt = 'Do not copy the garment model\'s body, pose, or background objects. Transfer garments only.';

            const dynamicPrompt = [
                identityPrompt,
                fullBodyPrompt,
                layeringPrompt,
                fittingPrompt,
                referenceExclusionPrompt,
                bottomPrompt,
                topMissingPrompt,
                pantsMissingPrompt,
            ]
                .filter(Boolean)
                .join(' ');

            // 가상 피팅과 추천을 동시에 시작
            const virtualTryOnPromise = virtualTryOnService.combineImages({
                person: personImage ? convertToApiFile(personImage) : null,
                clothingItems,
                prompt: dynamicPrompt,
            });

            // 외부 데이터가 있는지 확인
            const hasExternalData = topImage || pantsImage || shoesImage || outerImage;
            
            let recommendationPromise;
            if (hasExternalData) {
                // 외부 데이터가 있으면 새로운 로직 사용
                recommendationPromise = getRecommendationsForSlots();
            } else {
                // 내부 데이터만 있으면 기존 로직 사용 (원래대로) - Azure OpenAI 호출 없음
                recommendationPromise = (async () => {
                    try {
                        const positions: number[] = [];
                        const itemsPayload: any[] = [];
                        
                        if (originalItems.top && originalItems.top.pos !== undefined) {
                            positions.push(originalItems.top.pos);
                            itemsPayload.push({
                                pos: originalItems.top.pos,
                                category: originalItems.top.category,
                                title: originalItems.top.title,
                                tags: originalItems.top.tags,
                                price: originalItems.top.price
                            });
                        }
                        if (originalItems.pants && originalItems.pants.pos !== undefined) {
                            positions.push(originalItems.pants.pos);
                            itemsPayload.push({
                                pos: originalItems.pants.pos,
                                category: originalItems.pants.category,
                                title: originalItems.pants.title,
                                tags: originalItems.pants.tags,
                                price: originalItems.pants.price
                            });
                        }
                        if (originalItems.shoes && originalItems.shoes.pos !== undefined) {
                            positions.push(originalItems.shoes.pos);
                            itemsPayload.push({
                                pos: originalItems.shoes.pos,
                                category: originalItems.shoes.category,
                                title: originalItems.shoes.title,
                                tags: originalItems.shoes.tags,
                                price: originalItems.shoes.price
                            });
                        }
                        if (originalItems.outer && originalItems.outer.pos !== undefined) {
                            positions.push(originalItems.outer.pos);
                            itemsPayload.push({
                                pos: originalItems.outer.pos,
                                category: originalItems.outer.category,
                                title: originalItems.outer.title,
                                tags: originalItems.outer.tags,
                                price: originalItems.outer.price
                            });
                        }

                        const byPos = await apiClient.recommendByPositions({
                            positions,
                            items: itemsPayload,
                            min_price: minPrice ? Number(minPrice) : undefined,
                            max_price: maxPrice ? Number(maxPrice) : undefined,
                            exclude_tags: excludeTagsInput ? excludeTagsInput.split(',').map(t => t.trim()) : [],
                            final_k: 3,
                            use_llm_rerank: false, // 내부 데이터는 LLM 리랭킹 비활성화
                        });
                        
                        // toCategoryRecs 함수 정의
                        const toCategoryRecs = (arr: RecommendationItem[]) => {
                            const buckets: any = { top: [], pants: [], shoes: [], outer: [], accessories: [] };
                            for (const it of arr) {
                                const key = normalizeCategoryLoose(String(it.category || ''));
                                buckets[key].push(it);
                            }
                            return buckets;
                        };
                        
                        return toCategoryRecs(byPos);
                    } catch (error) {
                        console.error('내부 데이터 추천 실패:', error);
                        return null;
                    }
                })();
            }

            // 가상 피팅과 추천을 병렬로 실행
            const [virtualTryOnResult, recommendations] = await Promise.all([
                virtualTryOnPromise,
                recommendationPromise
            ]);

            if (virtualTryOnResult.generatedImage) {
                setGeneratedImage(virtualTryOnResult.generatedImage);
                // Record output history (data URI)
                await tryOnHistory.addOutput(virtualTryOnResult.generatedImage);
            }

            if (recommendations) {
                setRecommendations(recommendations);
            }

        } catch (error) {
            console.error('Failed to process:', error);
            setError(error instanceof Error ? error.message : 'Failed to process');
        } finally {
            setIsLoading(false);
            setIsLoadingRecommendations(false);
        }
    }, [personImage, topImage, pantsImage, shoesImage, outerImage, minPrice, maxPrice, excludeTagsInput, originalItems, pantsLabel]);

    // 추천 로직을 별도 함수로 분리
    const getRecommendationsForSlots = useCallback(async () => {
        try {
            // 슬롯별로 내부/외부 데이터 구분하여 처리 (내부 아이템 우선)
            const clothingSlots: Record<string, any> = {
                top: originalItems.top ? {
                    // 내부 아이템: originalItems.top 정보 사용
                    id: originalItems.top.id,
                    pos: originalItems.top.pos,
                    title: originalItems.top.title,
                    price: originalItems.top.price,
                    category: originalItems.top.category,
                    imageUrl: originalItems.top.imageUrl,
                    productUrl: originalItems.top.productUrl,
                    tags: originalItems.top.tags
                } : (topImage ? {
                    // 외부 업로드: base64 정보 사용
                    base64: topImage.base64,
                    mimeType: topImage.mimeType,
                    isExternal: true
                } : null),
                pants: originalItems.pants ? {
                    // 내부 아이템: originalItems.pants 정보 사용
                    id: originalItems.pants.id,
                    pos: originalItems.pants.pos,
                    title: originalItems.pants.title,
                    price: originalItems.pants.price,
                    category: originalItems.pants.category,
                    imageUrl: originalItems.pants.imageUrl,
                    productUrl: originalItems.pants.productUrl,
                    tags: originalItems.pants.tags
                } : (pantsImage ? {
                    // 외부 업로드: base64 정보 사용
                    base64: pantsImage.base64,
                    mimeType: pantsImage.mimeType,
                    isExternal: true
                } : null),
                shoes: originalItems.shoes ? {
                    // 내부 아이템: originalItems.shoes 정보 사용
                    id: originalItems.shoes.id,
                    pos: originalItems.shoes.pos,
                    title: originalItems.shoes.title,
                    price: originalItems.shoes.price,
                    category: originalItems.shoes.category,
                    imageUrl: originalItems.shoes.imageUrl,
                    productUrl: originalItems.shoes.productUrl,
                    tags: originalItems.shoes.tags
                } : (shoesImage ? {
                    // 외부 업로드: base64 정보 사용
                    base64: shoesImage.base64,
                    mimeType: shoesImage.mimeType,
                    isExternal: true
                } : null),
                outer: originalItems.outer ? {
                    // 내부 아이템: originalItems.outer 정보 사용
                    id: originalItems.outer.id,
                    pos: originalItems.outer.pos,
                    title: originalItems.outer.title,
                    price: originalItems.outer.price,
                    category: originalItems.outer.category,
                    imageUrl: originalItems.outer.imageUrl,
                    productUrl: originalItems.outer.productUrl,
                    tags: originalItems.outer.tags
                } : (outerImage ? {
                    // 외부 업로드: base64 정보 사용
                    base64: outerImage.base64,
                    mimeType: outerImage.mimeType,
                    isExternal: true
                } : null)
            };

            // 내부 데이터와 외부 데이터 분리
            const internalSlots: Array<{ slot: 'top'|'pants'|'shoes'|'outer'; item: RecommendationItem }> = [];
            const externalSlots: Array<{ slot: 'top'|'pants'|'shoes'|'outer'; data: any }> = [];

            for (const [slotName, slotData] of Object.entries(clothingSlots)) {
                if (slotData) {
                    if (slotData.isExternal) {
                        externalSlots.push({ slot: slotName as any, data: slotData });
                    } else {
                        internalSlots.push({ slot: slotName as any, item: slotData });
                    }
                }
            }

            console.log('🔍 슬롯 분류:', { internalSlots, externalSlots });
            console.log('🔍 originalItems 상태:', originalItems);
            console.log('🔍 topImage 상태:', topImage);
            console.log('🔍 pantsImage 상태:', pantsImage);

                    // 내부 데이터 처리 (기존 로직)
                    const positions: number[] = [];
                    const itemsPayload: any[] = [];
                    for (const s of internalSlots) {
                        const idNum = Number(s.item.id);
                        const posNum = Number.isFinite(s.item.pos as any) ? Number(s.item.pos) : (Number.isFinite(idNum) ? idNum : NaN);
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
                        const buckets: any = { top: [], pants: [], shoes: [], outer: [], accessories: [] };
                        for (const it of arr) {
                            const key = normalizeCategoryLoose(String(it.category || ''));
                            buckets[key].push(it);
                        }
                        return buckets;
                    };

                    // 내부 데이터와 외부 데이터를 병렬로 처리
                    const allRecommendations: any = { top: [], pants: [], shoes: [], outer: [], accessories: [] };
                    
                    // 1. 내부 데이터 추천 (기존 로직)
                    if (positions.length > 0) {
                        try {
                            const byPos = await apiClient.recommendByPositions({
                                positions,
                                items: itemsPayload,
                                min_price: minPrice ? Number(minPrice) : undefined,
                                max_price: maxPrice ? Number(maxPrice) : undefined,
                                exclude_tags: excludeTagsInput ? excludeTagsInput.split(',').map(t => t.trim()) : [],
                                final_k: 3,
                                use_llm_rerank: false, // 내부 데이터는 LLM 리랭킹 비활성화
                            });
                            const internalRecs = toCategoryRecs(byPos);
                            // 내부 추천 결과를 전체 추천에 병합
                            for (const [category, items] of Object.entries(internalRecs)) {
                                if (items && Array.isArray(items)) {
                                    allRecommendations[category] = [...allRecommendations[category], ...items];
                                }
                            }
                        } catch (e) {
                            console.error('내부 데이터 추천 실패:', e);
                        }
                    }

                    // 2. 외부 데이터 추천 (새로운 로직)
                    if (externalSlots.length > 0) {
                        try {
                            console.log('🔍 외부 데이터 추천 시작:', externalSlots);
                            
                            // 외부 데이터를 병렬로 처리 (API 클라이언트 사용)
                            const externalPromises = externalSlots.map(async (slot) => {
                                try {
                                    const response = await apiClient.getExternalRecommendations(slot.slot, slot.data);
                                    console.log(`🔍 ${slot.slot} 외부 추천 결과:`, response);
                                    return { slot: slot.slot, recommendations: response.recommendations || [] };
                                } catch (error) {
                                    console.error(`${slot.slot} 외부 추천 에러:`, error);
                                    return { slot: slot.slot, recommendations: [] };
                                }
                            });

                            const externalResults = await Promise.all(externalPromises);
                            
                            // 외부 추천 결과를 전체 추천에 병합
                            for (const result of externalResults) {
                                allRecommendations[result.slot] = [...allRecommendations[result.slot], ...result.recommendations];
                            }
                            
                            console.log('🔍 전체 추천 결과:', allRecommendations);
                        } catch (e) {
                            console.error('외부 데이터 추천 실패:', e);
                        }
                    }

            // 3. 최종 추천 결과 반환
            return allRecommendations;
        } catch (error) {
            console.error('추천 처리 실패:', error);
            return null;
        }
    }, [originalItems, topImage, pantsImage, shoesImage, outerImage]);


    // 버튼 활성화: 사람 있든 없든 의류 1개 이상이면 진행 가능
    const canCombine = (!!personImage && (topImage || pantsImage || shoesImage || outerImage)) || (!personImage && (topImage || pantsImage || shoesImage || outerImage));

    // Helper: add a catalog/recommendation item into proper slot
    const addCatalogItemToSlot = useCallback(async (item: RecommendationItem, showToast: boolean = true) => {
        console.log('🔔🔔🔔 addCatalogItemToSlot 호출됨! 🔔🔔🔔');
        console.log('🔔 상품 정보:', {
            id: item.id,
            title: item.title,
            category: item.category,
            imageUrl: item.imageUrl
        });
        
        const cat = (item.category || '').toLowerCase();
        console.log('🔔 카테고리 소문자 변환:', cat);
        
        // 백엔드와 동일한 카테고리 매핑 로직 사용
        const slot: 'top' | 'pants' | 'shoes' | 'outer' | null = (() => {
            const match = (keywordList: string[]): boolean => keywordList.some(keyword => cat.includes(keyword));

            if (match(['outer', 'coat', 'jacket', 'outerwear', '맨투맨', '아우터', '패딩'])) {
                return 'outer';
            }
            if (match(['top', 'tee', 'shirt', 'sweater', '상의', '블라우스'])) {
                return 'top';
            }
            if (match(['pants', 'bottom', 'skirt', 'trouser', '하의', '데님', '슬랙스'])) {
                return 'pants';
            }
            if (match(['shoe', 'sneaker', 'boots', '신발', '스니커즈'])) {
                return 'shoes';
            }
            return null;
        })();
        
        console.log('🔔 매핑된 slot:', slot);
        
        if (!slot) {
            console.error('❌ 카테고리 매핑 실패:', item.category);
            return;
        }
        if (!item.imageUrl) {
            addToast(toast.error('Image URL is missing.'));
            return;
        }
        try {
            console.log('🔔 이미지 변환 시작...');
            const up = await imageProxy.toUploadedImage(item.imageUrl, item.title);
            console.log('🔔 이미지 변환 완료:', up);
            
            // ?먮낯 ?곹뭹 ?곗씠?????
            setOriginalItems(prev => ({
                ...prev,
                [slot]: item
            }));
            
            console.log('🔔 recordInput 호출 전:', { slot, item });
            
            if (slot === 'top') { setTopImage(up); setTopLabel(item.title); setSelectedTopId(String(item.id)); recordInput({ top: up }, { top: item.title }, 'delta', undefined, { top: String(item.id) }, { top: item }); }
            if (slot === 'pants') { setPantsImage(up); setPantsLabel(item.title); setSelectedPantsId(String(item.id)); recordInput({ pants: up }, { pants: item.title }, 'delta', undefined, { pants: String(item.id) }, { pants: item }); }
            if (slot === 'shoes') { setShoesImage(up); setShoesLabel(item.title); setSelectedShoesId(String(item.id)); recordInput({ shoes: up }, { shoes: item.title }, 'delta', undefined, { shoes: String(item.id) }, { shoes: item }); }
            if (slot === 'outer') { setOuterImage(up); setOuterLabel(item.title); setSelectedOuterId(String(item.id)); recordInput({ outer: up }, { outer: item.title }, 'delta', undefined, { outer: String(item.id) }, { outer: item }); }

            
            console.log('🔔 recordInput 호출 완료');
            if (showToast) {
                addToast(toast.success(`담기 완료: ${item.title}. Try It On을 눌러 합성하세요`, undefined, { duration: 1800 }));
            }
        } catch (e: any) {
            console.error('❌ 이미지 처리 실패:', e);
            addToast(toast.error('가져오기에 실패했어요', e?.message));
        }
    }, [addToast, setTopImage, setPantsImage, setShoesImage, setOuterImage, setTopLabel, setPantsLabel, setShoesLabel, setOuterLabel, setSelectedOuterId, setOriginalItems]);
    // Helper wrapper: force slot without relying on category text
    const addToSlotForced = useCallback((item: RecommendationItem, slot: 'top'|'pants'|'shoes'|'outer') => {
        console.log('🔔🔔🔔 addToSlotForced 호출됨! 🔔🔔🔔');
        console.log('🔔 랜덤 아이템 클릭:', { item: item.title, slot });
        // Reuse existing logic by overriding category for mapping
        return addCatalogItemToSlot({ ...(item as any), category: slot } as any);
    }, [addCatalogItemToSlot]);

    // ?섎쪟 ?꾩씠???ㅻ쾭?덉씠 ?몃뱾??
    const handleClothingLike = useCallback((slot: 'outer' | 'top' | 'pants' | 'shoes') => {
        const label = slot === 'outer' ? outerLabel : 
                     slot === 'top' ? topLabel : 
                     slot === 'pants' ? pantsLabel : shoesLabel;
        
        if (label) {
            const productId = slot === 'outer' ? selectedOuterId :
                             slot === 'top' ? selectedTopId :
                             slot === 'pants' ? selectedPantsId :
                             selectedShoesId;
            
            // ?곹뭹 ID媛 ?덉쑝硫?(移댄깉濡쒓렇?먯꽌 媛?몄삩 ?곹뭹) ?좉?
            if (productId) {
                // ?먮낯 ?곹뭹 ?곗씠???ъ슜
                const originalItem = originalItems[slot];
                       const item: RecommendationItem = originalItem ? {
                           ...originalItem,
                           id: productId,
                           imageUrl: slot === 'outer' ? (outerImage?.previewUrl || originalItem.imageUrl) :
                                    slot === 'top' ? (topImage?.previewUrl || originalItem.imageUrl) :
                                    slot === 'pants' ? (pantsImage?.previewUrl || originalItem.imageUrl) :
                                    (shoesImage?.previewUrl || originalItem.imageUrl),
                       } : {
                           id: productId,
                           title: label,
                           price: 0,
                           imageUrl: slot === 'outer' ? (outerImage?.previewUrl || '') :
                                    slot === 'top' ? (topImage?.previewUrl || '') :
                                    slot === 'pants' ? (pantsImage?.previewUrl || '') :
                                    (shoesImage?.previewUrl || ''),
                           category: slot,
                           tags: []
                       };
                
                const wasAdded = likesService.toggle(item);
                if (wasAdded) {
                    addToast(toast.success('Added to likes', label, { duration: 1500 }));
                } else {
                    addToast(toast.success('Removed from likes', label, { duration: 1500 }));
                }
            } else {
                       // ?낅줈?쒕맂 ?대?吏???좉? (怨좎젙 ID ?ъ슜)
                       const item: RecommendationItem = {
                           id: 'uploaded-' + slot,
                           title: label,
                           price: 0,
                           imageUrl: slot === 'outer' ? (outerImage?.previewUrl || '') :
                                    slot === 'top' ? (topImage?.previewUrl || '') :
                                    slot === 'pants' ? (pantsImage?.previewUrl || '') :
                                    (shoesImage?.previewUrl || ''),
                           category: slot,
                           tags: []
                       };
                
                const wasAdded = likesService.toggle(item);
                if (wasAdded) {
                    addToast(toast.success('Added to likes', label, { duration: 1500 }));
                } else {
                    addToast(toast.success('Removed from likes', label, { duration: 1500 }));
                }
            }
        }
    }, [outerLabel, topLabel, pantsLabel, shoesLabel, outerImage, topImage, pantsImage, shoesImage, selectedOuterId, selectedTopId, selectedPantsId, selectedShoesId, originalItems, addToast]);

    const handleClothingBuy = useCallback((slot: 'outer' | 'top' | 'pants' | 'shoes') => {
        const label = slot === 'outer' ? outerLabel : 
                     slot === 'top' ? topLabel : 
                     slot === 'pants' ? pantsLabel : shoesLabel;
        
        if (label) {
            // ?먮낯 ?곹뭹 ?곗씠?곗뿉??URL 媛?몄삤湲?
            const originalItem = originalItems[slot];
            if (originalItem?.productUrl) {
                // ?ㅼ젣 ?곹뭹 URL???덉쑝硫??대떦 ?섏씠吏濡??대룞
                window.open(originalItem.productUrl, '_blank');
                addToast(toast.success('?곹뭹 ?섏씠吏濡??대룞', originalItem.title, { duration: 2000 }));
            } else {
                // ?낅줈?쒕맂 ?대?吏?닿굅??URL???놁쑝硫??쇳븨 ?섏씠吏濡??대룞
                window.open('https://www.musinsa.com', '_blank');
                addToast(toast.info('Opening shopping page', 'Check Musinsa for similar items.', { duration: 2000 }));
            }
        }
    }, [outerLabel, topLabel, pantsLabel, shoesLabel, originalItems, addToast]);

    return (
        <div className="flex flex-col items-center bg-[var(--page-bg)] pt-[140px] px-4 sm:px-6 lg:px-8 pb-20">
            <div className="w-full">
                <Header />
                <main className="mt-8 mx-auto w-full max-w-screen-xl xl:max-w-[1400px] 2xl:max-w-[1600px]">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-10 items-start">
                        {/* Input Section */}
                        <div className="lg:col-span-8 order-1 bg-white p-6 xl:p-7 rounded-2xl shadow-sm border border-gray-200">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* ?쇱そ ?곸뿭: Person + AI Sample */}
                                <div className="md:col-span-1 space-y-2 border-r border-gray-200 pr-4">
                                    <ImageUploader
                                        id="person-image"
                                        title="Person"
                                        description="Upload a full-body photo."
                                        onImageUpload={(img) => { setPersonImage(img); setPersonSource(img ? 'upload' : 'unknown'); setSelectedModelId(null); recordInput({ person: img }, undefined, 'delta', img ? 'upload' : 'unknown'); }}
                                        externalImage={personImage}
                                        active={!!personImage && personSource === 'upload'}
                                        isFullScreen={isFullScreen}
                                    />
                                    <ModelPicker
                                        direction="vertical"
                                        selectedId={personSource === 'model' ? (selectedModelId || undefined) : undefined}
                                        onSelectModel={(id) => setSelectedModelId(id)}
                                        onPick={(img) => { setPersonImage(img); setPersonSource('model'); recordInput({ person: img }, undefined, 'delta', 'model'); }}
                                    />
                                </div>

                                {/* 오른쪽 영역: 의류 4개 */}
                                <div className="md:col-span-2 pl-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <h3 className="text-sm font-medium text-gray-700">?섎쪟 ?꾩씠??</h3>
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
                                                addToast(toast.success('紐⑤뱺 ?섎쪟媛 鍮꾩썙議뚯뒿?덈떎', undefined, { duration: 1500 }));
                                            }}
                                            disabled={!outerImage && !topImage && !pantsImage && !shoesImage}
                                        >
                                            ?꾩껜 鍮꾩슦湲?
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div 
                                            onMouseEnter={() => outerImage && setHoveredSlot('outer')}
                                            onMouseLeave={() => setHoveredSlot(null)}
                                        >
                                            <ImageUploader
                                                id="outer-image"
                                                title="Outer"
                                                description="Upload a photo of outerwear."
                                                onImageUpload={(img) => {
                                                    setOuterImage(img);
                                                    const label = img ? 'Uploaded outer' : undefined;
                                                    setOuterLabel(label);
                                                    recordInput({ outer: img }, { outer: label }, 'delta');
                                                }}
                                                externalImage={outerImage}
                                                active={!!outerImage}
                                                isFullScreen={isFullScreen}
                                                overlay={
                                                    <ClothingItemOverlay
                                                        isVisible={hoveredSlot === 'outer' && !isFullScreen}
                                                        onLike={() => handleClothingLike('outer')}
                                                        onBuy={() => handleClothingBuy('outer')}
                                                        onRemove={() => { 
                                                            console.log('🔍 아우터 제거 시작');
                                                            setOuterImage(null); 
                                                            setOuterLabel(undefined); 
                                                            setSelectedOuterId(null);
                                                            setOriginalItems(prev => ({ ...prev, outer: undefined }));
                                                            // 생성된 이미지도 초기화하여 이전 결과가 남아있지 않도록 함
                                                            setGeneratedImage(null);
                                                            console.log('🔍 아우터 제거 완료');
                                                        }}
                                                        itemTitle={outerLabel || 'Outer'}
                                                        isLiked={selectedOuterId ? likesService.isLiked(selectedOuterId) : likesService.isLiked('uploaded-outer')}
                                                    />
                                                }
                                            />
                                        </div>
                                        <div 
                                            onMouseEnter={() => topImage && setHoveredSlot('top')}
                                            onMouseLeave={() => setHoveredSlot(null)}
                                        >
                                            <ImageUploader
                                                id="top-image"
                                                title="Top"
                                                description="Upload a photo of a top."
                                                onImageUpload={(img) => {
                                                    setTopImage(img);
                                                    const label = img ? 'Uploaded top' : undefined;
                                                    setTopLabel(label);
                                                    recordInput({ top: img }, { top: label }, 'delta');
                                                }}
                                                externalImage={topImage}
                                                active={!!topImage}
                                                isFullScreen={isFullScreen}
                                                overlay={
                                                    <ClothingItemOverlay
                                                        isVisible={hoveredSlot === 'top' && !isFullScreen}
                                                        onLike={() => handleClothingLike('top')}
                                                        onBuy={() => handleClothingBuy('top')}
                                                        onRemove={() => { 
                                                            console.log('🔍 상의 제거 시작');
                                                            setTopImage(null); 
                                                            setTopLabel(undefined); 
                                                            setSelectedTopId(null);
                                                            setOriginalItems(prev => ({ ...prev, top: undefined }));
                                                            setGeneratedImage(null);
                                                            console.log('🔍 상의 제거 완료');
                                                        }}
                                                        itemTitle={topLabel || 'Top'}
                                                        isLiked={selectedTopId ? likesService.isLiked(selectedTopId) : likesService.isLiked('uploaded-top')}
                                                    />
                                                }
                                            />
                                        </div>
                                        <div 
                                            onMouseEnter={() => pantsImage && setHoveredSlot('pants')}
                                            onMouseLeave={() => setHoveredSlot(null)}
                                        >
                                            <ImageUploader
                                                id="pants-image"
                                                title="Pants"
                                                description="Upload a photo of pants."
                                                onImageUpload={(img) => {
                                                    setPantsImage(img);
                                                    const label = img ? 'Uploaded pants' : undefined;
                                                    setPantsLabel(label);
                                                    recordInput({ pants: img }, { pants: label }, 'delta');
                                                }}
                                                externalImage={pantsImage}
                                                active={!!pantsImage}
                                                isFullScreen={isFullScreen}
                                                overlay={
                                                    <ClothingItemOverlay
                                                        isVisible={hoveredSlot === 'pants' && !isFullScreen}
                                                        onLike={() => handleClothingLike('pants')}
                                                        onBuy={() => handleClothingBuy('pants')}
                                                        onRemove={() => { 
                                                            console.log('🔍 하의 제거 시작');
                                                            setPantsImage(null); 
                                                            setPantsLabel(undefined); 
                                                            setSelectedPantsId(null);
                                                            setOriginalItems(prev => ({ ...prev, pants: undefined }));
                                                            setGeneratedImage(null);
                                                            console.log('🔍 하의 제거 완료');
                                                        }}
                                                        itemTitle={pantsLabel || 'Pants'}
                                                        isLiked={selectedPantsId ? likesService.isLiked(selectedPantsId) : likesService.isLiked('uploaded-pants')}
                                                    />
                                                }
                                            />
                                        </div>
                                        <div 
                                            onMouseEnter={() => shoesImage && setHoveredSlot('shoes')}
                                            onMouseLeave={() => setHoveredSlot(null)}
                                        >
                                            <ImageUploader
                                                id="shoes-image"
                                                title="Shoes"
                                                description="Upload a photo of shoes."
                                                onImageUpload={(img) => {
                                                    setShoesImage(img);
                                                    const label = img ? 'Uploaded shoes' : undefined;
                                                    setShoesLabel(label);
                                                    recordInput({ shoes: img }, { shoes: label }, 'delta');
                                                }}
                                                externalImage={shoesImage}
                                                active={!!shoesImage}
                                                isFullScreen={isFullScreen}
                                                overlay={
                                                    <ClothingItemOverlay
                                                        isVisible={hoveredSlot === 'shoes' && !isFullScreen}
                                                        onLike={() => handleClothingLike('shoes')}
                                                        onBuy={() => handleClothingBuy('shoes')}
                                                        onRemove={() => { 
                                                            console.log('🔍 신발 제거 시작');
                                                            setShoesImage(null); 
                                                            setShoesLabel(undefined); 
                                                            setSelectedShoesId(null);
                                                            setOriginalItems(prev => ({ ...prev, shoes: undefined }));
                                                            setGeneratedImage(null);
                                                            console.log('🔍 신발 제거 완료');
                                                        }}
                                                        itemTitle={shoesLabel || 'Shoes'}
                                                        isLiked={selectedShoesId ? likesService.isLiked(selectedShoesId) : likesService.isLiked('uploaded-shoes')}
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

                            <TryOnHistory onApply={useCallback(async (payload: {
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
                                console.log('🔔 히스토리에서 적용 시도:', payload);
                                
                                // 히스토리에서 가져온 상품들을 addCatalogItemToSlot으로 처리
                                // 실제로 선택된 아이템들만 처리 (라벨이 있는 것들)
                                
                                if (payload.topLabel && payload.topProduct) {
                                    console.log('🔔 상의 적용:', payload.topProduct.title);
                                    await addCatalogItemToSlot(payload.topProduct, false);
                                }
                                if (payload.pantsLabel && payload.pantsProduct) {
                                    console.log('🔔 하의 적용:', payload.pantsProduct.title);
                                    await addCatalogItemToSlot(payload.pantsProduct, false);
                                }
                                if (payload.shoesLabel && payload.shoesProduct) {
                                    console.log('🔔 신발 적용:', payload.shoesProduct.title);
                                    await addCatalogItemToSlot(payload.shoesProduct, false);
                                }
                                if (payload.outerLabel && payload.outerProduct) {
                                    console.log('🔔 아우터 적용:', payload.outerProduct.title);
                                    await addCatalogItemToSlot(payload.outerProduct, false);
                                }
                                
                                // 히스토리에서 적용 완료 토스트
                                addToast(toast.success('히스토리에서 적용했습니다', undefined, { duration: 1500 }));
                            }, [addCatalogItemToSlot, addToast])} />
                        </div>

                        {/* Action and Result Section */}
                        <div id="result-panel" className="lg:col-span-4 order-2 flex flex-col gap-2 xl:gap-3 lg:sticky lg:top-32 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto self-start">
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
                                <div>
                                    <Button disabled={!generatedImage} onClick={() => setShareOpen(true)}>Save share image</Button>
                                </div>
                            )}
                            {videoFeatureEnabled && (
                                <Card className="space-y-3">
                                    <div className="space-y-1">
                                        <h3 className="text-lg font-semibold text-gray-800">Create video clip</h3>
                                        <p className="text-sm text-gray-500">Turn the generated look into a short clip.</p>
                                        {isSafari && (
                                            <p className="text-xs text-amber-600">Safari에서는 다운로드가 제한될 수 있어요. Chrome 또는 Edge 사용을 권장합니다.</p>
                                        )}
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide" htmlFor="video-prompt">Prompt</label>
                                        <Input
                                            id="video-prompt"
                                            value={videoPrompt}
                                            onChange={(e) => setVideoPrompt(e.target.value)}
                                            placeholder="Describe the tone or mood for the clip"
                                            disabled={promptLocked || videoStatus === 'starting' || videoStatus === 'polling'}
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            onClick={handleStartVideoGeneration}
                                            disabled={!generatedImage || videoStatus === 'starting' || videoStatus === 'polling'}
                                            loading={videoStatus === 'starting' || videoStatus === 'polling'}
                                        >
                                            Generate video
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleCancelVideoPolling}
                                            disabled={videoStatus !== 'starting' && videoStatus !== 'polling'}
                                        >
                                            Cancel
                                        </Button>
                                        {(videoStatus === 'starting' || videoStatus === 'polling') && (<span className="text-xs text-gray-500">Generating...</span>)}
                                        {videoStatus === 'completed' && videoUrls.length === 0 && (<span className="text-xs text-gray-500">No download link returned.</span>)}
                                    </div>
                                    {typeof videoProgress === 'number' && (<p className="text-xs text-gray-500">Progress: {Math.min(100, Math.max(0, Math.round(videoProgress)))}%</p>)}
                                    {videoOperationName && (<p className="text-xs text-gray-400 break-all">Operation: {videoOperationName}</p>)}
                                    {videoError && (<p className="text-sm text-red-500">{videoError}</p>)}
                                    {videoUrls.length > 0 && (
                                        <div className="space-y-2">
                                            <div>
    <p className="text-sm font-medium text-gray-700">Preview</p>
    <div className="w-full rounded-lg overflow-hidden bg-black">
        <video key={selectedVideoIndex} src={toPlayable(videoUrls[selectedVideoIndex])} controls playsInline className="w-full h-auto" />
    </div>
</div>
{videoUrls.length > 1 && (
    <div className="flex flex-wrap gap-2">
        {videoUrls.map((_, idx) => (
            <button key={idx} className={`px-2 py-1 text-xs rounded-full border ${idx === selectedVideoIndex ? 'bg-[#111111] text-white' : 'bg-white text-gray-700'}`} onClick={() => setSelectedVideoIndex(idx)}>Clip {idx + 1}</button>
        ))}
    </div>
)}
<p className="text-sm font-medium text-gray-700">Download</p>
                                            <ul className="space-y-1">
                                                {videoUrls.map((url, idx) => (
                                                    <li key={url} className="flex items-center justify-between gap-3">
                                                        <span className="text-xs text-gray-500">Clip {idx + 1}</span>
                                                        <a className="text-sm text-blue-600 underline" href={toPlayable(url)} target="_blank" rel="noreferrer">Open</a>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </Card>
                            )}<SnsShareDialog open={shareOpen} onClose={() => setShareOpen(false)} image={generatedImage || undefined} />
                            {/* ModelPicker moved to left sidebar in input section */}
                            {likedItems.length > 0 && (
                                <Card className="space-y-3">
                                    <h3 className="text-lg font-semibold text-gray-800">Quick add from likes</h3>
                                    <div className="overflow-x-auto whitespace-nowrap flex gap-4 pb-1">
                                        {likedItems.map(item => {
                                            const cat = (item.category || '').toLowerCase();
                                            let slot: 'top' | 'pants' | 'shoes' | 'outer' | null = null;
                                            if (cat.includes('outer')) slot = 'outer';
                                            else if (cat.includes('top')) slot = 'top';
                                            else if (cat.includes('pant')) slot = 'pants';
                                            else if (cat.includes('shoe')) slot = 'shoes';
                                            if (!slot) return null;
                                            const handleAdd = async () => {
                                                if (!item.imageUrl) {
                                                    addToast(toast.error('Image URL is missing.'));
                                                    return;
                                                }
                                                try {
                                                    const uploaded = await imageProxy.toUploadedImage(item.imageUrl, item.title);
                                                    if (slot === 'top') { setTopImage(uploaded); setTopLabel(item.title); recordInput({ top: uploaded }, { top: item.title }, 'delta', undefined, { top: String(item.id) }); }
                                                    if (slot === 'pants') { setPantsImage(uploaded); setPantsLabel(item.title); recordInput({ pants: uploaded }, { pants: item.title }, 'delta', undefined, { pants: String(item.id) }); }
                                                    if (slot === 'shoes') { setShoesImage(uploaded); setShoesLabel(item.title); recordInput({ shoes: uploaded }, { shoes: item.title }, 'delta', undefined, { shoes: String(item.id) }); }
                                                    if (slot === 'outer') { setOuterImage(uploaded); setOuterLabel(item.title); recordInput({ outer: uploaded }, { outer: item.title }, 'delta', undefined, { outer: String(item.id) }); }
                                                    addToast(toast.success('Added to fitting queue', `${item.title} -> ${slot}`, { duration: 2000 }));
                                                    if (!personImage) {
                                                        addToast(toast.info('Choose a model first', 'Select a base model to apply outfits automatically.', { duration: 1800 }));
                                                    }
                                                } catch (error: any) {
                                                    addToast(toast.error('Failed to load liked item', error?.message));
                                                }
                                            };
                                            return (
                                                <div key={item.id} className="inline-block w-40">
                                                    <div
                                                        className="aspect-square rounded-lg overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200 cursor-pointer"
                                                        onClick={handleAdd}
                                                        title={`Tap to use this liked ${slot}`}
                                                    >
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="mt-1 text-xs text-gray-600 truncate" title={item.title}>{item.title}</p>
                                                    <div className="mt-1">
                                                        <Button size="sm" onClick={handleAdd}>Use ({slot})</Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Card>
                            )}
                            {/* Recommendation Filters */}
                        </div>
                    </div>

                    {/* Recommendations Section */}
                    {(recommendations || isLoadingRecommendations) && (
                        <div className="mt-8">
                            {isLoadingRecommendations ? (
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                        <span className="ml-3 text-gray-600">異붿쿇 ?곹뭹??遺덈윭?ㅻ뒗 以?..</span>
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
                    {/* LLM ?됯?: ?덉뒪?좊━ ?좏깮 ???먯닔??*/}
                    {/* HistoryEvaluator removed per request */}
                    {/* Fallback random items before recommendations are available */}
                    {!recommendations && !isLoadingRecommendations && (
                        <div className="mt-8">
                            <Card>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-2xl font-bold text-gray-800">?쒕뜡 ?꾩씠??</h2>
                                    <Button size="sm" onClick={() => fetchRandom(12)} loading={isLoadingRandom}>?덈줈怨좎묠</Button>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">?곸쓽</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {randomItemsByCat.top.map(item => (
                                                <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => addToSlotForced(item,'top')} padding="sm">
                                                    <div className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${selectedTopId === String(item.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="text-xs text-gray-700 truncate" title={item.title}>{item.title}</p>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">?섏쓽</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {randomItemsByCat.pants.map(item => (
                                                <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => addToSlotForced(item,'pants')} padding="sm">
                                                    <div className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${selectedPantsId === String(item.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="text-xs text-gray-700 truncate" title={item.title}>{item.title}</p>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">?꾩슦??</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {randomItemsByCat.outer.map(item => (
                                                <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => addToSlotForced(item,'outer')} padding="sm">
                                                    <div className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${selectedOuterId === String(item.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="text-xs text-gray-700 truncate" title={item.title}>{item.title}</p>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">?좊컻</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {randomItemsByCat.shoes.map(item => (
                                                <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => addToSlotForced(item,'shoes')} padding="sm">
                                                    <div className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${selectedShoesId === String(item.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="text-xs text-gray-700 truncate" title={item.title}>{item.title}</p>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                    {randomItemsByCat.top.length + randomItemsByCat.pants.length + randomItemsByCat.shoes.length === 0 && (
                                        <div className="text-center text-gray-500 py-6">?꾩씠?쒖쓣 遺덈윭?ㅻ뒗 以묒씠嫄곕굹 紐⑸줉??鍮꾩뼱?덉뒿?덈떎.</div>
                                    )}
                                </div>
                            </Card>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
};












