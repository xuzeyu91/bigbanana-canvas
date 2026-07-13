import { CanvasNodeType, type CanvasGenerationMode, type CanvasGenerationRecord, type CanvasNodeData, type CanvasNodeMetadata, type CanvasProductionResourceRole, type CanvasShotStage } from "../types";

export const productionResourceRoles: Array<{ value: CanvasProductionResourceRole; label: string }> = [
    { value: "character", label: "角色" },
    { value: "scene", label: "场景" },
    { value: "prop", label: "道具" },
    { value: "style", label: "风格" },
];

export type CanvasProductionPreflightIssue = {
    severity: "error" | "warning";
    message: string;
};

export type CanvasProductionPreflight = {
    issues: CanvasProductionPreflightIssue[];
    canGenerate: boolean;
};

export type CanvasShotSummary = {
    id: string;
    title: string;
    nodes: CanvasNodeData[];
    stage: CanvasShotStage;
};

export function productionRoleLabel(role?: CanvasProductionResourceRole) {
    return productionResourceRoles.find((item) => item.value === role)?.label || "";
}

export function inferNodeGenerationMode(node: CanvasNodeData): CanvasGenerationMode {
    if (node.type === CanvasNodeType.Video) return "video";
    if (node.type === CanvasNodeType.Audio) return "audio";
    if (node.type === CanvasNodeType.Image) return "image";
    return node.metadata?.generationMode || "text";
}

export function resolveVideoReferenceImageLimit(model: string) {
    const normalizedModel = String(model || "").trim().toLowerCase();
    if (normalizedModel.includes("viduq3") || normalizedModel.includes("veo") || normalizedModel.includes("doubao-seedance-1-5")) return 2;
    if (normalizedModel.includes("doubao-seedance") || normalizedModel.includes("seedance") || normalizedModel.includes("251215") || normalizedModel.includes("260128")) return 4;
    return 1;
}

export function buildCanvasShotSummaries(nodes: CanvasNodeData[]): CanvasShotSummary[] {
    const groups = new Map<string, CanvasNodeData[]>();
    nodes.forEach((node) => {
        const shotId = node.metadata?.shotId;
        if (!shotId) return;
        groups.set(shotId, [...(groups.get(shotId) || []), node]);
    });
    return [...groups.entries()]
        .map(([id, shotNodes]) => ({ id, title: shotNodes.find((node) => node.metadata?.shotTitle)?.metadata?.shotTitle || "未命名镜头", nodes: shotNodes, stage: resolveShotStage(shotNodes) }))
        .sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
}

export function preflightCanvasGeneration({ node, nodes, mode, prompt, model, inputCount }: { node: CanvasNodeData; nodes: CanvasNodeData[]; mode: CanvasGenerationMode; prompt: string; model: string; inputCount: { text: number; image: number; video: number; audio: number } }): CanvasProductionPreflight {
    const issues: CanvasProductionPreflightIssue[] = [];
    const hasPrompt = Boolean(prompt.trim());
    if (!hasPrompt && mode !== "image") issues.push({ severity: "error", message: "缺少生成提示词。" });
    if (!hasPrompt && mode === "image") issues.push({ severity: "warning", message: "未填写文字提示词，将完全依赖参考图生成。" });
    if (!model.trim()) issues.push({ severity: "error", message: "未选择可用模型。" });
    if (mode === "video" && inputCount.image > resolveVideoReferenceImageLimit(model)) issues.push({ severity: "error", message: `当前视频模型最多支持 ${resolveVideoReferenceImageLimit(model)} 张参考图。` });

    const shotId = node.metadata?.shotId;
    if (shotId) {
        const shotNodes = nodes.filter((item) => item.metadata?.shotId === shotId);
        const roles = new Set(shotNodes.map((item) => item.metadata?.resourceRole));
        if (!roles.has("scene")) issues.push({ severity: "warning", message: "镜头未绑定场景资产，连续性可能不足。" });
        if (!roles.has("character")) issues.push({ severity: "warning", message: "镜头未绑定角色资产，人物一致性可能不足。" });
        if (mode === "video" && !shotNodes.some((item) => item.type === CanvasNodeType.Image && item.metadata?.content)) issues.push({ severity: "warning", message: "镜头中没有已完成的图片关键帧，将使用文本/参考输入直接生成视频。" });
    }

    return { issues, canGenerate: !issues.some((item) => item.severity === "error") };
}

export function createGenerationRecord(id: string, mode: CanvasGenerationMode, model: string, prompt: string, preflight: CanvasProductionPreflight): CanvasGenerationRecord {
    return { id, mode, status: "running", model, prompt: prompt.trim().slice(0, 500), startedAt: new Date().toISOString(), warningCount: preflight.issues.filter((item) => item.severity === "warning").length };
}

export function appendGenerationRecord(metadata: CanvasNodeMetadata | undefined, record: CanvasGenerationRecord): CanvasNodeMetadata {
    return { ...metadata, generationRecords: [...(metadata?.generationRecords || []), record].slice(-20) };
}

export function finishGenerationRecord(metadata: CanvasNodeMetadata | undefined, id: string, patch: Pick<CanvasGenerationRecord, "status" | "error">): CanvasNodeMetadata {
    return { ...metadata, generationRecords: (metadata?.generationRecords || []).map((record) => (record.id === id ? { ...record, ...patch, finishedAt: new Date().toISOString() } : record)) };
}

function resolveShotStage(nodes: CanvasNodeData[]): CanvasShotStage {
    if (nodes.some((node) => node.metadata?.status === "loading" || node.metadata?.shotStage === "generating")) return "generating";
    if (nodes.some((node) => node.type === CanvasNodeType.Video && node.metadata?.content)) return "completed";
    return nodes.find((node) => node.metadata?.shotStage)?.metadata?.shotStage || "draft";
}
