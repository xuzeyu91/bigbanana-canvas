"use client";

import localforage from "localforage";

import { nanoid } from "nanoid";
import { readImageMeta } from "@/lib/image-utils";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const thumbnailStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_thumbnails" });
const objectUrls = new Map<string, string>();
const thumbnailObjectUrls = new Map<string, string>();
const thumbnailTasks = new Map<string, Promise<string>>();
const thumbnailVersions = new Map<string, number>();
const THUMBNAIL_MAX_EDGE = 640;

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await (await fetch(input)).blob() : input;
    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    await saveImageThumbnail(storageKey, blob);
    const meta = await readImageMeta(url);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function resolveImagePreviewUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = thumbnailObjectUrls.get(storageKey);
    if (cached) return cached;
    const pending = thumbnailTasks.get(storageKey);
    if (pending) return pending;
    const version = thumbnailVersions.get(storageKey) || 0;

    const taskPromise = (async () => {
        try {
            let thumbnail = await thumbnailStore.getItem<Blob>(storageKey);
            if (!thumbnail) {
                const original = await store.getItem<Blob>(storageKey);
                if (!original) return fallback;
                thumbnail = await createImageThumbnail(original);
                if (!thumbnail) return fallback;
                if (thumbnailVersions.get(storageKey) !== version) return fallback;
                await thumbnailStore.setItem(storageKey, thumbnail);
            }
            if (thumbnailVersions.get(storageKey) !== version) return fallback;
            const url = URL.createObjectURL(thumbnail);
            thumbnailObjectUrls.set(storageKey, url);
            return url;
        } catch {
            return fallback;
        }
    })();
    let task: Promise<string>;
    task = taskPromise.finally(() => {
        if (thumbnailTasks.get(storageKey) === task) thumbnailTasks.delete(storageKey);
    });
    thumbnailTasks.set(storageKey, task);
    return task;
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    invalidateThumbnail(storageKey);
    const previousThumbnailUrl = thumbnailObjectUrls.get(storageKey);
    if (previousThumbnailUrl) URL.revokeObjectURL(previousThumbnailUrl);
    thumbnailObjectUrls.delete(storageKey);
    try {
        await thumbnailStore.removeItem(storageKey);
    } catch {
        // A stale thumbnail must never replace the updated original image.
    }
    await saveImageThumbnail(storageKey, blob);
    const previousUrl = objectUrls.get(storageKey);
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            invalidateThumbnail(key);
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            const thumbnailUrl = thumbnailObjectUrls.get(key);
            if (thumbnailUrl) URL.revokeObjectURL(thumbnailUrl);
            thumbnailObjectUrls.delete(key);
            await Promise.all([store.removeItem(key), thumbnailStore.removeItem(key)]);
        }),
    );
}

function invalidateThumbnail(storageKey: string) {
    thumbnailVersions.set(storageKey, (thumbnailVersions.get(storageKey) || 0) + 1);
    thumbnailTasks.delete(storageKey);
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    const unused = new Set<string>();
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.add(key);
    });
    await thumbnailStore.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.add(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取图片失败"));
        reader.readAsDataURL(blob);
    });
}

async function saveImageThumbnail(storageKey: string, blob: Blob) {
    try {
        const thumbnail = await createImageThumbnail(blob);
        if (thumbnail) await thumbnailStore.setItem(storageKey, thumbnail);
    } catch {
        // Thumbnails are derived data; image upload and editing must work without them.
    }
}

async function createImageThumbnail(blob: Blob): Promise<Blob | null> {
    let bitmap: ImageBitmap | undefined;
    try {
        bitmap = await createImageBitmap(blob);
        const scale = Math.min(1, THUMBNAIL_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    } catch {
        return null;
    } finally {
        bitmap?.close();
    }
}
