import React, { useState, useCallback, useRef } from 'react';
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
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
    id,
    title,
    description,
    onImageUpload,
    externalImage,
    active = false,
}) => {
    const [preview, setPreview] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync preview when externalImage is provided/changed
    React.useEffect(() => {
        if (!externalImage) { setPreview(null); return; }
        // Prefer generating a fresh data URL from File for max compatibility
        if (externalImage.file) {
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
        <div className="flex flex-col gap-3">
            <h3 className="font-semibold text-gray-800">{title}</h3>
            <label
                htmlFor={id}
                className={`relative w-full aspect-[4/3] xl:aspect-[5/4] 2xl:aspect-[4/3] min-h-[220px] md:min-h-[240px] lg:min-h-[260px] xl:min-h-[300px] border-2 border-dashed rounded-xl flex flex-col justify-center items-center text-center p-4 cursor-pointer hover:border-primary-500 hover:bg-primary-50 transition-colors duration-200 ${active ? 'border-blue-600 ring-4 ring-blue-200' : 'border-gray-300'}`}
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
                            onClick={handleRemoveImage}
                            className="absolute top-2 right-2 p-1 bg-white/70 rounded-full text-gray-600 hover:bg-white hover:text-red-500 transition-all duration-200"
                            aria-label="Remove image"
                        >
                            <XCircleIcon className="w-6 h-6" />
                        </button>
                    </>
                ) : (
                    <div className="flex flex-col items-center gap-2 text-gray-500">
                        <UploadIcon className="w-8 h-8" />
                        <span className="font-medium">Click to upload or drag & drop</span>
                        <p className="text-sm text-gray-400">{description}</p>
                    </div>
                )}
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
