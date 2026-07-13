"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "antd";
import { Clapperboard, Film, Lock, Unlock, X } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasNodeMetadata, type CanvasProductionResourceRole } from "../types";
import { buildCanvasShotSummaries, productionResourceRoles, type CanvasProductionPreflight } from "../utils/canvas-production";

type CanvasProductionPanelProps = {
    open: boolean;
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    onClose: () => void;
    onUpdateMetadata: (ids: Set<string>, patch: Partial<CanvasNodeMetadata>) => void;
    onAssignShot: (ids: Set<string>, title: string) => void;
    onRemoveFromShot: (ids: Set<string>) => void;
    onSelectNodeIds: (ids: Set<string>) => void;
    onPreflight: (nodeId: string) => CanvasProductionPreflight | null;
};

export function CanvasProductionPanel({ open, nodes, selectedNodeIds, onClose, onUpdateMetadata, onAssignShot, onRemoveFromShot, onSelectNodeIds, onPreflight }: CanvasProductionPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const selectedNodes = useMemo(() => nodes.filter((node) => selectedNodeIds.has(node.id)), [nodes, selectedNodeIds]);
    const selectedKey = selectedNodes.map((node) => node.id).join(",");
    const [shotTitle, setShotTitle] = useState("");
    const [preflight, setPreflight] = useState<CanvasProductionPreflight | null>(null);
    const shots = useMemo(() => buildCanvasShotSummaries(nodes), [nodes]);
    const selectedRole = selectedNodes.length && selectedNodes.every((node) => node.metadata?.resourceRole === selectedNodes[0]?.metadata?.resourceRole) ? selectedNodes[0]?.metadata?.resourceRole : undefined;
    const selectedShotId = selectedNodes.length && selectedNodes.every((node) => node.metadata?.shotId === selectedNodes[0]?.metadata?.shotId) ? selectedNodes[0]?.metadata?.shotId : undefined;
    const selectedShotTitle = selectedNodes.find((node) => node.metadata?.shotTitle)?.metadata?.shotTitle || "";
    const selectedLocked = selectedNodes.length > 0 && selectedNodes.every((node) => node.metadata?.resourceLocked);
    const records = useMemo(() => selectedNodes.flatMap((node) => node.metadata?.generationRecords || []).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5), [selectedNodes]);

    useEffect(() => {
        setShotTitle(selectedShotTitle);
        setPreflight(null);
    }, [selectedKey, selectedShotTitle]);

    if (!open) return null;

    const setRole = (resourceRole: CanvasProductionResourceRole | "") => onUpdateMetadata(selectedNodeIds, { resourceRole: resourceRole || undefined });
    const runPreflight = () => {
        const target = selectedNodes.find((node) => node.metadata?.generationMode || node.type !== CanvasNodeType.Text) || selectedNodes[0];
        if (target) setPreflight(onPreflight(target.id));
    };

    return (
        <aside data-canvas-no-zoom className="pointer-events-auto absolute bottom-4 right-4 top-[72px] z-[80] flex w-[344px] flex-col overflow-hidden rounded-2xl border backdrop-blur-xl" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}>
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="flex items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}><Clapperboard className="size-4" /></span>
                    <div>
                        <div className="text-sm font-semibold">制作</div>
                        <div className="text-[11px] opacity-55">资产、镜头与生成检查</div>
                    </div>
                </div>
                <Button type="text" aria-label="关闭制作面板" icon={<X className="size-4" />} onClick={onClose} style={{ color: theme.node.text }} />
            </div>

            <div className="thin-scrollbar space-y-4 overflow-y-auto p-3.5">
                <section className="rounded-xl border p-3" style={{ borderColor: theme.toolbar.border, background: theme.canvas.background }}>
                    <PanelTitle title="当前选择" detail={selectedNodes.length ? `${selectedNodes.length} 个节点` : "请选择画布节点"} />
                    {selectedNodes.length ? (
                        <>
                            <div className="mt-3 grid grid-cols-4 gap-1">
                                {productionResourceRoles.map((item) => <RoleButton key={item.value} active={selectedRole === item.value} label={item.label} onClick={() => setRole(selectedRole === item.value ? "" : item.value)} theme={theme} />)}
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                                <Button size="small" type="text" icon={selectedLocked ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />} onClick={() => onUpdateMetadata(selectedNodeIds, { resourceLocked: !selectedLocked })} style={{ color: selectedLocked ? theme.toolbar.activeText : theme.node.text, background: selectedLocked ? theme.toolbar.activeBg : undefined }}>
                                    {selectedLocked ? "已锁定参考" : "锁定为参考"}
                                </Button>
                                <span className="text-[11px] opacity-50">锁定资产会在镜头检查中作为固定参考。</span>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <input value={shotTitle} onChange={(event) => setShotTitle(event.target.value)} placeholder="镜头名称，例如：雨夜初见" className="min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 py-1.5 text-xs outline-none" style={{ borderColor: theme.toolbar.border, color: theme.node.text }} />
                                {selectedShotId ? <Button size="small" onClick={() => onRemoveFromShot(selectedNodeIds)}>移出</Button> : null}
                                <Button size="small" type="primary" onClick={() => onAssignShot(selectedNodeIds, shotTitle)}>{selectedShotId ? "更新" : "归入镜头"}</Button>
                            </div>
                        </>
                    ) : <p className="mt-2 text-xs leading-5 opacity-55">框选关键帧、视频、文本或资产节点后，可赋予角色/场景/道具语义并归入同一镜头。</p>}
                </section>

                <section className="rounded-xl border p-3" style={{ borderColor: theme.toolbar.border }}>
                    <PanelTitle title="生成前检查" detail="只阻止明确无效的请求" />
                    <Button className="mt-2 w-full" size="small" disabled={!selectedNodes.length} icon={<Film className="size-3.5" />} onClick={runPreflight}>检查所选节点</Button>
                    {preflight ? <div className="mt-2 space-y-1.5">{preflight.issues.length ? preflight.issues.map((issue, index) => <div key={`${issue.message}-${index}`} className="rounded-lg px-2.5 py-2 text-[11px] leading-4" style={{ background: issue.severity === "error" ? `${theme.node.accent}22` : theme.toolbar.itemHover, color: theme.node.text }}>{issue.severity === "error" ? "需处理：" : "提醒："}{issue.message}</div>) : <div className="rounded-lg px-2.5 py-2 text-[11px]" style={{ background: theme.toolbar.itemHover }}>检查通过，可以继续生成。</div>}</div> : null}
                </section>

                <section className="rounded-xl border p-3" style={{ borderColor: theme.toolbar.border }}>
                    <PanelTitle title="镜头总览" detail={shots.length ? `${shots.length} 个镜头` : "尚未建立镜头"} />
                    {shots.length ? <div className="mt-2 space-y-1">{shots.slice(0, 8).map((shot) => <button key={shot.id} type="button" className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition" style={{ background: selectedShotId === shot.id ? theme.toolbar.activeBg : "transparent", color: selectedShotId === shot.id ? theme.toolbar.activeText : theme.node.text }} onClick={() => onSelectNodeIds(new Set(shot.nodes.map((node) => node.id)))}><span className="truncate">{shot.title}</span><span className="ml-3 shrink-0 text-[10px] opacity-60">{shot.nodes.length} 节点 · {shot.stage === "completed" ? "已完成" : shot.stage === "generating" ? "生成中" : shot.stage === "ready" ? "待生成" : "草稿"}</span></button>)}</div> : <p className="mt-2 text-xs opacity-55">使用“归入镜头”将相关节点组织为一个可追踪的生产单元。</p>}
                </section>

                {records.length ? <section className="rounded-xl border p-3" style={{ borderColor: theme.toolbar.border }}><PanelTitle title="最近生成记录" detail="保存在节点中" /><div className="mt-2 space-y-1.5">{records.map((record) => <div key={record.id} className="rounded-lg px-2.5 py-2 text-[11px]" style={{ background: theme.toolbar.itemHover }}><div className="flex justify-between gap-2"><span>{record.mode === "image" ? "图片" : record.mode === "video" ? "视频" : record.mode === "audio" ? "音频" : "文本"} · {record.status === "success" ? "成功" : record.status === "error" ? "失败" : record.status === "cancelled" ? "已取消" : "进行中"}</span><span className="opacity-50">{new Date(record.startedAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span></div>{record.error ? <div className="mt-1 opacity-65">{record.error}</div> : null}</div>)}</div></section> : null}
            </div>
        </aside>
    );
}

function PanelTitle({ title, detail }: { title: string; detail: string }) {
    return <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{title}</span><span className="text-[10px] opacity-50">{detail}</span></div>;
}

function RoleButton({ active, label, onClick, theme }: { active: boolean; label: string; onClick: () => void; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return <button type="button" className="rounded-lg px-1 py-1.5 text-[11px] transition" style={{ background: active ? theme.toolbar.activeBg : theme.toolbar.itemHover, color: active ? theme.toolbar.activeText : theme.node.text }} onClick={onClick}>{label}</button>;
}
