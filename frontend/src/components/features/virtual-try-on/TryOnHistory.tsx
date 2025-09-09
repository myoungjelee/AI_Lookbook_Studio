import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button } from '../../ui';
import { tryOnHistory, TryOnOutputHistoryItem } from '../../../services/tryon_history.service';
import { FullScreenImage } from '../common/FullScreenImage';

interface TryOnHistoryProps {
  onApply?: (payload: { person?: string; top?: string; pants?: string; shoes?: string; topLabel?: string; pantsLabel?: string; shoesLabel?: string }) => void;
}

export const TryOnHistory: React.FC<TryOnHistoryProps> = ({ onApply }) => {
  const [inputs, setInputs] = useState(tryOnHistory.inputs());
  const [outputs, setOutputs] = useState(tryOnHistory.outputs());
  const [view, setView] = useState<string | null>(null);
  const [sortMode] = useState<'recent'>('recent');

  const refresh = () => {
    setInputs(tryOnHistory.inputs());
    setOutputs(tryOnHistory.outputs());
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

  // Lightweight relative time
  const fmt = (ts: number) => {
    const d = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (d < 60) return `${d}s ago`;
    const m = Math.floor(d / 60); if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
    const day = Math.floor(h / 24); return `${day}d ago`;
  };

  const outputsSorted = useMemo(() => {
    const arr = [...outputs];
    arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return arr;
  }, [outputs]);

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
              // Prefer clothing thumbnails over person to avoid showing AI model face
              const first = item.topImage || item.pantsImage || item.shoesImage || item.personImage;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onApply?.({ person: item.personImage, top: item.topImage, pants: item.pantsImage, shoes: item.shoesImage, topLabel: item.topLabel, pantsLabel: item.pantsLabel, shoesLabel: item.shoesLabel })}
                  className="relative w-40 aspect-[4/5] rounded-md overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200 transition"
                  title="클릭하면 입력을 적용합니다"
                >
                  {first ? (
                    <img src={first} alt="input" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">-</div>
                  )}
                </button>
              );
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
            {outputsSorted.map((o: TryOnOutputHistoryItem, idx: number) => (
              <button key={o.id} onClick={() => setView(o.image)} className="relative group aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200">
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

      {view && <FullScreenImage src={view} onClose={() => setView(null)} />}
    </div>
  );
};

export default TryOnHistory;
