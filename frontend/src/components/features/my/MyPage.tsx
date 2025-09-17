import React, { useEffect, useState } from 'react';
import type { TryOnInputHistoryItem, TryOnOutputHistoryItem } from '../../../services/tryon_history.service';
import { tryOnHistory } from '../../../services/tryon_history.service';
import { Button, Card } from '../../ui';
import { FullScreenImage } from '../common/FullScreenImage';

interface MyPageHistoryItemProps {
  item: TryOnInputHistoryItem;
  getHistoryItemImage: (item: TryOnInputHistoryItem) => Promise<string | null>;
}

const MyPageHistoryItem: React.FC<MyPageHistoryItemProps> = ({ item, getHistoryItemImage }) => {
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
    <button className="group relative aspect-[4/5] rounded-xl overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200" onClick={() => {}}>
      {loading ? (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
          로딩...
        </div>
      ) : imageUrl ? (
        <img src={imageUrl} alt="의류 이미지" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
      ) : hasClothing ? (
        <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 p-2">
          <span className="text-sm font-medium">의류 조합</span>
          <span className="text-xs text-gray-500 mt-1">
            {[item.topLabel, item.pantsLabel, item.shoesLabel, item.outerLabel].filter(Boolean).join(', ')}
          </span>
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">-</div>
      )}
    </button>
  );
};

export const MyPage: React.FC = () => {
  const [inputs, setInputs] = useState<TryOnInputHistoryItem[]>(tryOnHistory.inputs());
  const [outputs, setOutputs] = useState<TryOnOutputHistoryItem[]>(tryOnHistory.outputs());
  const [view, setView] = useState<string | null>(null);

  useEffect(() => {
    const unsub = tryOnHistory.subscribe(() => {
      setInputs(tryOnHistory.inputs());
      setOutputs(tryOnHistory.outputs());
    });
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.includes('app:tryon:history')) {
        setInputs(tryOnHistory.inputs());
        setOutputs(tryOnHistory.outputs());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => { unsub(); window.removeEventListener('storage', onStorage); };
  }, []);

  // 상품 데이터는 히스토리에 저장되므로 별도 캐시 불필요

  // 더 이상 API 호출이 필요하지 않음 (상품 데이터가 히스토리에 저장됨)

  // 히스토리 아이템의 대표 이미지를 가져오는 함수 (저장된 상품 데이터 사용)
  const getHistoryItemImage = async (item: TryOnInputHistoryItem): Promise<string | null> => {
    // 상의 → 하의 → 신발 → 아우터 순으로 우선순위
    const products = [item.topProduct, item.pantsProduct, item.shoesProduct, item.outerProduct].filter(Boolean);
    
    for (const product of products) {
      if (product?.imageUrl) {
        return product.imageUrl;
      }
    }
    
    return null;
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      <div className="mx-auto w-full max-w-screen-xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 xl:gap-10 items-start">
          <Card className="space-y-4 p-6 xl:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">입력 히스토리</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setInputs(tryOnHistory.inputs())}>새로고침</Button>
                <Button size="sm" variant="ghost" onClick={() => { tryOnHistory.clearInputs(); setInputs([]); }}>비우기</Button>
              </div>
            </div>
            {inputs.length === 0 ? (
              <div className="text-center text-gray-500 py-12">기록이 없습니다.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {inputs.map((it) => (
                  <MyPageHistoryItem key={it.id} item={it} getHistoryItemImage={getHistoryItemImage} />
                ))}
              </div>
            )}
          </Card>

          <Card className="space-y-4 p-6 xl:p-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">결과 히스토리</h2>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setOutputs(tryOnHistory.outputs())}>새로고침</Button>
                <Button size="sm" variant="ghost" onClick={() => { tryOnHistory.clearOutputs(); setOutputs([]); }}>비우기</Button>
              </div>
            </div>
            {outputs.length === 0 ? (
              <div className="text-center text-gray-500 py-12">기록이 없습니다.</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {outputs.map((o) => (
                  <button key={o.id} className="group relative aspect-[4/5] rounded-xl overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200" onClick={() => setView(o.image)}>
                    <img src={o.image} alt="result" className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {view && <FullScreenImage src={view} onClose={() => setView(null)} />}
    </div>
  );
};

export default MyPage;
