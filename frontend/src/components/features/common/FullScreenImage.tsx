import React, { useEffect } from 'react';
import { XIcon } from '../../icons/XIcon';

interface FullScreenImageProps {
    src: string;
    onClose: () => void;
    onDelete?: () => void;
}

export const FullScreenImage: React.FC<FullScreenImageProps> = ({ src, onClose, onDelete }) => {
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden'; // Prevent background scrolling

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = 'auto';
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={onClose}
            aria-modal="true"
            role="dialog"
        >
            <div className="absolute top-4 right-4 flex gap-2">
                {onDelete && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('이 항목을 삭제하시겠습니까?')) {
                                onDelete();
                                onClose();
                            }
                        }}
                        className="text-red-400 hover:text-red-300 transition-colors"
                        aria-label="Delete this item"
                    >
                        <XIcon className="w-8 h-8" />
                    </button>
                )}
                <button
                    onClick={onClose}
                    className="text-white/80 hover:text-white transition-colors"
                    aria-label="Close full screen view"
                >
                    <XIcon className="w-8 h-8" />
                </button>
            </div>
            <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <img src={src} alt="Full screen generated result" className="w-full h-full object-contain rounded-lg shadow-2xl" />
            </div>
        </div>
    );
};