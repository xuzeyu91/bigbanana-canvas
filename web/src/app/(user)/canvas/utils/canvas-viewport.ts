import type { ViewportTransform } from "../types";

export type CanvasBounds = { left: number; top: number; right: number; bottom: number };

/** 按可用区域适配节点范围；元素列表等场景可限制最大缩放，避免单节点被放得过大。 */
export function fitCanvasBounds(bounds: CanvasBounds, available: CanvasBounds, maxScale = 5): ViewportTransform {
    const worldWidth = Math.max(bounds.right - bounds.left, 1);
    const worldHeight = Math.max(bounds.bottom - bounds.top, 1);
    const availableWidth = Math.max(1, available.right - available.left - 48);
    const availableHeight = Math.max(1, available.bottom - available.top - 48);
    const k = Math.min(maxScale, Math.max(0.01, Math.min(availableWidth / worldWidth, availableHeight / worldHeight)));
    return {
        x: (available.left + available.right) / 2 - ((bounds.left + bounds.right) / 2) * k,
        y: (available.top + available.bottom) / 2 - ((bounds.top + bounds.bottom) / 2) * k,
        k,
    };
}

/** 元素列表聚焦单个节点时，最多放大到 100%，避免一张小图铺满视口。 */
export function fitCanvasNodeBounds(bounds: CanvasBounds, available: CanvasBounds): ViewportTransform {
    return fitCanvasBounds(bounds, available, 1);
}
