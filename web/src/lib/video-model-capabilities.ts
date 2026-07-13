import { modelOptionName } from "@/stores/use-config-store";

export const videoAspectRatioOptions = [
    { value: "16:9", label: "横屏", width: 1280, height: 720 },
    { value: "9:16", label: "竖屏", width: 720, height: 1280 },
    { value: "1:1", label: "方形", width: 720, height: 720 },
] as const;

export type VideoAspectRatio = (typeof videoAspectRatioOptions)[number]["value"];

type VideoModelCapabilities = {
    defaultAspectRatio: VideoAspectRatio;
    supportedAspectRatios: VideoAspectRatio[];
    defaultDuration: number;
    supportedDurations: number[];
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
    defaultDuration: 16,
    supportedDurations: [16],
};

const VIDU_Q2_CAPABILITIES: VideoModelCapabilities = {
    defaultAspectRatio: "16:9",
    supportedAspectRatios: ["16:9", "9:16"],
    defaultDuration: 5,
    supportedDurations: [5, 10],
};

export function resolveVideoModelCapabilities(model: string): VideoModelCapabilities {
    const name = modelOptionName(model).trim().toLowerCase();
    if (name.includes("viduq3") || name.includes("vidu-q3")) return VIDU_Q3_CAPABILITIES;
    if (name.includes("viduq2") || name.includes("vidu-q2")) return VIDU_Q2_CAPABILITIES;
    if (name.includes("seedance-2-0") || name.includes("happyhorse")) return SEEDANCE_2_0_CAPABILITIES;
    if (name.includes("seedance-1-5")) return SEEDANCE_1_5_CAPABILITIES;
    if (name.includes("veo")) return VEO_CAPABILITIES;
    return SORA_CAPABILITIES;
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
    const [width, height] = value.split(":").map(Number);
    return width / height;
}
