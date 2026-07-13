import { modelOptionName } from "@/stores/use-config-store";

export const imageResolutionOptions = [
    { value: "1k", label: "1K" },
    { value: "2k", label: "2K" },
    { value: "4k", label: "4K" },
] as const;

export const imageAspectRatioOptions = [
    { value: "16:9", label: "横屏", width: 16, height: 9 },
    { value: "9:16", label: "竖屏", width: 9, height: 16 },
    { value: "1:1", label: "方形", width: 1, height: 1 },
    { value: "3:2", label: "横幅", width: 3, height: 2 },
    { value: "2:3", label: "竖幅", width: 2, height: 3 },
    { value: "4:3", label: "标准横屏", width: 4, height: 3 },
    { value: "3:4", label: "标准竖屏", width: 3, height: 4 },
] as const;

export type ImageResolution = (typeof imageResolutionOptions)[number]["value"];
export type ImageAspectRatio = (typeof imageAspectRatioOptions)[number]["value"];

type ImageModelCapabilities = {
    provider: "gemini" | "openai";
    supportsQuality: boolean;
    defaultResolution: ImageResolution;
    supportedResolutions: ImageResolution[];
    supportedAspectRatios: Record<ImageResolution, ImageAspectRatio[]>;
    outputSizes?: Partial<Record<ImageResolution, Partial<Record<ImageAspectRatio, string>>>>;
    variantModels?: Partial<Record<ImageResolution, string>>;
};

const GEMINI_RATIOS: ImageAspectRatio[] = ["16:9", "9:16"];
const GPT_RATIOS: ImageAspectRatio[] = ["16:9", "9:16", "1:1"];
const GENERIC_RATIOS: ImageAspectRatio[] = imageAspectRatioOptions.map((item) => item.value);

const GEMINI_PRO_CAPABILITIES: ImageModelCapabilities = {
    provider: "gemini",
    supportsQuality: false,
    defaultResolution: "1k",
    supportedResolutions: ["1k", "2k", "4k"],
    supportedAspectRatios: { "1k": GEMINI_RATIOS, "2k": GEMINI_RATIOS, "4k": GEMINI_RATIOS },
    variantModels: { "1k": "gemini-3-pro-image-preview", "2k": "gemini-3-pro-image-preview-2k", "4k": "gemini-3-pro-image-preview-4k" },
};

const GEMINI_FLASH_CAPABILITIES: ImageModelCapabilities = {
    provider: "gemini",
    supportsQuality: false,
    defaultResolution: "1k",
    supportedResolutions: ["1k", "2k", "4k"],
    supportedAspectRatios: { "1k": GEMINI_RATIOS, "2k": GEMINI_RATIOS, "4k": GEMINI_RATIOS },
    variantModels: { "1k": "gemini-3.1-flash-image-preview", "2k": "gemini-3.1-flash-image-preview-2k", "4k": "gemini-3.1-flash-image-preview-4k" },
};

const GPT_IMAGE_1_5_CAPABILITIES: ImageModelCapabilities = {
    provider: "openai",
    supportsQuality: true,
    defaultResolution: "1k",
    supportedResolutions: ["1k"],
    supportedAspectRatios: { "1k": GPT_RATIOS, "2k": [], "4k": [] },
    outputSizes: { "1k": { "16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024" } },
};

const GPT_IMAGE_2_CAPABILITIES: ImageModelCapabilities = {
    provider: "openai",
    supportsQuality: true,
    defaultResolution: "1k",
    supportedResolutions: ["1k", "2k", "4k"],
    supportedAspectRatios: { "1k": GPT_RATIOS, "2k": ["16:9", "1:1"], "4k": ["16:9", "9:16"] },
    outputSizes: {
        "1k": { "16:9": "1536x1024", "9:16": "1024x1536", "1:1": "1024x1024" },
        "2k": { "16:9": "2048x1152", "1:1": "2048x2048" },
        "4k": { "16:9": "3840x2160", "9:16": "2160x3840" },
    },
};

const GENERIC_CAPABILITIES: ImageModelCapabilities = {
    provider: "openai",
    supportsQuality: true,
    defaultResolution: "1k",
    supportedResolutions: ["1k"],
    supportedAspectRatios: { "1k": GENERIC_RATIOS, "2k": [], "4k": [] },
};

export function resolveImageModelCapabilities(model: string): ImageModelCapabilities {
    const name = modelOptionName(model).trim().toLowerCase().replace(/-(?:2k|4k)$/, "");
    if (name === "gemini-3-pro-image-preview") return GEMINI_PRO_CAPABILITIES;
    if (name === "gemini-3.1-flash-image-preview") return GEMINI_FLASH_CAPABILITIES;
    if (name === "gpt-image-2") return GPT_IMAGE_2_CAPABILITIES;
    if (name === "gpt-image-1.5") return GPT_IMAGE_1_5_CAPABILITIES;
    return GENERIC_CAPABILITIES;
}

export function normalizeImageResolution(value: string | undefined, model: string): ImageResolution {
    const capabilities = resolveImageModelCapabilities(model);
    const legacyResolution = ({ low: "1k", medium: "2k", high: "4k" } as Record<string, ImageResolution>)[String(value || "").trim().toLowerCase()] || value;
    return capabilities.supportedResolutions.includes(legacyResolution as ImageResolution) ? legacyResolution as ImageResolution : capabilities.defaultResolution;
}

export function normalizeImageAspectRatio(value: string, model: string, resolution: ImageResolution): ImageAspectRatio {
    const capabilities = resolveImageModelCapabilities(model);
    const supported = capabilities.supportedAspectRatios[resolution] || capabilities.supportedAspectRatios[capabilities.defaultResolution];
    if (supported.includes(value as ImageAspectRatio)) return value as ImageAspectRatio;
    const [width, height] = String(value || "").split("x").map(Number);
    if (width > 0 && height > 0) {
        const ratio = width / height;
        return supported.reduce((closest, option) => Math.abs(aspectRatioValue(option) - ratio) < Math.abs(aspectRatioValue(closest) - ratio) ? option : closest, supported[0]);
    }
    return supported[0];
}

export function resolveImageRequestModel(model: string, resolution: ImageResolution) {
    const rawModel = modelOptionName(model).trim();
    return resolveImageModelCapabilities(rawModel).variantModels?.[resolution] || rawModel;
}

export function resolveImageOutputSize(model: string, resolution: ImageResolution, ratio: ImageAspectRatio) {
    return resolveImageModelCapabilities(model).outputSizes?.[resolution]?.[ratio];
}

export function imageModelSupportsQuality(model: string) {
    return resolveImageModelCapabilities(model).supportsQuality;
}

export function normalizeImageQuality(value: string | undefined, model: string) {
    if (!imageModelSupportsQuality(model)) return undefined;
    const quality = String(value || "").trim().toLowerCase();
    return ["low", "medium", "high"].includes(quality) ? quality : "medium";
}

function aspectRatioValue(value: ImageAspectRatio) {
    const [width, height] = value.split(":").map(Number);
    return width / height;
}
