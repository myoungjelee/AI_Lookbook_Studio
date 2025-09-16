import React from 'react';
import type { RecommendationItem } from '../../../types';
import { XIcon } from '../../icons/XIcon';
import { Button } from '../../ui';

interface CartSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToFitting: () => void;
  selectedItems: {
    outer?: RecommendationItem;
    top?: RecommendationItem;
    pants?: RecommendationItem;
    shoes?: RecommendationItem;
  };
  onRemoveItem: (category: 'outer' | 'top' | 'pants' | 'shoes') => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export const CartSidebar: React.FC<CartSidebarProps> = ({
  isOpen,
  onClose,
  onGoToFitting,
  selectedItems,
  onRemoveItem,
  onMouseEnter,
  onMouseLeave,
}) => {

  const categories = [
    { key: 'outer' as const, label: '아우터', icon: '🧥' },
    { key: 'top' as const, label: '상의', icon: '👕' },
    { key: 'pants' as const, label: '하의', icon: '👖' },
    { key: 'shoes' as const, label: '신발', icon: '👟' },
  ];

  const hasAnyItem = Object.values(selectedItems).some(item => item !== undefined);

  return (
    <div 
      className={`fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
        <div className="flex flex-col h-full">
          {/* 헤더 */}
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">입어보기 준비</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full"
            >
              <XIcon className="w-5 h-5" />
            </button>
          </div>

          {/* 내용 */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {categories.map(({ key, label, icon }) => {
                const item = selectedItems[key];
                return (
                  <div key={key} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{icon}</span>
                      <span className="font-medium">{label}</span>
                      {item && (
                        <button
                          onClick={() => onRemoveItem(key)}
                          className="ml-auto text-red-500 hover:text-red-700"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    
                    {item ? (
                      <div className="flex gap-3">
                        <div className="w-16 h-16 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                          {item.imageUrl && (
                            <img 
                              src={item.imageUrl} 
                              alt={item.title}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.title}</p>
                          <p className="text-xs text-gray-500">₩{item.price.toLocaleString()}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-400 text-center py-4">
                        {label}을 선택해주세요
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 푸터 */}
          <div className="p-4 border-t">
            <Button
              onClick={onGoToFitting}
              disabled={!hasAnyItem}
              className="w-full"
            >
              사이버피팅 시작하기
            </Button>
          </div>
        </div>
      </div>
  );
};
