"use client";

import { type ReactNode } from "react";
import { Select, Switch } from "antd";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { boolConfig, isSeedanceVideoConfig } from "@/lib/seedance-video";
import { isOmniVideoModel, normalizeVideoAspectRatio, normalizeVideoDuration, omniVideoModeOptions, resolveVideoModelCapabilities, videoAspectRatioOptions } from "@/lib/video-model-capabilities";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { type AiConfig } from "@/stores/use-config-store";

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "size" | "videoSeconds" | "videoMode" | "videoGenerateAudio" | "videoWatermark", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function VideoSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: VideoSettingsPanelProps) {
    const model = config.model || config.videoModel;
    const capabilities = resolveVideoModelCapabilities(model);
    const ratio = normalizeVideoAspectRatio(config.size, model);
    const seconds = normalizeVideoDuration(config.videoSeconds, model);
    const supportsOutputOptions = isSeedanceVideoConfig(config);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                {capabilities.description ? (
                    <div className="space-y-1 text-xs leading-relaxed" style={{ color: theme.node.muted }}>
                        <div>{capabilities.description}</div>
                        <div>{capabilities.priceHint} · {capabilities.priceHint?.endsWith("/次") ? "按次计费" : "按秒计费"}</div>
                    </div>
                ) : null}
                {isOmniVideoModel(model) ? (
                    <SettingGroup title="生成模式" color={theme.node.muted}>
                        <div className="grid grid-cols-3 gap-2.5">
                            {omniVideoModeOptions.map((item) => (
                                <OptionPill key={item.value} selected={config.videoMode === item.value} theme={theme} onClick={() => onConfigChange("videoMode", item.value)}>
                                    {item.label}
                                </OptionPill>
                            ))}
                        </div>
                        <div className="text-xs leading-relaxed" style={{ color: theme.node.muted }}>
                            {omniVideoModeOptions.find((item) => item.value === config.videoMode)?.description}
                        </div>
                    </SettingGroup>
                ) : null}
                <SettingGroup title="比例" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {videoAspectRatioOptions.filter((item) => capabilities.supportedAspectRatios.includes(item.value)).map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[78px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent text-sm transition hover:opacity-80"
                                style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", item.value)}
                            >
                                <SizePreview width={item.width} height={item.height} color={theme.node.text} />
                                <span>{item.label}</span>
                                <span className="text-[11px] leading-none opacity-55">{item.value}</span>
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="时长" color={theme.node.muted}>
                    {capabilities.supportedDurations.length > 16 ? (
                        <Select
                            className="w-full"
                            aria-label="视频期望时长"
                            value={String(seconds)}
                            options={capabilities.supportedDurations.map((value) => ({ value: String(value), label: `${value}s` }))}
                            onChange={(value) => onConfigChange("videoSeconds", value)}
                            onMouseDown={(event) => event.stopPropagation()}
                        />
                    ) : <div className="grid grid-cols-3 gap-2.5">
                        {capabilities.supportedDurations.map((value) => (
                            <OptionPill key={value} selected={seconds === value} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                {value}s
                            </OptionPill>
                        ))}
                    </div>}
                </SettingGroup>
                {supportsOutputOptions ? (
                    <SettingGroup title="输出" color={theme.node.muted}>
                        <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                            <SwitchRow label="生成声音" checked={generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} />
                            <SwitchRow label="添加水印" checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} />
                        </div>
                    </SettingGroup>
                ) : null}
            </div>
        </ImageSettingsTheme>
    );
}

export function videoSizeLabel(value: string, model = "") {
    const ratio = normalizeVideoAspectRatio(value, model);
    if (value === "adaptive" || value === "auto") return "自适应";
    return videoAspectRatioOptions.find((item) => item.value === ratio)?.label || ratio;
}

export function videoSecondsLabel(value: string, model = "") {
    return `${normalizeVideoDuration(value, model)}s`;
}

function OptionPill({ selected, disabled = false, theme, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode }) {
    return (
        <button type="button" disabled={disabled} className="h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35" style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={onClick}>
            {children}
        </button>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2.5">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function SizePreview({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) return null;
    const longSide = Math.max(width, height);
    const previewWidth = Math.max(10, Math.round((width / longSide) * 26));
    const previewHeight = Math.max(10, Math.round((height / longSide) * 26));
    return <span className="rounded-[3px] border-2" style={{ width: previewWidth, height: previewHeight, borderColor: color }} />;
}

function SwitchRow({ label, checked, theme, onChange }: { label: string; checked: boolean; theme: CanvasTheme; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex h-8 items-center justify-between gap-3">
            <span className="text-sm" style={{ color: theme.node.text }}>
                {label}
            </span>
            <span onMouseDown={(event) => event.stopPropagation()}>
                <Switch size="small" checked={checked} onChange={onChange} />
            </span>
        </div>
    );
}
