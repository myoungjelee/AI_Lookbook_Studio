import React, { useEffect, useState } from 'react';
import { Card, Button, useToast, toast } from '../../ui';
import type { RecommendationItem } from '../../../types';
import { apiClient } from '../../../services/api.service';
import { likesService } from '../../../services/likes.service';
import { HeartIcon } from '../../icons/HeartIcon';
import { HeroBanner } from '../home/HeroBanner';
import { CategoryRow } from '../home/CategoryRow';
import { FilterChips } from '../home/FilterChips';

function formatPriceKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
}

const useRandomProducts = (limit: number = 18) => {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true); setError(null);
    try {
      const data = await apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${limit}`);
      setItems(data);
    } catch (e: any) {
      setError(e?.message || 'failed');
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
      ? toast.success('좋아요에 추가', item.title, { duration: 2000 })
      : toast.info('좋아요에서 제거', item.title, { duration: 1500 })
    );
  };

  const onBuy: React.MouseEventHandler = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (item.productUrl) {
      window.open(item.productUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const body = (
    <Card
      padding="sm"
      className="group relative cursor-pointer transition-all duration-200 hover:shadow-xl hover:-translate-y-1 hover:scale-[1.02] ring-1 ring-transparent hover:ring-blue-200 rounded-xl"
    >
      <div className="relative aspect-[4/5] bg-gray-100 rounded-lg mb-2 overflow-hidden">
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
        )}
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-0 ring-blue-200/50 opacity-0 group-hover:opacity-100 group-hover:ring-4 transition-opacity" />
      </div>
      <p className="font-bold text-sm truncate">{item.tags?.[0] || '브랜드'}</p>
      <p className="text-xs text-gray-600 truncate h-8">{item.title}</p>
      <p className="text-sm font-bold">{formatPriceKRW(item.price)}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onBuy} disabled={!item.productUrl}>구매</Button>
        <Button size="sm" variant={liked ? 'secondary' : 'outline'} onClick={onToggleLike} aria-pressed={liked}>
          <span className="inline-flex items-center gap-1">
            <HeartIcon className={liked ? 'w-4 h-4 text-red-500' : 'w-4 h-4'} />
            {liked ? '좋아요됨' : '좋아요'}
          </span>
        </Button>
      </div>
    </Card>
  );
  return item.productUrl ? (
    <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="block">{body}</a>
  ) : (
    <div className="block">{body}</div>
  );
};

// Carousel item with Buy/Like actions
const CarouselItem: React.FC<{ item: RecommendationItem }> = ({ item }) => {
  const { addToast } = useToast();
  const [liked, setLiked] = useState<boolean>(() => likesService.isLiked(item.id));

  const onToggleLike: React.MouseEventHandler = (e) => {
    e.preventDefault(); e.stopPropagation();
    const nowLiked = likesService.toggle(item);
    setLiked(nowLiked);
    addToast(nowLiked
      ? toast.success('좋아요에 추가', item.title, { duration: 2000 })
      : toast.info('좋아요에서 제거', item.title, { duration: 1500 })
    );
  };

  const onBuy: React.MouseEventHandler = (e) => {
    e.preventDefault(); e.stopPropagation();
    if (item.productUrl) window.open(item.productUrl, '_blank', 'noopener,noreferrer');
  };

  const card = (
    <div className="flex-shrink-0 w-40 group cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:scale-105">
      <div className="relative aspect-square bg-gray-100 rounded-lg mb-2 overflow-hidden ring-1 ring-transparent group-hover:ring-blue-200">
        {item.imageUrl && <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />}
        <div className="pointer-events-none absolute inset-0 rounded-lg ring-0 ring-blue-200/50 opacity-0 group-hover:opacity-100 group-hover:ring-4 transition-opacity" />
      </div>
      <p className="font-bold text-sm truncate">{item.tags?.[0] || '브랜드'}</p>
      <p className="text-xs text-gray-600 truncate">{item.title}</p>
      <p className="text-sm font-bold">{formatPriceKRW(item.price)}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" onClick={onBuy} disabled={!item.productUrl}>구매</Button>
        <Button size="sm" variant={liked ? 'secondary' : 'outline'} onClick={onToggleLike} aria-pressed={liked}>
          <span className="inline-flex items-center gap-1">
            <HeartIcon className={liked ? 'w-4 h-4 text-red-500' : 'w-4 h-4'} />
            {liked ? '좋아요됨' : '좋아요'}
          </span>
        </Button>
      </div>
    </div>
  );

  return item.productUrl ? (
    <a href={item.productUrl} target="_blank" rel="noopener noreferrer" className="block">{card}</a>
  ) : (
    <div className="block">{card}</div>
  );
};

interface HomeProps { onNavigate?: (page: 'home' | 'try-on' | 'likes') => void }
export const ECommerceUI: React.FC<HomeProps> = ({ onNavigate }) => {
  const { items, loading, error, refresh } = useRandomProducts(18);
  const carousel = items.slice(0, 8);
  const gridItems = items.slice(8);

  return (
    <div className="bg-white font-sans">
      <header className="sticky top-0 bg-white z-10 shadow-sm">
        <div className="overflow-x-auto whitespace-nowrap">
          <nav className="flex items-center justify-center space-x-4 p-3 text-sm font-medium">
            {[
              { id: 'content', label: '콘텐츠' },
              { id: 'recommend', label: '추천' },
              { id: 'ranking', label: '랭킹' },
              { id: 'sale', label: '세일' },
              { id: 'brand', label: '브랜드' },
              { id: 'release', label: '발매' },
              { id: 'beauty', label: '뷰티' },
              { id: 'time', label: '시간특가' },
              { id: 'try-on', label: '사이버피팅', go: 'try-on' as const },
              { id: 'likes', label: '좋아요', go: 'likes' as const },
            ].map((item, idx) => (
              <button
                key={item.id}
                onClick={() => item.go && onNavigate?.(item.go)}
                className={`pb-1 ${idx === 1 ? 'text-black border-b-2 border-black font-bold' : 'text-gray-500'} ${item.go ? 'hover:text-black' : ''}`}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="p-4 space-y-8 max-w-3xl mx-auto">
        <HeroBanner />
        <CategoryRow />
        <section>
          <h2 className="text-lg font-bold mb-3">인기 신상</h2>
          <FilterChips />
        </section>

        <Button className="w-full" size="lg" onClick={refresh} loading={loading}>새로고침</Button>

        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">오늘 인기 아이템</h2>
            <Button onClick={refresh} size="sm" loading={loading}>새로고침</Button>
          </div>
          {error && (
            <div className="text-red-600 text-sm mb-2">{error}</div>
          )}
          <div className="grid grid-cols-3 gap-4">
            {gridItems.map(item => <ProductCard key={item.id} item={item} />)}
          </div>
        </section>
      </main>
    </div>
  );
};

