import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { getEventListeners } from "node:events";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import axios from "axios";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "src");
const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        const base = specifier.startsWith("@/")
            ? path.join(sourceRoot, specifier.slice(2))
            : specifier.startsWith(".") && context.parentURL?.startsWith(pathToFileURL(sourceRoot).href)
              ? fileURLToPath(new URL(specifier, context.parentURL))
              : "";
        if (base) {
            const file = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")].find((candidate) => existsSync(candidate) && /\.(ts|tsx)$/.test(candidate));
            if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
        if (url.startsWith(pathToFileURL(sourceRoot).href) && /\.tsx?$/.test(url)) {
            const source = ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
                fileName: fileURLToPath(url),
                compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
            }).outputText;
            return { format: "module", source, shortCircuit: true };
        }
        return nextLoad(url, context);
    },
});

const originalAdapter = axios.defaults.adapter;
const originalFetch = globalThis.fetch;
const originalSetTimeout = globalThis.setTimeout;
globalThis.fetch = async (url) => { throw new Error(`Unexpected external request: ${url}`); };
globalThis.setTimeout = (callback, ms, ...args) => originalSetTimeout(callback, ms === 2500 || ms === 5000 ? 0 : ms, ...args);

try {
    const configApi = await import("@/stores/use-config-store");
    const api = await import("@/services/api/video");
    const capabilities = await import("@/lib/video-model-capabilities");
    const production = await import("@/app/(user)/canvas/utils/canvas-production");
    const generation = await import("@/app/(user)/canvas/components/canvas-node-generation");
    const { CanvasNodeType } = await import("@/app/(user)/canvas/types");
    const { defaultConfig, encodeChannelModel } = configApi;
    const selectedModel = (model) => encodeChannelModel("default", model);
    const config = (model, overrides = {}) => ({
        ...structuredClone(defaultConfig),
        model: selectedModel(model),
        videoModel: selectedModel(model),
        videoSeconds: model.includes("q4") ? "3" : "1",
        channels: defaultConfig.channels.map((channel) => ({ ...channel, models: [...channel.models], apiKey: "offline-test-credential" })),
        ...overrides,
    });
    const image = (index, name = `参考${index}.png`) => ({
        id: `image-${index}`, name, type: "image/png",
        dataUrl: `data:image/png;base64,${Buffer.from(`offline-image-${index}`).toString("base64")}`,
    });
    const result = (request, data, status = 200) => ({ data, status, statusText: "OK", headers: {}, config: request });
    let passed = 0;
    const test = async (name, fn) => {
        axios.defaults.adapter = async (request) => { throw new Error(`Unexpected HTTP request: ${request.method} ${request.url}`); };
        await fn();
        passed++;
        console.log(`PASS ${name}`);
    };

    await test("default Q4 model, durations, pricing and reference limits", () => {
        for (const [model, min, maxImages, price] of [
            ["viduq3-turbo", 1, 7, "0.4$/秒"],
            ["viduq3-pro", 1, 7, "0.875$/秒"],
            ["viduq4-preview", 3, 15, "0.875$/秒"],
        ]) {
            assert.ok(defaultConfig.videoModels.includes(selectedModel(model)));
            assert.ok(defaultConfig.channels[0].models.includes(model));
            for (const name of [model, selectedModel(model), model.replace("vidu", "vidu-")]) {
                const profile = capabilities.resolveVideoModelCapabilities(name);
                assert.deepEqual(profile.supportedDurations, Array.from({ length: 17 - min }, (_, i) => i + min));
                assert.equal(profile.defaultDuration, 8);
                assert.equal(profile.priceHint, price);
                assert.equal(profile.referenceImageLimit, maxImages);
                assert.equal(production.resolveVideoReferenceImageLimit(name), maxImages);
                assert.equal(capabilities.isViduGatewayModel(name), true);
                assert.equal(capabilities.normalizeVideoDuration(String(min), name), min);
                assert.deepEqual(profile.supportedAspectRatios, ["16:9", "9:16"]);
            }
        }
        assert.match(capabilities.resolveVideoModelCapabilities("viduq4-preview").description, /Vidu 最强参考模型/);
        assert.equal(capabilities.resolveVideoModelCapabilities("viduq4-preview").requiresReferenceImage, true);
        assert.equal(capabilities.isViduGatewayModel("viduq2-pro"), false);
        assert.equal(production.resolveVideoReferenceImageLimit("sora-2"), 1);
        assert.equal(production.resolveVideoReferenceImageLimit("veo_3_1-fast"), 2);
        assert.equal(production.resolveVideoReferenceImageLimit("doubao-seedance-2-0-fast"), 4);
    });

    await test("Q4 empty images are blocked in both UI preflight and API before I/O", async () => {
        const source = { id: "video", type: CanvasNodeType.Video, title: "视频", position: { x: 0, y: 0 } };
        for (const model of ["viduq4-preview", selectedModel("viduq4-preview")]) {
            const preflight = production.preflightCanvasGeneration({
                node: source, nodes: [source], mode: "video", prompt: "一只风筝升起", model,
                inputCount: { text: 1, image: 0, video: 0, audio: 0 },
            });
            assert.equal(preflight.canGenerate, false);
            assert.ok(preflight.issues.some((issue) => issue.severity === "error" && issue.message.includes("不支持纯文本生成")));
        }
        await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "一只风筝升起"), /不支持纯文本生成/);
        await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [], [{ id: "video" }]), /不支持参考视频或参考音频/);
        await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [], [], [{ id: "audio" }]), /不支持参考视频或参考音频/);
    });

    await test("Q3 0/1/2/3/7 image requests use new top-level bridge fields in order", async () => {
        for (const model of ["viduq3-turbo", "viduq3-pro"]) {
            for (const count of [0, 1, 2, 3, 7]) {
                const images = Array.from({ length: count }, (_, i) => image(i));
                let body;
                axios.defaults.adapter = async (request) => {
                    assert.equal(request.url, "/api/new-api/gateway/v1/videos");
                    assert.equal(request.method, "post");
                    assert.equal(request.headers.get("Authorization"), "Bearer offline-test-credential");
                    assert.match(request.headers.get("Content-Type"), /application\/json/);
                    body = JSON.parse(request.data);
                    return result(request, { id: "task_q3", status: "queued" });
                };
                const seconds = count === 7 ? 16 : 1;
                const task = await api.createVideoGenerationTask(config(model, { size: "9:16", videoSeconds: String(seconds) }), "风筝升起", images);
                assert.deepEqual(task, { id: "task_q3", provider: "openai", model: selectedModel(model) });
                assert.deepEqual(body.input_reference, images.map((item) => item.dataUrl));
                assert.equal(body.model, model);
                assert.equal(body.seconds, seconds);
                assert.equal(body.resolution, "720p");
                assert.equal(body.audio, true);
                assert.equal(body.aspect_ratio, "9:16");
                for (const old of ["images", "duration", "metadata"]) assert.ok(!Object.hasOwn(body, old));
                if (count < 3) assert.equal(body.prompt, "风筝升起");
                else assert.ok(body.prompt.includes(`[@${count}]（图片${count}）`));
            }
        }
    });

    await test("Q4 sends all 1/2/15 images as references, never as start/end frames", async () => {
        for (const count of [1, 2, 15]) {
            const images = Array.from({ length: count }, (_, i) => image(i));
            let body;
            axios.defaults.adapter = async (request) => {
                body = JSON.parse(request.data);
                return result(request, { id: "task_q4", status: "queued" });
            };
            const seconds = count === 15 ? 16 : 3;
            const task = await api.createVideoGenerationTask(config("viduq4-preview", { videoSeconds: String(seconds) }), "风筝在图片1中升起", images);
            assert.equal(task.provider, "openai");
            assert.equal(body.model, "viduq4-preview");
            assert.equal(body.seconds, seconds);
            assert.deepEqual(body.input_reference, images.map((item) => item.dataUrl));
            if (count > 1) {
                assert.match(body.prompt, /不强制首尾帧/);
                assert.ok(body.prompt.includes(`[@${count}]（图片${count}）`));
            }
        }
    });

    await test("connected scene, character and prop retain original order and prompt labels", async () => {
        const nodes = [
            { id: "video", type: CanvasNodeType.Video, title: "结果", position: { x: 0, y: 0 } },
            ...["场景", "角色", "道具"].map((name, i) => ({
                id: `image-${i}`, type: CanvasNodeType.Image, title: name, position: { x: 0, y: 0 },
                metadata: { content: image(i).dataUrl, resourceRole: ["scene", "character", "prop"][i] },
            })),
        ];
        const connections = nodes.slice(1).map((node, i) => ({ id: `link-${i}`, fromNodeId: node.id, toNodeId: "video" }));
        const context = await generation.hydrateNodeGenerationContext(generation.buildNodeGenerationContext("video", nodes, connections, "角色拿起道具"));
        assert.equal(context.imageCount, 3);
        let body;
        axios.defaults.adapter = async (request) => {
            body = JSON.parse(request.data);
            return result(request, { id: "task_assets" });
        };
        await api.createVideoGenerationTask(config("viduq4-preview"), context.prompt, context.referenceImages);
        assert.deepEqual(body.input_reference, context.referenceImages.map((item) => item.dataUrl));
        for (const [i, reference] of context.referenceImages.entries()) {
            assert.ok(body.prompt.includes(`[@${i + 1}]（图片${i + 1}）：${reference.name}`));
        }
    });

    await test("invalid durations, too many images and empty prompt fail before any HTTP request", async () => {
        for (const [model, values, overLimit] of [
            ["viduq3-pro", ["", "0", "1.5", "17", "bad"], 8],
            ["viduq4-preview", ["1", "2", "3.5", "17"], 16],
        ]) {
            for (const seconds of values) {
                await assert.rejects(() => api.createVideoGenerationTask(config(model, { videoSeconds: seconds }), "风筝", [image(1)]), /时长必须为/);
            }
            await assert.rejects(() => api.createVideoGenerationTask(config(model), "风筝",
                Array.from({ length: overLimit }, (_, i) => image(i))), /最多支持/);
            await assert.rejects(() => api.createVideoGenerationTask(config(model), " ", [image(1)]), /请输入视频提示词/);
            await assert.rejects(() => api.createVideoGenerationTask(config(model), "风".repeat(20001), [image(1)]), /20000/);
            await assert.rejects(() => api.createVideoGenerationTask(config(model), "风筝", [{ ...image(1), dataUrl: "" }]), /读取失败/);
        }
        const huge = { ...image(1), dataUrl: `data:image/png;base64,${"A".repeat(20 * 1024 * 1024)}` };
        await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [huge]), /20 MB/);
    });

    await test("preflight accepts Q3 zero/two/seven and Q4 one/two/fifteen images", () => {
        const node = { id: "video", type: CanvasNodeType.Video };
        for (const [model, counts, max] of [
            ["viduq3-turbo", [0, 2, 7], 7],
            ["viduq4-preview", [1, 2, 15], 15],
        ]) {
            for (const count of counts) {
                assert.equal(production.preflightCanvasGeneration({
                    node, nodes: [node], mode: "video", prompt: "风筝", model: selectedModel(model),
                    inputCount: { text: 1, image: count, video: 0, audio: 0 },
                }).canGenerate, true);
            }
            assert.equal(production.preflightCanvasGeneration({
                node, nodes: [node], mode: "video", prompt: "风筝", model,
                inputCount: { text: 1, image: max + 1, video: 0, audio: 0 },
            }).canGenerate, false);
        }
    });

    await test("Vidu creation errors preserve upstream messages and failed states", async () => {
        for (const message of ["invalid duration", "account denied", "rate limited", "upstream unavailable"]) {
            axios.defaults.adapter = async (request) => {
                throw new axios.AxiosError("request failed", "ERR_BAD_REQUEST", request, undefined,
                    result(request, { error: { message } }, 400));
            };
            await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [image(1)]), new RegExp(message));
        }
        axios.defaults.adapter = async (request) => result(request, { id: "task_failed", status: "failed", error: { message: "Vidu upstream rejected" } });
        await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [image(1)]), /Vidu upstream rejected/);
        axios.defaults.adapter = async (request) => result(request, { status: "queued" });
        await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [image(1)]), /没有返回任务 ID/);
    });

    await test("video response envelopes preserve tasks and explicit error responses", async () => {
        for (const payload of [
            { code: 0, data: { id: "task_envelope", status: "queued" } },
            { success: true, data: { id: "task_envelope", status: "queued" } },
            { id: "task_envelope", data: { status: "queued" } },
        ]) {
            axios.defaults.adapter = async (request) => result(request, payload);
            assert.equal((await api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [image(1)])).id, "task_envelope");
        }
        for (const payload of [
            { code: 400, msg: "invalid reference" },
            { success: false, message: "invalid reference" },
        ]) {
            axios.defaults.adapter = async (request) => result(request, payload);
            await assert.rejects(() => api.createVideoGenerationTask(config("viduq4-preview"), "风筝", [image(1)]), /invalid reference/);
        }
    });

    await test("create, resume and content download preserve task model, ID and gateway", async () => {
        const calls = [];
        const events = [];
        let polls = 0;
        axios.defaults.adapter = async (request) => {
            calls.push([request.method, request.url]);
            if (request.method === "post") return result(request, { id: "task_restore", status: "queued" });
            if (request.url.endsWith("/content")) return result(request, new Blob(["offline-video"], { type: "video/mp4" }));
            return result(request, { id: "task_restore", status: ++polls === 1 ? "in_progress" : "completed" });
        };
        const output = await api.requestVideoGeneration(config("viduq4-preview"), "风筝", [image(1)], [], [], {
            onTaskCreated: (task) => events.push(task),
        });
        assert.equal(output.blob.size, 13);
        assert.deepEqual(events, [{ id: "task_restore", provider: "openai", model: selectedModel("viduq4-preview") }]);
        assert.deepEqual(calls, [
            ["post", "/api/new-api/gateway/v1/videos"],
            ["get", "/api/new-api/gateway/v1/videos/task_restore"],
            ["get", "/api/new-api/gateway/v1/videos/task_restore"],
            ["get", "/api/new-api/gateway/v1/videos/task_restore/content"],
        ]);
        calls.length = 0;
        await api.resumeVideoGenerationTask(config("viduq4-preview"), events[0]);
        assert.equal(calls[0][1], "/api/new-api/gateway/v1/videos/task_restore");
        assert.ok(!calls.some(([method]) => method === "post"));
    });

    await test("polling supports direct status URLs, JSON content URLs and failed state details", async () => {
        const task = { id: "task_urls", provider: "openai", model: selectedModel("viduq4-preview") };
        for (const useContent of [false, true]) {
            axios.defaults.adapter = async (request) => {
                if (request.url === "https://example.com/result.mp4") return result(request, new Blob(["offline-video"], { type: "video/mp4" }));
                if (request.url.endsWith("/content")) return result(request, new Blob([JSON.stringify({ url: "https://example.com/result.mp4" })], { type: "application/json" }));
                return result(request, { id: task.id, status: "completed", ...(!useContent ? { video_url: "https://example.com/result.mp4" } : {}) });
            };
            const state = await api.pollVideoGenerationTask(config("viduq4-preview"), task);
            assert.equal(state.status, "completed");
            assert.equal(state.result.blob.size, 13);
        }
        axios.defaults.adapter = async (request) => result(request, { status: "failed", error: { message: "upstream model failed" } });
        const state = await api.pollVideoGenerationTask(config("viduq4-preview"), task);
        assert.deepEqual(state, { status: "failed", error: "upstream model failed" });
    });

    await test("Vidu polling allows long-running tasks beyond the old five-minute attempt cap", async () => {
        let polls = 0;
        axios.defaults.adapter = async (request) => {
            polls++;
            return result(request, { status: "queued" });
        };
        await assert.rejects(() => api.resumeVideoGenerationTask(config("viduq4-preview"), {
            id: "task_long", provider: "openai", model: selectedModel("viduq4-preview"),
        }), /视频生成超时/);
        assert.equal(polls, 720);
    });

    await test("cancelled and missing-channel tasks cannot restart or switch channels", async () => {
        const task = { id: "task_cancel", provider: "openai", model: selectedModel("viduq4-preview") };
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(() => api.resumeVideoGenerationTask(config("viduq4-preview"), task, { signal: controller.signal }), /Aborted/);
        await assert.rejects(() => api.resumeVideoGenerationTask(config("viduq4-preview", { channels: [] }), task), /渠道不存在/);
    });

    await test("long-running polling cleans up abort listeners after each wait", async () => {
        const controller = new AbortController();
        let polls = 0;
        axios.defaults.adapter = async (request) => {
            if (request.url.endsWith("/content")) return result(request, new Blob(["offline-video"], { type: "video/mp4" }));
            return result(request, { status: ++polls <= 130 ? "in_progress" : "completed" });
        };
        await api.resumeVideoGenerationTask(config("viduq4-preview"), {
            id: "task_listeners", provider: "openai", model: selectedModel("viduq4-preview"),
        }, { signal: controller.signal });
        assert.equal(polls, 131);
        assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    });

    await test("aborting during a polling wait stops the task and releases its listener", async () => {
        const controller = new AbortController();
        let polls = 0;
        axios.defaults.adapter = async (request) => {
            polls++;
            originalSetTimeout(() => controller.abort(), 0);
            return result(request, { status: "in_progress" });
        };
        await assert.rejects(() => api.resumeVideoGenerationTask(config("viduq4-preview"), {
            id: "task_abort_wait", provider: "openai", model: selectedModel("viduq4-preview"),
        }, { signal: controller.signal }), (error) => error.name === "AbortError");
        assert.equal(polls, 1);
        assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    });

    await test("Sora, Veo and Seedance keep existing multipart behavior", async () => {
        for (const [model, seconds, fields] of [
            ["sora-2", "4", ["model", "prompt", "seconds", "size"]],
            ["veo_3_1-fast", "8", ["model", "prompt", "seconds", "size"]],
            ["doubao-seedance-2-0-fast", "5", ["model", "prompt", "seconds", "size"]],
        ]) {
            axios.defaults.adapter = async (request) => {
                assert.ok(request.data instanceof FormData);
                assert.deepEqual([...request.data.keys()], fields);
                assert.equal(request.data.get("model"), model);
                assert.equal(request.data.get("seconds"), seconds);
                return result(request, { id: "task_other" });
            };
            assert.equal((await api.createVideoGenerationTask(config(model, { videoSeconds: seconds }), "风筝")).provider, "openai");
        }
    });

    await test("settings UI displays Q4 text-generation restriction, pricing and duration controls", async () => {
        const { createElement } = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { VideoSettingsPanel } = await import("@/components/video-settings-panel");
        const { canvasThemes } = await import("@/lib/canvas-theme");
        const theme = Object.values(canvasThemes)[0];
        const html = renderToStaticMarkup(createElement(VideoSettingsPanel, {
            config: config("viduq4-preview"), theme, onConfigChange() {},
        }));
        assert.match(html, /Vidu 最强参考模型/);
        assert.match(html, /不支持纯文本生成/);
        assert.match(html, /0\.875\$\/秒/);
        assert.match(html, />3s</);
        assert.match(html, />16s</);
        assert.doesNotMatch(html, />1s</);
        assert.doesNotMatch(html, />2s</);
    });

    await test("same-origin gateway transparently forwards new Vidu JSON and poll/content responses", async () => {
        const route = await import("@/app/api/new-api/[...path]/route");
        const payload = {
            model: "viduq4-preview", prompt: "风筝", seconds: 3, resolution: "720p",
            audio: true, aspect_ratio: "16:9", input_reference: [image(1).dataUrl],
        };
        const original = globalThis.fetch;
        try {
            globalThis.fetch = async (url, init) => {
                assert.equal(url, "https://api.antsk.cn/v1/videos");
                assert.equal(init.headers.get("Authorization"), "Bearer offline-test-credential");
                const forwarded = await new Response(init.body).json();
                assert.deepEqual(forwarded, payload);
                return Response.json({ id: "task_proxy", status: "queued" });
            };
            const request = new Request("https://canvas.example.com/api/new-api/gateway/v1/videos", {
                method: "POST", headers: { Authorization: "Bearer offline-test-credential", "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            request.nextUrl = new URL(request.url);
            const context = { params: Promise.resolve({ path: ["gateway", "v1", "videos"] }) };
            const created = await route.POST(request, context);
            assert.deepEqual(await created.json(), { id: "task_proxy", status: "queued" });
            for (const suffix of ["task_proxy", "task_proxy/content?mode=url"]) {
                globalThis.fetch = async (url) => {
                    assert.equal(url, `https://api.antsk.cn/v1/videos/${suffix}`);
                    return Response.json({ url: "https://example.com/video.mp4" });
                };
                const poll = new Request(`https://canvas.example.com/api/new-api/gateway/v1/videos/${suffix}`);
                poll.nextUrl = new URL(poll.url);
                const response = await route.GET(poll, { params: Promise.resolve({ path: ["gateway", "v1", "videos", ...suffix.split("/")] }) });
                assert.deepEqual(await response.json(), { url: "https://example.com/video.mp4" });
            }
        } finally {
            globalThis.fetch = original;
        }
    });

    console.log(`\n${passed} Vidu regression groups passed (offline; no billable API calls).`);
} finally {
    axios.defaults.adapter = originalAdapter;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    hooks.deregister();
}
