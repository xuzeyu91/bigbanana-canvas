"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { nanoid } from "nanoid";

export type ApiCallFormat = "openai" | "gemini";

export type ModelChannel = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    models: string[];
};

export type AiConfig = {
    channelMode: "remote" | "local";
    baseUrl: string;
    apiKey: string;
    apiFormat: ApiCallFormat;
    channels: ModelChannel[];
    model: string;
    imageModel: string;
    videoModel: string;
    textModel: string;
    audioModel: string;
    audioVoice: string;
    audioFormat: string;
    audioSpeed: string;
    audioInstructions: string;
    regenerateExistingNode: boolean;
    videoSeconds: string;
    videoMode: string;
    videoGenerateAudio: string;
    videoWatermark: string;
    systemPrompt: string;
    models: string[];
    imageModels: string[];
    videoModels: string[];
    textModels: string[];
    audioModels: string[];
    quality: string;
    imageResolution: string;
    imageBackground: string;
    size: string;
    count: string;
    canvasImageCount: string;
};

export type WebdavSyncConfig = {
    proxyMode: "direct" | "nextjs";
    url: string;
    username: string;
    password: string;
    directory: string;
    lastSyncedAt: string;
};

export const CONFIG_STORE_KEY = "infinite-canvas:ai_config_store";
export type ModelCapability = "image" | "video" | "text" | "audio";
const CHANNEL_MODEL_SEPARATOR = "::";
export const ANTSK_UPSTREAM_BASE_URL = "https://api.antsk.cn";
export const ANTSK_BASE_URL = "/api/new-api/gateway";
const DEFAULT_IMAGE_MODEL_NAME = "gemini-3-pro-image-preview";
const DEFAULT_IMAGE_MODEL_NAMES = [DEFAULT_IMAGE_MODEL_NAME, "gemini-3.1-flash-image-preview", "gpt-image-2", "gpt-image-1.5"];
const DEFAULT_VIDEO_MODEL_NAMES = ["sora-2", "muse-video", "gemini-omni-1.2-flash", "viduq3-turbo", "viduq3-pro", "viduq4-preview", "doubao-seedance-2-0-fast", "doubao-seedance-2-0", "happyhorse-1.0", "happyhorse-1.1"];
const DEFAULT_TEXT_MODEL_NAME = "gpt-5.6-terra";
const DEFAULT_TEXT_MODEL_NAMES = ["gpt-5.6-terra", "gpt-6.1-sol", "gpt-5.6-sol", "gpt-5.4", "gpt-5.5", "claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "gemini-3.8-flash"];
const DEFAULT_AUDIO_MODEL_NAME = "gpt-audio-1.5";
const DEFAULT_AUDIO_MODEL_NAMES = ["gpt-audio-1.5", "gpt-audio-mini"];
const REMOVED_MODEL_NAMES = new Set(["gpt-5.1", "gpt-5.2", "claude-sonnet-4-6", "claude-opus-4-6", "claude-opus-4-7", "doubao-seedance-1-5-pro", "veo_3_1-fast"]);
const LEGACY_IMAGE_DEFAULT_MODEL_NAMES = new Set(["gpt-image-2"]);
const LEGACY_VIDEO_DEFAULT_MODEL_NAMES = new Set(["grok-imagine-video", "veo_3_1-fast"]);
const LEGACY_TEXT_DEFAULT_MODEL_NAMES = new Set(["gpt-5.4", "gpt-5.5"]);
const LEGACY_AUDIO_DEFAULT_MODEL_NAMES = new Set(["gpt-4o-mini-tts"]);
const DEFAULT_CHANNEL_MODEL_NAMES = uniqueRawModels([...DEFAULT_VIDEO_MODEL_NAMES, ...DEFAULT_IMAGE_MODEL_NAMES, ...DEFAULT_TEXT_MODEL_NAMES, ...DEFAULT_AUDIO_MODEL_NAMES]);

export const defaultConfig: AiConfig = {
    channelMode: "local",
    baseUrl: ANTSK_BASE_URL,
    apiKey: "",
    apiFormat: "openai",
    channels: [
        {
            id: "default",
            name: "BigBanana API",
            baseUrl: ANTSK_BASE_URL,
            apiKey: "",
            apiFormat: "openai",
            models: DEFAULT_CHANNEL_MODEL_NAMES,
        },
    ],
    model: encodeChannelModel("default", DEFAULT_IMAGE_MODEL_NAME),
    imageModel: encodeChannelModel("default", DEFAULT_IMAGE_MODEL_NAME),
    videoModel: encodeChannelModel("default", DEFAULT_VIDEO_MODEL_NAMES[0]),
    textModel: encodeChannelModel("default", DEFAULT_TEXT_MODEL_NAME),
    audioModel: encodeChannelModel("default", DEFAULT_AUDIO_MODEL_NAME),
    audioVoice: "alloy",
    audioFormat: "mp3",
    audioSpeed: "1",
    audioInstructions: "",
    regenerateExistingNode: false,
    videoSeconds: "8",
    videoMode: "first_frame",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: DEFAULT_CHANNEL_MODEL_NAMES.map((model) => encodeChannelModel("default", model)),
    imageModels: DEFAULT_IMAGE_MODEL_NAMES.map((model) => encodeChannelModel("default", model)).sort(compareModelsByName),
    videoModels: DEFAULT_VIDEO_MODEL_NAMES.map((model) => encodeChannelModel("default", model)).sort(compareModelsByName),
    textModels: DEFAULT_TEXT_MODEL_NAMES.map((model) => encodeChannelModel("default", model)).sort(compareModelsByName),
    audioModels: DEFAULT_AUDIO_MODEL_NAMES.map((model) => encodeChannelModel("default", model)).sort(compareModelsByName),
    quality: "medium",
    imageResolution: "1k",
    imageBackground: "",
    size: "16:9",
    count: "1",
    canvasImageCount: "3",
};

export const defaultWebdavSyncConfig: WebdavSyncConfig = {
    proxyMode: "direct",
    url: "",
    username: "",
    password: "",
    directory: "bigbanana-canvas",
    lastSyncedAt: "",
};

type ConfigStore = {
    config: AiConfig;
    webdav: WebdavSyncConfig;
    isConfigOpen: boolean;
    shouldPromptContinue: boolean;
    updateConfig: <K extends keyof AiConfig>(key: K, value: AiConfig[K]) => void;
    updateWebdavConfig: <K extends keyof WebdavSyncConfig>(key: K, value: WebdavSyncConfig[K]) => void;
    isAiConfigReady: (config: AiConfig, model: string, capability?: ModelCapability) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value === "gemini-omni-1.2-flash" || value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("vidu") || value.includes("kling") || value.includes("wan") || value.includes("hailuo") || value.includes("happyhorse");
}

function isImageModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return !isVideoModelName(model) && !isAudioModelName(model) && (value.includes("seedream") || value.includes("gpt-image") || value.includes("image") || value.includes("dall-e") || value.includes("dalle") || value.includes("imagen") || value.includes("flux") || value.includes("sdxl") || value.includes("stable-diffusion") || value.includes("midjourney"));
}

function isAudioModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("audio") || value.includes("tts") || value.includes("speech") || value.includes("voice") || value.includes("music") || value.includes("sound");
}

function isTextModelName(model: string) {
    return !isImageModelName(model) && !isVideoModelName(model) && !isAudioModelName(model);
}

export function modelMatchesCapability(model: string, capability?: ModelCapability) {
    if (!capability) return true;
    if (capability === "image") return isImageModelName(model);
    if (capability === "video") return isVideoModelName(model);
    if (capability === "audio") return isAudioModelName(model);
    return isTextModelName(model);
}

export function filterModelsByCapability(models: string[], capability?: ModelCapability) {
    return models.filter((model) => !REMOVED_MODEL_NAMES.has(modelOptionName(model)) && modelMatchesCapability(model, capability)).sort(compareModelsByName);
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    return filterModelsByCapability(capability ? config[modelListKey(capability)] : config.models, capability);
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

export function modelSelectionError(config: AiConfig, value: string) {
    const selected = value.trim();
    if (!selected) return "尚未选择模型，请先选择一个可用模型。";
    const decoded = decodeChannelModel(selected);
    if (decoded) {
        const channel = config.channels.find((item) => item.id === decoded.channelId);
        if (!channel) return `模型“${decoded.model}”所属渠道已删除，请修复渠道配置或明确选择其他模型。`;
        if (!channel.models.includes(decoded.model)) return `渠道“${channel.name}”中已找不到模型“${decoded.model}”，请修复模型列表或明确选择其他模型。`;
        return "";
    }
    const matches = config.channels.filter((channel) => channel.models.includes(selected));
    if (!matches.length) return `模型“${selected}”已不在任何渠道中，请修复模型列表或明确选择其他模型。`;
    if (matches.length > 1) return `模型“${selected}”存在于多个渠道，请从模型列表中明确选择对应渠道。`;
    return "";
}

export function modelRequestConfigError(config: AiConfig, model: string, capability?: ModelCapability) {
    const selectionError = modelSelectionError(config, model);
    if (selectionError) return selectionError;
    const channel = resolveModelChannel(config, model);
    if (capability && !modelMatchesCapability(model, capability)) return `模型“${modelOptionName(model)}”不支持${capabilityLabel(capability)}生成，请明确选择匹配的模型。`;
    if (!channel.baseUrl.trim()) return `渠道“${channel.name}”缺少 Base URL，请修复渠道配置后重试。`;
    if (!channel.apiKey.trim()) return `渠道“${channel.name}”未配置 API Key，请先配置 Key 后重试。`;
    return "";
}

function capabilityLabel(capability: ModelCapability) {
    return capability === "image" ? "图片" : capability === "video" ? "视频" : capability === "audio" ? "音频" : "文本";
}

function isAiConfigReady(config: AiConfig, model: string, capability?: ModelCapability) {
    return !modelRequestConfigError(config, model, capability);
}

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            config: defaultConfig,
            webdav: defaultWebdavSyncConfig,
            isConfigOpen: false,
            shouldPromptContinue: false,
            updateConfig: (key, value) =>
                set((state) => ({
                    config: {
                        ...state.config,
                        [key]: value,
                    },
                })),
            updateWebdavConfig: (key, value) =>
                set((state) => ({
                    webdav: {
                        ...state.webdav,
                        [key]: value,
                    },
                })),
            isAiConfigReady: (config, model, capability) => isAiConfigReady(config, model, capability),
            openConfigDialog: (shouldPromptContinue = false) => set({ isConfigOpen: true, shouldPromptContinue }),
            setConfigDialogOpen: (isConfigOpen) => set({ isConfigOpen }),
            clearPromptContinue: () => set({ shouldPromptContinue: false }),
        }),
        {
            name: CONFIG_STORE_KEY,
            partialize: (state) => ({ config: state.config, webdav: state.webdav }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<ConfigStore>;
                const persistedConfig = (persistedState.config || {}) as Partial<AiConfig>;
                const persistedWebdav = (persistedState.webdav || {}) as Partial<WebdavSyncConfig>;
                const config = { ...defaultConfig, ...persistedConfig };
                if (!Array.isArray(persistedConfig.channels)) config.channels = [];
                const channels = normalizeChannels(config);
                const models = modelOptionsFromChannels(channels);
                const imageModels = ensureModelListIncludes(
                    Array.isArray(persistedConfig.imageModels) ? filterModelsByCapability(normalizeModelList(config.imageModels, channels), "image") : filterModelsByCapability(models, "image"),
                    channels,
                    [DEFAULT_IMAGE_MODEL_NAME],
                );
                const videoModels = ensureModelListIncludes(
                    Array.isArray(persistedConfig.videoModels) ? filterModelsByCapability(normalizeModelList(config.videoModels, channels), "video") : filterModelsByCapability(models, "video"),
                    channels,
                    DEFAULT_VIDEO_MODEL_NAMES,
                );
                const textModels = ensureModelListIncludes(
                    Array.isArray(persistedConfig.textModels) ? filterModelsByCapability(normalizeModelList(config.textModels, channels), "text") : filterModelsByCapability(models, "text"),
                    channels,
                    DEFAULT_TEXT_MODEL_NAMES,
                );
                const audioModels = ensureModelListIncludes(
                    Array.isArray(persistedConfig.audioModels) ? filterModelsByCapability(normalizeModelList(config.audioModels, channels), "audio") : filterModelsByCapability(models, "audio"),
                    channels,
                    DEFAULT_AUDIO_MODEL_NAMES,
                );
                const imageModel = normalizeDefaultModelSelection(config.imageModel || config.model, channels, DEFAULT_IMAGE_MODEL_NAME, LEGACY_IMAGE_DEFAULT_MODEL_NAMES, "image");
                const videoModel = normalizeDefaultModelSelection(config.videoModel, channels, DEFAULT_VIDEO_MODEL_NAMES[0], LEGACY_VIDEO_DEFAULT_MODEL_NAMES, "video");
                const textModel = normalizeDefaultModelSelection(config.textModel || config.model, channels, DEFAULT_TEXT_MODEL_NAME, LEGACY_TEXT_DEFAULT_MODEL_NAMES, "text");
                const audioModel = normalizeDefaultModelSelection(config.audioModel, channels, DEFAULT_AUDIO_MODEL_NAME, LEGACY_AUDIO_DEFAULT_MODEL_NAMES, "audio");
                const model = imageModel || normalizeDefaultModelSelection(config.model || config.imageModel, channels, DEFAULT_IMAGE_MODEL_NAME);
                const mergedWebdav = normalizeWebdavSyncConfig({ ...defaultWebdavSyncConfig, ...persistedWebdav });
                return {
                    ...current,
                    webdav: mergedWebdav,
                    config: {
                        ...config,
                        channelMode: "local",
                        baseUrl: channels[0]?.baseUrl || ANTSK_BASE_URL,
                        apiKey: channels[0]?.apiKey || config.apiKey,
                        apiFormat: channels[0]?.apiFormat || normalizeApiFormat(config.apiFormat),
                        channels,
                        models,
                        model,
                        imageModel,
                        videoModel,
                        textModel,
                        audioModel,
                        audioVoice: config.audioVoice || defaultConfig.audioVoice,
                        audioFormat: config.audioFormat || defaultConfig.audioFormat,
                        audioSpeed: config.audioSpeed || defaultConfig.audioSpeed,
                        audioInstructions: config.audioInstructions || "",
                        videoSeconds: config.videoSeconds || "8",
                        videoGenerateAudio: config.videoGenerateAudio || "true",
                        videoWatermark: config.videoWatermark || "false",
                        imageResolution: config.imageResolution || defaultConfig.imageResolution,
                        canvasImageCount: config.canvasImageCount || "3",
                        imageModels,
                        videoModels,
                        textModels,
                        audioModels,
                    },
                };
            },
        },
    ),
);

function normalizeModelList(models: string[], channels: ModelChannel[]) {
    const allModelOptions = channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model)));
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)))
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter((model) => model && (!allModelOptions.length || allModelOptions.includes(model) || !isChannelModelValue(model)));
}

function normalizeWebdavSyncConfig(config: WebdavSyncConfig): WebdavSyncConfig {
    const directory = config.directory.trim();
    if (!directory || directory === "infinite-canvas") {
        return { ...config, directory: "bigbanana-canvas" };
    }
    return config;
}

export function useEffectiveConfig() {
    const config = useConfigStore((state) => state.config);
    return useMemo(() => ({ ...config, channelMode: "local" as const }), [config]);
}

export function createModelChannel(channel?: Partial<ModelChannel>): ModelChannel {
    const apiFormat = normalizeApiFormat(channel?.apiFormat);
    return {
        id: channel?.id?.trim() || nanoid(),
        name: channel?.name?.trim() || "新渠道",
        baseUrl: ANTSK_BASE_URL,
        apiKey: channel?.apiKey || "",
        apiFormat,
        models: uniqueRawModels(channel?.models || []),
    };
}

export function encodeChannelModel(channelId: string, model: string) {
    return `${channelId}${CHANNEL_MODEL_SEPARATOR}${model.trim()}`;
}

export function isChannelModelValue(value: string) {
    return value.includes(CHANNEL_MODEL_SEPARATOR);
}

export function decodeChannelModel(value: string) {
    const index = value.indexOf(CHANNEL_MODEL_SEPARATOR);
    if (index < 0) return null;
    return { channelId: value.slice(0, index), model: value.slice(index + CHANNEL_MODEL_SEPARATOR.length) };
}

export function modelOptionName(value: string) {
    return decodeChannelModel(value)?.model || value;
}

export function modelOptionLabel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    if (!decoded) return modelSelectionError(config, value) ? `${value}（模型不可用）` : value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    if (!channel) return `${decoded.model}（渠道已删除）`;
    if (!channel.models.includes(decoded.model)) return `${decoded.model}（模型已删除）`;
    return channel.name.trim().toLowerCase() === "bigbanana api" ? decoded.model : `${decoded.model}（${channel.name}）`;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (REMOVED_MODEL_NAMES.has(decoded?.model || model)) return "";
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.includes(decoded.model) ? model : "";
    }
    const normalizedModel = model;
    const matches = channels.filter((item) => item.models.includes(normalizedModel));
    if (matches.length > 1) return "";
    const channel = matches[0];
    return channel && channel.models.includes(normalizedModel) ? encodeChannelModel(channel.id, normalizedModel) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const error = modelSelectionError(config, value);
    if (error) throw new Error(error);
    return decoded ? config.channels.find((channel) => channel.id === decoded.channelId)! : config.channels.find((channel) => channel.models.includes(value))!;
}

export function resolveModelRequestConfig(config: AiConfig, value: string, capability?: ModelCapability) {
    const selectedModel = value || config.model;
    const error = modelRequestConfigError(config, selectedModel, capability);
    if (error) throw new Error(error);
    const channel = resolveModelChannel(config, selectedModel);
    const model = modelOptionName(selectedModel);
    return {
        ...config,
        model,
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: inferApiFormatByModel(model, channel.apiFormat),
    };
}

export function resolveModelForCapability(config: AiConfig, selectedModel: string, fallbackModel: string, capability: ModelCapability) {
    if (!selectedModel || modelSelectionError(config, selectedModel)) return selectedModel || fallbackModel;
    return modelMatchesCapability(selectedModel, capability) ? selectedModel : fallbackModel;
}

function inferApiFormatByModel(model: string, fallback: ApiCallFormat): ApiCallFormat {
    if (["gemini-omni-1.2-flash", "muse-video"].includes(model.trim().toLowerCase())) return "openai";
    return model.trim().toLowerCase().includes("gemini") ? "gemini" : fallback;
}

function normalizeChannels(config: AiConfig) {
    const persistedChannels = Array.isArray(config.channels) ? config.channels : [];
    const channels = persistedChannels.map((channel, index) =>
        createModelChannel({
            ...channel,
            id: channel.id || (index === 0 ? "default" : `channel-${index + 1}`),
            name: channel.name || (index === 0 ? "BigBanana API" : `渠道 ${index + 1}`),
            baseUrl: ANTSK_BASE_URL,
            models: uniqueRawModels(channel.models || []),
        }),
    );
    if (!channels.length) {
        channels.push(
            createModelChannel({
                id: "default",
                name: "BigBanana API",
                baseUrl: ANTSK_BASE_URL,
                apiKey: config.apiKey || "",
                apiFormat: config.apiFormat || defaultConfig.apiFormat,
                models: uniqueRawModels([
                    ...DEFAULT_CHANNEL_MODEL_NAMES,
                    ...(config.models || []),
                    config.model,
                    config.imageModel,
                    config.videoModel,
                    config.textModel,
                    config.audioModel,
                ]),
            }),
        );
    }
    const defaultChannelIndex = Math.max(
        0,
        channels.findIndex((channel) => channel.id === "default"),
    );
    channels[defaultChannelIndex] = {
        ...channels[defaultChannelIndex],
        models: uniqueRawModels([...channels[defaultChannelIndex].models, ...DEFAULT_CHANNEL_MODEL_NAMES]),
    };
    return channels.map((channel) => ({ ...channel, baseUrl: ANTSK_BASE_URL, models: uniqueRawModels(channel.models) }));
}

export function defaultBaseUrlForApiFormat(_apiFormat: ApiCallFormat) {
    return ANTSK_BASE_URL;
}

function normalizeApiFormat(apiFormat: unknown): ApiCallFormat {
    return apiFormat === "gemini" ? "gemini" : "openai";
}

function uniqueRawModels(models: string[]) {
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter((model) => model && !REMOVED_MODEL_NAMES.has(model)))).sort(compareModelsByName);
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean))).sort(compareModelsByName);
}

function compareModelsByName(a: string, b: string) {
    return modelOptionName(a).localeCompare(modelOptionName(b), "en", { numeric: true, sensitivity: "base" });
}

function ensureModelListIncludes(list: string[], channels: ModelChannel[], requiredModelNames: string[]) {
    const required = requiredModelNames
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter(Boolean);
    return uniqueModelOptions([...list, ...required]);
}

function normalizeDefaultModelSelection(value: string | undefined, channels: ModelChannel[], fallbackModelName: string, legacyDefaults?: Set<string>, capability?: ModelCapability) {
    const matchesCapability = (model: string) => !capability || modelMatchesCapability(model, capability);
    const fallback = normalizeModelOptionValue(fallbackModelName, channels);
    const raw = value?.trim() || "";
    const current = normalizeModelOptionValue(raw, channels);
    if (legacyDefaults?.has(modelOptionName(raw))) return fallback && matchesCapability(fallback) ? fallback : raw;
    if (!raw) return fallback && matchesCapability(fallback) ? fallback : "";
    if (!current) return REMOVED_MODEL_NAMES.has(modelOptionName(raw)) && fallback && matchesCapability(fallback) ? fallback : raw;
    if (current === raw && !isChannelModelValue(raw)) return raw;
    if (!matchesCapability(current)) return fallback && matchesCapability(fallback) ? fallback : current;
    return current;
}

export function buildApiUrl(baseUrl: string, path: string) {
    let normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
    normalizedBaseUrl = normalizeArkPlanBaseUrl(normalizedBaseUrl);
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    const apiBaseUrl = lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/api/v3") || lowerBaseUrl.endsWith("/api/plan/v3") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1`;
    return `${apiBaseUrl}${path}`;
}

export function proxyAntskUrl(url: string) {
    if (!url) return url;
    try {
        const parsed = new URL(url);
        const upstream = new URL(ANTSK_UPSTREAM_BASE_URL);
        if (parsed.protocol !== upstream.protocol || parsed.host !== upstream.host) return url;
        return `${ANTSK_BASE_URL}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return url;
    }
}

function normalizeArkPlanBaseUrl(baseUrl: string) {
    try {
        const url = new URL(baseUrl);
        const path = url.pathname.replace(/\/+$/, "");
        const lowerPath = path.toLowerCase();
        const arkPlanIndex = lowerPath.indexOf("/api/plan/v3");
        if (arkPlanIndex < 0) return baseUrl;
        const end = arkPlanIndex + "/api/plan/v3".length;
        if (lowerPath.length !== end && lowerPath[end] !== "/") return baseUrl;
        url.pathname = path.slice(0, end);
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return baseUrl;
    }
}
