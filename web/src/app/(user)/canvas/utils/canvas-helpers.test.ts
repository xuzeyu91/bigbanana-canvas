import assert from "node:assert/strict";
import test from "node:test";

import { connectionsForCopy, inboundConnectionsForDuplicate, remapCopiedConnections } from "./canvas-connections.ts";
import { fitCanvasBounds, fitCanvasNodeBounds } from "./canvas-viewport.ts";
import { resolveVideoFrameTime } from "./canvas-video-frame.ts";
import { isComposingKeyboardEvent } from "../../../../lib/keyboard-event.ts";
import { createPreferenceFile, parsePreferenceFile } from "../../../../services/config-file.ts";

const connection = (id: string, fromNodeId: string, toNodeId: string) => ({ id, fromNodeId, toNodeId });

test("复制节点会带上来自选区外的入边", () => {
    const connections = [connection("a", "source", "selected"), connection("b", "selected", "other"), connection("c", "x", "y")];
    assert.deepEqual(connectionsForCopy(connections, new Set(["selected"])), [connection("a", "source", "selected")]);
});

test("粘贴时只重映射指向复制节点的连线，外部来源保持原节点", () => {
    const connections = [connection("a", "source", "selected"), connection("b", "selected", "selected2")];
    const remapped = remapCopiedConnections(connections, new Map([["selected", "copy1"], ["selected2", "copy2"]]), () => "new-id");
    assert.deepEqual(remapped, [
        { id: "new-id", fromNodeId: "source", toNodeId: "copy1" },
        { id: "new-id", fromNodeId: "copy1", toNodeId: "copy2" },
    ]);
});

test("复制单个节点会复制全部入边到新节点", () => {
    const connections = [connection("a", "source1", "node"), connection("b", "source2", "node"), connection("c", "node", "downstream")];
    assert.deepEqual(inboundConnectionsForDuplicate(connections, "node", "copy", () => "new-id"), [
        { id: "new-id", fromNodeId: "source1", toNodeId: "copy" },
        { id: "new-id", fromNodeId: "source2", toNodeId: "copy" },
    ]);
});

test("视口适配默认最多放大 5 倍，元素列表聚焦最多放大 1 倍", () => {
    const bounds = { left: 0, top: 0, right: 100, bottom: 100 };
    const available = { left: 0, top: 0, right: 1000, bottom: 1000 };
    assert.equal(fitCanvasBounds(bounds, available).k, 5);
    assert.equal(fitCanvasNodeBounds(bounds, available).k, 1);
});

test("视口适配会把节点范围居中到可用区域", () => {
    const viewport = fitCanvasBounds({ left: 100, top: 100, right: 300, bottom: 300 }, { left: 0, top: 0, right: 800, bottom: 600 });
    assert.equal(viewport.k, 2.76);
    assert.equal(viewport.x, 400 - 200 * 2.76);
    assert.equal(viewport.y, 300 - 200 * 2.76);
});

test("视频截帧时间限制在合法范围内", () => {
    assert.equal(resolveVideoFrameTime("first", 10, 4), 0);
    assert.equal(resolveVideoFrameTime("last", 10, 4), 9.999);
    assert.equal(resolveVideoFrameTime("current", 10, 4), 4);
    assert.equal(resolveVideoFrameTime("current", 10, 99), 9.999);
    assert.equal(resolveVideoFrameTime("last", Number.NaN, 2), 0);
});

test("中文输入法组合输入不会被当作回车提交", () => {
    assert.equal(isComposingKeyboardEvent({ isComposing: true }), true);
    assert.equal(isComposingKeyboardEvent({ nativeEvent: { isComposing: true } }), true);
    assert.equal(isComposingKeyboardEvent({ keyCode: 229 }), true);
    assert.equal(isComposingKeyboardEvent({ keyCode: 13 }), false);
});

test("生成偏好导出后可原样导入，未知字段忽略", () => {
    const config = {
        quality: "high",
        imageResolution: "2k",
        imageBackground: "transparent",
        size: "16:9",
        count: "1",
        canvasImageCount: "3",
        videoSeconds: "8",
        videoMode: "first_frame",
        videoGenerateAudio: "true",
        videoWatermark: "false",
        audioVoice: "alloy",
        audioFormat: "mp3",
        audioSpeed: "1",
        audioInstructions: "",
        systemPrompt: "test",
        regenerateExistingNode: true,
        autoFocusOnSelect: true,
        channels: [{ id: "should-not-export" }],
    };
    const file = createPreferenceFile(config as never, "2026-01-01T00:00:00.000Z");
    assert.equal((file.preferences as Record<string, unknown>).channels, undefined);
    assert.deepEqual(parsePreferenceFile(file), file.preferences);

    const imported = parsePreferenceFile({ ...file, preferences: { ...file.preferences, unknown: "x", count: 4 }, extra: true });
    assert.equal(imported.count, "4");
    assert.equal((imported as Record<string, unknown>).unknown, undefined);
});

test("生成偏好导入会拒绝非法结构", () => {
    assert.throws(() => parsePreferenceFile(null), /格式不正确/);
    assert.throws(() => parsePreferenceFile({ preferences: { quality: {} } }), /文本或数字/);
    assert.throws(() => parsePreferenceFile({ preferences: { autoFocusOnSelect: "yes" } }), /true 或 false/);
    assert.throws(() => parsePreferenceFile({ preferences: { unknown: "x" } }), /没有可导入/);
});
