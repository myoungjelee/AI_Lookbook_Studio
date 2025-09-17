import React, { useEffect, useState } from 'react';
import type { RecommendationItem } from '../../../types';

interface StickySidebarProps {
  selectedItems: {
    outer?: RecommendationItem;
    top?: RecommendationItem;
    pants?: RecommendationItem;
    shoes?: RecommendationItem;
  };
  onRemoveItem: (category: 'outer' | 'top' | 'pants' | 'shoes') => void;
  onGoToFitting: () => void;
  onClearAll: () => void;
}

export const StickySidebar: React.FC<StickySidebarProps> = ({
  selectedItems,
  onRemoveItem,
  onGoToFitting,
  onClearAll,
}) => {
  const itemCount = Object.values(selectedItems).filter(Boolean).length;
  const [isVisible, setIsVisible] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [hideTimer, setHideTimer] = useState<number | null>(null);

  // 통합된 타이머 관리 함수
  const scheduleHide = (delay: number) => {
    if (hideTimer) {
      clearTimeout(hideTimer);
    }
    const timer = setTimeout(() => {
      // 고정 모드가 아니고, 현재 호버 상태가 아니면 사라지게
      if (!isPinned) {
        setIsVisible(false);
      }
      setHideTimer(null);
    }, delay);
    setHideTimer(timer);
  };

  // 아이템이 추가되면 2초간 보여주고 사라지게 (고정 모드가 아닐 때만)
  useEffect(() => {
    if (itemCount > 0 && !isPinned) {
      setIsVisible(true);
      scheduleHide(2000); // 2초 후 사라지게
    } else if (isPinned && itemCount > 0) {
      setIsVisible(true);
    }
  }, [selectedItems, isPinned]);

  // 마우스/터치 호버 시 보이게 (고정 모드가 아닐 때만)
  const handleMouseEnter = () => {
    if (!isPinned) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        setHideTimer(null);
      }
      setIsVisible(true);
    }
  };

  const handleMouseLeave = () => {
    if (!isPinned) {
      scheduleHide(500); // 0.5초 후 사라지게
    }
  };

  // 터치 이벤트 핸들러 (모바일 대응)
  const handleTouchStart = () => {
    if (!isPinned) {
      if (hideTimer) {
        clearTimeout(hideTimer);
        setHideTimer(null);
      }
      setIsVisible(true);
    }
  };

  const handleTouchEnd = () => {
    if (!isPinned) {
      scheduleHide(1000); // 터치의 경우 1초 후 사라지게 (더 여유있게)
    }
  };

  // 고정 모드 토글
  const togglePinned = () => {
    const newPinnedState = !isPinned;
    setIsPinned(newPinnedState);
    
    if (newPinnedState) {
      // 고정 모드로 전환 시 즉시 보이게
      if (hideTimer) {
        clearTimeout(hideTimer);
        setHideTimer(null);
      }
      setIsVisible(true);
    } else {
      // 고정 해제 시 아이템이 있으면 0.5초 후에 사라지게
      if (itemCount > 0) {
        setIsVisible(true);
        scheduleHide(500);
      } else {
        setIsVisible(false);
      }
    }
  };

  return (
    <>
      {/* 모바일용 플로팅 버튼 (사이드바가 숨겨져 있을 때만) */}
      {!isVisible && itemCount > 0 && (
        <button
          onClick={() => setIsVisible(true)}
          className="md:hidden fixed right-4 bottom-4 z-50 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 active:bg-blue-800 transition-all duration-200"
          title="입어보기 준비"
        >
          <div className="flex flex-col items-center">
            <span className="text-lg">👕</span>
            <span className="text-xs font-bold">{itemCount}</span>
          </div>
        </button>
      )}

      <div 
        className={`fixed right-2 md:right-4 top-1/2 transform -translate-y-1/2 z-40 transition-all duration-500 ease-out ${
          isVisible 
            ? 'translate-x-0 opacity-100' 
            : 'translate-x-full opacity-0'
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
      <div className="bg-white rounded-2xl shadow-2xl w-72 md:w-80 h-[600px] md:h-[800px] overflow-hidden">
        {/* 헤더 */}
        <div className="bg-black text-white p-6 rounded-t-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xl font-bold">입어보기 준비</h3>
            <div className="flex items-center gap-2">
              {/* 모바일용 닫기 버튼 */}
              <button
                onClick={() => setIsVisible(false)}
                className="md:hidden p-2 rounded-full bg-gray-600 text-white hover:bg-gray-500 active:bg-gray-700 transition-all duration-200"
                title="닫기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {itemCount > 0 && (
                <button
                  onClick={onClearAll}
                  className="p-3 md:p-2 rounded-full bg-red-600 text-white hover:bg-red-700 active:bg-red-800 transition-all duration-200 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0"
                  title="전체 비우기"
                >
                  <span className="text-lg md:text-base">🗑️</span>
                </button>
              )}
              <button
                onClick={togglePinned}
                className={`p-3 md:p-2 rounded-full transition-all duration-200 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0 ${
                  isPinned 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-600 text-gray-300 hover:bg-gray-500 active:bg-gray-700'
                }`}
                title={isPinned ? '고정 해제' : '고정하기'}
              >
                {isPinned ? (
                  // 고정됨: 압정 아이콘
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.5 3.5 0 0114 15a3.5 3.5 0 01-6.708-.24l-1.738-5.42 1.233-.616a1 1 0 01.894-1.79l1.599.8L9 4.323V3a1 1 0 011-1zm-2 3.004V3a3 3 0 116 0v2.004l.571.143.598-.3 2.464 1.232-.123.384 1.738 5.42a3.5 3.5 0 01-2.56 4.66 3.5 3.5 0 01-6.56 0 3.5 3.5 0 01-2.56-4.66l1.738-5.42-.123-.384 2.464-1.232.598.3.571-.143z" clipRule="evenodd" />
                  </svg>
                ) : (
                  // 고정 안됨: 메뉴 아이콘
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
          </div>
          <button
            onClick={onGoToFitting}
            disabled={itemCount === 0}
            className={`w-full px-4 py-2 rounded-full font-medium transition-all duration-200 ${
              itemCount === 0
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-white text-black hover:bg-gray-100 hover:scale-105 active:scale-95'
            }`}
          >
            {itemCount === 0 
              ? '선택해주세요' 
              : `${itemCount}개 입어보기`
            }
          </button>
        </div>

        {/* 내용 */}
        <div className="p-6 flex-1 flex flex-col bg-gray-100/50 backdrop-blur-sm">
          <div className="space-y-4 flex-1 flex flex-col">
            {[
              { key: 'outer' as const, label: '아우터', item: selectedItems.outer },
              { key: 'top' as const, label: '상의', item: selectedItems.top },
              { key: 'pants' as const, label: '하의', item: selectedItems.pants },
              { key: 'shoes' as const, label: '신발', item: selectedItems.shoes },
            ].map(({ key, label, item }) => (
              <div key={key} className={`border border-gray-300 rounded-2xl p-5 hover:shadow-lg transition-all duration-300 hover:border-gray-400 hover:-translate-y-1 flex-1 min-h-[120px] ${
                item ? 'bg-white/80 backdrop-blur-sm' : 'bg-white/60 backdrop-blur-sm'
              }`}>
                <div className="flex items-center gap-4 h-full">
                  {item ? (
                    // 아이템이 있을 때: 이미지 + 정보
                    <>
                      <div className="w-24 h-24 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 shadow-sm">
                        <img 
                          src={item.imageUrl} 
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-gray-900 text-base mb-2">{label}</div>
                        <div className="text-sm text-gray-600 truncate mb-2">{item.title}</div>
                        <div className="text-base font-bold text-blue-600">₩{item.price.toLocaleString()}</div>
                      </div>
                      <button
                        onClick={() => onRemoveItem(key)}
                        className="text-gray-400 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-all duration-200"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  ) : (
                    // 아이템이 없을 때: 기본 상태
                    <div className="w-24 h-24 bg-gray-50 rounded-xl flex items-center justify-center flex-shrink-0 border-2 border-dashed border-gray-200">
                      <div className="text-gray-400 text-sm text-center">
                        <div className="text-4xl mb-2">
                          {key === 'outer' ? '🧥' : key === 'top' ? '👕' : key === 'pants' ? '👖' : '👟'}
                        </div>
                        <div className="text-sm font-medium">{label}</div>
                      </div>
                    </div>
                  )}
                  
                  {!item && (
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-gray-900 text-base mb-2">{label}</div>
                      <div className="text-sm text-gray-400">선택해주세요</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
      </div>
    </>
  );
};
