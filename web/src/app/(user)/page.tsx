"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { App, Button, Image, Tag } from "antd";

import { fetchPrompts, type Prompt } from "@/services/api/prompts";
import { navigationTools } from "@/constant/navigation-tools";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/stores/use-theme-store";
import FuzzyText from "@/components/ui/fuzzy-text";

export default function IndexPage() {
    const { message } = App.useApp();
    const theme = useThemeStore((s) => s.theme);
    const [primaryTool] = navigationTools;

    const titleGradient = useMemo(
        () =>
            theme === "dark"
                ? ["#fafaf9", "#fafaf9", "#a8a29e", "#fafaf9", "#fafaf9"]
                : ["#111827", "#111827", "#6b7280", "#111827", "#111827"],
        [theme],
    );
    const highlightGradients = useMemo(
        () =>
            theme === "dark"
                ? {
                      brand: ["#fff7ed", "#fb923c", "#fff7ed"],
                      visual: ["#eff6ff", "#60a5fa", "#eff6ff"],
                  }
                : {
                      brand: ["#b45309", "#f59e0b", "#b45309"],
                      visual: ["#1d4ed8", "#60a5fa", "#1d4ed8"],
                  },
        [theme],
    );
    const [promptShowcase, setPromptShowcase] = useState<Prompt[]>([]);
    const [previewIndex, setPreviewIndex] = useState(0);
    const [previewOpen, setPreviewOpen] = useState(false);
    const promptShowcaseWithCover = promptShowcase.filter((item) => Boolean(item.coverUrl?.trim()));

    useEffect(() => {
        void fetchPrompts({ pageSize: 12 })
            .then((data) => setPromptShowcase(data.items))
            .catch((error) => message.error(error instanceof Error ? error.message : "获取提示词失败"));
    }, [message]);

    return (
        <main className="relative h-full overflow-y-auto bg-background bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] text-stone-950 dark:bg-[radial-gradient(rgba(245,245,244,.18)_1px,transparent_1px)] dark:text-stone-100">
            <section className="relative mx-auto min-h-[calc(100vh-4rem)] max-w-7xl overflow-hidden px-6">
                <div className="pointer-events-none absolute left-[15%] top-24 size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />
                <div className="pointer-events-none absolute right-[23%] top-[48%] size-20 rounded-full border border-dashed border-stone-200 dark:border-stone-800" />

                <div className="relative flex min-h-[620px] flex-col items-center justify-center pt-10 text-center">
                    <FuzzyText
                        fontSize="clamp(3rem, 8vw, 6rem)"
                        fontWeight={600}
                        baseIntensity={0.12}
                        hoverIntensity={0.35}
                        fuzzRange={24}
                        enableHover
                        direction="both"
                        gradient={titleGradient}
                        className="max-w-full"
                    >
                        BigBanana Canvas
                    </FuzzyText>
                    <p className="mt-8 max-w-3xl text-balance text-lg leading-8 text-stone-500 dark:text-stone-400">
                        在
                        <FuzzyText
                            fontSize={18}
                            fontWeight={500}
                            baseIntensity={0.1}
                            hoverIntensity={0.28}
                            fuzzRange={4}
                            horizontalPadding={4}
                            horizontalMargin={4}
                            enableHover
                            direction="horizontal"
                            transitionDuration={120}
                            gradient={highlightGradients.brand}
                            className="inline-block align-[-0.25em]"
                        >
                            BigBanana Canvas
                        </FuzzyText>
                        中生成、连接和重组
                        <FuzzyText
                            fontSize={18}
                            fontWeight={500}
                            baseIntensity={0.1}
                            hoverIntensity={0.28}
                            fuzzRange={4}
                            horizontalPadding={4}
                            horizontalMargin={4}
                            enableHover
                            direction="horizontal"
                            transitionDuration={120}
                            gradient={highlightGradients.visual}
                            className="inline-block align-[-0.25em]"
                        >
                            图片、文字与图形
                        </FuzzyText>
                        ，让创作从单次生成变成连续推演。
                    </p>
                    <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                        <Button type="primary" size="large" href={`/${primaryTool.slug}`} icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            开始使用
                        </Button>
                        <Button size="large" href="/canvas">
                            打开画布
                        </Button>
                    </div>
                </div>

                <section className="relative mx-auto mb-20 max-w-6xl border-t border-stone-200 pt-12 dark:border-stone-800">
                    <div className="mb-8 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
                        <div />
                        <div className="max-w-2xl text-center">
                            <h2 className="text-3xl font-semibold text-stone-950 dark:text-stone-100">沉淀每一次好结果</h2>
                            <p className="mt-3 text-base leading-7 text-stone-500 dark:text-stone-400">收藏稳定出图的提示词、参考风格和结果图片，让下一次创作从已有经验开始。</p>
                        </div>
                        <Button type="link" href="/prompts" className="justify-self-center md:justify-self-end" icon={<ArrowRight className="size-4" />} iconPlacement="end">
                            查看提示词库
                        </Button>
                    </div>
                    <div className="grid auto-rows-[210px] gap-4 md:grid-cols-4">
                        {promptShowcase.map((item, index) => {
                            const coverUrl = item.coverUrl?.trim();
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => {
                                        const nextIndex = promptShowcaseWithCover.findIndex((entry) => entry.id === item.id);
                                        if (nextIndex < 0) {
                                            message.info("该提示词暂无预览图");
                                            return;
                                        }
                                        setPreviewIndex(nextIndex);
                                        setPreviewOpen(true);
                                    }}
                                    className={cn(
                                        "group relative cursor-pointer overflow-hidden border border-stone-200 bg-stone-100 text-left dark:border-stone-800 dark:bg-stone-900",
                                        index === 0 && "md:col-span-2 md:row-span-2",
                                        index === 3 && "md:col-span-2",
                                    )}
                                >
                                    {coverUrl ? (
                                        <img src={coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                                    ) : (
                                        <div className="h-full w-full bg-gradient-to-br from-stone-200 to-stone-100 dark:from-stone-900 dark:to-stone-800" />
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/35 to-transparent p-4 text-white">
                                        <div className="mb-2 flex flex-wrap gap-1.5">
                                            {item.tags.slice(0, 2).map((tag) => (
                                                <Tag key={tag} variant="filled" className="m-0 bg-white/15 text-[11px] text-white backdrop-blur">
                                                    {tag}
                                                </Tag>
                                            ))}
                                        </div>
                                        <h3 className="text-sm font-medium">{item.title}</h3>
                                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/75">{item.prompt}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>
            </section>
            <Image.PreviewGroup
                preview={{
                    open: previewOpen,
                    current: previewIndex,
                    onOpenChange: setPreviewOpen,
                    onChange: setPreviewIndex,
                }}
            >
                <div className="hidden">
                    {promptShowcaseWithCover.map((item) => (
                        <Image key={item.id} src={item.coverUrl.trim()} alt={item.title} />
                    ))}
                </div>
            </Image.PreviewGroup>
        </main>
    );
}
