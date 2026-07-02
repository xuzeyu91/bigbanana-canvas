"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type BaiduHmWindow = Window & {
    _hmt?: Array<unknown>;
};

export function BaiduHmTracker() {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const query = searchParams.toString();
    const initializedRef = useRef(false);

    useEffect(() => {
        if (!pathname) {
            return;
        }
        if (!initializedRef.current) {
            initializedRef.current = true;
            return;
        }

        const fullPath = query ? `${pathname}?${query}` : pathname;
        const hmWindow = window as BaiduHmWindow;
        hmWindow._hmt?.push(["_trackPageview", fullPath]);
    }, [pathname, query]);

    return null;
}
