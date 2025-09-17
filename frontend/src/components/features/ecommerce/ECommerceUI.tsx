import React, { useEffect, useState } from 'react';
import { useToast, toast } from '../../ui';
import type { RecommendationItem } from '../../../types';
import { apiClient } from '../../../services/api.service';
import { likesService } from '../../../services/likes.service';
import { HeartIcon } from '../../icons/HeartIcon';
import { FilterChips } from '../home/FilterChips';

function formatPriceKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
}

const useRandomProducts = (limit: number = 20) => {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${limit}`);
      setItems(data);
    } catch (e: any) {
      setError(e?.message || '추천 상품을 불러오지 못했습니다.');
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchItems(); }, []);
  return { items, loading, error, refresh: fetchItems };
};

interface ProductCardProps { item: RecommendationItem }
const ProductCard: React.FC<ProductCardProps> = ({ item }) => {
  const { addToast } = useToast();
  const [liked, setLiked] = useState<boolean>(() => likesService.isLiked(item.id));

  const onToggleLike: React.MouseEventHandler = (e) => {
    e.preventDefault(); e.stopPropagation();
    const nowLiked = likesService.toggle(item);
    setLiked(nowLiked);
    addToast(nowLiked
      ? toast.success('좋아요에 추가했어요', item.title, { duration: 2000 })
      : toast.info('좋아요에서 제거했어요', item.title, { duration: 1500 })
    );
  };

  const onClick = () => {
    if (item.productUrl) {
      window.open(item.productUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const discount = item.discountRate ? Math.round(item.discountRate * 100) : item.discountPercentage;

  return (
    <article
      onClick={onClick}
      className="group cursor-pointer"
    >
      <div className="relative mb-3 overflow-hidden rounded-[var(--radius-card)] border border-[var(--divider)] bg-[var(--surface-bg)]">
        <div className="aspect-[4/5] bg-[var(--surface-muted)]">
          {item.imageUrl && (
            <img
              src={item.imageUrl}
              alt={item.title}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
          )}
        </div>
        <button
          onClick={onToggleLike}
          aria-label="좋아요 토글"
          className={`absolute top-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-white/90 shadow-sm transition-colors ${liked ? 'text-[#d6001c]' : 'text-gray-500 hover:text-black'}`}
        >
          <HeartIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="space-y-1">
        <p className="text-[13px] font-semibold text-[var(--text-muted)] truncate uppercase tracking-wide">
          {item.brandName || item.tags?.[0] || 'MUSINSA'}
        </p>
        <p className="text-[15px] font-medium text-[var(--text-strong)] leading-snug h-[44px] overflow-hidden">
          {item.title}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-[var(--text-strong)]">{formatPriceKRW(item.price)}</span>
          {typeof discount === 'number' && discount > 0 && (
            <span className="text-[13px] font-semibold text-[#d6001c]">{discount}%</span>
          )}
        </div>
      </div>
    </article>
  );
};

interface HomeProps { onNavigate?: (page: 'home' | 'try-on' | 'likes') => void }
export const ECommerceUI: React.FC<HomeProps> = ({ onNavigate }) => {
  const { items, loading, error, refresh } = useRandomProducts(25);

  return (
    <div className="pt-[124px]">
      <div className="border-y border-[var(--divider)] bg-[var(--surface-bg)]/70 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3 px-8 py-3 text-sm text-[var(--text-muted)]">
          <span className="font-semibold text-[var(--text-strong)]">스포츠 종목 아이템 추천</span>
          <span className="text-[var(--text-muted)]">러닝</span>
          <div className="ml-auto flex items-center gap-3 text-xs">
            <button onClick={() => onNavigate?.('try-on')} className="rounded-full border border-[var(--divider)] bg-white/40 px-3 py-1 text-[var(--text-strong)] hover:bg-white">버추얼 피팅 이동</button>
            <button onClick={refresh} className="rounded-full border border-[var(--divider)] px-3 py-1 text-[var(--text-muted)] hover:text-[var(--text-strong)]">새로고침</button>
          </div>
        </div>
        <div className="mx-auto max-w-[1280px] px-8 pb-4">
          <FilterChips />
        </div>
      </div>

      <main className="mx-auto max-w-[1280px] px-8 py-10">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#d6001c]">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map(item => (
            <ProductCard key={item.id} item={item} />
          ))}
        </div>
        {loading && (
          <div className="mt-8 text-center text-sm text-[var(--text-muted)]">추천 상품을 불러오는 중...</div>
        )}
      </main>
    </div>
  );
};
