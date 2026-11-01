"use client";

import { Alert, Button, Spin } from "antd";
import { RefreshCw } from "lucide-react";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";

import { useThemeStore } from "@/stores/use-theme-store";

type TurnstileApi = {
    render: (container: HTMLElement, options: {
        sitekey: string;
        theme: "light" | "dark";
        size: "compact" | "flexible";
        language: string;
        callback: (token: string) => void;
        "error-callback": (code: string) => void;
        "expired-callback": () => void;
        "timeout-callback": () => void;
    }) => string;
    remove: (widgetId: string) => void;
};

export function TurnstileVerification({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
    const theme = useThemeStore((state) => state.theme);
    const containerRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [size, setSize] = useState<"compact" | "flexible">("compact");
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(([entry]) => setSize(entry.contentRect.width < 300 ? "compact" : "flexible"));
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const container = containerRef.current;
        const api = (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
        if (!ready || !container || !api) return;
        let active = true;
        onToken("");
        setError("");
        const widgetId = api.render(container, {
            sitekey: siteKey,
            theme,
            size,
            language: "zh-cn",
            callback: (token) => {
                if (!active) return;
                setError("");
                onToken(token);
            },
            "error-callback": (code) => {
                if (!active) return;
                onToken("");
                setError(code === "110200" ? "当前域名未获 Turnstile 授权，请在 Cloudflare 中添加画布域名。" : `安全验证失败（${code}），请重试。`);
            },
            "expired-callback": () => { if (active) onToken(""); },
            "timeout-callback": () => { if (active) onToken(""); },
        });
        return () => {
            active = false;
            onToken("");
            api.remove(widgetId);
        };
    }, [onToken, ready, retry, siteKey, size, theme]);

    return (
        <div className="space-y-2" aria-label="安全验证">
            <Script
                id="account-turnstile"
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                onReady={() => setReady(true)}
                onError={() => {
                    onToken("");
                    setError("安全验证脚本加载失败，请检查网络后刷新页面。");
                }}
            />
            {!ready && !error ? <Spin size="small" /> : null}
            <div ref={containerRef} style={{ minHeight: size === "compact" ? 140 : 65 }} />
            {error ? (
                <Alert
                    type="error"
                    showIcon
                    title={error}
                    action={ready ? <Button size="small" icon={<RefreshCw className="size-3.5" />} onClick={() => { onToken(""); setRetry((value) => value + 1); }}>重试</Button> : null}
                />
            ) : null}
        </div>
    );
}