import React, { useEffect, useMemo, useState } from 'react';
import { tryOnHistory, TryOnInputHistoryItem, TryOnOutputHistoryItem } from '../../../services/tryon_history.service';
import { Button, Card } from '../../ui';
import { FullScreenImage } from '../common/FullScreenImage';

interface TryOnHistoryProps {
  onApply?: (payload: { person?: string; top?: string; pants?: string; shoes?: string; topLabel?: string; pantsLabel?: string; shoesLabel?: string }) => void;
}

interface HistoryItemCardProps {
  item: TryOnInputHistoryItem;
  onApply?: (payload: { person?: string; top?: string; pants?: string; shoes?: string; topLabel?: string; pantsLabel?: string; shoesLabel?: string }) => void;
  getHistoryItemImage: (item: TryOnInputHistoryItem) => Promise<string | null>;
}

const HistoryItemCard: React.FC<HistoryItemCardProps> = ({ item, onApply, getHistoryItemImage }) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadImage = async () => {
      setLoading(true);
      try {
        const image = await getHistoryItemImage(item);
        setImageUrl(image);
      } catch (error) {
        console.warn('이미지 로드 실패:', error);
        setImageUrl(null);
      } finally {
        setLoading(false);
      }
    };

    loadImage();
  }, [item, getHistoryItemImage]);

  const hasClothing = item.topLabel || item.pantsLabel || item.shoesLabel || item.outerLabel;

  return (
    <button
      type="button"
      onClick={() => onApply?.({ person: undefined, top: undefined, pants: undefined, shoes: undefined, topLabel: item.topLabel, pantsLabel: item.pantsLabel, shoesLabel: item.shoesLabel })}
      className="relative w-40 aspect-[4/5] rounded-md overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200 transition"
      title="클릭하면 입력을 적용합니다"
    >
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
          로딩...
        </div>
      ) : imageUrl ? (
        <img src={imageUrl} alt="의류 이미지" className="absolute inset-0 w-full h-full object-cover" />
      ) : hasClothing ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 p-2">
          <span className="text-xs font-medium">의류 조합</span>
          <span className="text-xs text-gray-500 mt-1">
            {[item.topLabel, item.pantsLabel, item.shoesLabel, item.outerLabel].filter(Boolean).join(', ')}
          </span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">-</div>
      )}
    </button>
  );
};

export const TryOnHistory: React.FC<TryOnHistoryProps> = ({ onApply }) => {
  const [inputs, setInputs] = useState(tryOnHistory.inputs());
  const [outputs, setOutputs] = useState(tryOnHistory.outputs());
  const [view, setView] = useState<string | null>(null);
  const [viewingItem, setViewingItem] = useState<TryOnOutputHistoryItem | null>(null);
  const [sortMode, setSortMode] = useState<'recent' | 'rank'>('recent');
  // 상품 데이터는 히스토리에 저장되므로 별도 캐시 불필요

  const refresh = () => {
    setInputs(tryOnHistory.inputs());
    setOutputs(tryOnHistory.outputs());
  };

  // 더 이상 API 호출이 필요하지 않음 (상품 데이터가 히스토리에 저장됨)

  // 히스토리 아이템의 대표 이미지를 가져오는 함수 (저장된 상품 데이터 사용)
  const getHistoryItemImage = async (item: TryOnInputHistoryItem): Promise<string | null> => {
    // 상의 → 하의 → 신발 → 아우터 순으로 우선순위
    const products = [item.topProduct, item.pantsProduct, item.shoesProduct, item.outerProduct].filter(Boolean);
    
    console.log(`히스토리 아이템 상품 데이터들:`, {
      topProduct: item.topProduct?.title,
      pantsProduct: item.pantsProduct?.title,
      shoesProduct: item.shoesProduct?.title,
      outerProduct: item.outerProduct?.title,
      filteredProducts: products.length
    });
    
    for (const product of products) {
      if (product?.imageUrl) {
        console.log(`이미지 URL 찾음: ${product.imageUrl}`);
        return product.imageUrl;
      }
    }
    
    console.log(`모든 상품에서 이미지를 찾지 못함`);
    return null;
  };

  useEffect(() => {
    const unsub = tryOnHistory.subscribe(() => refresh());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'app:tryon:history:inputs:v1' || e.key === 'app:tryon:history:outputs:v1') {
        refresh();
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { unsub(); window.removeEventListener('storage', onStorage); };
  }, []);


  const outputsSorted = useMemo(() => {
    const arr = [...outputs];
    if (sortMode === 'recent') {
      arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    } else {
      // 랭킹순 정렬 (평가 점수 기준)
      arr.sort((a, b) => {
        const scoreA = a.evaluation?.score || 0;
        const scoreB = b.evaluation?.score || 0;
        return scoreB - scoreA;
      });
    }
    return arr;
  }, [outputs, sortMode]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="space-y-3 md:col-span-2 min-h-[260px] order-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">입력 히스토리</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refresh}>새로고침</Button>
            <Button size="sm" variant="ghost" onClick={() => { tryOnHistory.clearInputs(); refresh(); }}>비우기</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid grid-rows-2 grid-flow-col auto-cols-[160px] gap-3 pr-1">
            {inputs.length === 0 ? (
              <div className="row-span-2 flex items-center justify-center text-sm text-gray-500 w-80">기록이 없습니다.</div>
            ) : inputs.map(item => {
              return <HistoryItemCard key={item.id} item={item} onApply={onApply} getHistoryItemImage={getHistoryItemImage} />;
            })}
          </div>
        </div>
      </Card>

      <Card className="space-y-3 md:col-span-2 min-h-[260px] order-1">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">결과 히스토리</h3>
          <div className="flex gap-2">
            <Button size="sm" variant={sortMode === 'rank' ? 'secondary' : 'outline'} onClick={() => setSortMode(sortMode === 'rank' ? 'recent' : 'rank')}>
              {sortMode === 'rank' ? '최신순' : '랭킹순위'}
            </Button>
            <Button size="sm" variant="outline" onClick={refresh}>새로고침</Button>
            <Button size="sm" variant="ghost" onClick={() => { tryOnHistory.clearOutputs(); refresh(); }}>비우기</Button>
          </div>
        </div>
        {outputsSorted.length === 0 ? (
          <div className="text-sm text-gray-500">기록이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {outputsSorted.map((o: TryOnOutputHistoryItem) => (
              <button key={o.id} onClick={() => { setView(o.image); setViewingItem(o); }} className="relative group aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200">
                <img src={o.image} alt="history" className="w-full h-full object-cover" />
                {typeof o.evaluation?.score === 'number' && (
                  <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md">
                    ⭐ {o.evaluation!.score}점
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>

      {view && (
        <FullScreenImage 
          src={view} 
          onClose={() => { setView(null); setViewingItem(null); }} 
          onDelete={viewingItem ? () => {
            tryOnHistory.removeOutput(viewingItem.id);
            refresh();
          } : undefined}
        />
      )}
    </div>
  );
};

export default TryOnHistory;
