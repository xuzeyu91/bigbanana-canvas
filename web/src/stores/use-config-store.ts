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
    videoSeconds: string;
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
const DEFAULT_VIDEO_MODEL_NAMES = ["sora-2", "veo_3_1-fast", "viduq3-turbo", "viduq3-pro", "doubao-seedance-1-5-pro", "doubao-seedance-2-0-fast", "doubao-seedance-2-0", "happyhorse-1.0"];
const DEFAULT_TEXT_MODEL_NAME = "gpt-5.4";
const DEFAULT_TEXT_MODEL_NAMES = ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.5", DEFAULT_TEXT_MODEL_NAME, "gpt-5.2", "gpt-5.1", "claude-sonnet-4-6", "claude-opus-4-6", "claude-opus-4-7", "gemini-3.1-pro-preview"];
const DEFAULT_AUDIO_MODEL_NAME = "gpt-audio-1.5";
const DEFAULT_AUDIO_MODEL_NAMES = [DEFAULT_AUDIO_MODEL_NAME, "gpt-audio-mini"];
const LEGACY_IMAGE_DEFAULT_MODEL_NAMES = new Set(["gpt-image-2"]);
const LEGACY_VIDEO_DEFAULT_MODEL_NAMES = new Set(["grok-imagine-video"]);
const LEGACY_TEXT_DEFAULT_MODEL_NAMES = new Set(["gpt-5.5"]);
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
    videoSeconds: "8",
    videoGenerateAudio: "true",
    videoWatermark: "false",
    systemPrompt: "",
    models: DEFAULT_CHANNEL_MODEL_NAMES.map((model) => encodeChannelModel("default", model)),
    imageModels: DEFAULT_IMAGE_MODEL_NAMES.map((model) => encodeChannelModel("default", model)),
    videoModels: DEFAULT_VIDEO_MODEL_NAMES.map((model) => encodeChannelModel("default", model)),
    textModels: DEFAULT_TEXT_MODEL_NAMES.map((model) => encodeChannelModel("default", model)),
    audioModels: DEFAULT_AUDIO_MODEL_NAMES.map((model) => encodeChannelModel("default", model)),
    quality: "medium",
    imageResolution: "1k",
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
    isAiConfigReady: (config: AiConfig, model: string) => boolean;
    openConfigDialog: (shouldPromptContinue?: boolean) => void;
    setConfigDialogOpen: (isOpen: boolean) => void;
    clearPromptContinue: () => void;
};

function isVideoModelName(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("seedance") || value.includes("video") || value.includes("sora") || value.includes("veo") || value.includes("vidu") || value.includes("kling") || value.includes("wan") || value.includes("hailuo") || value.includes("happyhorse");
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
    return capability ? models.filter((model) => modelMatchesCapability(model, capability)) : models;
}

export function selectableModelsByCapability(config: AiConfig, capability?: ModelCapability) {
    if (!capability) return config.models;
    return filterModelsByCapability(config[modelListKey(capability)], capability);
}

function modelListKey(capability: ModelCapability) {
    return `${capability}Models` as "imageModels" | "videoModels" | "textModels" | "audioModels";
}

function isAiConfigReady(config: AiConfig, model: string) {
    const channel = resolveModelChannel(config, model);
    return Boolean(model.trim() && channel.baseUrl.trim() && channel.apiKey.trim());
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
            isAiConfigReady: (config, model) => isAiConfigReady(config, model),
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
        .filter((model) => !allModelOptions.length || allModelOptions.includes(model) || !isChannelModelValue(model));
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
    if (!decoded) return value;
    const channel = config.channels.find((item) => item.id === decoded.channelId);
    return channel?.name.trim().toLowerCase() === "bigbanana api" ? decoded.model : channel ? `${decoded.model}（${channel.name}）` : decoded.model;
}

export function modelOptionsFromChannels(channels: ModelChannel[]) {
    return uniqueModelOptions(channels.flatMap((channel) => channel.models.map((model) => encodeChannelModel(channel.id, model))));
}

export function normalizeModelOptionValue(value: string | undefined, channels: ModelChannel[]) {
    const model = (value || "").trim();
    if (!model) return "";
    const decoded = decodeChannelModel(model);
    if (decoded) {
        const channel = channels.find((item) => item.id === decoded.channelId);
        return channel && channel.models.includes(decoded.model) ? model : "";
    }
    const normalizedModel = model;
    const channel = channels.find((item) => item.models.includes(normalizedModel)) || channels[0];
    return channel && channel.models.includes(normalizedModel) ? encodeChannelModel(channel.id, normalizedModel) : model;
}

export function resolveModelChannel(config: AiConfig, value: string) {
    const decoded = decodeChannelModel(value);
    const model = decoded?.model || value;
    const matched = decoded ? config.channels.find((channel) => channel.id === decoded.channelId) : config.channels.find((channel) => channel.models.includes(model));
    return matched || config.channels[0] || createModelChannel({ id: "default", name: "BigBanana API", baseUrl: config.baseUrl, apiKey: config.apiKey, apiFormat: config.apiFormat, models: config.models.map(modelOptionName) });
}

export function resolveModelRequestConfig(config: AiConfig, value: string) {
    const channel = resolveModelChannel(config, value);
    const model = modelOptionName(value || config.model);
    return {
        ...config,
        model,
        baseUrl: channel.baseUrl,
        apiKey: channel.apiKey,
        apiFormat: inferApiFormatByModel(model, channel.apiFormat),
    };
}

function inferApiFormatByModel(model: string, fallback: ApiCallFormat): ApiCallFormat {
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
    return Array.from(new Set((models || []).map((model) => modelOptionName(model).trim()).filter(Boolean)));
}

function uniqueModelOptions(models: string[]) {
    return Array.from(new Set((models || []).map((model) => model.trim()).filter(Boolean)));
}

function ensureModelListIncludes(list: string[], channels: ModelChannel[], requiredModelNames: string[]) {
    const required = requiredModelNames
        .map((model) => normalizeModelOptionValue(model, channels))
        .filter(Boolean);
    return uniqueModelOptions([...list, ...required]);
}

function normalizeDefaultModelSelection(value: string | undefined, channels: ModelChannel[], fallbackModelName: string, legacyDefaults?: Set<string>, capability?: ModelCapability) {
    const matchesCapability = (model: string) => !capability || modelMatchesCapability(model, capability);
    const current = normalizeModelOptionValue(value, channels);
    if (current && !legacyDefaults?.has(modelOptionName(current)) && matchesCapability(current)) return current;
    const fallback = normalizeModelOptionValue(fallbackModelName, channels);
    if (fallback && matchesCapability(fallback)) return fallback;
    return current && matchesCapability(current) ? current : "";
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
