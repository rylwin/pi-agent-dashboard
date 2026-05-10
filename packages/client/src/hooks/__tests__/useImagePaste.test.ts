import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ImageContent } from "@blackbelt-technology/pi-dashboard-shared/types.js";
import { useImagePaste } from "../useImagePaste.js";

// ---- helpers --------------------------------------------------------------

function makeFile(mime: string, bytes = 100): File {
	// Build an actual blob; FileReader.readAsDataURL is provided by jsdom.
	return new File([new Uint8Array(bytes)], "x", { type: mime });
}

function makePasteEvent(files: File[]): React.ClipboardEvent {
	const items = files.map((f) => ({
		kind: "file" as const,
		type: f.type,
		getAsFile: () => f,
	}));
	const event = {
		clipboardData: { items: items as unknown as DataTransferItemList },
		preventDefault: vi.fn(),
	};
	return event as unknown as React.ClipboardEvent;
}

// FileReader.readAsDataURL is async — wait one microtask + onload tick.
async function flushFileReader() {
	await new Promise((r) => setTimeout(r, 0));
	await new Promise((r) => setTimeout(r, 0));
}

describe("useImagePaste — uncontrolled mode (legacy)", () => {
	it("starts with empty pendingImages and null error", () => {
		const { result } = renderHook(() => useImagePaste());
		expect(result.current.pendingImages).toEqual([]);
		expect(result.current.imageError).toBeNull();
	});

	it("appends a pasted PNG to pendingImages", async () => {
		const { result } = renderHook(() => useImagePaste());
		const evt = makePasteEvent([makeFile("image/png")]);

		act(() => { result.current.handlePaste(evt); });
		await act(async () => { await flushFileReader(); });

		expect(result.current.pendingImages).toHaveLength(1);
		expect(result.current.pendingImages[0].mimeType).toBe("image/png");
		expect(result.current.pendingImages[0].type).toBe("image");
		expect(evt.preventDefault).toHaveBeenCalled();
	});

	it("rejects unsupported mime with a transient error", async () => {
		vi.useFakeTimers();
		try {
			const { result } = renderHook(() => useImagePaste());
			const evt = makePasteEvent([makeFile("image/bmp")]);

			act(() => { result.current.handlePaste(evt); });
			expect(result.current.imageError).toMatch(/Unsupported/);
			expect(result.current.pendingImages).toHaveLength(0);

			act(() => { vi.advanceTimersByTime(3000); });
			expect(result.current.imageError).toBeNull();
		} finally {
			vi.useRealTimers();
		}
	});

	it("appends selected image files to pendingImages", async () => {
		const { result } = renderHook(() => useImagePaste());

		act(() => { result.current.addImageFiles([makeFile("image/jpeg"), makeFile("image/webp")]); });
		await act(async () => { await flushFileReader(); });

		expect(result.current.pendingImages).toHaveLength(2);
		expect(result.current.pendingImages[0].mimeType).toBe("image/jpeg");
		expect(result.current.pendingImages[1].mimeType).toBe("image/webp");
	});

	it("removeImage removes by index", async () => {
		const { result } = renderHook(() => useImagePaste());
		const evt = makePasteEvent([makeFile("image/png"), makeFile("image/jpeg")]);

		act(() => { result.current.handlePaste(evt); });
		await act(async () => { await flushFileReader(); });
		expect(result.current.pendingImages).toHaveLength(2);

		act(() => { result.current.removeImage(0); });
		expect(result.current.pendingImages).toHaveLength(1);
		expect(result.current.pendingImages[0].mimeType).toBe("image/jpeg");
	});

	it("clearImages empties the list and clears errors", async () => {
		const { result } = renderHook(() => useImagePaste());
		const evt = makePasteEvent([makeFile("image/png")]);

		act(() => { result.current.handlePaste(evt); });
		await act(async () => { await flushFileReader(); });
		expect(result.current.pendingImages).toHaveLength(1);

		act(() => { result.current.clearImages(); });
		expect(result.current.pendingImages).toEqual([]);
		expect(result.current.imageError).toBeNull();
	});
});

describe("useImagePaste — controlled mode", () => {
	it("uses caller-owned `images` as the source of truth", () => {
		const seed: ImageContent[] = [{ type: "image", data: "AAAA", mimeType: "image/png" }];
		const { result } = renderHook(() =>
			useImagePaste({ images: seed, onImagesChange: () => {} }),
		);
		expect(result.current.pendingImages).toBe(seed);
	});

	it("routes paste through onImagesChange (caller owns array)", async () => {
		let images: ImageContent[] = [];
		const onImagesChange = vi.fn((next: ImageContent[]) => { images = next; });

		const { result, rerender } = renderHook(
			({ imgs }) => useImagePaste({ images: imgs, onImagesChange }),
			{ initialProps: { imgs: images } },
		);

		const evt = makePasteEvent([makeFile("image/png")]);
		act(() => { result.current.handlePaste(evt); });
		await act(async () => { await flushFileReader(); });

		expect(onImagesChange).toHaveBeenCalledTimes(1);
		expect(onImagesChange.mock.calls[0][0]).toHaveLength(1);
		expect(onImagesChange.mock.calls[0][0][0].mimeType).toBe("image/png");

		// Caller-side commit, then rerender — hook reflects new images.
		rerender({ imgs: images });
		expect(result.current.pendingImages).toEqual(images);
	});

	it("routes multiple selected files through one onImagesChange", async () => {
		let images: ImageContent[] = [];
		const onImagesChange = vi.fn((next: ImageContent[]) => { images = next; });

		const { result } = renderHook(() =>
			useImagePaste({ images, onImagesChange }),
		);

		act(() => { result.current.addImageFiles([makeFile("image/webp"), makeFile("image/png")]); });
		await act(async () => { await flushFileReader(); });

		expect(onImagesChange).toHaveBeenCalledTimes(1);
		expect(onImagesChange.mock.calls[0][0]).toHaveLength(2);
		expect(onImagesChange.mock.calls[0][0][0].mimeType).toBe("image/webp");
		expect(onImagesChange.mock.calls[0][0][1].mimeType).toBe("image/png");
	});

	it("removeImage in controlled mode emits the new array via onImagesChange", () => {
		let images: ImageContent[] = [
			{ type: "image", data: "AAAA", mimeType: "image/png" },
			{ type: "image", data: "BBBB", mimeType: "image/jpeg" },
		];
		const onImagesChange = vi.fn((next: ImageContent[]) => { images = next; });

		const { result } = renderHook(() =>
			useImagePaste({ images, onImagesChange }),
		);

		act(() => { result.current.removeImage(0); });

		expect(onImagesChange).toHaveBeenCalledWith([
			{ type: "image", data: "BBBB", mimeType: "image/jpeg" },
		]);
	});

	it("clearImages in controlled mode emits an empty array", () => {
		const images: ImageContent[] = [{ type: "image", data: "x", mimeType: "image/png" }];
		const onImagesChange = vi.fn();
		const { result } = renderHook(() =>
			useImagePaste({ images, onImagesChange }),
		);

		act(() => { result.current.clearImages(); });

		expect(onImagesChange).toHaveBeenCalledWith([]);
	});

	it("does NOT mutate local state when controlled", () => {
		const images: ImageContent[] = [];
		const onImagesChange = vi.fn();
		const { result } = renderHook(() =>
			useImagePaste({ images, onImagesChange }),
		);

		// Even after a write, pendingImages still points at the controlled array.
		act(() => { result.current.clearImages(); });
		expect(result.current.pendingImages).toBe(images);
	});
});
