// ---------------------------------------------------------------------------
// useImagePaste — reusable clipboard-image-paste state + handler.
//
// Supports two modes:
//
//   1. Uncontrolled (legacy): `useImagePaste()` with no args. The hook
//      owns `pendingImages` in local `useState`. Used by the OpenSpec
//      Explore dialog — its lifetime IS the dialog's lifetime, so a
//      per-component state location is correct.
//
//   2. Controlled: `useImagePaste({ images, onImagesChange })`. The
//      caller owns the array and gets a setter. Used by `<CommandInput>`
//      so pending images can be lifted to App-level state keyed by
//      sessionId — surviving route changes (Settings, terminals,
//      OpenSpec preview, …) and not leaking across session switches.
//
// Behavior (identical in both modes):
//   - Supported MIME types: image/jpeg, image/png, image/gif, image/webp
//   - Max size: 10 MB of base64 (≈7.5 MB of raw bytes)
//   - On unsupported/oversized paste or file selection: set `imageError` for 3 s,
//     ignore the blob
//   - On successful paste or file selection: append to `pendingImages`
//   - `clearImages()` is meant to be called by the consumer after sending
//     so the UI resets.
//
// `imageError` is local in BOTH modes — it auto-clears after 3 s and
// has no value in surviving an unmount. Lifting it would force the
// caller to manage a clear timeout for no user-visible benefit.
//
// The returned `handlePaste` swallows the clipboard event with
// preventDefault when an image is handled, preventing the base64 data
// URL from being inserted as text into the textarea.
// ---------------------------------------------------------------------------

import { useCallback, useState } from "react";
import type { ImageContent } from "@blackbelt-technology/pi-dashboard-shared/types.js";

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB base64
export const SUPPORTED_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/png",
	"image/gif",
	"image/webp",
]);

export interface UseImagePasteOptions {
	/** When provided, the hook is controlled — caller owns the array. */
	images?: ImageContent[];
	/** Called whenever the images array would change. Required when `images` is provided. */
	onImagesChange?: (next: ImageContent[]) => void;
}

export interface UseImagePasteResult {
	/** Accumulated pasted images ready to attach to a send_prompt. */
	pendingImages: ImageContent[];
	/** Transient error message; auto-clears after 3s. null when idle. */
	imageError: string | null;
	/** Clipboard paste handler — attach to the textarea's onPaste. */
	handlePaste: (e: React.ClipboardEvent) => void;
	/** Add image files selected from disk, camera, or gallery. */
	addImageFiles: (files: FileList | File[]) => void;
	/** Remove the image at index `i` from pendingImages. */
	removeImage: (index: number) => void;
	/** Clear everything — call after a successful send. */
	clearImages: () => void;
}

export function useImagePaste(opts?: UseImagePasteOptions): UseImagePasteResult {
	const isControlled = opts?.images !== undefined;
	const [localImages, setLocalImages] = useState<ImageContent[]>([]);
	const [imageError, setImageError] = useState<string | null>(null);

	// Source of truth for the current array.
	const pendingImages = isControlled ? (opts!.images as ImageContent[]) : localImages;

	// Setter that routes through the caller in controlled mode and through
	// local state otherwise. Accepts a value or an updater function so call
	// sites can use either.
	const writeImages = useCallback(
		(next: ImageContent[] | ((prev: ImageContent[]) => ImageContent[])) => {
			if (isControlled) {
				const onChange = opts?.onImagesChange;
				if (!onChange) return;
				const resolved =
					typeof next === "function"
						? (next as (p: ImageContent[]) => ImageContent[])(opts!.images as ImageContent[])
						: next;
				onChange(resolved);
			} else {
				setLocalImages(next as ImageContent[] | ((p: ImageContent[]) => ImageContent[]));
			}
		},
		[isControlled, opts],
	);

	const showImageError = useCallback((message: string) => {
		setImageError(message);
		setTimeout(() => setImageError(null), 3000);
	}, []);

	const readImageFile = useCallback((file: File): Promise<ImageContent | null> => {
		const mimeType = file.type;

		if (!SUPPORTED_IMAGE_TYPES.has(mimeType)) {
			showImageError(`Unsupported image type: ${mimeType}. Use JPEG, PNG, GIF, or WebP.`);
			return Promise.resolve(null);
		}

		return new Promise((resolve) => {
			const reader = new FileReader();
			reader.onload = () => {
				const dataUrl = reader.result as string;
				const base64 = dataUrl.split(",")[1];
				if (!base64) {
					resolve(null);
					return;
				}

				if (base64.length > MAX_IMAGE_SIZE) {
					showImageError("Image too large (max 10MB)");
					resolve(null);
					return;
				}

				resolve({ type: "image", data: base64, mimeType });
			};
			reader.onerror = () => resolve(null);
			reader.readAsDataURL(file);
		});
	}, [showImageError]);

	const addImageFiles = useCallback((files: FileList | File[]) => {
		void Promise.all(Array.from(files).map(readImageFile)).then((images) => {
			const validImages = images.filter((image): image is ImageContent => image !== null);
			if (validImages.length > 0) {
				writeImages((prev) => [...prev, ...validImages]);
			}
		});
	}, [readImageFile, writeImages]);

	const handlePaste = useCallback((e: React.ClipboardEvent) => {
		const files: File[] = [];
		const items = e.clipboardData.items;
		for (const item of items) {
			if (!item.type.startsWith("image/")) continue;

			e.preventDefault();
			const file = item.getAsFile();
			if (file) files.push(file);
		}
		if (files.length > 0) addImageFiles(files);
	}, [addImageFiles]);

	const removeImage = useCallback((index: number) => {
		writeImages((prev) => prev.filter((_, i) => i !== index));
	}, [writeImages]);

	const clearImages = useCallback(() => {
		writeImages([]);
		setImageError(null);
	}, [writeImages]);

	return { pendingImages, imageError, handlePaste, addImageFiles, removeImage, clearImages };
}
