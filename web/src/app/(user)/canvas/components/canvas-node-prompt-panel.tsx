"use client";

import { useEffect, useState } from "react";
import { ArrowUp, LoaderCircle, Sparkles, Square } from "lucide-react";
import { App, Button } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { CreditSymbol, requestCreditCost } from "@/constant/credits";
import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { requestImageQuestion } from "@/services/api/image";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onImageSettingsOpenChange?: (open: boolean) => void;
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], onImageSettingsOpenChange }: CanvasNodePromptPanelProps) {
    const { message } = App.useApp();
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const [optimizing, setOptimizing] = useState(false);
    const credits = requestCreditCost({ channelMode: config.channelMode, model: config.model, count: mode === "image" ? config.count : 1 });

    useEffect(() => {
        setPrompt(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    }, [isEditingExistingContent, node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (!isEditingExistingContent) onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        onGenerate(node.id, mode, text);
        setPrompt("");
    };

    const optimizePrompt = async () => {
        const rawPrompt = prompt.trim();
        if (!rawPrompt || optimizing || isRunning) return;
        const optimizeModel = resolveNodeModelByMode(node.metadata, "text") || globalConfig.textModel || globalConfig.model || defaultConfig.textModel;
        const optimizeConfig: AiConfig = { ...config, model: optimizeModel, textModel: optimizeModel };
        if (!isAiConfigReady(optimizeConfig, optimizeModel)) {
            openConfigDialog(true);
            return;
        }
        setOptimizing(true);
        try {
            let streamed = "";
            const optimized = await requestImageQuestion(
                optimizeConfig,
                [{ role: "user", content: buildPromptOptimizationInstruction(mode, rawPrompt, node, mentionReferences) }],
                (text) => {
                    streamed = text;
                },
            );
            const normalized = normalizeOptimizedPrompt(optimized || streamed);
            const limited = limitPromptLengthByMode(normalized || rawPrompt, mode);
            if (!limited) {
                message.warning("AI 优化未返回有效提示词");
                return;
            }
            if (limited === "没有返回内容") {
                message.warning("AI 优化未返回有效提示词");
                return;
            }
            updatePrompt(limited);
            message.success("已按当前场景优化提示词");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 优化失败");
        } finally {
            setOptimizing(false);
        }
    };

    return (
        <div
            className="rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <CanvasResourceMentionTextarea
                value={prompt}
                references={mentionReferences}
                onChange={updatePrompt}
                onSubmit={submit}
                className="thin-scrollbar h-24 w-full resize-none rounded-xl border px-3 py-2 text-sm leading-5 outline-none"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}
                placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
            />

            <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <CanvasPromptLibrary onSelect={updatePrompt} />
                    <Button
                        className="!h-10 !shrink-0 !rounded-full !px-3"
                        icon={<Sparkles className="size-4" />}
                        disabled={!prompt.trim() || isRunning}
                        loading={optimizing}
                        onClick={() => void optimizePrompt()}
                    >
                        AI优化
                    </Button>
                    {mode === "image" ? (
                        <>
                            <ModelPicker className="h-10 max-w-[180px]" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, modelPatchByMode(mode, model))} capability="image" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                                onMissingConfig={() => openConfigDialog(true)}
                                onOpenChange={onImageSettingsOpenChange}
                            />
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker className="h-10 max-w-[180px]" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, modelPatchByMode(mode, model))} capability="video" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasVideoSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))} />
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker className="h-10 max-w-[180px]" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, modelPatchByMode(mode, model))} capability="audio" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-10 !max-w-[170px] !justify-start !rounded-full !px-3" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <ModelPicker className="h-10 max-w-[180px]" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, modelPatchByMode(mode, model))} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                    )}
                </div>
                <Button
                    type="primary"
                    className="!h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    danger={isRunning}
                    disabled={!isRunning && !prompt.trim()}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={isRunning ? "停止生成" : "生成"}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">停止</span>
                            </>
                        ) : (
                            <>
                                <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                                    <CreditSymbol />
                                    {credits.toLocaleString()}
                                </span>
                                <ArrowUp className="size-4" />
                            </>
                        )}
                    </span>
                </Button>
            </div>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    return {
        ...globalConfig,
        model: resolveNodeModelByMode(node.metadata, mode) || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model),
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        imageResolution: node.metadata?.imageResolution || globalConfig.imageResolution || defaultConfig.imageResolution,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function modelPatchByMode(mode: CanvasNodeGenerationMode, model: string): Partial<CanvasNodeMetadata> {
    const key = modelFieldByMode(mode);
    return { model, [key]: model };
}

function resolveNodeModelByMode(metadata: CanvasNodeMetadata | undefined, mode: CanvasNodeGenerationMode) {
    if (!metadata) return "";
    const key = modelFieldByMode(mode);
    if (metadata[key]) return metadata[key];
    const hasModeSpecificModel = Boolean(metadata.imageModel || metadata.videoModel || metadata.textModel || metadata.audioModel);
    return hasModeSpecificModel ? "" : metadata.model || "";
}

function modelFieldByMode(mode: CanvasNodeGenerationMode) {
    if (mode === "image") return "imageModel" as const;
    if (mode === "video") return "videoModel" as const;
    if (mode === "audio") return "audioModel" as const;
    return "textModel" as const;
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述要生成的视频内容";
    if (mode === "audio") return "描述要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}

function buildPromptOptimizationInstruction(mode: CanvasNodeGenerationMode, prompt: string, node: CanvasNodeData, references: CanvasResourceReference[]) {
    const modeLabel = mode === "image" ? "图片" : mode === "video" ? "视频" : mode === "audio" ? "音频" : "文本";
    const modeFocus = mode === "image" ? "重点补齐主体、构图、风格、光线、材质。" : mode === "video" ? "重点补齐主体动作、镜头运动、节奏和氛围。" : mode === "audio" ? "重点补齐音色、语速、情绪和用途场景。" : "重点补齐目标读者、语气和输出结构。";
    const lengthHint = mode === "video" ? "80~220 字" : mode === "image" ? "60~180 字" : "40~160 字";
    const nodeContext = summarizeNodeContext(node);
    const referenceContext = summarizeScenarioReferences(references);
    return `你是提示词优化助手。请把“用户原始输入”优化成适合${modeLabel}生成的可执行提示词。

规则：
1. 保留用户核心意图与限制，不要改题。
2. 结合“场景参考”自动补足必要信息，但不要编造剧情。
3. ${modeFocus}
4. 输出简洁直接，不要小说化描述，长度建议 ${lengthHint}。
5. 只输出最终提示词，不要解释、不要加标题、不要 Markdown。

当前节点上下文：
${nodeContext}

场景参考：
${referenceContext}

用户原始输入：
${prompt}`;
}

function summarizeNodeContext(node: CanvasNodeData) {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) return "当前节点已有图片内容，本次更偏向图像编辑指令。";
    if (node.type === CanvasNodeType.Text && node.metadata?.content?.trim()) return `当前节点已有文本：${trimByChars(node.metadata.content, 120)}`;
    if (node.type === CanvasNodeType.Video && node.metadata?.content) return "当前节点已有视频内容，本次更偏向视频编辑或重生成指令。";
    if (node.type === CanvasNodeType.Audio && node.metadata?.content) return "当前节点已有音频内容，本次更偏向音频编辑或重生成指令。";
    return "当前节点无既有内容。";
}

function summarizeScenarioReferences(references: CanvasResourceReference[]) {
    if (!references.length) return "无可用参考。";
    return references
        .slice(0, 6)
        .map((item) => {
            const kind = item.kind === "image" ? "图片" : item.kind === "video" ? "视频" : item.kind === "audio" ? "音频" : "文本";
            const detail = item.kind === "text" ? trimByChars(item.text || item.title || "", 70) : item.title || item.label;
            return `- ${item.label}（${kind}）：${detail || "无描述"}`;
        })
        .join("\n");
}

function normalizeOptimizedPrompt(value: string) {
    let text = value.trim();
    if (!text) return "";
    if (text.startsWith("```")) {
        text = text.replace(/^```[\w-]*\s*/i, "").replace(/```$/, "").trim();
    }
    if (text.startsWith("{") && text.endsWith("}")) {
        try {
            const parsed = JSON.parse(text) as Record<string, unknown>;
            const candidate = String(parsed.optimizedPrompt || parsed.prompt || parsed.text || parsed.content || "").trim();
            if (candidate) text = candidate;
        } catch {
            // ignore invalid json
        }
    }
    return text.replace(/^(优化后提示词|提示词|Optimized Prompt|Prompt)\s*[:：]\s*/i, "").trim();
}

function limitPromptLengthByMode(value: string, mode: CanvasNodeGenerationMode) {
    const maxChars = mode === "video" ? 320 : mode === "image" ? 260 : 220;
    const normalized = value.replace(/\s+/g, " ").trim();
    if (Array.from(normalized).length <= maxChars) return normalized;
    return trimByChars(normalized, maxChars);
}

function trimByChars(value: string, maxChars: number) {
    const chars = Array.from(value);
    if (chars.length <= maxChars) return value.trim();
    return `${chars.slice(0, Math.max(0, maxChars - 1)).join("").trim()}…`;
}
