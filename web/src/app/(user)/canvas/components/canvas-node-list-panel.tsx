"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Image as ImageIcon, ListFilter, Music2, PanelLeftClose, Search, Settings2, Type, Video } from "lucide-react";
import { Input } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { resolveImagePreviewUrl } from "@/services/image-storage";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

type Props = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onClose: () => void;
    onFocusNode: (nodeId: string) => void;
    onPreviewNode: (nodeId: string) => void;
    onHoverNode: (nodeId: string | null) => void;
};

const NODE_TYPE_LABEL: Record<CanvasNodeType, string> = {
    [CanvasNodeType.Image]: "图片",
    [CanvasNodeType.Video]: "视频",
    [CanvasNodeType.Audio]: "音频",
    [CanvasNodeType.Text]: "文本",
    [CanvasNodeType.Config]: "配置",
};

const NODE_TYPE_ICON = {
    [CanvasNodeType.Image]: ImageIcon,
    [CanvasNodeType.Video]: Video,
    [CanvasNodeType.Audio]: Music2,
    [CanvasNodeType.Text]: Type,
    [CanvasNodeType.Config]: Settings2,
};

export function CanvasNodeListPanel({ nodes, selectedNodeIds, onClose, onFocusNode, onPreviewNode, onHoverNode }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [keyword, setKeyword] = useState("");
    const items = useMemo(() => {
        const query = keyword.trim().toLowerCase();
        return nodes
            .filter((node) => !node.metadata?.batchRootId)
            .filter((node) => {
                if (!query) return true;
                return `${node.title} ${node.metadata?.content || ""} ${node.metadata?.prompt || ""}`.toLowerCase().includes(query);
            })
            .sort((left, right) => left.position.y - right.position.y || left.position.x - right.position.x);
    }, [keyword, nodes]);

    return (
        <aside
            data-canvas-occlusion="left"
            className="absolute bottom-4 left-3 top-20 z-40 flex w-[248px] flex-col overflow-hidden rounded-2xl border shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
        >
            <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                    <ListFilter className="size-4 shrink-0 opacity-60" />
                    <span className="truncate text-sm font-semibold">元素列表</span>
                    <span className="text-xs opacity-50">{items.length}</span>
                </div>
                <button type="button" className="grid size-7 shrink-0 place-items-center rounded-lg opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10" onClick={onClose} aria-label="收起元素列表">
                    <PanelLeftClose className="size-4" />
                </button>
            </div>
            <div className="px-3 pb-2">
                <Input size="small" allowClear prefix={<Search className="size-3.5 opacity-45" />} placeholder="搜索节点" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
            </div>
            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-2" onMouseLeave={() => onHoverNode(null)}>
                {items.length ? (
                    items.map((node) => {
                        const Icon = NODE_TYPE_ICON[node.type] || Type;
                        const selected = selectedNodeIds.has(node.id);
                        return (
                            <div
                                key={node.id}
                                role="button"
                                tabIndex={0}
                                className="mb-1 flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 transition"
                                style={{ background: selected ? theme.toolbar.activeBg : "transparent", color: selected ? theme.toolbar.activeText : theme.node.text }}
                                onMouseEnter={() => onHoverNode(node.id)}
                                onClick={() => onFocusNode(node.id)}
                                onDoubleClick={() => (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video) && onPreviewNode(node.id)}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") onFocusNode(node.id);
                                }}
                                title={node.title}
                            >
                                <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border" style={{ borderColor: selected ? "transparent" : theme.toolbar.border, background: selected ? "rgba(255,255,255,.12)" : theme.node.fill }}>
                                    <NodeThumbnail node={node} icon={<Icon className="size-4 opacity-65" />} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-xs font-medium">{node.title || "未命名节点"}</span>
                                    <span className="mt-0.5 flex items-center gap-1.5 text-[10px] opacity-55">
                                        <span>{NODE_TYPE_LABEL[node.type]}</span>
                                        {node.metadata?.status === "loading" ? <span>生成中</span> : null}
                                        {node.metadata?.status === "error" ? <span className="text-red-400">失败</span> : null}
                                        {node.metadata?.isBatchRoot ? <span>{node.metadata.batchChildIds?.length || 0} 张</span> : null}
                                    </span>
                                </span>
                                <span className="size-1.5 shrink-0 rounded-full" style={{ background: statusColor(node.metadata?.status, theme) }} />
                            </div>
                        );
                    })
                ) : (
                    <div className="grid place-items-center px-4 py-10 text-center text-xs opacity-45">没有匹配的节点</div>
                )}
            </div>
        </aside>
    );
}

function NodeThumbnail({ node, icon }: { node: CanvasNodeData; icon: ReactNode }) {
    const content = node.type === CanvasNodeType.Image ? node.metadata?.content || "" : "";
    const storageKey = node.metadata?.storageKey;
    const [url, setUrl] = useState(content);

    useEffect(() => {
        if (node.type !== CanvasNodeType.Image || !storageKey) {
            setUrl(content);
            return;
        }
        let active = true;
        void resolveImagePreviewUrl(storageKey, content).then((next) => {
            if (active) setUrl(next);
        });
        return () => {
            active = false;
        };
    }, [content, node.type, storageKey]);

    if (url) return <img src={url} alt="" loading="lazy" className="size-full object-cover" />;
    return <>{icon}</>;
}

function statusColor(status: string | undefined, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    if (status === "loading") return "#f59e0b";
    if (status === "error") return "#ef4444";
    if (status === "success") return "#22c55e";
    return theme.node.muted;
}
