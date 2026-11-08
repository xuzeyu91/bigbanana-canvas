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
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const localStorageValues = new Map();
Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
        getItem: (key) => localStorageValues.get(key) ?? null,
        setItem: (key, value) => localStorageValues.set(key, String(value)),
        removeItem: (key) => localStorageValues.delete(key),
    },
});
Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: globalThis.localStorage } });
globalThis.fetch = async (url) => { throw new Error(`Unexpected external request: ${url}`); };
globalThis.setTimeout = (callback, ms, ...args) => originalSetTimeout(callback, ms === 2500 || ms === 5000 ? 0 : ms, ...args);

try {
    const configApi = await import("@/stores/use-config-store");
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
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

    await test("all Q3/Q4 durations and image modes match the gateway wire types", async () => {
        for (const model of ["viduq3-turbo", "viduq3-pro", "viduq4-preview"]) {
            const minDuration = model === "viduq4-preview" ? 3 : 1;
            const imageCounts = model === "viduq4-preview" ? [1, 2, 15] : [0, 1, 2, 3, 7];
            for (let seconds = minDuration; seconds <= 16; seconds++) {
                const count = imageCounts[(seconds - minDuration) % imageCounts.length];
                const images = Array.from({ length: count }, (_, index) => image(index));
                axios.defaults.adapter = async (request) => {
                    const body = JSON.parse(request.data);
                    if (typeof body.seconds !== "string") {
                        throw new Error("json: cannot unmarshal number into Go struct field .Alias.seconds of type string");
                    }
                    if (Object.hasOwn(body, "input_reference") && typeof body.input_reference !== "string") {
                        throw new Error("json: cannot unmarshal array into Go struct field .Alias.input_reference of type string");
                    }
                    assert.ok(!Object.hasOwn(body, "input_reference"));
                    assert.deepEqual(body.images, images.map((reference) => reference.dataUrl));
                    assert.equal(body.seconds, String(seconds));
                    assert.equal(body.model, model);
                    return result(request, { id: "task_string_seconds", status: "queued" });
                };
                const task = await api.createVideoGenerationTask(config(model, {
                    videoSeconds: String(seconds),
                }), "风筝升起", images);
                assert.deepEqual(task, { id: "task_string_seconds", provider: "openai", model: selectedModel(model) });
            }
        }
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
                assert.deepEqual(body.images, images.map((item) => item.dataUrl));
                assert.equal(body.model, model);
                assert.equal(body.seconds, String(seconds));
                assert.equal(body.resolution, "720p");
                assert.equal(body.audio, true);
                assert.equal(body.aspect_ratio, "9:16");
                for (const old of ["input_reference", "duration", "metadata"]) assert.ok(!Object.hasOwn(body, old));
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
            assert.equal(body.seconds, String(seconds));
            assert.deepEqual(body.images, images.map((item) => item.dataUrl));
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
        assert.deepEqual(body.images, context.referenceImages.map((item) => item.dataUrl));
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

    await test("Sora and Seedance keep existing multipart behavior", async () => {
        for (const [model, seconds, fields] of [
            ["sora-2", "4", ["model", "prompt", "seconds", "size"]],
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
            model: "viduq4-preview", prompt: "风筝", seconds: "3", resolution: "720p",
            audio: true, aspect_ratio: "16:9", images: [image(1).dataUrl],
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

    const omniModel = "gemini-omni-1.2-flash";
    const museOmniConfig = (model, overrides = {}) => config(model, { videoSeconds: "5", ...overrides });
    const videoReference = (index) => ({
        id: `video-${index}`, name: `镜头${index}.mp4`, type: "video/mp4",
        url: `data:video/mp4;base64,${Buffer.from(`offline-video-${index}`).toString("base64")}`,
    });

    await test("removed Veo Fast is excluded from defaults, selections and persisted channels", async () => {
        const removed = selectedModel("veo_3_1-fast");
        assert.ok(!defaultConfig.videoModels.includes(removed));
        assert.ok(!defaultConfig.models.includes(removed));
        assert.ok(!defaultConfig.channels[0].models.includes("veo_3_1-fast"));
        assert.equal(configApi.normalizeModelOptionValue(removed, defaultConfig.channels), "");
        assert.deepEqual(configApi.filterModelsByCapability([removed], "video"), []);
        assert.deepEqual(configApi.filterModelsByCapability([removed]), []);
        const persisted = structuredClone(defaultConfig);
        persisted.channels[0].models.push("veo_3_1-fast");
        persisted.models.push(removed);
        persisted.videoModels.push(removed);
        persisted.videoModel = removed;
        const merged = configApi.useConfigStore.persist.getOptions().merge({ config: persisted }, configApi.useConfigStore.getState()).config;
        assert.ok(!merged.models.includes(removed));
        assert.ok(!merged.videoModels.includes(removed));
        assert.ok(!merged.channels[0].models.includes("veo_3_1-fast"));
        assert.equal(merged.videoModel, selectedModel("sora-2"));
        await assert.rejects(() => api.createVideoGenerationTask(config("veo_3_1-fast"), "风筝"), /渠道不存在/);
    });

    await test("all model lists sort by model name, not channel IDs or selection order", () => {
        const sorted = (models) => [...models].sort((a, b) => configApi.modelOptionName(a).localeCompare(configApi.modelOptionName(b), "en", { numeric: true, sensitivity: "base" }));
        for (const key of ["models", "imageModels", "videoModels", "textModels", "audioModels"]) {
            assert.deepEqual(defaultConfig[key], sorted(defaultConfig[key]));
        }
        assert.deepEqual(defaultConfig.channels[0].models, sorted(defaultConfig.channels[0].models));
        assert.equal(defaultConfig.videoModel, selectedModel("sora-2"));
        const channels = [
            configApi.createModelChannel({ id: "z-channel", models: ["gpt-10", "gpt-2", "gemini-omni-1.2-flash"] }),
            configApi.createModelChannel({ id: "a-channel", models: ["viduq4-preview", "muse-video"] }),
        ];
        const options = configApi.modelOptionsFromChannels(channels);
        assert.deepEqual(options.map(configApi.modelOptionName), ["gemini-omni-1.2-flash", "gpt-2", "gpt-10", "muse-video", "viduq4-preview"]);
        const input = [...options].reverse();
        const cfg = { ...defaultConfig, models: input, videoModels: input };
        assert.deepEqual(configApi.selectableModelsByCapability(cfg), sorted(input));
        assert.deepEqual(configApi.selectableModelsByCapability(cfg, "video").map(configApi.modelOptionName), ["gemini-omni-1.2-flash", "muse-video", "viduq4-preview"]);
        assert.deepEqual(input, [...options].reverse());
        const currentFirst = [selectedModel("sora-2"), ...defaultConfig.videoModels.filter((model) => model !== selectedModel("sora-2"))];
        assert.deepEqual(configApi.filterModelsByCapability(currentFirst, "video"), defaultConfig.videoModels);
    });

    await test("Muse and Omni are video models with per-request prices and documented limits", () => {
        for (const [model, min, max, limit, price] of [
            ["muse-video", 1, 60, 1, "1$/次"],
            [omniModel, 3, 15, 10, "3$/次"],
        ]) {
            for (const name of [model, selectedModel(model), model.toUpperCase()]) {
                assert.equal(configApi.modelMatchesCapability(name, "video"), true);
                assert.equal(configApi.modelMatchesCapability(name, "text"), false);
                assert.equal(configApi.modelMatchesCapability(name, "image"), false);
                const profile = capabilities.resolveVideoModelCapabilities(name);
                assert.deepEqual(profile.supportedDurations, Array.from({ length: max - min + 1 }, (_, index) => index + min));
                assert.equal(profile.defaultDuration, 5);
                assert.equal(profile.referenceImageLimit, limit);
                assert.equal(profile.priceHint, price);
                assert.equal(production.resolveVideoReferenceImageLimit(name), limit);
            }
            assert.ok(defaultConfig.videoModels.includes(selectedModel(model)));
            assert.ok(defaultConfig.channels[0].models.includes(model));
            const geminiChannel = museOmniConfig(model);
            geminiChannel.channels[0].apiFormat = "gemini";
            assert.equal(configApi.resolveModelRequestConfig(geminiChannel, selectedModel(model)).apiFormat, "openai");
        }
        assert.equal(configApi.resolveModelRequestConfig(config("gemini-3-pro-image-preview"), selectedModel("gemini-3-pro-image-preview")).apiFormat, "gemini");
        assert.deepEqual(capabilities.resolveVideoModelCapabilities(omniModel).supportedAspectRatios, ["16:9", "9:16", "auto"]);
        assert.deepEqual(capabilities.resolveVideoModelCapabilities("muse-video").supportedAspectRatios, ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"]);
        assert.equal(capabilities.normalizeVideoAspectRatio("auto", omniModel), "auto");
        assert.equal(capabilities.normalizeVideoAspectRatio("1920x1080", omniModel), "16:9");
        assert.equal(capabilities.normalizeVideoAspectRatio("1080x1920", omniModel), "9:16");
    });

    await test("Muse single-frame JSON preserves every duration and ratio without fixed resolution", async () => {
        const ratios = capabilities.resolveVideoModelCapabilities("muse-video").supportedAspectRatios;
        for (let seconds = 1; seconds <= 60; seconds++) {
            const ratio = ratios[(seconds - 1) % ratios.length];
            axios.defaults.adapter = async (request) => {
                assert.equal(request.url, "/api/new-api/gateway/v1/videos");
                assert.match(request.headers.get("Content-Type"), /application\/json/);
                assert.deepEqual(JSON.parse(request.data), {
                    model: "muse-video", prompt: "风筝升起", seconds: String(seconds),
                    resolution: "auto", aspect_ratio: ratio, image: image(1).dataUrl,
                });
                return result(request, { request_id: "task_muse" });
            };
            const task = await api.createVideoGenerationTask(museOmniConfig("muse-video", { videoSeconds: String(seconds), size: ratio }), " 风筝升起 ", [image(1)]);
            assert.deepEqual(task, { id: "task_muse", provider: "openai", model: selectedModel("muse-video") });
        }
    });

    await test("Omni explicitly distinguishes first frame, first-last frames and multi-reference modes", async () => {
        for (const [mode, count, videoCount] of [
            ["first_frame", 1, 0], ["first_last_frame", 2, 0],
            ["references", 1, 0], ["references", 2, 0], ["references", 10, 0],
            ["references", 0, 3], ["references", 10, 3],
        ]) {
            for (let seconds = 3; seconds <= 15; seconds++) {
                const images = Array.from({ length: count }, (_, index) => image(index));
                const videos = Array.from({ length: videoCount }, (_, index) => videoReference(index));
                const ratio = ["16:9", "9:16", "auto"][(seconds - 3) % 3];
                axios.defaults.adapter = async (request) => {
                    const body = JSON.parse(request.data);
                    assert.equal(body.model, omniModel);
                    assert.equal(body.seconds, String(seconds));
                    assert.equal(body.resolution, "720p");
                    assert.equal(body.aspect_ratio, ratio);
                    for (const key of ["size", "image_size", "duration", "input_reference", "image", "audio", "generate_audio", "watermark"]) assert.equal(Object.hasOwn(body, key), false);
                    if (mode === "references") {
                        assert.deepEqual(body.image_references, images.map((item) => item.dataUrl));
                        assert.deepEqual(body.video_references, videos.map((item) => item.url));
                        assert.equal(Object.hasOwn(body, "first_frame"), false);
                        assert.equal(Object.hasOwn(body, "last_frame"), false);
                        images.forEach((item, index) => assert.ok(body.prompt.includes(`图片${index + 1}：${item.name}`)));
                        videos.forEach((item, index) => assert.ok(body.prompt.includes(`视频${index + 1}：${item.name}`)));
                    } else {
                        assert.equal(body.prompt, "风筝升起");
                        assert.equal(body.first_frame, images[0].dataUrl);
                        assert.equal(body.last_frame, mode === "first_last_frame" ? images[1].dataUrl : undefined);
                        assert.equal(Object.hasOwn(body, "image_references"), false);
                        assert.equal(Object.hasOwn(body, "video_references"), false);
                    }
                    return result(request, { data: { task_id: "task_omni" } });
                };
                const task = await api.createVideoGenerationTask(museOmniConfig(omniModel, { videoMode: mode, videoSeconds: String(seconds), size: ratio }), "风筝升起", images, videos);
                assert.deepEqual(task, { id: "task_omni", provider: "openai", model: selectedModel(omniModel) });
            }
        }
    });

    await test("Muse and Omni reject unsupported or missing assets identically in preflight and API", async () => {
        const source = { id: "video", type: CanvasNodeType.Video, title: "视频", position: { x: 0, y: 0 } };
        for (const [model, mode, images, videos, audios] of [
            ["muse-video", "first_frame", 0, 0, 0], ["muse-video", "first_frame", 2, 0, 0],
            ["muse-video", "first_frame", 1, 1, 0], ["muse-video", "first_frame", 1, 0, 1],
            [omniModel, "first_frame", 0, 0, 0], [omniModel, "first_frame", 2, 0, 0],
            [omniModel, "first_last_frame", 1, 0, 0], [omniModel, "first_last_frame", 3, 0, 0],
            [omniModel, "first_frame", 1, 1, 0], [omniModel, "first_last_frame", 2, 1, 0],
            [omniModel, "references", 0, 0, 0], [omniModel, "references", 11, 0, 0],
            [omniModel, "references", 1, 4, 0], [omniModel, "references", 1, 0, 1],
            [omniModel, "invalid", 1, 0, 0],
        ]) {
            const inputCount = { text: 1, image: images, video: videos, audio: audios };
            const expected = capabilities.museOmniReferenceError(selectedModel(model), mode, inputCount);
            assert.ok(expected);
            const preflight = production.preflightCanvasGeneration({
                node: source, nodes: [source], mode: "video", model: selectedModel(model), videoMode: mode,
                prompt: "风筝", inputCount,
            });
            assert.equal(preflight.canGenerate, false);
            assert.ok(preflight.issues.some((issue) => issue.severity === "error" && issue.message === expected));
            await assert.rejects(() => api.createVideoGenerationTask(
                museOmniConfig(model, { videoMode: mode }), "风筝",
                Array.from({ length: images }, (_, index) => image(index)),
                Array.from({ length: videos }, (_, index) => videoReference(index)),
                Array.from({ length: audios }, () => ({ id: "audio" })),
            ), (error) => error.message === expected);
        }
        const saved = JSON.parse(JSON.stringify({ ...source, metadata: { videoMode: "references" } }));
        assert.equal(production.preflightCanvasGeneration({
            node: saved, nodes: [saved], mode: "video", prompt: "风筝", model: selectedModel(omniModel),
            inputCount: { text: 1, image: 2, video: 1, audio: 0 },
        }).canGenerate, true);
    });

    await test("Muse and Omni reject out-of-range/fractional duration and empty prompts before I/O", async () => {
        for (const [model, invalid] of [["muse-video", ["0", "61", "1.5", "", "abc"]], [omniModel, ["2", "16", "3.5", "", "abc"]]]) {
            for (const seconds of invalid) await assert.rejects(() => api.createVideoGenerationTask(museOmniConfig(model, { videoSeconds: seconds }), "风筝", [image(1)]), /秒的整数/);
            await assert.rejects(() => api.createVideoGenerationTask(museOmniConfig(model), "  ", [image(1)]), /请输入视频提示词/);
        }
    });

    await test("Omni accepts public and local video references and checks exact 20 MiB inline limits", async () => {
        axios.defaults.adapter = async (request) => result(request, { id: "task_asset" });
        const cfg = museOmniConfig(omniModel, { videoMode: "references" });
        await api.createVideoGenerationTask(cfg, "风筝", [], [{ ...videoReference(1), url: "https://example.com/reference.mp4" }]);
        await assert.rejects(() => api.createVideoGenerationTask(cfg, "风筝", [], [{ ...videoReference(1), url: "asset://unsupported" }]), /不支持 asset/);
        await assert.rejects(() => api.createVideoGenerationTask(museOmniConfig("muse-video"), "风筝", [{ ...image(1), dataUrl: "data:text/plain;base64,eA==" }]), /读取失败/);
        for (const kind of ["image", "video"]) {
            for (const bytes of [20 * 1024 * 1024, 20 * 1024 * 1024 + 1]) {
                const url = `data:${kind}/${kind === "image" ? "png" : "mp4"};base64,${Buffer.alloc(bytes).toString("base64")}`;
                const request = () => api.createVideoGenerationTask(cfg, "风筝", kind === "image" ? [{ ...image(1), dataUrl: url }] : [], kind === "video" ? [{ ...videoReference(1), url }] : []);
                if (bytes === 20 * 1024 * 1024) await request();
                else await assert.rejects(request, /超过 20 MiB/);
            }
        }
        const originalReader = globalThis.FileReader;
        const original = globalThis.fetch;
        try {
            globalThis.FileReader = class {
                readAsDataURL(blob) {
                    blob.arrayBuffer().then((buffer) => {
                        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
                        this.onload();
                    }).catch(() => this.onerror());
                }
            };
            globalThis.fetch = async (url) => {
                assert.equal(url, "blob:offline-video");
                return new Response(new Blob(["local-video"], { type: "video/mp4" }));
            };
            axios.defaults.adapter = async (request) => {
                assert.equal(JSON.parse(request.data).video_references[0], "data:video/mp4;base64,bG9jYWwtdmlkZW8=");
                return result(request, { id: "task_local" });
            };
            await api.createVideoGenerationTask(cfg, "风筝", [], [{ ...videoReference(1), url: "blob:offline-video" }]);
        } finally {
            globalThis.fetch = original;
            if (originalReader) globalThis.FileReader = originalReader;
            else delete globalThis.FileReader;
        }
    });

    await test("Muse/Omni creation handles all task IDs and surfaces malformed or failed responses", async () => {
        for (const data of [{}, { id: 42 }, { request_id: "  " }, { status: "failed", error: { message: "upstream rejected" } }]) {
            axios.defaults.adapter = async (request) => result(request, data);
            await assert.rejects(() => api.createVideoGenerationTask(museOmniConfig("muse-video"), "风筝", [image(1)]), /任务 ID|upstream rejected/);
        }
        for (const key of ["id", "request_id", "task_id"]) {
            axios.defaults.adapter = async (request) => result(request, { [key]: " task_native " });
            assert.equal((await api.createVideoGenerationTask(museOmniConfig("muse-video"), "风筝", [image(1)])).id, "task_native");
        }
    });

    await test("Muse/Omni completed tasks always download authenticated gateway content, never returned URLs", async () => {
        for (const model of ["muse-video", omniModel]) {
            const task = { id: "task/encoded?", provider: "openai", model: selectedModel(model) };
            for (const status of ["done", "completed", "succeeded", "success"]) {
                const urls = [];
                axios.defaults.adapter = async (request) => {
                    urls.push(request.url);
                    assert.equal(request.headers.get("Authorization"), "Bearer offline-test-credential");
                    if (request.url.endsWith("/content")) {
                        assert.equal(request.headers.get("Accept"), "video/mp4");
                        assert.equal(request.responseType, "blob");
                        return result(request, new Blob(["offline-video"], { type: "video/mp4" }));
                    }
                    return result(request, { status, video_url: "/v1/videos/task/content", video: { url: "https://untrusted.example.com/video.mp4" } });
                };
                const state = await api.pollVideoGenerationTask(museOmniConfig(model), task);
                assert.equal(state.status, "completed");
                assert.equal(state.result.blob.size, 13);
                assert.equal(Object.hasOwn(state.result, "url"), false);
                assert.deepEqual(urls, ["/api/new-api/gateway/v1/videos/task%2Fencoded%3F", "/api/new-api/gateway/v1/videos/task%2Fencoded%3F/content"]);
            }
            for (const status of ["pending", "queued", "processing", "in_progress", "running"]) {
                axios.defaults.adapter = async (request) => result(request, { status });
                assert.deepEqual(await api.pollVideoGenerationTask(museOmniConfig(model), task), { status: "pending" });
            }
            for (const status of ["failed", "expired", "cancelled", "canceled", "error"]) {
                axios.defaults.adapter = async (request) => result(request, { status, error: { message: "upstream rejected" } });
                assert.deepEqual(await api.pollVideoGenerationTask(museOmniConfig(model), task), { status: "failed", error: "upstream rejected" });
            }
            for (const blob of [
                new Blob([], { type: "video/mp4" }), new Blob(['{"error":{"message":"download failed"}}'], { type: "application/json" }),
                new Blob(["not a video"], { type: "text/plain" }),
            ]) {
                axios.defaults.adapter = async (request) => result(request, request.url.endsWith("/content") ? blob : { status: "done" });
                await assert.rejects(() => api.pollVideoGenerationTask(museOmniConfig(model), task), /返回内容为空|download failed|没有返回视频文件/);
            }
        }
    });

    await test("Muse/Omni polling uses a twenty-minute window and resumes IDs without paid creation", async () => {
        for (const model of ["muse-video", omniModel]) {
            let polls = 0;
            axios.defaults.adapter = async (request) => {
                assert.equal(request.method, "get");
                polls++;
                return result(request, { status: "processing" });
            };
            const task = { id: "task_long", provider: "openai", model: selectedModel(model) };
            await assert.rejects(() => api.resumeVideoGenerationTask(museOmniConfig(model), task), /视频生成超时/);
            assert.equal(polls, 240);
            const controller = new AbortController();
            controller.abort();
            await assert.rejects(() => api.resumeVideoGenerationTask(museOmniConfig(model), task, { signal: controller.signal }), /Aborted/);
            await assert.rejects(() => api.resumeVideoGenerationTask(museOmniConfig(model, { channels: [] }), task), /渠道不存在/);
            axios.defaults.adapter = async (request) => {
                assert.equal(request.method, "get");
                return result(request, request.url.endsWith("/content") ? new Blob(["offline-video"], { type: "video/mp4" }) : { status: "done" });
            };
            assert.equal((await api.resumeVideoGenerationTask(museOmniConfig(model), task)).blob.size, 13);
        }
    });

    await test("Muse/Omni settings display per-request prices, modes and compact duration selection", async () => {
        const { createElement } = await import("react");
        const { renderToStaticMarkup } = await import("react-dom/server");
        const { VideoSettingsPanel } = await import("@/components/video-settings-panel");
        const { canvasThemes } = await import("@/lib/canvas-theme");
        for (const theme of Object.values(canvasThemes)) {
            const muse = renderToStaticMarkup(createElement(VideoSettingsPanel, { config: museOmniConfig("muse-video"), theme, onConfigChange() {} }));
            assert.match(muse, /1\$\/次/);
            assert.match(muse, /按次计费/);
            assert.doesNotMatch(muse, /按秒计费/);
            assert.match(muse, /视频期望时长/);
            assert.match(muse, /1-60/);
            const omni = renderToStaticMarkup(createElement(VideoSettingsPanel, { config: museOmniConfig(omniModel, { videoMode: "references" }), theme, onConfigChange() {} }));
            assert.match(omni, /3\$\/次/);
            assert.match(omni, /按次计费/);
            assert.doesNotMatch(omni, /按秒计费/);
            for (const text of ["首帧", "首尾帧", "多参考", "自适应", "1-10"]) assert.ok(omni.includes(text));
            assert.match(omni, />3s</);
            assert.match(omni, />15s</);
            assert.doesNotMatch(omni, />1s</);
        }
        const { CanvasConfigNodePanel } = await import("@/app/(user)/canvas/components/canvas-config-node-panel");
        for (const [mode, label] of [["first_frame", "首帧"], ["first_last_frame", "首尾帧"], ["references", "多参考"]]) {
            const node = JSON.parse(JSON.stringify({
                id: "config", type: CanvasNodeType.Config, metadata: { generationMode: "video", videoModel: selectedModel(omniModel), videoMode: mode },
            }));
            const html = renderToStaticMarkup(createElement(CanvasConfigNodePanel, {
                node, isRunning: false, inputSummary: { textCount: 1, imageCount: 2, videoCount: 0, audioCount: 0 },
                onConfigChange() {}, onGenerate() {}, onStop() {}, onComposerToggle() {},
            }));
            assert.ok(html.includes(`${label} · `));
        }
    });

    await test("same-origin proxy preserves all Muse/Omni native fields and protected video downloads", async () => {
        const route = await import("@/app/api/new-api/[...path]/route");
        const original = globalThis.fetch;
        try {
            for (const assets of [
                { model: "muse-video", resolution: "auto", image: image(1).dataUrl },
                { model: omniModel, first_frame: image(1).dataUrl },
                { model: omniModel, first_frame: image(1).dataUrl, last_frame: image(2).dataUrl },
                { model: omniModel, image_references: [image(1).dataUrl, image(2).dataUrl], video_references: [videoReference(1).url] },
            ]) {
                const body = { prompt: "风筝", seconds: "5", aspect_ratio: "16:9", ...assets };
                globalThis.fetch = async (url, init) => {
                    assert.equal(url, "https://api.antsk.cn/v1/videos");
                    assert.equal(init.headers.get("Authorization"), "Bearer offline-test-credential");
                    assert.deepEqual(await new Response(init.body).json(), body);
                    return Response.json({ id: "task_proxy", status: "pending" });
                };
                const request = new Request("https://canvas.example.com/api/new-api/gateway/v1/videos", {
                    method: "POST", headers: { Authorization: "Bearer offline-test-credential", "Content-Type": "application/json" }, body: JSON.stringify(body),
                });
                request.nextUrl = new URL(request.url);
                assert.deepEqual(await (await route.POST(request, { params: Promise.resolve({ path: ["gateway", "v1", "videos"] }) })).json(), { id: "task_proxy", status: "pending" });
            }
            globalThis.fetch = async (url, init) => {
                assert.equal(url, "https://api.antsk.cn/v1/videos/task_proxy/content");
                assert.equal(init.headers.get("Authorization"), "Bearer offline-test-credential");
                return new Response(new Blob(["offline-video"], { type: "video/mp4" }));
            };
            const request = new Request("https://canvas.example.com/api/new-api/gateway/v1/videos/task_proxy/content", { headers: { Authorization: "Bearer offline-test-credential" } });
            request.nextUrl = new URL(request.url);
            const response = await route.GET(request, { params: Promise.resolve({ path: ["gateway", "v1", "videos", "task_proxy", "content"] }) });
            assert.equal((await response.blob()).size, 13);
            assert.equal(response.headers.get("Content-Type"), "video/mp4");
        } finally {
            globalThis.fetch = original;
        }
    });

    console.log(`\n${passed} video regression groups passed (offline; no billable API calls).`);
} finally {
    axios.defaults.adapter = originalAdapter;
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    else delete globalThis.localStorage;
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else delete globalThis.window;
    hooks.deregister();
}
