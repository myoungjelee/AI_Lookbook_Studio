import React from 'react';
import type { RecommendationItem } from '../../../types';
import { Button } from '../../ui';

interface ProductCardOverlayProps {
  isVisible: boolean;
  onBuy: () => void;
  onVirtualFitting: () => void;
  product: RecommendationItem;
}

export const ProductCardOverlay: React.FC<ProductCardOverlayProps> = ({
  isVisible,
  onBuy,
  onVirtualFitting,
  product
}) => {
  if (!isVisible) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    // 오버레이 클릭 시 이벤트 전파만 중지 (닫지 않음)
    e.stopPropagation();
  };

  const handleButtonClick = (e: React.MouseEvent, action: () => void) => {
    console.log('ProductCardOverlay 버튼 클릭됨');
    e.stopPropagation();
    action();
  };

  return (
    <div 
      className="absolute inset-0 bg-black/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-10"
      onClick={handleOverlayClick}
    >
      <div className="flex flex-col gap-3 p-4">
        <Button 
          onClick={(e) => {
            console.log('입어보기 버튼 클릭됨');
            e.stopPropagation();
            onVirtualFitting();
          }}
          className="w-full bg-green-600 text-white hover:bg-green-700 font-semibold"
        >
          입어보기
        </Button>
        {product.productUrl && (
          <Button 
            onClick={(e) => {
              console.log('사러가기 버튼 클릭됨');
              e.stopPropagation();
              onBuy();
            }}
            className="w-full bg-blue-600 text-white hover:bg-blue-700 font-semibold"
          >
            구매하기
          </Button>
        )}
      </div>
    </div>
  );
};

export default ProductCardOverlay;
