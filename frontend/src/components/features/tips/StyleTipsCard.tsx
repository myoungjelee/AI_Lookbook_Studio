import React, { useEffect, useMemo, useState } from "react";
import { Card, Button, Spinner } from "../../ui";
import { virtualTryOnService } from "../../../services/virtualTryOn.service";
import { tryOnHistory } from "../../../services/tryon_history.service";
import type { StyleTipsResponse } from "../../../types";

interface StyleTipsCardProps {
  generatedImage?: string | null;
  onTipsLoaded?: (payload: {
    tips: string[];
    score: number | null;
    source: "ai" | "fallback" | null;
    image?: string | null;
  }) => void;
}

const featureEnabled = (): boolean => {
  const v = (import.meta as any).env?.VITE_FEATURE_TIPS;
  if (v === undefined || v === null) return true; // default ON
  const s = String(v).toLowerCase();
  return !(s === "0" || s === "false" || s === "off");
};

export const StyleTipsCard: React.FC<StyleTipsCardProps> = ({
  generatedImage,
  onTipsLoaded,
}) => {
  const [tips, setTips] = useState<string[] | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const historyImages = useMemo(() => {
    const outs = tryOnHistory.outputs();
    return outs.slice(0, 2).map((o) => o.image);
  }, [generatedImage]);

  const canShow = featureEnabled();

  const fetchTips = async () => {
    if (!canShow) return;
    setLoading(true);
    setError(null);
    try {
      const payload: any = {};
      if (generatedImage) payload.generatedImage = generatedImage;
      else if (historyImages.length > 0) payload.historyImages = historyImages;
      else return; // nothing to base on

      const res: StyleTipsResponse =
        await virtualTryOnService.getStyleTips(payload);
      console.log("[StyleTips] response", res.score, res.tips);

      const nextTips = res.tips || [];
      const nextSource = (res.source as "ai" | "fallback") ?? null;
      setTips(nextTips);
      setSource(nextSource);
      const normalized =
        typeof res.score === "number"
          ? Math.max(0, Math.min(100, res.score))
          : null;
      setScore(normalized);
      console.log("[StyleTips] normalized score", normalized);

      // Persist score into output history for ranking
      if (generatedImage && normalized !== null) {
        const outs = tryOnHistory.outputs();
        const found = outs.find(
          (o) =>
            o.image === generatedImage || o.originalImage === generatedImage
        );
        console.log("[StyleTips] found entry", found);
        if (found) {
          tryOnHistory.updateOutput(found.id, {
            evaluation: {
              score: normalized,
              reasoning: undefined,
              ts: Date.now(),
              model: "tips",
            } as any,
          });
        }
      }

      onTipsLoaded?.({
        tips: nextTips,
        score: normalized,
        source: nextSource,
        image: generatedImage,
      });
    } catch (e: any) {
      setError(e?.message || "Failed to load tips");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // auto fetch when a new result arrives
    if (generatedImage) void fetchTips();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedImage]);

  if (!canShow) return null;

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800">스타일 팁</h3>
        <div className="flex items-center gap-2">
          {typeof score === "number" && (
            <span
              aria-label="AI score"
              title="AI score"
              className="text-xs px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700"
            >
              ⭐ {score}점
            </span>
          )}
          {source && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${source === "ai" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-600"}`}
            >
              {source.toUpperCase()}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={fetchTips}
            disabled={loading}
          >
            새로고침
          </Button>
        </div>
      </div>
      {loading ? (
        <div className="flex items-center gap-3 text-gray-600">
          <Spinner size="sm" />
          <span>팁을 불러오는 중…</span>
        </div>
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : tips && tips.length > 0 ? (
        <ul className="list-disc pl-5 space-y-1 text-sm text-gray-800">
          {tips.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">
          생성된 이미지가 있으면 스타일 팁을 보여드립니다.
        </p>
      )}
    </Card>
  );
};

export default StyleTipsCard;
