"use client";

import { Alert, Button, Progress, Spin } from "antd";
import { Database, HardDrive, Layers3, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { readLocalStorageUsage, type IndexedDbStoreUsage, type LocalStorageUsage } from "@/services/local-storage-usage";

const storeLabels: Record<string, string> = {
    app_state: "应用状态",
    image_files: "图片文件",
    media_files: "视频与音频文件",
};

export function ConfigLocalStorage({ active }: { active: boolean }) {
    const [usage, setUsage] = useState<LocalStorageUsage | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const refresh = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            setUsage(await readLocalStorageUsage());
        } catch (reason) {
            setError(reason instanceof Error ? reason.message : "读取本地存储失败");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (active && !usage) void refresh();
    }, [active, refresh, usage]);

    const percent = usage?.usage != null && usage.quota ? Math.min(100, (usage.usage / usage.quota) * 100) : null;
    const database = usage?.database;

    return (
        <div className="space-y-3">
            <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-sm font-semibold">
                            <Database className="size-4" />
                            本地存储
                        </div>
                        <div className="mt-1 text-xs text-stone-500">查看画布、图片和媒体文件在当前浏览器中的占用估算。统计过程不会删除或修改数据。</div>
                    </div>
                    <Button icon={<RefreshCw className="size-4" />} loading={loading} onClick={() => void refresh()}>
                        刷新统计
                    </Button>
                </div>
                {error ? <Alert className="mt-4" type="error" showIcon message="读取本地存储失败" description={error} /> : null}
                {!usage && loading ? (
                    <div className="flex min-h-48 items-center justify-center">
                        <Spin />
                    </div>
                ) : usage ? (
                    <>
                        {usage.usage == null && usage.quota == null ? <Alert className="mt-4" type="warning" showIcon message="浏览器配额估算不可用" description="当前浏览器不支持 StorageManager，已降级为 IndexedDB 记录内容估算。" /> : null}
                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <StorageMetric icon={<Database className="size-4" />} label="IndexedDB 内容" value={formatStorageBytes(usage.contentBytes)} hint="按记录内容估算" />
                            <StorageMetric icon={<HardDrive className="size-4" />} label="站点总占用" value={formatStorageBytes(usage.usage)} hint="浏览器提供的估算值" />
                            <StorageMetric icon={<Layers3 className="size-4" />} label="浏览器配额" value={formatStorageBytes(usage.quota)} hint="当前站点可用上限" />
                        </div>
                        <div className="mt-4">
                            <div className="mb-1 flex justify-between text-xs text-stone-500">
                                <span>配额使用率</span>
                                <span className="tabular-nums">{percent == null ? "暂不可用" : `${percent.toFixed(2)}%`}</span>
                            </div>
                            <Progress percent={percent ?? 0} showInfo={false} status={percent == null ? "normal" : undefined} />
                        </div>
                    </>
                ) : null}
            </section>

            {database ? (
                <section className="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
                    <div className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                        <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">IndexedDB 数据库</div>
                            <div className="mt-0.5 truncate font-mono text-[11px] text-stone-500">
                                {database.name} · v{database.version}
                            </div>
                        </div>
                        <div className="shrink-0 text-sm font-medium tabular-nums">{formatStorageBytes(database.bytes)}</div>
                    </div>
                    {database.error ? <Alert className="m-3" type="warning" showIcon message="无法读取数据库明细" description={database.error} /> : null}
                    <div className="divide-y divide-stone-200 dark:divide-stone-800">
                        {database.stores.length ? database.stores.map((store) => <StoreRow key={store.name} store={store} />) : <div className="px-4 py-5 text-sm text-stone-500">暂未发现可统计的 object store。</div>}
                    </div>
                </section>
            ) : null}
        </div>
    );
}

function StoreRow({ store }: { store: IndexedDbStoreUsage }) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-4 py-3 text-sm">
            <div className="min-w-0">
                <div className="truncate font-medium">{storeLabels[store.name] || store.name}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-stone-500">{store.name}</div>
            </div>
            <div className="text-right text-xs text-stone-500 tabular-nums">{store.records.toLocaleString()} 条记录</div>
            <div className="w-20 text-right font-medium tabular-nums">{formatStorageBytes(store.bytes)}</div>
        </div>
    );
}

function StorageMetric({ icon, label, value, hint }: { icon: ReactNode; label: string; value: number | null; hint: string }) {
    return (
        <div className="rounded-lg bg-stone-100/70 p-3 dark:bg-stone-900/70">
            <div className="flex items-center gap-2 text-xs text-stone-500">
                {icon}
                {label}
            </div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{formatStorageBytes(value)}</div>
            <div className="mt-1 text-[11px] text-stone-500">{hint}</div>
        </div>
    );
}

function formatStorageBytes(bytes: number | null) {
    if (bytes == null || !Number.isFinite(bytes)) return "暂不可用";
    if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
