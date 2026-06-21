import { Clapperboard, FileText, ImagePlus, Images, Maximize2, Video } from "lucide-react";

const IMAGE_WORKBENCH_URL = "https://bigbanana.tree456.com/gemini-image.html";
const VIDEO_WORKBENCH_URL = "https://bigbanana.tree456.com/ai-video-content.html";
const COMIC_WORKFLOW_URL = "https://director.tree456.com/";

export const navigationTools = [
    {
        slug: "canvas",
        label: "我的画布",
        icon: Maximize2,
        href: "/canvas",
        external: false,
    },
    {
        slug: "image",
        label: "生图工作台",
        icon: ImagePlus,
        href: IMAGE_WORKBENCH_URL,
        external: true,
    },
    {
        slug: "video",
        label: "视频创作台",
        icon: Video,
        href: VIDEO_WORKBENCH_URL,
        external: true,
    },
    {
        slug: "comic-workflow",
        label: "漫剧工作流平台",
        icon: Clapperboard,
        href: COMIC_WORKFLOW_URL,
        external: true,
    },
    {
        slug: "prompts",
        label: "提示词库",
        icon: FileText,
        href: "/prompts",
        external: false,
    },
    {
        slug: "assets",
        label: "我的素材",
        icon: Images,
        href: "/assets",
        external: false,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
