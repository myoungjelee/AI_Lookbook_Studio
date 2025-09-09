import React, { useState, useCallback, useEffect } from 'react';
import { ImageUploader } from './ImageUploader';
import { ResultDisplay } from './ResultDisplay';
import { CombineButton } from './CombineButton';
import { RecommendationDisplay } from '../recommendations/RecommendationDisplay';
import { Header } from '../layout/Header';
import { virtualTryOnService } from '../../../services/virtualTryOn.service';
import { apiClient } from '../../../services/api.service';
import type { UploadedImage, ApiFile, ClothingItems, RecommendationOptions, RecommendationItem } from '../../../types';
import { Card, Input, Button, useToast, toast } from '../../ui';
import { likesService } from '../../../services/likes.service';
import { imageProxy } from '../../../services/imageProxy.service';
import { ModelPicker } from './ModelPicker';
import { tryOnHistory } from '../../../services/tryon_history.service';
import { TryOnHistory } from './TryOnHistory';
import { StyleTipsCard } from '../tips/StyleTipsCard';
import { ComparePanel } from './ComparePanel';
import { shareOrDownloadResult } from '../../../utils/shareImage';
import { SnsShareDialog } from './SnsShareDialog';

export const VirtualTryOnUI: React.FC = () => {
    const [personImage, setPersonImage] = useState<UploadedImage | null>(null);
    const [topImage, setTopImage] = useState<UploadedImage | null>(null);
    const [pantsImage, setPantsImage] = useState<UploadedImage | null>(null);
    const [shoesImage, setShoesImage] = useState<UploadedImage | null>(null);
    const [personSource, setPersonSource] = useState<'model' | 'upload' | 'unknown'>('unknown');
    const [topLabel, setTopLabel] = useState<string | undefined>(undefined);
    const [pantsLabel, setPantsLabel] = useState<string | undefined>(undefined);
    const [shoesLabel, setShoesLabel] = useState<string | undefined>(undefined);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<any>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isLoadingRecommendations, setIsLoadingRecommendations] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const { addToast } = useToast();
    const [shareOpen, setShareOpen] = useState<boolean>(false);
    // UI highlight states
    const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
    const [selectedTopId, setSelectedTopId] = useState<string | null>(null);
    const [selectedPantsId, setSelectedPantsId] = useState<string | null>(null);
    const [selectedShoesId, setSelectedShoesId] = useState<string | null>(null);

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

    // Likes feed for quick fitting
    const [likedItems, setLikedItems] = useState<RecommendationItem[]>([]);
    useEffect(() => {
        setLikedItems(likesService.getAll());
        const unsub = likesService.subscribe(setLikedItems);
        const onStorage = (e: StorageEvent) => { if (e.key === 'app:likes:v1') setLikedItems(likesService.getAll()); };
        window.addEventListener('storage', onStorage);
        return () => { unsub(); window.removeEventListener('storage', onStorage); };
    }, []);

    // Recommendation filter options
    const [minPrice, setMinPrice] = useState<string>('');
    const [maxPrice, setMaxPrice] = useState<string>('');
    const [excludeTagsInput, setExcludeTagsInput] = useState<string>('');

    // Random items to show before recommendations are available
    const [randomItemsByCat, setRandomItemsByCat] = useState<{ top: RecommendationItem[]; pants: RecommendationItem[]; shoes: RecommendationItem[] }>({ top: [], pants: [], shoes: [] });
    const [isLoadingRandom, setIsLoadingRandom] = useState<boolean>(false);
    const fetchRandom = useCallback(async (limit: number = 12) => {
        try {
            setIsLoadingRandom(true);
            const per = Math.max(1, Math.floor(limit / 3));
            const [tops, pants, shoes] = await Promise.all([
                apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${per}&category=top`).catch(() => [] as RecommendationItem[]),
                apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${per}&category=pants`).catch(() => [] as RecommendationItem[]),
                apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${per}&category=shoes`).catch(() => [] as RecommendationItem[]),
            ]);
            setRandomItemsByCat({ top: tops, pants, shoes });
        } catch (e) {
            // ignore silently
            setRandomItemsByCat({ top: [], pants: [], shoes: [] });
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
    const toDataUrl = (img: UploadedImage | null | undefined) => img ? `data:${img.mimeType};base64,${img.base64}` : undefined;
    // mode: 'delta' logs only provided overrides; 'snapshot' logs full current state
    const recordInput = (
        overrides?: Partial<{ person: UploadedImage | null; top: UploadedImage | null; pants: UploadedImage | null; shoes: UploadedImage | null; }>,
        labels?: Partial<{ top: string; pants: string; shoes: string }>,
        mode: 'delta' | 'snapshot' = 'delta',
        sourceOverride?: 'model' | 'upload' | 'unknown',
    ) => {
        const p = mode === 'delta' ? (overrides?.person ?? null) : (overrides && 'person' in overrides ? overrides.person : personImage);
        const t = mode === 'delta' ? (overrides?.top ?? null) : (overrides && 'top' in overrides ? overrides.top : topImage);
        const pa = mode === 'delta' ? (overrides?.pants ?? null) : (overrides && 'pants' in overrides ? overrides.pants : pantsImage);
        const s = mode === 'delta' ? (overrides?.shoes ?? null) : (overrides && 'shoes' in overrides ? overrides.shoes : shoesImage);
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
            personImage: toDataUrl(p || null),
            topImage: toDataUrl(t || null),
            pantsImage: toDataUrl(pa || null),
            shoesImage: toDataUrl(s || null),
        });
    };

    const handleCombineClick = useCallback(async () => {
        if (!personImage || (!topImage && !pantsImage && !shoesImage)) {
            setError("Please upload a person's image and at least one clothing item.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setGeneratedImage(null);
        setRecommendations(null);

        try {
            const clothingItems: ClothingItems = {
                top: topImage ? convertToApiFile(topImage) : null,
                pants: pantsImage ? convertToApiFile(pantsImage) : null,
                shoes: shoesImage ? convertToApiFile(shoesImage) : null,
            };

            // Record input history with small previews (data URLs)
            const toDataUrl = (img: UploadedImage | null | undefined) => img ? `data:${img.mimeType};base64,${img.base64}` : undefined;
            // Snapshot logging: hide 'model' label to avoid AI 모델 히스토리 노출
            tryOnHistory.addInput({
                person: personSource === 'upload' ? 'upload' : 'unknown',
                topLabel,
                pantsLabel,
                shoesLabel,
                personImage: personSource === 'upload' ? toDataUrl(personImage) : undefined,
                topImage: toDataUrl(topImage),
                pantsImage: toDataUrl(pantsImage),
                shoesImage: toDataUrl(shoesImage),
            });

            const result = await virtualTryOnService.combineImages({
                person: convertToApiFile(personImage),
                clothingItems,
            });

            if (result.generatedImage) {
                setGeneratedImage(result.generatedImage);
                // Record output history (data URI)
                tryOnHistory.addOutput(result.generatedImage);

                // Fetch recommendations after virtual fitting
                setIsLoadingRecommendations(true);
                try {
                    const options: RecommendationOptions = {};
                    if (minPrice) options.minPrice = Number(minPrice);
                    if (maxPrice) options.maxPrice = Number(maxPrice);
                    const trimmed = excludeTagsInput.trim();
                    if (trimmed) options.excludeTags = trimmed.split(',').map(t => t.trim()).filter(Boolean);

                    const recommendationsResult = await virtualTryOnService.getRecommendationsFromFitting({
                        generatedImage: result.generatedImage,
                        clothingItems,
                        options,
                    });

                    setRecommendations(recommendationsResult.recommendations as any);
                } catch (recError) {
                    console.error('Failed to get recommendations:', recError);
                } finally {
                    setIsLoadingRecommendations(false);
                }
            } else {
                setError('The AI could not generate an image. Please try again with different images.');
            }
        } catch (err) {
            console.error(err);
            setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        } finally {
            setIsLoading(false);
        }
    }, [personImage, topImage, pantsImage, shoesImage, minPrice, maxPrice, excludeTagsInput]);

    // Helper to trigger combine programmatically (used by quick-add from likes)
    const combineNow = useCallback(async () => {
        await handleCombineClick();
    }, [handleCombineClick]);

    const canCombine = personImage && (topImage || pantsImage || shoesImage);

    // Helper: add a catalog/recommendation item into proper slot
    const addCatalogItemToSlot = useCallback(async (item: RecommendationItem) => {
        const cat = (item.category || '').toLowerCase();
        const slot: 'top' | 'pants' | 'shoes' | null =
            cat.includes('top') ? 'top'
            : cat.includes('pant') ? 'pants'
            : cat.includes('shoe') ? 'shoes'
            : (cat === '상의' ? 'top' : (cat === '하의' ? 'pants' : (cat === '신발' ? 'shoes' : null)));
        if (!slot) return;
        if (!item.imageUrl) {
            addToast(toast.error('이미지 URL이 없어 담을 수 없어요'));
            return;
        }
        try {
            const up = await imageProxy.toUploadedImage(item.imageUrl, item.title);
            if (slot === 'top') { setTopImage(up); setTopLabel(item.title); setSelectedTopId(String(item.id)); recordInput({ top: up }, { top: item.title }, 'delta'); }
            if (slot === 'pants') { setPantsImage(up); setPantsLabel(item.title); setSelectedPantsId(String(item.id)); recordInput({ pants: up }, { pants: item.title }, 'delta'); }
            if (slot === 'shoes') { setShoesImage(up); setShoesLabel(item.title); setSelectedShoesId(String(item.id)); recordInput({ shoes: up }, { shoes: item.title }, 'delta'); }
            addToast(toast.success(`담기 완료: ${item.title}. Try It On을 눌러 합성하세요`, undefined, { duration: 1800 }));
        } catch (e: any) {
            addToast(toast.error('가져오기에 실패했어요', e?.message));
        }
    }, [addToast, setTopImage, setPantsImage, setShoesImage, setTopLabel, setPantsLabel, setShoesLabel]);

    return (
        <div className="flex flex-col items-center p-4 sm:p-6 lg:p-8 bg-gray-50">
            <div className="w-full">
                <Header />
                <main className="mt-8 mx-auto w-full max-w-screen-xl xl:max-w-[1400px] 2xl:max-w-[1600px]">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-10 items-start">
                        {/* Input Section */}
                        <div className="lg:col-span-8 order-1 bg-white p-6 xl:p-7 rounded-2xl shadow-sm border border-gray-200">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 xl:gap-7">
                                <div className="md:col-span-1">
                                    <div>
                                        <ModelPicker
                                            direction="vertical"
                                            selectedId={personSource === 'model' ? (selectedModelId || undefined) : undefined}
                                            onSelectModel={(id) => setSelectedModelId(id)}
                                            onPick={(img) => { setPersonImage(img); setPersonSource('model'); recordInput({ person: img }, undefined, 'delta', 'model'); }}
                                        />
                                    </div>
                                </div>
                                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-6 xl:gap-7">
                                    <ImageUploader
                                        id="person-image"
                                        title="Person"
                                        description="Upload a full-body photo."
                                        onImageUpload={(img) => { setPersonImage(img); setPersonSource(img ? 'upload' : 'unknown'); setSelectedModelId(null); recordInput({ person: img }, undefined, 'delta', img ? 'upload' : 'unknown'); }}
                                        externalImage={personImage}
                                        active={!!personImage && personSource === 'upload'}
                                    />
                                    <ImageUploader
                                        id="top-image"
                                        title="Top"
                                        description="Upload a photo of a top."
                                        onImageUpload={(img) => { setTopImage(img); setTopLabel(img ? '업로드' : undefined); recordInput({ top: img }, { top: img ? '업로드' : undefined }, 'delta'); }}
                                        externalImage={topImage}
                                        active={!!topImage}
                                    />
                                    <ImageUploader
                                        id="pants-image"
                                        title="Pants"
                                        description="Upload a photo of pants."
                                        onImageUpload={(img) => { setPantsImage(img); setPantsLabel(img ? '업로드' : undefined); recordInput({ pants: img }, { pants: img ? '업로드' : undefined }, 'delta'); }}
                                        externalImage={pantsImage}
                                        active={!!pantsImage}
                                    />
                                    <ImageUploader
                                        id="shoes-image"
                                        title="Shoes"
                                        description="Upload a photo of shoes."
                                        onImageUpload={(img) => { setShoesImage(img); setShoesLabel(img ? '업로드' : undefined); recordInput({ shoes: img }, { shoes: img ? '업로드' : undefined }, 'delta'); }}
                                        externalImage={shoesImage}
                                        active={!!shoesImage}
                                    />
                                </div>
                            </div>
                        </div>
                        {/* Histories section separated from upload card */}
                        <div className="lg:col-span-8 order-3">
                            <TryOnHistory onApply={(payload) => {
                                const parse = (data?: string, title?: string): UploadedImage | null => {
                                    if (!data) return null;
                                    const m = data.match(/^data:([^;]+);base64,(.*)$/);
                                    if (!m) return null;
                                    const mimeType = m[1];
                                    const base64 = m[2];
                                    try {
                                        const byteChars = atob(base64);
                                        const byteNumbers = new Array(byteChars.length);
                                        for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
                                        const byteArray = new Uint8Array(byteNumbers);
                                        const blob = new Blob([byteArray], { type: mimeType });
                                        const ext = mimeType.split('/')[1] || 'png';
                                        const file = new File([blob], `${title || 'history'}.${ext}`, { type: mimeType });
                                        return { file, previewUrl: data, base64, mimeType };
                                    } catch {
                                        return { file: new File([], title || 'history', { type: mimeType }), previewUrl: data, base64, mimeType } as UploadedImage;
                                    }
                                };
                                const p = parse(payload.person, 'person');
                                const t = parse(payload.top, payload.topLabel || 'top');
                                const pa = parse(payload.pants, payload.pantsLabel || 'pants');
                                const s = parse(payload.shoes, payload.shoesLabel || 'shoes');
                                if (p) { setPersonImage(p); setPersonSource('upload'); }
                                if (t) { setTopImage(t); setTopLabel(payload.topLabel || '히스토리'); }
                                if (pa) { setPantsImage(pa); setPantsLabel(payload.pantsLabel || '히스토리'); }
                                if (s) { setShoesImage(s); setShoesLabel(payload.shoesLabel || '히스토리'); }
                                addToast(toast.success('히스토리에서 적용했습니다', undefined, { duration: 1200 }));
                            }} />
                        </div>

                        {/* Action and Result Section */}
                        <div id="result-panel" className="lg:col-span-4 order-2 flex flex-col gap-6 xl:gap-7 lg:sticky lg:top-0 self-start">
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
                            />
                            {/* Style Tips below result */}
                            <StyleTipsCard generatedImage={generatedImage || undefined} />
                            {/* Share button (feature flag default ON) */}
                            {(() => { const v = (import.meta as any).env?.VITE_FEATURE_SHARE; const on = !(String(v).toLowerCase() === '0' || String(v).toLowerCase() === 'false' || String(v).toLowerCase() === 'off'); return on; })() && (
                                <div>
                                    <Button disabled={!generatedImage} onClick={() => setShareOpen(true)}>SNS 공유용 이미지 저장</Button>
                                </div>
                            )}
                            <SnsShareDialog open={shareOpen} onClose={() => setShareOpen(false)} image={generatedImage || undefined} />
                            {/* ModelPicker moved to left sidebar in input section */}
                            {likedItems.length > 0 && (
                                <Card className="space-y-3">
                                    <h3 className="text-lg font-semibold text-gray-800">좋아요에서 빠르게 담기</h3>
                                    <div className="overflow-x-auto whitespace-nowrap flex gap-4 pb-1">
                                        {likedItems.map(item => {
                                            const cat = (item.category || '').toLowerCase();
                                            const slot: 'top' | 'pants' | 'shoes' | null =
                                                cat.includes('top') || cat.includes('상의') ? 'top'
                                                : (cat.includes('pant') || cat.includes('하의') || cat.includes('바지')) ? 'pants'
                                                : (cat.includes('shoe') || cat.includes('신발')) ? 'shoes'
                                                : null;
                                            if (!slot) return null;
                                            const onAdd = async () => {
                                                if (!item.imageUrl) {
                                                    addToast(toast.error('이미지를 가져올 수 없습니다'));
                                                    return;
                                                }
                                                try {
                                                    const up = await imageProxy.toUploadedImage(item.imageUrl, item.title);
                                                    if (slot === 'top') { setTopImage(up); setTopLabel(item.title); recordInput({ top: up }, { top: item.title }, 'delta'); }
                                                    if (slot === 'pants') { setPantsImage(up); setPantsLabel(item.title); recordInput({ pants: up }, { pants: item.title }, 'delta'); }
                                                    if (slot === 'shoes') { setShoesImage(up); setShoesLabel(item.title); recordInput({ shoes: up }, { shoes: item.title }, 'delta'); }
                                                    addToast(toast.success('피팅에 담겼습니다', `${item.title} → ${slot}`, { duration: 2000 }));
                                                    if (personImage) {
                                                        void 0; // generation only via Try It On
                                                    } else {
                                                        addToast(toast.info('모델을 먼저 선택하세요', '상반신 모델을 선택하면 자동 합성됩니다.', { duration: 1800 }));
                                                    }
                                                } catch (e: any) {
                                                    addToast(toast.error('가져오기에 실패했습니다', e?.message));
                                                }
                                            };
                                            return (
                                                <div key={item.id} className="inline-block w-40">
                                                    <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200 cursor-pointer" onClick={onAdd} title="이미지를 클릭하면 담깁니다">
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="mt-1 text-xs text-gray-600 truncate" title={item.title}>{item.title}</p>
                                                    <div className="mt-1">
                                                        <Button size="sm" onClick={onAdd}>담기 ({slot})</Button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Card>
                            )}
                            {/* Recommendation Filters */}
                            {false && (
                            <Card className="space-y-4">
                                <h3 className="text-lg font-semibold text-gray-800">추천 필터</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    <Input
                                        type="number"
                                        label="최소 가격"
                                        placeholder="₩ 10000"
                                        value={minPrice}
                                        onChange={(e) => setMinPrice(e.target.value)}
                                        min={0}
                                    />
                                    <Input
                                        type="number"
                                        label="최대 가격"
                                        placeholder="₩ 100000"
                                        value={maxPrice}
                                        onChange={(e) => setMaxPrice(e.target.value)}
                                        min={0}
                                    />
                                    <Input
                                        label="제외 태그(콤마 구분)"
                                        placeholder="예: formal, leather"
                                        value={excludeTagsInput}
                                        onChange={(e) => setExcludeTagsInput(e.target.value)}
                                    />
                                </div>
                                <p className="text-xs text-gray-500">필터는 가상 피팅 이후 추천 호출에 자동 적용됩니다.</p>
                            </Card>
                            )}
                        </div>
                    </div>

                    {/* Recommendations Section */}
                    {(recommendations || isLoadingRecommendations) && (
                        <div className="mt-8">
                            {isLoadingRecommendations ? (
                                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                                    <div className="flex items-center justify-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                        <span className="ml-3 text-gray-600">추천 상품을 불러오는 중...</span>
                                    </div>
                                </div>
                            ) : recommendations ? (
                                <RecommendationDisplay
                                    recommendations={recommendations}
                                    onItemClick={async (item) => {
                                        const cat = (item.category || '').toLowerCase();
                                        const slot: 'top' | 'pants' | 'shoes' | null =
                                            cat.includes('top') ? 'top'
                                            : cat.includes('pant') ? 'pants'
                                            : cat.includes('shoe') ? 'shoes'
                                            : (cat === '상의' ? 'top' : (cat === '하의' ? 'pants' : (cat === '신발' ? 'shoes' : null)));
                                        if (!slot) return;
                                        if (!item.imageUrl) {
                                            addToast(toast.error('이미지 URL이 없어 담을 수 없어요'));
                                            return;
                                        }
                                        try {
                                            const up = await imageProxy.toUploadedImage(item.imageUrl, item.title);
                                            if (slot === 'top') { setTopImage(up); setTopLabel(item.title); recordInput({ top: up }, { top: item.title }, 'delta'); }
                                            if (slot === 'pants') { setPantsImage(up); setPantsLabel(item.title); recordInput({ pants: up }, { pants: item.title }, 'delta'); }
                                            if (slot === 'shoes') { setShoesImage(up); setShoesLabel(item.title); recordInput({ shoes: up }, { shoes: item.title }, 'delta'); }
                                            addToast(toast.success(`담기 완료: ${item.title}`, undefined, { duration: 1600 }));
                                            if (personImage) {
                                                void 0; // generation only via Try It On
                                            } else {
                                                addToast(toast.info('먼저 모델을 선택해주세요', undefined, { duration: 1400 }));
                                            }
                                        } catch (e: any) {
                                            addToast(toast.error('가져오기에 실패했어요', e?.message));
                                        }
                                    }}
                                />
                            ) : null}
                        </div>
                    )}
                    {/* LLM 평가: 히스토리 선택 후 점수화 */}
                    {/* HistoryEvaluator removed per request */}
                    {/* Fallback random items before recommendations are available */}
                    {!recommendations && !isLoadingRecommendations && (
                        <div className="mt-8">
                            <Card>
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-2xl font-bold text-gray-800">랜덤 아이템</h2>
                                    <Button size="sm" onClick={() => fetchRandom(12)} loading={isLoadingRandom}>새로고침</Button>
                                </div>
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">상의</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {randomItemsByCat.top.map(item => (
                                                <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => addCatalogItemToSlot(item)} padding="sm">
                                                    <div className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${selectedTopId === String(item.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="text-xs text-gray-700 truncate" title={item.title}>{item.title}</p>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">하의</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {randomItemsByCat.pants.map(item => (
                                                <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => addCatalogItemToSlot(item)} padding="sm">
                                                    <div className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${selectedPantsId === String(item.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="text-xs text-gray-700 truncate" title={item.title}>{item.title}</p>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-800 mb-2">신발</h3>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                                            {randomItemsByCat.shoes.map(item => (
                                                <Card key={item.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => addCatalogItemToSlot(item)} padding="sm">
                                                    <div className={`aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 mb-2 ${selectedShoesId === String(item.id) ? 'ring-2 ring-blue-500' : ''}`}>
                                                        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />}
                                                    </div>
                                                    <p className="text-xs text-gray-700 truncate" title={item.title}>{item.title}</p>
                                                </Card>
                                            ))}
                                        </div>
                                    </div>
                                    {randomItemsByCat.top.length + randomItemsByCat.pants.length + randomItemsByCat.shoes.length === 0 && (
                                        <div className="text-center text-gray-500 py-6">아이템을 불러오는 중이거나 목록이 비어있습니다.</div>
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
