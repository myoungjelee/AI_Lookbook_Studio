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
  const [sortMode, setSortMode] = useState<'recent' | 'score'>('recent');

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
    if (sortMode === 'score') {
      arr.sort((a, b) => {
        const sa = typeof a.evaluation?.score === 'number' ? a.evaluation!.score : -1;
        const sb = typeof b.evaluation?.score === 'number' ? b.evaluation!.score : -1;
        if (sb !== sa) return sb - sa; // desc
        return (b.ts || 0) - (a.ts || 0);
      });
    } else {
      arr.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    }
    return arr;
  }, [outputs, sortMode]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <Card className="space-y-3 lg:col-span-1 min-h-[260px]">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">입력 히스토리</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refresh}>새로고침</Button>
            <Button size="sm" variant="ghost" onClick={() => { tryOnHistory.clearInputs(); refresh(); }}>비우기</Button>
          </div>
        </div>
        <div className="columns-2 gap-x-3">
          {inputs.length === 0 ? (
            <div className="col-span-2 py-4 text-sm text-gray-500 text-center">기록이 없습니다.</div>
          ) : inputs.map(item => {
            // Prefer clothing thumbnails over person to avoid showing AI model face
            const first = item.topImage || item.pantsImage || item.shoesImage || item.personImage;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onApply?.({ person: item.personImage, top: item.topImage, pants: item.pantsImage, shoes: item.shoesImage, topLabel: item.topLabel, pantsLabel: item.pantsLabel, shoesLabel: item.shoesLabel })}
                className="mb-3 break-inside-avoid rounded-md overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200 transition w-full"
                title="클릭하면 입력을 적용합니다"
              >
                {first ? (
                  <img src={first} alt="input" className="block w-full h-auto object-cover" />
                ) : (
                  <div className="aspect-[4/5] w-full flex items-center justify-center text-gray-400 text-xs">-</div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-3 lg:col-span-2 min-h-[260px]">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">결과 히스토리</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={refresh}>새로고침</Button>
            <Button size="sm" variant="ghost" onClick={() => { tryOnHistory.clearOutputs(); refresh(); }}>비우기</Button>
            <Button size="sm" variant={sortMode === 'score' ? 'secondary' : 'outline'} onClick={() => setSortMode(sortMode === 'score' ? 'recent' : 'score')}>
              {sortMode === 'score' ? '최신순' : '점수순 보기'}
            </Button>
          </div>
        </div>
        {outputsSorted.length === 0 ? (
          <div className="text-sm text-gray-500">기록이 없습니다.</div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {outputsSorted.map((o: TryOnOutputHistoryItem, idx: number) => (
              <button key={o.id} onClick={() => setView(o.image)} className="relative group aspect-[4/5] rounded-lg overflow-hidden bg-gray-100 ring-1 ring-transparent hover:ring-blue-200">
                <img src={o.image} alt="history" className="w-full h-full object-cover" />
                {o.evaluation && (
                  <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md">
                    ⭐ {o.evaluation.score}%
                  </div>
                )}
                {sortMode === 'score' && (
                  <div className="absolute top-2 right-2 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-md">#{idx + 1}</div>
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
