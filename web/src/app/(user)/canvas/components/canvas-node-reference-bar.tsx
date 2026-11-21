"use client";

import { useState } from "react";
import { FileText, Image as ImageIcon, Music2, Plus, Video, X } from "lucide-react";
import { Popover } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type Props = {
    references: CanvasResourceReference[];
    available: CanvasResourceReference[];
    onRemove: (nodeId: string) => void;
    onAdd: (nodeId: string) => void;
};

export function CanvasNodeReferenceBar({ references, available, onRemove, onAdd }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [open, setOpen] = useState(false);
    if (!references.length && !available.length) return null;
    const content = (
        <div className="thin-scrollbar max-h-60 w-64 overflow-y-auto p-1">
            {available.length ? (
                available.map((reference) => (
                    <button
                        key={reference.nodeId}
                        type="button"
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ color: theme.node.text }}
                        onClick={() => {
                            onAdd(reference.nodeId);
                            setOpen(false);
                        }}
                    >
                        <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md border" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                            {reference.kind === "image" && reference.previewUrl ? <img src={reference.previewUrl} alt="" className="size-full object-cover" /> : <ResourceIcon kind={reference.kind} />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{reference.title || reference.label}</span>
                        <span className="shrink-0 text-[10px] opacity-45">{reference.label}</span>
                    </button>
                ))
            ) : (
                <div className="px-2 py-6 text-center text-xs opacity-45">没有可添加的参考节点</div>
            )}
        </div>
    );

    return (
        <div className="mb-2">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium" style={{ color: theme.node.muted }}>
                <span>参考内容</span>
                <span>{references.length ? `${references.length} 个` : ""}</span>
            </div>
            <div className="thin-scrollbar flex min-h-11 gap-2 overflow-x-auto pb-1">
                {references.map((reference) => (
                    <div key={reference.nodeId} className="group relative grid size-11 shrink-0 place-items-center overflow-visible rounded-xl border" style={{ borderColor: theme.toolbar.border, background: theme.toolbar.activeBg }}>
                        <span className="grid size-full place-items-center overflow-hidden rounded-[inherit]">
                            {reference.kind === "image" && reference.previewUrl ? <img src={reference.previewUrl} alt="" className="size-full object-cover" /> : <ResourceIcon kind={reference.kind} />}
                        </span>
                        <button
                            type="button"
                            className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border opacity-100 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                            onClick={() => onRemove(reference.nodeId)}
                            aria-label="移除参考"
                            title="移除参考"
                        >
                            <X className="size-3" />
                        </button>
                    </div>
                ))}
                {available.length ? (
                    <Popover content={content} trigger="click" placement="topLeft" destroyOnHidden open={open} onOpenChange={setOpen}>
                        <button
                            type="button"
                            className="grid size-11 shrink-0 place-items-center rounded-xl border transition hover:opacity-70"
                            style={{ borderColor: theme.toolbar.border, color: theme.node.muted, background: "transparent" }}
                            aria-label="添加参考"
                            title="添加参考"
                        >
                            <Plus className="size-4" />
                        </button>
                    </Popover>
                ) : null}
            </div>
        </div>
    );
}

function ResourceIcon({ kind }: { kind: CanvasResourceReference["kind"] }) {
    if (kind === "image") return <ImageIcon className="size-4 opacity-65" />;
    if (kind === "video") return <Video className="size-4 opacity-65" />;
    if (kind === "audio") return <Music2 className="size-4 opacity-65" />;
    return <FileText className="size-4 opacity-65" />;
}
