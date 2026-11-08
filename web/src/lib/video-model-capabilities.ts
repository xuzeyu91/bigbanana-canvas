import { modelOptionName } from "@/stores/use-config-store";

export const videoAspectRatioOptions = [
    { value: "16:9", label: "横屏", width: 1280, height: 720 },
    { value: "9:16", label: "竖屏", width: 720, height: 1280 },
    { value: "1:1", label: "方形", width: 720, height: 720 },
    { value: "4:3", label: "标准横屏", width: 960, height: 720 },
    { value: "3:4", label: "标准竖屏", width: 720, height: 960 },
    { value: "3:2", label: "摄影横屏", width: 1080, height: 720 },
    { value: "2:3", label: "摄影竖屏", width: 720, height: 1080 },
    { value: "auto", label: "自适应", width: 0, height: 0 },
] as const;

export type VideoAspectRatio = (typeof videoAspectRatioOptions)[number]["value"];

export const omniVideoModeOptions = [
    { value: "first_frame", label: "首帧", description: "需要 1 张图片作为首帧，不支持参考视频。" },
    { value: "first_last_frame", label: "首尾帧", description: "需要 2 张图片，按输入顺序分别作为首帧、尾帧，不支持参考视频。" },
    { value: "references", label: "多参考", description: "支持 1-10 张参考图和最多 3 段参考视频，也可仅使用参考视频；不作为首尾帧。" },
] as const;

type VideoModelCapabilities = {
    defaultAspectRatio: VideoAspectRatio;
    supportedAspectRatios: VideoAspectRatio[];
    defaultDuration: number;
    supportedDurations: number[];
    referenceImageLimit?: number;
    requiresReferenceImage?: boolean;
    description?: string;
    priceHint?: string;
};

const SORA_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16", "1:1"],
    defaultDuration: 8,
    supportedDurations: [4, 8, 12],
};

const VEO_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportedDurations: [8],
};

const SEEDANCE_1_5_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportedDurations: [4, 8, 12],
};

const SEEDANCE_2_0_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 5,
    supportedDurations: [5, 10, 15],
};

const VIDU_Q3_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 8,
    supportedDurations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    referenceImageLimit: 7,
    description: "支持文生视频；1 张图为图生视频，2 张图按顺序为首尾帧，3-7 张图为场景/角色/道具多参考图。默认 720p，开启音频。",
};

const VIDU_Q4_CAPABILITIES: VideoModelCapabilities = {
    ...VIDU_Q3_CAPABILITIES,
    supportedDurations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
    referenceImageLimit: 15,
    requiresReferenceImage: true,
    description: "Vidu 最强参考模型；至少需要 1 张图片，2-15 张图为场景/角色/道具多参考图。不支持纯文本生成或首尾帧模式。默认 720p，开启音频。",
    priceHint: "0.875$/秒",
};

const VIDU_Q2_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 5,
    supportedDurations: [5, 10],
};

const MUSE_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"],
    defaultDuration: 5,
    supportedDurations: Array.from({ length: 60 }, (_, index) => index + 1),
    referenceImageLimit: 1,
    requiresReferenceImage: true,
    description: "仅支持单张首帧生成；时长为 1-60 秒的期望值，实际时长与分辨率由模型决定。",
    priceHint: "1$/次",
};

const OMNI_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16", "auto"],
    defaultDuration: 5,
    supportedDurations: Array.from({ length: 13 }, (_, index) => index + 3),
    referenceImageLimit: 10,
    description: "支持首帧、首尾帧、多参考三种模式；首尾帧与多参考互斥。默认 720p。",
    priceHint: "3$/次",
};

export function resolveVideoModelCapabilities(model: string): VideoModelCapabilities {
    const name = modelOptionName(model).trim().toLowerCase();
    if (isMuseVideoModel(name)) return MUSE_CAPABILITIES;
    if (isOmniVideoModel(name)) return OMNI_CAPABILITIES;
    if (isViduQ4VideoModel(name)) return VIDU_Q4_CAPABILITIES;
    if (name.includes("viduq3") || name.includes("vidu-q3")) return { ...VIDU_Q3_CAPABILITIES, priceHint: name.includes("turbo") ? "0.4$/秒" : "0.875$/秒" };
    if (name.includes("viduq2") || name.includes("vidu-q2")) return VIDU_Q2_CAPABILITIES;
    if (name.includes("seedance-2-0") || name.includes("happyhorse")) return SEEDANCE_2_0_CAPABILITIES;
    if (name.includes("seedance-1-5")) return SEEDANCE_1_5_CAPABILITIES;
    if (name.includes("veo")) return VEO_CAPABILITIES;
    return SORA_CAPABILITIES;
}

export function isMuseVideoModel(model: string) {
    return modelOptionName(model).trim().toLowerCase() === "muse-video";
}

export function isOmniVideoModel(model: string) {
    return modelOptionName(model).trim().toLowerCase() === "gemini-omni-1.2-flash";
}

export function museOmniReferenceError(model: string, mode: string, count: { image: number; video: number; audio: number }) {
    if (isMuseVideoModel(model)) {
        if (count.video || count.audio) return "Muse 仅支持单张首帧，不支持参考视频或参考音频。";
        return count.image === 1 ? "" : "Muse 单帧生成需要且只能使用 1 张图片。";
    }
    if (!isOmniVideoModel(model)) return "";
    if (count.audio) return "Gemini Omni 不支持参考音频，请移除参考音频。";
    if (count.image > 10 || count.video > 3) return "Gemini Omni 最多支持 10 张参考图和 3 段参考视频。";
    if (mode === "references") return count.image || count.video ? "" : "Gemini Omni 多参考模式至少需要 1 张参考图或 1 段参考视频。";
    if (mode === "first_frame" || mode === "first_last_frame") {
        if (count.video) return "Gemini Omni 首帧/首尾帧与多参考模式互斥，请移除参考视频或切换到多参考模式。";
        const images = mode === "first_frame" ? 1 : 2;
        return count.image === images ? "" : `Gemini Omni ${images === 1 ? "首帧" : "首尾帧"}模式需要且只能使用 ${images} 张图片。`;
    }
    return "请选择有效的 Gemini Omni 视频生成模式。";
}

export function isViduQ4VideoModel(model: string) {
    const name = modelOptionName(model).trim().toLowerCase();
    return name.includes("viduq4") || name.includes("vidu-q4");
}

export function isViduGatewayModel(model: string) {
    const name = modelOptionName(model).trim().toLowerCase();
    return name.includes("viduq3") || name.includes("vidu-q3") || isViduQ4VideoModel(name);
}

export function viduReferenceImageError(model: string, count: number) {
    if (!isViduGatewayModel(model)) return "";
    const capabilities = resolveVideoModelCapabilities(model);
    if (capabilities.requiresReferenceImage && count < 1) return "Vidu Q4 不支持纯文本生成，请至少添加一张参考图片。";
    if (capabilities.referenceImageLimit && count > capabilities.referenceImageLimit) return `当前 Vidu 模型最多支持 ${capabilities.referenceImageLimit} 张参考图。`;
    return "";
}

export function normalizeVideoAspectRatio(value: string, model: string): VideoAspectRatio {
    const capabilities = resolveVideoModelCapabilities(model);
    if (capabilities.supportedAspectRatios.includes(value as VideoAspectRatio)) return value as VideoAspectRatio;
    const [width, height] = String(value || "").split("x").map(Number);
    if (width > 0 && height > 0) {
        const ratio = width / height;
        return capabilities.supportedAspectRatios.reduce((closest, option) => Math.abs(aspectRatioValue(option) - ratio) < Math.abs(aspectRatioValue(closest) - ratio) ? option : closest, capabilities.defaultAspectRatio);
    }
    return capabilities.defaultAspectRatio;
}

export function normalizeVideoDuration(value: string, model: string) {
    const capabilities = resolveVideoModelCapabilities(model);
    const duration = Math.floor(Number(value));
    if (capabilities.supportedDurations.includes(duration)) return duration;
    return capabilities.defaultDuration;
}

function aspectRatioValue(value: VideoAspectRatio) {
    if (value === "auto") return NaN;
    const [width, height] = value.split(":").map(Number);
    return width / height;
}
