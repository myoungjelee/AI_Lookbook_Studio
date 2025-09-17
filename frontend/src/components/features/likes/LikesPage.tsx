import React, { useEffect, useState } from 'react';
import type { RecommendationItem } from '../../../types';
import { likesService } from '../../../services/likes.service';
import { Card, Button } from '../../ui';
import { HeartIcon } from '../../icons/HeartIcon';

function formatPriceKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
}

export const LikesPage: React.FC = () => {
  const [items, setItems] = useState<RecommendationItem[]>(() => likesService.getAll());

  useEffect(() => {
    const unsubscribe = likesService.subscribe(setItems);
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'app:likes:v1') {
        setItems(likesService.getAll());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      unsubscribe();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (items.length === 0) {
    return (
      <div className="pt-[124px] min-h-screen bg-white">
        <div className="mx-auto max-w-[720px] px-6 py-16">
          <Card className="flex flex-col items-center justify-center gap-3 py-12 text-center text-gray-600">
            <HeartIcon className="h-10 w-10 text-gray-300" />
            <p className="text-base font-medium text-[var(--text-muted)]">좋아요한 상품이 없습니다.</p>
            <p className="text-sm text-[var(--text-muted)]">관심 가는 상품의 하트를 눌러 목록을 채워보세요.</p>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-[124px] min-h-screen bg-white">
      <div className="mx-auto max-w-[1280px] px-8 py-10 space-y-8">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[var(--text-strong)]">좋아요한 상품</h2>
          <Button variant="ghost" size="sm" onClick={() => likesService.clear()}>전체 비우기</Button>
        </header>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => (
            <Card
              key={item.id}
              padding="sm"
              className="group relative transition-all duration-200 hover:-translate-y-1 hover:scale-[1.02] hover:shadow-xl"
            >
              <div className="relative mb-3 overflow-hidden rounded-[var(--radius-card)] bg-[var(--surface-muted)]">
                <div className="aspect-[4/5]">
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    />
                  )}
                </div>
                <div className="pointer-events-none absolute inset-0 rounded-[var(--radius-card)] ring-0 ring-blue-200/60 opacity-0 group-hover:opacity-100 group-hover:ring-4 transition-opacity" />
              </div>

              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)] truncate">
                {item.brandName || item.tags?.[0] || 'MUSINSA'}
              </p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-[var(--text-strong)]">{item.title}</p>
              <p className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{formatPriceKRW(item.price)}</p>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => item.productUrl && window.open(item.productUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!item.productUrl}
                >
                  구매하기
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => likesService.remove(item.id)}
                >
                  삭제
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LikesPage;
