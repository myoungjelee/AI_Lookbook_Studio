import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../../ui/Modal';
import { Button, Spinner } from '../../ui';
import { shareOrDownloadResult, defaultFileName } from '../../../utils/shareImage';
import { virtualTryOnService } from '../../../services/virtualTryOn.service';
import type { StyleTipsResponse } from '../../../types';

type SizeKey = 'square' | 'story' | 'wide';

const SIZES: Record<SizeKey, { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: 'Square 1080×1080 (Instagram)' },
  story: { w: 1080, h: 1920, label: 'Story 1080×1920 (Reels/Story)' },
  wide: { w: 1200, h: 630, label: 'Wide 1200×630 (X/Facebook)' },
};

export const SnsShareDialog: React.FC<{ open: boolean; onClose: () => void; image?: string | null }>
  = ({ open, onClose, image }) => {
  const [size, setSize] = useState<SizeKey>('square');
  const [loading, setLoading] = useState(false);
  const [tips, setTips] = useState<string[]>([]);
  const [score, setScore] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!image) { setTips([]); setScore(null); return; }
      setLoading(true);
      try {
        const res: StyleTipsResponse = await virtualTryOnService.getStyleTips({ generatedImage: image });
        if (cancelled) return;
        setTips((res.tips || []).slice(0, 4));
        setScore(typeof res.score === 'number' ? Math.max(0, Math.min(100, res.score)) : null);
      } catch {
        if (!cancelled) { setTips([]); setScore(null); }
      } finally { if (!cancelled) setLoading(false); }
    };
    if (open) run();
    return () => { cancelled = true; };
  }, [open, image]);

  const dims = SIZES[size];
  const containerStyle: React.CSSProperties = useMemo(() => ({
    width: `${dims.w}px`,
    height: `${dims.h}px`,
  }), [dims]);

  const download = async () => {
    await shareOrDownloadResult('#sns-share-capture', image || undefined, defaultFileName('vto-share'));
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="SNS 공유용 이미지" size="xl">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Object.entries(SIZES).map(([k, v]) => (
            <button key={k} onClick={() => setSize(k as SizeKey)} className={`px-3 py-1.5 rounded-full text-sm border ${size === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'}`}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-500">미리보기는 축소되어 보이지만, 저장 이미지는 위 해상도로 생성됩니다.</div>
        <div className="overflow-auto max-h-[70vh]">
          <div id="sns-share-capture" className="mx-auto shadow ring-1 ring-gray-200" style={containerStyle}>
            {/* Card background */}
            <div className="w-full h-full bg-white flex flex-col">
              <div className="flex items-center justify-between px-6 pt-6">
                <div className="text-gray-800 font-semibold">AI Virtual Try-On</div>
                {typeof score === 'number' && (
                  <span className="text-xs px-2 py-1 rounded-full bg-yellow-50 text-yellow-700">⭐ {score}%</span>
                )}
              </div>
              <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="w-full h-full bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden">
                  {image ? (
                    <img src={image} alt="result" className="object-contain max-w-full max-h-full" />
                  ) : (
                    <div className="text-gray-400 text-sm">No image</div>
                  )}
                </div>
                <div className="flex flex-col">
                  <h4 className="font-semibold text-gray-800 mb-2">스타일 팁</h4>
                  {loading ? (
                    <div className="flex items-center gap-2 text-gray-600"><Spinner size="sm" /> 불러오는 중…</div>
                  ) : tips.length > 0 ? (
                    <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
                      {tips.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                  ) : (
                    <div className="text-sm text-gray-500">팁 없음</div>
                  )}
                  <div className="mt-auto pt-4 text-xs text-gray-400">© Virtual Try-On</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onClose}>닫기</Button>
          <Button onClick={download} disabled={!image}>이미지 저장</Button>
        </div>
      </div>
    </Modal>
  );
};

export default SnsShareDialog;

