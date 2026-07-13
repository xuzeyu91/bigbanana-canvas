import type { Metadata } from "next";
import Script from "next/script";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { AppProviders } from "@/components/layout/app-providers";
import "antd/dist/reset.css";
import "./globals.css";
import React from "react";

export const metadata: Metadata = {
    metadataBase: new URL("https://canvas.tree456.com"),
    title: {
        default: "BigBanana Canvas - 无界画板生图创作工具",
        template: "%s | BigBanana Canvas",
    },
    description: "在 BigBanana Canvas 中生成、连接和重组图片、文字与图形，让创作从单次生成变成连续推演。提供无限画布、提示词中心、AI生图、视频创作及素材管理，开启下一代AI协同创作体验。",
    keywords: [
        "BigBanana Canvas",
        "无界画板",
        "无限画布",
        "生图创作",
        "AI生图",
        "视频创作",
        "提示词中心",
        "提示词库",
        "我的素材",
        "创意推演",
        "AI作画",
        "AI绘画",
        "Midjourney画板",
        "Stable Diffusion画板",
    ],
    authors: [{ name: "BigBanana", url: "https://canvas.tree456.com" }],
    creator: "BigBanana",
    publisher: "BigBanana",
    alternates: {
        canonical: "/",
    },
    icons: {
        icon: [{ url: "/favicon.ico", type: "image/x-icon", sizes: "32x32" }],
        shortcut: "/favicon.ico",
        apple: "/favicon.ico",
    },
    openGraph: {
        type: "website",
        locale: "zh_CN",
        url: "https://canvas.tree456.com",
        title: "BigBanana Canvas - 无界画板生图创作工具",
        description: "在 BigBanana Canvas 中生成、连接和重组图片、文字与图形，让创作从单次生成变成连续推演。提供无限画布、提示词中心、AI生图、视频创作及素材管理，开启下一代AI协同创作体验。",
        siteName: "BigBanana Canvas",
        images: [
            {
                url: "/logo.png",
                width: 512,
                height: 512,
                alt: "BigBanana Canvas Logo",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "BigBanana Canvas - 无界画板生图创作工具",
        description: "在 BigBanana Canvas 中生成、连接和重组图片、文字与图形，让创作从单次生成变成连续推演。提供无限画布、提示词中心、AI生图、视频创作及素材管理，开启下一代AI协同创作体验。",
        images: ["/logo.png"],
    },
    robots: {
        index: true,
        follow: true,
        googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
        },
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="zh-CN" suppressHydrationWarning className="font-sans">
            <body
                className="bg-background text-foreground antialiased"
                style={{
                    fontFamily: '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif',
                }}
            >
                <Script
                    id="theme-script"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{
                        __html: `try{var s=JSON.parse(localStorage.getItem("infinite-canvas:theme_store")||"{}");var t=s.state&&s.state.theme==="light"?"light":"dark";document.documentElement.classList.toggle("dark",t==="dark");document.documentElement.style.colorScheme=t}catch(e){}`,
                    }}
                />
                <Script
                    id="baidu-hm-init"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{ __html: "window._hmt = window._hmt || [];" }}
                />
                <Script
                    id="baidu-hm-src"
                    src="https://hm.baidu.com/hm.js?a279a450048889338ec3afdd144535c6"
                    strategy="beforeInteractive"
                />
                <AntdRegistry>
                    <AppProviders>{children}</AppProviders>
                </AntdRegistry>
            </body>
        </html>
    );
}
