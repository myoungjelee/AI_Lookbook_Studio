import React, { useState } from "react";
import { AlertTriangleIcon } from "../../icons/AlertTriangleIcon";
import { ImageIcon } from "../../icons/ImageIcon";
import { ZoomInIcon } from "../../icons/ZoomInIcon";
import { Spinner } from "../../ui";
import { FullScreenImage } from "../common/FullScreenImage";

interface ResultDisplayProps {
  generatedImage: string | null;
  isLoading: boolean;
  error: string | null;
  score?: number | null; // optional AI score to overlay
  onFullScreenChange?: (isFullScreen: boolean) => void; // 풀스크린 상태 변경 콜백
}

export const ResultDisplay: React.FC<ResultDisplayProps> = ({
  generatedImage,
  isLoading,
  error,
  score,
  onFullScreenChange,
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);

  const PLACEHOLDER_DATA_URIS = new Set([
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=",
  ]);
  const isPlaceholder =
    !!generatedImage &&
    (PLACEHOLDER_DATA_URIS.has(generatedImage) || generatedImage.length < 100);

  return (
    <>
      <div className="w-full aspect-[4/3] xl:aspect-[5/4] 2xl:aspect-[4/3] min-h-[220px] md:min-h-[240px] lg:min-h-[260px] xl:min-h-[300px] bg-white border border-gray-200 rounded-2xl flex justify-center items-center p-4 shadow-sm relative overflow-hidden">
        {isLoading && (
          <div className="flex flex-col items-center gap-4 text-gray-600">
            <Spinner size="lg" />
            <span className="font-medium">Generating your image...</span>
            <span className="text-sm text-gray-400 text-center">
              This may take a moment.
            </span>
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center gap-2 text-red-600 text-center">
            <AlertTriangleIcon className="w-10 h-10" />
            <h4 className="font-semibold">Generation Failed</h4>
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {!isLoading && !error && generatedImage && !isPlaceholder && (
          <div className="relative w-full h-full group">
            <img
              src={generatedImage}
              alt="Generated result"
              className="w-full h-full object-contain rounded-lg"
            />
            {typeof score === "number" && (
              <div className="absolute top-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-md select-none">
                ⭐ {Math.max(0, Math.min(100, score))}%
              </div>
            )}
            <button
              onClick={() => {
                setIsFullScreen(true);
                onFullScreenChange?.(true);
              }}
              className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg cursor-pointer"
              aria-label="View full screen"
            >
              <ZoomInIcon className="w-12 h-12 text-white" />
            </button>
          </div>
        )}

        {!isLoading && !error && (isPlaceholder || !generatedImage) && (
          <div className="flex flex-col items-center gap-2 text-gray-400 text-center">
            <ImageIcon className="w-10 h-10" />
            <h4 className="font-semibold text-gray-600"></h4>
            {isPlaceholder ? (
              <p className="text-sm">
                AI 설정이 필요하거나, 합성 결과가 비었습니다.
              </p>
            ) : (
              <p className="text-sm">결과물 표시창</p>
            )}
          </div>
        )}
      </div>
      {isFullScreen && generatedImage && (
        <FullScreenImage
          src={generatedImage}
          onClose={() => {
            setIsFullScreen(false);
            onFullScreenChange?.(false);
          }}
        />
      )}
    </>
  );
};
