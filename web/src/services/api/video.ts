import axios from "axios";

import { dataUrlToFile } from "@/lib/image-utils";
import { getMediaBlob, uploadMediaFile, type UploadedFile } from "@/services/file-storage";
import { imageToDataUrl } from "@/services/image-storage";
import { boolConfig, buildSeedancePromptText, isArkPlanBaseUrl, normalizeSeedanceDuration, normalizeSeedanceRatio, normalizeSeedanceResolution, seedanceVideoReferenceError, SEEDANCE_REFERENCE_LIMITS } from "@/lib/seedance-video";
import { buildApiUrl, modelOptionName, proxyAntskUrl, resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/types/media";

type VideoResponse = {
    id?: string;
    task_id?: string;
    status?: string;
    state?: string;
    error?: { code?: string; message?: string } | string | null;
    message?: string;
    msg?: string;
    url?: string;
    video_url?: string;
    videoUrl?: string;
    download_url?: string;
    downloadUrl?: string;
    data?: unknown;
    content?: unknown;
    result?: unknown;
    output?: unknown;
    metadata?: unknown;
};
type ApiVideoResponse = VideoResponse | { code?: number; data?: VideoResponse | null; msg?: string; message?: string; success?: boolean };
type SeedanceTask = {
    id: string;
    status?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
    error?: { code?: string; message?: string } | null;
    content?: { video_url?: string; last_frame_url?: string } | null;
};
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string; message?: string; success?: boolean };
type RequestOptions = { signal?: AbortSignal };
type OpenAIVideoTaskOptions = { useReferenceArray: boolean; maxReferences: number; supportedSeconds?: number[] };

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "seedance"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function normalizeVideoModelId(model: string) {
    return modelOptionName(model).trim().toLowerCase();
}

function isViduGatewayModel(model: string) {
    return model.includes("viduq3");
}

function isDoubaoOpenAiModel(model: string) {
    return model.includes("doubao-seedance") || model.includes("happyhorse");
}

function shouldUseSeedanceTaskApi(config: AiConfig, model: string) {
    return isArkPlanBaseUrl(config.baseUrl) || model.includes("251215") || model.includes("260128");
}

function resolveOpenAIVideoTaskOptions(model: string): OpenAIVideoTaskOptions {
    if (isDoubaoOpenAiModel(model)) {
        const isMultiReferenceModel = model.includes("2-0") || model.includes("happyhorse");
        return { useReferenceArray: true, maxReferences: isMultiReferenceModel ? 4 : 2, supportedSeconds: isMultiReferenceModel ? [5, 10, 15] : undefined };
    }
    if (model.includes("veo")) return { useReferenceArray: true, maxReferences: 2, supportedSeconds: [8] };
    if (model.includes("sora")) return { useReferenceArray: false, maxReferences: 1, supportedSeconds: [4, 8, 12] };
    return { useReferenceArray: false, maxReferences: 1 };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, options);
    const delayMs = task.provider === "seedance" ? 5000 : 2500;
    for (let attempt = 0; attempt < 120; attempt += 1) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const state = await pollVideoGenerationTask(config, task, options);
        if (state.status === "completed") return state.result;
        if (state.status === "failed") throw new Error(state.error);
        if (attempt === 119) throw new Error(`${task.provider === "seedance" ? "Seedance " : ""}视频生成超时，请稍后重试`);
        await delay(delayMs, options?.signal);
    }
    throw new Error("视频生成超时，请稍后重试");
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    const selectedModel = (config.model || config.videoModel).trim();
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    assertVideoConfig(requestConfig, requestConfig.model);
    const normalizedModel = normalizeVideoModelId(selectedModel);
    if (shouldUseSeedanceTaskApi(requestConfig, normalizedModel)) {
        return createSeedanceTask(requestConfig, selectedModel, prompt, references, videoReferences, audioReferences, options);
    }
    if (isViduGatewayModel(normalizedModel)) {
        if (videoReferences.length || audioReferences.length) throw new Error("Vidu Q3 当前不支持参考视频或参考音频，请只保留参考图片");
        return createViduGatewayTask(requestConfig, selectedModel, prompt, references, options);
    }
    if (videoReferences.length || audioReferences.length) {
        throw new Error("当前视频接口不支持参考视频或参考音频，请移除参考素材后重试");
    }
    return createOpenAIVideoTask(requestConfig, selectedModel, prompt, references, resolveOpenAIVideoTaskOptions(normalizedModel), options);
}

export async function pollVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const requestConfig = resolveModelRequestConfig(config, task.model);
    assertVideoConfig(requestConfig, requestConfig.model);
    return task.provider === "seedance" ? pollSeedanceTask(requestConfig, task, options) : pollOpenAIVideoTask(requestConfig, task, options);
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) return { url: result.url, storageKey: "", bytes: 0, mimeType: result.mimeType || "video/mp4" };
    throw new Error("视频接口没有返回可播放的视频");
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], taskOptions: OpenAIVideoTaskOptions, options?: RequestOptions): Promise<VideoGenerationTask> {
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds, taskOptions.supportedSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    const targetSize = videoReferenceSize(config.size);
    const selectedReferences = references.slice(0, taskOptions.maxReferences);
    const useReferenceArray = taskOptions.useReferenceArray && selectedReferences.length > 1;
    const files = await Promise.all(
        selectedReferences.map(async (image, index) =>
            dataUrlToFile({
                ...image,
                name: useReferenceArray ? `reference-${index + 1}.png` : "reference.png",
                type: "image/png",
                dataUrl: await imageToDataUrl(image).then((dataUrl) => fitVideoReference(dataUrl, targetSize)),
            }),
        ),
    );
    if (useReferenceArray) {
        files.forEach((file) => body.append("input_reference[]", file));
    } else if (files[0]) {
        body.append("input_reference", files[0]);
    }
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), body, { headers: aiHeaders(config), signal: options?.signal })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(await readAxiosError(error, "视频任务创建失败"));
    }
}

async function createViduGatewayTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], options?: RequestOptions): Promise<VideoGenerationTask> {
    const firstReference = references[0];
    if (!firstReference) throw new Error("Vidu Q3 模型需要至少一张参考图作为首帧");
    const targetSize = viduReferenceSize(config.size);
    const [startImage, endImage] = await Promise.all([
        imageToDataUrl(firstReference).then((image) => fitVideoReference(image, targetSize)),
        references[1] ? imageToDataUrl(references[1]).then((image) => fitVideoReference(image, targetSize)) : Promise.resolve(""),
    ]);
    const payload = {
        model: modelOptionName(model),
        prompt,
        duration: Number(normalizeVideoSeconds(config.videoSeconds)),
        images: [startImage, endImage].filter(Boolean),
        metadata: {
            resolution: "1080p",
            audio: true,
            audio_type: "all",
        },
    };
    try {
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(aiApiUrl(config, "/videos"), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        if (!created.id) throw new Error("Vidu 接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(await readAxiosError(error, "Vidu 任务创建失败"));
    }
}

function viduReferenceSize(size: string) {
    const [width, height] = (normalizeVideoSize(size) || "1280x720").split("x").map(Number);
    return height > width ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 };
}

function videoReferenceSize(size: string) {
    const [width, height] = (normalizeVideoSize(size) || "1280x720").split("x").map(Number);
    return { width, height };
}

async function fitVideoReference(dataUrl: string, target: { width: number; height: number }) {
    if (!dataUrl.startsWith("data:")) return dataUrl;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("Vidu 参考图读取失败"));
        element.src = dataUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Vidu 参考图处理失败");
    const sourceWidth = image.naturalWidth || target.width;
    const sourceHeight = image.naturalHeight || target.height;
    const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, target.width, target.height);
    context.drawImage(image, (target.width - width) / 2, (target.height - height) / 2, width, height);
    return canvas.toDataURL("image/png");
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal })).data);
        if (isVideoTaskCompleted(video.status || video.state)) {
            const url = extractVideoUrl(video);
            if (url) return { status: "completed", result: await videoResultFromUrl(proxyAntskUrl(url), options) };
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal });
            const contentUrl = await extractVideoUrlFromBlob(content.data);
            if (contentUrl) return { status: "completed", result: await videoResultFromUrl(proxyAntskUrl(contentUrl), options) };
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (isVideoTaskFailed(video.status || video.state)) return { status: "failed", error: formatVideoError(extractApiErrorMessage(video.error) || extractApiErrorMessage(video) || "视频生成失败") };
        return { status: "pending" };
    } catch (error) {
        throw new Error(await readAxiosError(error, "视频任务查询失败"));
    }
}

async function createSeedanceTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[], options?: RequestOptions): Promise<VideoGenerationTask> {
    if (audioReferences.length && !references.length && !videoReferences.length) {
        throw new Error("Seedance 参考音频不能单独使用，请同时添加参考图或参考视频");
    }
    assertSeedanceVideoReferences(videoReferences);
    assertSeedanceAudioReferences(audioReferences);
    const content = await buildSeedanceContent(config, prompt, references, videoReferences, audioReferences);
    if (!content.length) throw new Error("请输入视频提示词，或连接参考图片/视频/音频");
    const payload = {
        model: modelOptionName(model),
        content,
        ratio: normalizeSeedanceRatio(config.size),
        resolution: normalizeSeedanceResolution(config.vquality, modelOptionName(model)),
        duration: normalizeSeedanceDuration(config.videoSeconds),
        generate_audio: boolConfig(config.videoGenerateAudio, true),
        watermark: boolConfig(config.videoWatermark, false),
    };

    try {
        const created = unwrapSeedanceTask((await axios.post<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config), payload, { headers: aiHeaders(config, "application/json"), signal: options?.signal })).data);
        if (!created.id) throw new Error("Seedance 接口没有返回任务 ID");
        return { id: created.id, provider: "seedance", model };
    } catch (error) {
        throw new Error(await readAxiosError(error, "Seedance 任务创建失败"));
    }
}

async function pollSeedanceTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const state = unwrapSeedanceTask((await axios.get<ApiEnvelope<SeedanceTask>>(seedanceApiUrl(config, task.id), { headers: aiHeaders(config), signal: options?.signal })).data);
        if (state.status === "succeeded") {
            const url = state.content?.video_url;
            if (!url) return { status: "failed", error: "Seedance 任务成功但没有返回视频 URL" };
            return { status: "completed", result: await videoResultFromUrl(proxyAntskUrl(url), options) };
        }
        if (state.status === "failed" || state.status === "cancelled" || state.status === "expired") return { status: "failed", error: formatVideoError(extractApiErrorMessage(state.error) || `Seedance 视频生成${state.status === "expired" ? "超时" : "失败"}`) };
        return { status: "pending" };
    } catch (error) {
        throw new Error(await readAxiosError(error, "Seedance 任务查询失败"));
    }
}

function assertSeedanceVideoReferences(videoReferences: ReferenceVideo[]) {
    const error = seedanceVideoReferenceError(videoReferences);
    if (error) throw new Error(error);
    let total = 0;
    for (const video of videoReferences) {
        if (!video.durationMs) continue;
        if (video.durationMs < 2000 || video.durationMs > 15000) throw new Error("Seedance 参考视频单个时长需要在 2-15 秒之间");
        total += video.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考视频总时长不能超过 15 秒");
}

function assertSeedanceAudioReferences(audioReferences: ReferenceAudio[]) {
    let total = 0;
    for (const audio of audioReferences) {
        if (!audio.durationMs) continue;
        if (audio.durationMs < 2000 || audio.durationMs > 15000) throw new Error("Seedance 参考音频单个时长需要在 2-15 秒之间");
        total += audio.durationMs;
    }
    if (total > 15000) throw new Error("Seedance 参考音频总时长不能超过 15 秒");
}

function seedanceApiUrl(config: AiConfig, taskId?: string) {
    return buildApiUrl(config.baseUrl, `/contents/generations/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ""}`);
}

async function buildSeedanceContent(config: AiConfig, prompt: string, references: ReferenceImage[], videoReferences: ReferenceVideo[], audioReferences: ReferenceAudio[]) {
    const content: Array<Record<string, unknown>> = [];
    const text = buildSeedancePromptText(prompt, references, videoReferences, audioReferences);
    if (text) content.push({ type: "text", text });
    for (const image of references.slice(0, SEEDANCE_REFERENCE_LIMITS.images)) {
        content.push({ type: "image_url", image_url: { url: await resolveSeedanceImageUrl(config, image) }, role: "reference_image" });
    }
    for (const video of videoReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.videos)) {
        content.push({ type: "video_url", video_url: { url: await resolveSeedanceVideoUrl(video) }, role: "reference_video" });
    }
    for (const audio of audioReferences.slice(0, SEEDANCE_REFERENCE_LIMITS.audios)) {
        content.push({ type: "audio_url", audio_url: { url: await resolveSeedanceAudioUrl(audio) }, role: "reference_audio" });
    }
    return content;
}

async function resolveSeedanceImageUrl(config: AiConfig, image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl) || directUrl.startsWith("asset://")) return directUrl;
    const dataUrl = await imageToDataUrl(image);
    if (!dataUrl) throw new Error("参考图读取失败，请换一张图片或重新上传");
    return dataUrl;
}

async function resolveSeedanceVideoUrl(video: ReferenceVideo) {
    if (isPublicMediaUrl(video.url) || video.url.startsWith("asset://")) return video.url;
    let blob: Blob | null = null;
    if (video.storageKey) blob = await getMediaBlob(video.storageKey);
    if (!blob && video.url?.startsWith("blob:")) blob = await (await fetch(video.url)).blob();
    if (!blob) throw new Error("参考视频必须是公网 URL、素材 ID，或本地已保存的视频");
    return blobToDataUrl(blob);
}

async function resolveSeedanceAudioUrl(audio: ReferenceAudio) {
    if (isPublicMediaUrl(audio.url) || audio.url.startsWith("asset://")) return audio.url;
    let blob: Blob | null = null;
    if (audio.storageKey) blob = await getMediaBlob(audio.storageKey);
    if (!blob && audio.url?.startsWith("blob:")) blob = await (await fetch(audio.url)).blob();
    if (!blob) throw new Error("参考音频必须是公网 URL、素材 ID，或本地已保存的音频");
    return blobToDataUrl(blob);
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    try {
        const response = await axios.get<Blob>(url, { responseType: "blob", signal: options?.signal });
        await assertVideoBlob(response.data);
        return { blob: response.data };
    } catch (error) {
        if (axios.isCancel(error) || options?.signal?.aborted) throw error;
        return { url, mimeType: "video/mp4" };
    }
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持视频生成，请使用 OpenAI 格式渠道");
}

function normalizeVideoSeconds(value: string, supportedSeconds?: number[]) {
    const seconds = Math.floor(Number(value) || 6);
    if (supportedSeconds?.length) {
        return String(supportedSeconds.reduce((closest, current) => (Math.abs(current - seconds) < Math.abs(closest - seconds) ? current : closest)));
    }
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return (
        {
            "16:9": "1280x720",
            "9:16": "720x1280",
            "1:1": "720x720",
            "4:3": "960x720",
            "3:4": "720x960",
            "21:9": "1470x630",
            "2:3": "720x1080",
        }[size] || "1280x720"
    );
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapSeedanceTask(payload: ApiEnvelope<SeedanceTask>) {
    return unwrapEnvelope(payload, "Seedance 接口没有返回任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (isRecord(payload)) {
        if (typeof payload.code === "number") {
            if (payload.code !== 0) throw new Error(extractApiErrorMessage(payload) || "请求失败");
            if (!payload.data) throw new Error(emptyMessage);
            return payload.data as T;
        }
        if (payload.success === false) throw new Error(extractApiErrorMessage(payload) || "请求失败");
        if (isRecord(payload.data)) {
            const hasTaskFields = ["id", "task_id", "status", "state", "video_url", "videoUrl", "url", "content", "result", "output"].some((key) => key in payload);
            return (hasTaskFields ? { ...payload, ...payload.data } : payload.data) as T;
        }
    }
    return payload as T;
}

async function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError(error)) {
        const message = extractApiErrorMessage(await readErrorPayload(error.response?.data)) || statusMessage(error.response?.status, fallback);
        return formatVideoError(message);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return formatVideoError(error instanceof Error ? error.message : fallback);
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}

async function assertVideoBlob(blob: Blob) {
    if (!blob.size) throw new Error("视频下载失败：返回内容为空");
    const payload = await readJsonBlob(blob);
    if (!payload) return;
    throw new Error(extractApiErrorMessage(payload) || "视频下载接口返回了 JSON，但没有视频地址");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractApiErrorMessage(payload: unknown): string {
    if (typeof payload === "string") return payload.trim();
    if (!isRecord(payload)) return "";
    const error = payload.error;
    const candidates = [payload.msg, payload.message, payload.error_msg, payload.detail, payload.reason, payload.error_description, typeof error === "string" ? error : isRecord(error) ? error.message || error.detail || error.reason || error.code : ""];
    return candidates.map((value) => (typeof value === "string" ? value.trim() : "")).find((value) => value && !["success", "ok"].includes(value.toLowerCase())) || "";
}

async function readErrorPayload(payload: unknown): Promise<unknown> {
    if (payload instanceof Blob) return parseErrorPayload(await payload.text());
    if (payload instanceof ArrayBuffer) return parseErrorPayload(new TextDecoder().decode(payload));
    if (ArrayBuffer.isView(payload)) return parseErrorPayload(new TextDecoder().decode(payload));
    return payload;
}

function parseErrorPayload(value: string) {
    const text = value.trim();
    if (!text) return "";
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
}

function formatVideoError(message: string) {
    const detail = message.trim();
    if (!detail || detail.startsWith("内容安全审核未通过：")) return detail;
    return /blocked by (?:our )?moderation|moderation system|content[ _-]?(?:safety|policy|filter)|safety[ _-]?(?:policy|filter)|sensitive content|unsafe content|policy violation|内容安全|敏感(?:词|内容)?|违规|不安全/i.test(detail) ? `内容安全审核未通过：${detail}` : detail;
}

function isVideoTaskCompleted(status?: string) {
    return ["completed", "succeeded", "success", "done"].includes(String(status || "").toLowerCase());
}

function isVideoTaskFailed(status?: string) {
    return ["failed", "error", "cancelled", "canceled", "expired"].includes(String(status || "").toLowerCase());
}

function extractVideoUrl(payload: unknown): string {
    if (!isRecord(payload)) return "";
    for (const key of ["video_url", "videoUrl", "download_url", "downloadUrl", "url"]) {
        const value = payload[key];
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    for (const key of ["data", "content", "result", "output", "metadata", "task"]) {
        const url = extractVideoUrl(payload[key]);
        if (url) return url;
    }
    return "";
}

async function extractVideoUrlFromBlob(blob: Blob) {
    return extractVideoUrl(await readJsonBlob(blob));
}

async function readJsonBlob(blob: Blob): Promise<unknown> {
    if (!blob.size) return null;
    const preview = (await blob.slice(0, Math.min(blob.size, 1024 * 1024)).text()).trim();
    if (!preview.startsWith("{") && !preview.startsWith("[")) return null;
    try {
        return JSON.parse(preview) as unknown;
    } catch {
        return null;
    }
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("读取本地素材失败"));
        reader.readAsDataURL(blob);
    });
}
