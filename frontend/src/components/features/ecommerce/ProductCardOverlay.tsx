import React from 'react';
import { Button } from '../../ui';

interface ProductCardOverlayProps {
  isVisible: boolean;
  onBuy: () => void;
  onVirtualFitting: () => void;
}

export const ProductCardOverlay: React.FC<ProductCardOverlayProps> = ({
  isVisible,
  onBuy,
  onVirtualFitting
}) => {
  if (!isVisible) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    // 오버레이 클릭 시 이벤트 전파만 중지 (닫지 않음)
    e.stopPropagation();
  };

  return (
    <div 
      className="absolute inset-x-0 top-1/4 bottom-1/4 bg-black/60 backdrop-blur-sm rounded-xl flex items-center justify-center z-10"
      onClick={handleOverlayClick}
    >
      <div className="flex flex-col gap-3 p-4">
        <Button 
          onClick={(e) => {
            e.stopPropagation();
            onVirtualFitting();
          }}
          className="w-full bg-green-600 text-white hover:bg-green-700 font-semibold"
        >
          입어보기
        </Button>
         <Button 
           onClick={(e) => {
             console.log('사이드바에 담기 버튼 클릭됨');
             e.stopPropagation();
             onBuy();
           }}
           className="w-full bg-blue-600 text-white hover:bg-blue-700 font-semibold"
         >
           사이드바에 담기
         </Button>
      </div>
    </div>
  );
};

export default ProductCardOverlay;
