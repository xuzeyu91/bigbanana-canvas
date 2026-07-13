import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

import styles from "./glitch-text.module.css";

interface GlitchTextProps {
    children: ReactNode;
    speed?: number;
    enableShadows?: boolean;
    enableOnHover?: boolean;
    className?: string;
}

export default function GlitchText({ children, speed = 1, enableShadows = true, enableOnHover = false, className }: GlitchTextProps) {
    const text = String(children);
    const style = {
        "--glitch-after-duration": `${speed * 3}s`,
        "--glitch-before-duration": `${speed * 2}s`,
        "--glitch-after-shadow": enableShadows ? "-0.055em 0 #ef4444" : "none",
        "--glitch-before-shadow": enableShadows ? "0.055em 0 #22d3ee" : "none",
    } as CSSProperties;

    return (
        <span className={cn(styles.root, enableOnHover && styles.onHover, className)} data-text={text} style={style}>
            {children}
        </span>
    );
}
