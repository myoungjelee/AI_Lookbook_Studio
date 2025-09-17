import React, { useCallback, useRef, useState } from 'react';
import type { UploadedImage } from '../../../types';
import { UploadIcon } from '../../icons/UploadIcon';
import { XCircleIcon } from '../../icons/XCircleIcon';

interface ImageUploaderProps {
    id: string;
    title: string;
    description: string;
    onImageUpload: (image: UploadedImage | null) => void;
    externalImage?: UploadedImage | null;
    active?: boolean; // highlight when currently used in composition
    overlay?: React.ReactNode; // 오버레이 컴포넌트
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
    id,
    title,
    description,
    onImageUpload,
    externalImage,
    active = false,
    overlay,
}) => {
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync preview when externalImage is provided/changed
    React.useEffect(() => {
        if (!externalImage) { setPreview(null); return; }
        // Prefer generating a fresh data URL from File for max compatibility
        if (externalImage.file && externalImage.file instanceof Blob) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = String(reader.result || '');
                setPreview(result);
            };
            reader.readAsDataURL(externalImage.file);
        } else {
            const url = `data:${externalImage.mimeType};base64,${externalImage.base64}`;
            setPreview(url);
        }
    }, [externalImage]);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                const uploadedImage: UploadedImage = {
                    file,
                    previewUrl: URL.createObjectURL(file),
                    base64,
                    mimeType: file.type,
                };
                setPreview(uploadedImage.previewUrl);
                onImageUpload(uploadedImage);
            };
            reader.readAsDataURL(file);
        }
    }, [onImageUpload]);

    const handleRemoveImage = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setPreview(null);
        onImageUpload(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.currentTarget.classList.remove('border-primary-500', 'bg-primary-50');
        const file = event.dataTransfer.files?.[0];
        if (file) {
            if (fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInputRef.current.files = dataTransfer.files;
                fileInputRef.current.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }, []);

    const handleDragOver = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.currentTarget.classList.add('border-primary-500', 'bg-primary-50');
    };

    const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.currentTarget.classList.remove('border-primary-500', 'bg-primary-50');
    };

    return (
        <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-gray-800 text-xs">{title}</h3>
            <label
                htmlFor={id}
                className={`relative w-full aspect-square min-h-[100px] md:min-h-[120px] lg:min-h-[140px] xl:min-h-[160px] border-2 border-dashed rounded-xl flex flex-col justify-center items-center text-center p-1 cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors duration-200 ${active ? 'border-blue-600 ring-4 ring-blue-200' : 'border-gray-300'}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                {preview ? (
                    <>
                        <img
                            key={preview}
                            src={preview}
                            alt={title}
                            className="w-full h-full object-cover rounded-lg"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onError={(e) => {
                                // Fallback to data URL if external preview path fails
                                if (externalImage?.base64 && externalImage?.mimeType) {
                                    const fallback = `data:${externalImage.mimeType};base64,${externalImage.base64}`;
                                    if ((e.currentTarget as HTMLImageElement).src !== fallback) {
                                        (e.currentTarget as HTMLImageElement).src = fallback;
                                    }
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveImage(e);
                            }}
                            className="absolute top-2 right-2 p-1 bg-white/70 rounded-full text-gray-600 hover:bg-white hover:text-red-500 transition-all duration-200 z-10"
                            aria-label="Remove image"
                        >
                            <XCircleIcon className="w-6 h-6" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-1 text-gray-500">
                        <UploadIcon className="w-4 h-4" />
                        <span className="font-medium text-xs">Click to upload</span>
                        <p className="text-xs text-gray-400 leading-tight">{description}</p>
                    </div>
                )}
                {/* 오버레이 */}
                {overlay}
            </label>
            <input
                ref={fileInputRef}
                id={id}
                type="file"
                accept="image/png, image/jpeg, image/webp"
                className="sr-only"
                onChange={handleFileChange}
            />
        </div>
    );
};
