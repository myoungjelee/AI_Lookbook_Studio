import React, { useEffect, useState } from 'react';

// UI (양쪽 모두 사용)
import { toast, useToast } from '../../ui';

// 타입 (중복 금지: 한 줄만 유지)
import type { RecommendationItem } from '../../../types';

// 서비스
import { apiClient } from '../../../services/api.service';
import { likesService } from '../../../services/likes.service';

// 아이콘
import { HeartIcon } from '../../icons/HeartIcon';

// 컴포넌트 (양쪽 모두)
import { FilterChips } from '../home/FilterChips';
import { ProductCardOverlay } from './ProductCardOverlay';
import { StickySidebar } from './StickySidebar';

/* ===========================
   Utils & Hooks
   =========================== */

function formatPriceKRW(n?: number) {
  if (typeof n !== 'number') return '-';
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
}

const useRandomProducts = (limit: number = 20) => {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<RecommendationItem[]>(
        `/api/recommend/random?limit=${limit}`
      );
      setItems(data);
    } catch (e: any) {
      setError(e?.message || '추천 상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, loading, error, refresh: fetchItems };
};

/* ===========================
   ProductCard (심플 카드 + 오버레이)
   =========================== */

interface ProductCardProps {
  item: RecommendationItem;
  onBuy?: (item: RecommendationItem) => void;
  onVirtualFitting?: (item: RecommendationItem) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ item, onBuy, onVirtualFitting }) => {
  const { addToast } = useToast();
  const [liked, setLiked] = useState<boolean>(() => likesService.isLiked(item.id));
  const [showOverlay, setShowOverlay] = useState(false);

  const onToggleLike: React.MouseEventHandler = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nowLiked = likesService.toggle(item);
    setLiked(nowLiked);
    addToast(
      nowLiked
        ? toast.success('좋아요에 추가했어요', item.title, { duration: 2000 })
        : toast.info('좋아요에서 제거했어요', item.title, { duration: 1500 })
    );
  };

  // 카드 클릭 시 상품 새 탭 이동 (reco_merge 동작)
  const onClick = () => {
    if (item.productUrl) {
      window.open(item.productUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // 오버레이 표시 제어 (HEAD 동작)
  const handleMouseEnter = () => setShowOverlay(true);
  const handleMouseLeave = () => setShowOverlay(false);

  const handleBuy = () => {
    if (onBuy) onBuy(item);
    else if (item.productUrl) window.open(item.productUrl, '_blank', 'noopener,noreferrer');
  };

  const handleVirtualFitting = () => {
    if (onVirtualFitting) onVirtualFitting(item);
  };

  // 할인율 계산 (reco_merge 병합)
  const discount =
    typeof item.discountRate === 'number'
      ? Math.round(item.discountRate * 100)
      : item.discountPercentage;

  return (
    <article
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group cursor-pointer"
      data-card-id={item.id}
    >
      <div className="relative mb-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--divider)] bg-[var(--surface-bg)]">
        <div className="aspect-[4/5] bg-[var(--surface-muted)]">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              loading="lazy"
            />
          )}
        </div>

        {/* 좋아요 버튼 (reco_merge 스타일) */}
        <button
          onClick={onToggleLike}
          aria-label="좋아요 토글"
          aria-pressed={liked}
          className={`absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/90 shadow-sm transition-colors ${
            liked ? 'text-[#d6001c]' : 'text-gray-500 hover:text-black'
          }`}
        >
          <HeartIcon className="h-4 w-4" />
        </button>

        {/* 오버레이 CTA (HEAD 기능) */}
        <ProductCardOverlay
          isVisible={showOverlay}
          onBuy={(e: any) => {
            e?.stopPropagation?.();
            handleBuy();
          }}
          onVirtualFitting={(e: any) => {
            e?.stopPropagation?.();
            handleVirtualFitting();
          }}
          product={item}
        />
      </div>

      {/* 메타/텍스트 (reco_merge 베이스 + 브랜드/태그 폴백) */}
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-[var(--text-muted)] truncate uppercase tracking-wide">
          {item.brandName || item.tags?.[0] || 'MUSINSA'}
        </p>
        <p className="text-[15px] font-medium text-[var(--text-strong)] leading-snug h-[44px] overflow-hidden">
          {item.title}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-[var(--text-strong)]">
            {formatPriceKRW(item.price)}
          </span>
          {typeof discount === 'number' && discount > 0 && (
            <span className="text-[13px] font-semibold text-[#d6001c]">{discount}%</span>
          )}
        </div>
      </div>
    </article>
  );
};

/* ===========================
   ECommerceUI (레이아웃: reco_merge, 사이드바 연계: HEAD)
   =========================== */

interface HomeProps {
  onNavigate?: (page: 'home' | 'try-on' | 'likes') => void;
}

export const ECommerceUI: React.FC<HomeProps> = ({ onNavigate }) => {
  // NOTE: limit은 필요에 따라 조절
  const { items, loading, error, refresh } = useRandomProducts(24);

  // 사이드바 상태 (HEAD)
  const [selectedItems, setSelectedItems] = useState<{
    outer?: RecommendationItem;
    top?: RecommendationItem;
    pants?: RecommendationItem;
    shoes?: RecommendationItem;
  }>({});

  const handleRemoveItem = (category: 'outer' | 'top' | 'pants' | 'shoes') => {
    setSelectedItems((prev) => ({
      ...prev,
      [category]: undefined,
    }));
  };

  const handleGoToFitting = () => {
    const payload = Object.values(selectedItems).filter(Boolean);
    if (payload.length > 0) {
      try {
        localStorage.setItem('app:pendingVirtualFittingItems', JSON.stringify(payload));
      } catch (error) {
        console.warn('localStorage 용량 초과, 아이템 저장 실패:', error);
      }
    }
    onNavigate?.('try-on');
  };

  const handleClearAll = () => setSelectedItems({});

  const handleBuy = (product: RecommendationItem) => {
    if (product.productUrl) {
      window.open(product.productUrl, '_blank', 'noopener,noreferrer');
    }
  };

  // 상품을 카트(사이드바 선택)로 추가 (HEAD)
  const handleAddToCart = (product: RecommendationItem) => {
    const category = (product.category || '').toLowerCase();
    const cartCategory =
      category === 'outer'
        ? 'outer'
        : category === 'top'
        ? 'top'
        : category === 'pants'
        ? 'pants'
        : category === 'shoes'
        ? 'shoes'
        : null;

    if (cartCategory) {
      setSelectedItems((prev) => ({
        ...prev,
        [cartCategory]: product,
      }));
    }
  };

  return (
    <div className="pt-[124px]">
      {/* 상단 바 + 필터 (reco_merge) */}
      <div className="border-y border-[var(--divider)] bg-[var(--surface-bg)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-8 py-3 text-sm text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-strong)]">스포츠 종목 아이템 추천</span>
          <span className="text-[var(--text-muted)]">러닝</span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <button
              onClick={() => onNavigate?.('try-on')}
              className="rounded-full border border-[var(--divider)] bg-white/40 px-3 py-1 text-[var(--text-strong)] hover:bg-white"
            >
              버추얼 피팅 이동
            </button>
            <button
              onClick={refresh}
              className="rounded-full border border-[var(--divider)] px-3 py-1 text-[var(--text-muted)] hover:text-[var(--text-strong)]"
            >
              새로고침
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-[1280px] px-8 pb-4">
          <FilterChips />
        </div>
      </div>

      {/* 메인 그리드 (reco_merge 스타일) */}
      <main className="mx-auto max-w-[1280px] px-8 py-10">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#d6001c]">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <ProductCard
              key={item.id}
              item={item}
              onBuy={handleBuy}
              onVirtualFitting={handleAddToCart}
            />
          ))}
        </div>

        {loading && (
          <div className="mt-8 text-center text-sm text-[var(--text-muted)]">
            추천 상품을 불러오는 중...
          </div>
        )}
      </main>

      {/* 스티키 사이드바 (HEAD) */}
      <StickySidebar
        selectedItems={selectedItems}
        onRemoveItem={handleRemoveItem}
        onGoToFitting={handleGoToFitting}
        onClearAll={handleClearAll}
      />
    </div>
  );
};
