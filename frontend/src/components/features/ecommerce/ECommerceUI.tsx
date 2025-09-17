import React, { useEffect, useMemo, useState } from 'react';
import './ECommerceUI.css';
import { apiClient } from '../../../services/api.service';
import { likesService } from '../../../services/likes.service';
import type { RecommendationItem } from '../../../types';
import { HeartIcon } from '../../icons/HeartIcon';
import { Button, toast, useToast } from '../../ui';
import { CategoryRow } from '../home/CategoryRow';
import { FilterChips } from '../home/FilterChips';
import { ProductCardOverlay } from './ProductCardOverlay';
import { StickySidebar } from './StickySidebar';

function formatPriceKRW(n: number) {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(n);
}

const useRandomProducts = (limit: number = 24) => {
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<RecommendationItem[]>(`/api/recommend/random?limit=${limit}`);
      setItems(data);
    } catch (e: any) {
      setError(e?.message || '추천 상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, []);

  return { items, loading, error, refresh: fetchItems };
};

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

  const handleNavigate = () => {
    if (item.productUrl) {
      window.open(item.productUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleBuy = () => {
    if (onBuy) {
      onBuy(item);
      return;
    }
    handleNavigate();
  };

  const handleVirtual = () => {
    if (onVirtualFitting) {
      onVirtualFitting(item);
    }
  };

  const discount = item.discountRate ? Math.round(item.discountRate * 100) : item.discountPercentage;

  return (
    <article
      onClick={handleNavigate}
      onMouseEnter={() => setShowOverlay(true)}
      onMouseLeave={() => setShowOverlay(false)}
      className="product-card"
    >
      <div className="product-card__image">
        {item.imageUrl && (
          <img src={item.imageUrl} alt={item.title} />
        )}
        <ProductCardOverlay
          isVisible={showOverlay}
          onBuy={handleBuy}
          onVirtualFitting={handleVirtual}
          product={item}
        />
        <button
          onClick={onToggleLike}
          aria-label="좋아요 토글"
          className={`product-card__like ${liked ? 'is-liked' : ''}`}
        >
          <HeartIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="product-card__meta">
        <p className="product-card__brand">{item.brandName || item.tags?.[0] || 'MUSINSA'}</p>
        <p className="product-card__title">{item.title}</p>
        <div className="product-card__pricing">
          <span className="product-card__price">{formatPriceKRW(item.price)}</span>
          {typeof discount === 'number' && discount > 0 && (
            <span className="product-card__discount">{discount}%</span>
          )}
        </div>
      </div>
    </article>
  );
};

type HomePage = 'home' | 'try-on' | 'likes';

interface HomeProps {
  onNavigate?: (page: HomePage) => void;
}

const resolveCartCategory = (product: RecommendationItem): 'outer' | 'top' | 'pants' | 'shoes' | null => {
  const category = product.category?.toLowerCase();
  if (!category) {
    return null;
  }
  if (category.includes('outer')) {
    return 'outer';
  }
  if (category.includes('top')) {
    return 'top';
  }
  if (category.includes('pant') || category.includes('bottom')) {
    return 'pants';
  }
  if (category.includes('shoe')) {
    return 'shoes';
  }
  return null;
};

interface PromoSlide {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  image: string;
  ctaLabel: string;
  background: string;
}

const promoSlides: PromoSlide[] = [
  {
    id: 'run-lab',
    eyebrow: 'RUN CLUB',
    title: '새벽 러닝을 위한 테크웨어 컬렉션',
    description: '땀을 빠르게 배출하고 체온을 유지해 주는 고기능성 자켓과 러닝 슈즈를 만나보세요.',
    image: 'https://images.unsplash.com/photo-1600965962361-9035dbfd1c50?auto=format&fit=crop&w=900&q=80',
    ctaLabel: '버추얼 피팅 바로가기',
    background: 'radial-gradient(circle at 15% 20%, #4f46e590, transparent 60%), linear-gradient(120deg, #111827 0%, #1e1b4b 60%, #111827 100%)'
  },
  {
    id: 'studio-fit',
    eyebrow: 'STUDIO FIT',
    title: '필라테스를 위한 우먼스 퍼포먼스웨어',
    description: '섬세하게 잡아주는 텐션과 부드러운 촉감을 갖춘 크롭탑 & 레깅스 셋업을 엄선했습니다.',
    image: 'https://images.unsplash.com/photo-1527718641255-324f8e2d0421?auto=format&fit=crop&w=900&q=80',
    ctaLabel: '추천 상품 둘러보기',
    background: 'radial-gradient(circle at 80% 20%, #f472b63d, transparent 65%), linear-gradient(135deg, #312e81 0%, #4c1d95 55%, #312e81 100%)'
  },
  {
    id: 'street-play',
    eyebrow: 'STREET PLAY',
    title: '주말 농구에 어울리는 스트리트 무드',
    description: '로우탑 스니커즈와 와이드 팬츠, 오버핏 아우터로 완성하는 여유로운 실루엣.',
    image: 'https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=900&q=80',
    ctaLabel: '코디 가이드 확인하기',
    background: 'radial-gradient(circle at 20% 80%, #f9731633, transparent 60%), linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #0f172a 100%)'
  }
];

interface PromoCarouselProps {
  onTryOn?: () => void;
}

const PromoCarousel: React.FC<PromoCarouselProps> = ({ onTryOn }) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % promoSlides.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [isPaused]);

  const handleDotClick = (index: number) => {
    setActiveIndex(index);
  };

  return (
    <div
      className="banner-slider"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div
        className="banner-slider__frame"
        style={{ transform: `translateX(-${activeIndex * 100}%)` }}
      >
        {promoSlides.map((slide) => (
          <div key={slide.id} className="banner-slider__slide" style={{ background: slide.background }}>
            <div className="banner-slider__content">
              <span className="banner-slider__eyebrow">{slide.eyebrow}</span>
              <h3 className="banner-slider__title">{slide.title}</h3>
              <p className="banner-slider__desc">{slide.description}</p>
              <button
                type="button"
                className="banner-slider__cta"
                onClick={() => onTryOn?.()}
              >
                {slide.ctaLabel}
              </button>
            </div>
            <div className="banner-slider__visual">
              <img src={slide.image} alt={slide.title} loading="lazy" />
            </div>
          </div>
        ))}
      </div>
      <div className="banner-slider__dots" role="tablist" aria-label="프로모션 슬라이더">
        {promoSlides.map((slide, index) => (
          <button
            key={slide.id}
            type="button"
            className={`banner-slider__dot ${activeIndex === index ? 'is-active' : ''}`}
            onClick={() => handleDotClick(index)}
            aria-label={`${slide.title} 보기`}
            aria-selected={activeIndex === index}
          />
        ))}
      </div>
    </div>
  );
};

export const ECommerceUI: React.FC<HomeProps> = ({ onNavigate }) => {
  const { items, loading, error, refresh } = useRandomProducts(24);
  const gridItems = useMemo(() => items, [items]);
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
      } catch (storageError) {
        console.warn('virtual fitting queue storage failed', storageError);
      }
    }

    onNavigate?.('try-on');
  };

  const handleClearAll = () => {
    setSelectedItems({});
  };

  const handleBuy = (product: RecommendationItem) => {
    if (product.productUrl) {
      window.open(product.productUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAddToCart = (product: RecommendationItem) => {
    const category = resolveCartCategory(product);
    if (!category) {
      return;
    }
    setSelectedItems((prev) => ({
      ...prev,
      [category]: product,
    }));
  };

  return (
    <div className="main-wrap">
      <div className="main-container">
        <section className="headline-strip">
          <div>
            <div className="headline-strip__title">스포츠 종목 아이템 추천</div>
            <div className="headline-strip__meta">
              <span>러닝</span>
              <span>바디밸런스</span>
              <span>에어플로 테크</span>
            </div>
          </div>
          <div className="headline-strip__actions">
            <Button variant="outline" size="sm" onClick={() => onNavigate?.('try-on')}>
              버추얼 피팅 이동
            </Button>
            <Button variant="ghost" size="sm" onClick={refresh} loading={loading}>
              새로고침
            </Button>
          </div>
        </section>

        <section className="hero-section" aria-label="프로모션 영역">
          <PromoCarousel onTryOn={() => onNavigate?.('try-on')} />
        </section>

        <section className="category-showcase" aria-label="카테고리 탐색">
          <CategoryRow />
        </section>

        <section className="filter-panel" aria-label="필터 영역">
          <div className="filter-panel__chips">
            <FilterChips />
          </div>
          <div className="filter-panel__refresh">
            <Button onClick={refresh} size="sm" variant="outline" loading={loading}>
              추천 다시 받기
            </Button>
          </div>
        </section>

        <section className="product-section" aria-label="추천 상품 목록">
          <div className="section-title">
            <h2 className="section-title__heading">오늘의 인기 아이템</h2>
          </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#d6001c]">
              {error}
            </div>
          )}
          <div className="product-grid">
            {gridItems.map((item) => (
              <ProductCard
                key={item.id}
                item={item}
                onBuy={handleBuy}
                onVirtualFitting={handleAddToCart}
              />
            ))}
          </div>
          {loading && (
            <div className="mt-6 text-center text-sm text-[var(--text-muted)]">
              추천 상품을 불러오는 중입니다...
            </div>
          )}
        </section>
      </div>

      <StickySidebar
        selectedItems={selectedItems}
        onRemoveItem={handleRemoveItem}
        onGoToFitting={handleGoToFitting}
        onClearAll={handleClearAll}
      />
    </div>
  );
};
