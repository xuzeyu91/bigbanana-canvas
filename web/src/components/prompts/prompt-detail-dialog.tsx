"use client";

import { Copy, FolderPlus } from "lucide-react";
import { Button, Modal, Space, Tag } from "antd";

import { formatPromptDate, type Prompt } from "@/services/api/prompts";

type PreviewBlock =
    | { type: "text"; content: string }
    | { type: "link"; content: string; href: string }
    | { type: "image"; src: string; alt: string; href?: string };

function PromptPreviewMarkdown({ value, coverUrl }: { value: string; coverUrl: string }) {
    const blocks = normalizePreviewBlocks(parsePreviewMarkdown(value), coverUrl);
    if (!blocks.length) return null;

    return (
        <div className="max-h-80 overflow-auto rounded-lg bg-stone-100 p-3 text-xs leading-5 text-stone-600 dark:bg-stone-900 dark:text-stone-300">
            <div className="space-y-3">
                {blocks.map((block, index) => {
                    if (block.type === "image") {
                        const image = <img src={block.src} alt={block.alt || `preview-${index + 1}`} loading="lazy" className="max-h-80 w-full rounded-md object-cover" />;
                        return (
                            <div key={`${block.src}-${index}`}>
                                {block.href ? (
                                    <a href={block.href} target="_blank" rel="noreferrer" className="block">
                                        {image}
                                    </a>
                                ) : (
                                    image
                                )}
                            </div>
                        );
                    }
                    if (block.type === "link") {
                        return (
                            <a key={`${block.href}-${index}`} href={block.href} target="_blank" rel="noreferrer" className="block break-all underline">
                                {block.content || block.href}
                            </a>
                        );
                    }
                    return (
                        <p key={`${block.content}-${index}`} className="whitespace-pre-wrap break-words">
                            {block.content}
                        </p>
                    );
                })}
            </div>
        </div>
    );
}

function parsePreviewMarkdown(value: string) {
    const blocks: PreviewBlock[] = [];
    for (const rawBlock of value.split(/\r?\n\s*\r?\n/)) {
        const content = rawBlock.trim();
        if (!content) continue;
        const linkedImage = content.match(/^\[\s*!\[([^\]]*)\]\(([^)]+)\)\s*\]\(([^)]+)\)$/);
        if (linkedImage) {
            blocks.push({ type: "image", alt: linkedImage[1] || "", src: linkedImage[2], href: linkedImage[3] });
            continue;
        }
        const wrappedImage = content.match(/^\[\s*!\[([^\]]*)\]\(([^)]+)\)\s*\]$/);
        if (wrappedImage) {
            blocks.push({ type: "image", alt: wrappedImage[1] || "", src: wrappedImage[2] });
            continue;
        }
        const image = content.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (image) {
            blocks.push({ type: "image", alt: image[1] || "", src: image[2] });
            continue;
        }
        const imageTagWithSrcFirst = content.match(/^<img[^>]*src=["']([^"']+)["'][^>]*alt=["']([^"']*)["'][^>]*>$/i);
        if (imageTagWithSrcFirst) {
            blocks.push({ type: "image", alt: imageTagWithSrcFirst[2] || "", src: imageTagWithSrcFirst[1] });
            continue;
        }
        const imageTagWithAltFirst = content.match(/^<img[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>$/i);
        if (imageTagWithAltFirst) {
            blocks.push({ type: "image", alt: imageTagWithAltFirst[1] || "", src: imageTagWithAltFirst[2] });
            continue;
        }
        const link = content.match(/^\[([^\]]*)\]\(([^)]+)\)$/);
        if (link) {
            blocks.push({ type: "link", content: link[1] || "", href: link[2] });
            continue;
        }
        blocks.push({ type: "text", content });
    }
    return blocks;
}

function normalizePreviewBlocks(blocks: PreviewBlock[], coverUrl: string) {
    const normalizedCoverUrl = normalizeUrl(coverUrl);
    let hasPreviewImage = false;
    return blocks.filter((block) => {
        if (block.type !== "image") return true;
        const isDuplicateCover = normalizedCoverUrl && normalizeUrl(block.src) === normalizedCoverUrl;
        if (isDuplicateCover) return false;
        if (hasPreviewImage) return false;
        hasPreviewImage = true;
        return true;
    });
}

function normalizeUrl(value: string) {
    return value.trim().replace(/\/+$/, "");
}

export function PromptDetailDialog({ prompt, onClose, onCopy, onSaveAsset }: { prompt: Prompt | null; onClose: () => void; onCopy: (prompt: string) => void; onSaveAsset?: (prompt: Prompt) => void }) {
    return (
        <>
            <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={860}>
                {prompt ? (
                    <>
                        <div className="grid gap-5 md:grid-cols-[300px_minmax(0,1fr)]">
                            <div className="space-y-3">
                                <img src={prompt.coverUrl} alt={prompt.title} className="h-80 w-full rounded-lg object-cover" />
                                {prompt.preview ? <PromptPreviewMarkdown value={prompt.preview} coverUrl={prompt.coverUrl} /> : null}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                    {prompt.tags.map((tag) => (
                                        <Tag key={tag} className="m-0">
                                            {tag}
                                        </Tag>
                                    ))}
                                </div>
                                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                                <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">
                                    创建：{formatPromptDate(prompt.createdAt)} · 更新：{formatPromptDate(prompt.updatedAt)}
                                </div>
                                <Space wrap className="mt-5">
                                    <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                        复制提示词
                                    </Button>
                                    {onSaveAsset ? (
                                        <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                            加入我的素材
                                        </Button>
                                    ) : null}
                                </Space>
                            </div>
                        </div>
                    </>
                ) : null}
            </Modal>
        </>
    );
}
