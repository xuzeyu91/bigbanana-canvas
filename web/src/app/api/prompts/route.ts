import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Prompt = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    category: string;
    sourceUrl: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
};

type Image2Prompt = {
    title?: string;
    category?: string;
    tweet_url?: string;
    image_dir?: string;
    image_path?: string;
    added_at?: string;
    prompt?: string;
    prompt_available?: boolean;
};

type Image2Manifest = {
    available_dirs?: string[];
    thumbnail_dirs?: string[];
};

const image2Origin = "https://image2.tree456.com";
const image2LibraryUrl = `${image2Origin}/`;
const cacheTtlMs = 1000 * 60 * 60;
const categoryAliases: Record<string, string> = {
    portrait: "Portrait & Photography Cases",
    poster: "Poster & Illustration Cases",
    ui: "UI & Social Media Mockup Cases",
    character: "Character Design Cases",
    comparison: "Comparison & Community Examples",
};

let memoryCache: { items: Prompt[]; fetchedAt: number } | null = null;
let loadingPrompts: Promise<Prompt[]> | null = null;

export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const keyword = (params.get("keyword") || "").trim().toLowerCase();
    const tags = params.getAll("tag").filter(Boolean);
    const category = params.get("category") || "";
    const page = Math.max(1, Number(params.get("page")) || 1);
    const pageSize = Math.max(1, Math.min(100, Number(params.get("pageSize")) || 20));
    const items = await getPrompts();
    const withoutTagFilter = filterPrompts(items, { keyword, category, tags: [] });
    const filtered = filterPrompts(items, { keyword, category, tags });

    return Response.json({
        items: filtered.slice((page - 1) * pageSize, page * pageSize),
        tags: collectTags(withoutTagFilter),
        categories: Array.from(new Set(items.map((item) => item.category))),
        total: filtered.length,
    });
}

async function getPrompts() {
    if (memoryCache && Date.now() - memoryCache.fetchedAt < cacheTtlMs) return memoryCache.items;
    if (loadingPrompts) return loadingPrompts;
    loadingPrompts = loadPrompts().finally(() => {
        loadingPrompts = null;
    });
    return loadingPrompts;
}

async function loadPrompts() {
    const [catalog, manifest] = await Promise.all([fetchJson<{ records?: Image2Prompt[] }>("/data/ingested_tweets.json"), fetchJson<Image2Manifest>("/data/webp-manifest.json")]);
    const availableDirs = new Set(manifest.available_dirs || []);
    const thumbnailDirs = new Set(manifest.thumbnail_dirs || []);
    const items = (catalog.records || []).map((item, index) => toPrompt(item, index, availableDirs, thumbnailDirs)).filter((item): item is Prompt => Boolean(item));

    memoryCache = { items, fetchedAt: Date.now() };
    return items;
}

function toPrompt(item: Image2Prompt, index: number, availableDirs: Set<string>, thumbnailDirs: Set<string>): Prompt | null {
    const title = item.title?.trim() || "";
    const prompt = item.prompt?.trim() || "";
    const imageDir = getImageDir(item);
    if (!title || !prompt || !item.prompt_available || !imageDir || !availableDirs.has(imageDir)) return null;

    const category = normalizeCategory(item.category);
    const sourceUrl = item.tweet_url?.trim() || image2LibraryUrl;
    const coverFile = thumbnailDirs.has(imageDir) ? "output-thumb.webp" : "output.webp";
    return {
        id: `image2-${String(index + 1).padStart(4, "0")}`,
        title,
        coverUrl: `${image2Origin}/${imageDir}/${coverFile}`,
        prompt,
        tags: ["GPT-Image-2", category],
        category,
        sourceUrl,
        preview: sourceUrl === image2LibraryUrl ? "" : `[原始案例](${sourceUrl})`,
        createdAt: item.added_at || "",
        updatedAt: item.added_at || "",
    };
}

function getImageDir(item: Image2Prompt) {
    const imageDir = normalizePath(item.image_dir || "");
    if (imageDir) return imageDir;
    const imagePath = normalizePath(item.image_path || "");
    return imagePath.includes("/") ? imagePath.slice(0, imagePath.lastIndexOf("/")) : "";
}

function normalizePath(value: string) {
    return value.trim().replace(/\\/g, "/").replace(/^\/?/, "").replace(/\/$/, "");
}

function normalizeCategory(value?: string) {
    const category = value?.trim() || "未分类";
    return categoryAliases[category.toLowerCase()] || category;
}

async function fetchJson<T>(path: string) {
    const response = await fetch(`${image2Origin}${path}`, { cache: "no-store" });
    if (!response.ok) throw new Error("提示词库拉取失败");
    return (await response.json()) as T;
}

function filterPrompts(items: Prompt[], options: { keyword: string; category: string; tags: string[] }) {
    return items.filter((item) => {
        if (isActiveOption(options.category) && item.category !== options.category) return false;
        if (options.tags.length && !options.tags.some((tag) => item.tags.includes(tag))) return false;
        if (!options.keyword) return true;
        return [item.title, item.prompt, item.category, ...item.tags].join(" ").toLowerCase().includes(options.keyword);
    });
}

function collectTags(items: Prompt[]) {
    return Array.from(new Set(items.flatMap((item) => item.tags).filter(Boolean)));
}

function isActiveOption(value: string) {
    return value && value !== "全部" && value !== "all";
}
