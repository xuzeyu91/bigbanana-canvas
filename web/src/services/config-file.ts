import type { AiConfig } from "@/stores/use-config-store";

export const CONFIG_PREFERENCE_FILE_VERSION = 1;
export const CONFIG_PREFERENCE_APP_ID = "bigbanana-canvas";

/** 只导出生成偏好，不包含账号、渠道 Key、WebDAV 密码和模型请求配置。 */
export const CONFIG_PREFERENCE_KEYS = [
    "quality",
    "imageResolution",
    "imageBackground",
    "size",
    "count",
    "canvasImageCount",
    "videoSeconds",
    "videoMode",
    "videoGenerateAudio",
    "videoWatermark",
    "audioVoice",
    "audioFormat",
    "audioSpeed",
    "audioInstructions",
    "systemPrompt",
    "regenerateExistingNode",
    "autoFocusOnSelect",
] as const;

export type CanvasPreferenceKey = (typeof CONFIG_PREFERENCE_KEYS)[number];
export type CanvasPreferencePatch = Partial<Pick<AiConfig, CanvasPreferenceKey>>;

const BOOLEAN_PREFERENCE_KEYS = new Set<CanvasPreferenceKey>(["regenerateExistingNode", "autoFocusOnSelect"]);

export type CanvasPreferenceFile = {
    app: typeof CONFIG_PREFERENCE_APP_ID;
    version: typeof CONFIG_PREFERENCE_FILE_VERSION;
    exportedAt: string;
    preferences: CanvasPreferencePatch;
};

export function createPreferenceFile(config: AiConfig, exportedAt = new Date().toISOString()): CanvasPreferenceFile {
    const preferences = Object.fromEntries(CONFIG_PREFERENCE_KEYS.map((key) => [key, config[key]])) as CanvasPreferencePatch;
    return {
        app: CONFIG_PREFERENCE_APP_ID,
        version: CONFIG_PREFERENCE_FILE_VERSION,
        exportedAt,
        preferences,
    };
}

/** 接受导出的文件，也兼容直接传入偏好对象；未知字段忽略，类型不合法时给出明确错误。 */
export function parsePreferenceFile(value: unknown): CanvasPreferencePatch {
    if (!isRecord(value)) throw new Error("配置文件格式不正确，请选择导出的 JSON 文件。");
    const source = isRecord(value.preferences) ? value.preferences : value;
    const preferences: CanvasPreferencePatch = {};
    let imported = 0;

    CONFIG_PREFERENCE_KEYS.forEach((key) => {
        const raw = source[key];
        if (raw === undefined || raw === null) return;
        if (BOOLEAN_PREFERENCE_KEYS.has(key)) {
            if (typeof raw !== "boolean") throw new Error(`偏好“${key}”应为 true 或 false。`);
            (preferences as Record<string, unknown>)[key] = raw;
            imported += 1;
            return;
        }
        if (typeof raw !== "string" && typeof raw !== "number") throw new Error(`偏好“${key}”应为文本或数字。`);
        (preferences as Record<string, unknown>)[key] = typeof raw === "number" ? String(raw) : raw;
        imported += 1;
    });

    if (!imported) throw new Error("文件里没有可导入的生成偏好。");
    return preferences;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
