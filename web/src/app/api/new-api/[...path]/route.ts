import crypto from "node:crypto";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type UnknownRecord = Record<string, unknown>;

type NewApiEnvelope<T = unknown> = {
    success: boolean;
    message: string;
    data: T;
    url?: string;
};

type SessionUser = {
    id?: number;
    [key: string]: unknown;
};

type ProxySession = {
    endpoint: string;
    upstreamJar: Record<string, string>;
    user: SessionUser | null;
    pendingTwoFactor: boolean;
    expiresAt: number;
};

type LocalSessionResult = {
    sessionId: string;
    session: ProxySession;
};

const SESSION_COOKIE_NAME = "infinite_canvas_new_api_sid";
const SESSION_TTL_SECONDS = parseInteger(process.env.NEW_API_PROXY_SESSION_TTL, 7 * 24 * 60 * 60);
const DEFAULT_NEW_API_ENDPOINT = normalizeEndpoint(process.env.NEW_API_PROXY_DEFAULT_ENDPOINT || "https://api.antsk.cn");
const ALLOW_PRIVATE_HOSTS = String(process.env.NEW_API_ALLOW_PRIVATE_HOSTS || "").toLowerCase() === "true";
const ALLOWED_HOST_SUFFIXES = parseAllowedHosts(process.env.NEW_API_ALLOWED_HOSTS);
const SESSION_STORE_KEY = "__INFINITE_CANVAS_NEW_API_SESSIONS__";
const GATEWAY_PATH_PREFIX = "/gateway";
const GATEWAY_ROUTE_PREFIX = "/api/new-api/gateway";
const HOP_BY_HOP_HEADERS = new Set([
    "connection",
    "content-encoding",
    "content-length",
    "cookie",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "set-cookie",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "host",
]);

function parseInteger(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseAllowedHosts(rawHosts: string | undefined) {
    const configured = String(rawHosts || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
    return configured.length ? configured : ["api.antsk.cn"];
}

function normalizeEndpoint(value: string) {
    return String(value || "").trim().replace(/\/+$/, "");
}

function getSessionStore() {
    const state = globalThis as typeof globalThis & { [SESSION_STORE_KEY]?: Map<string, ProxySession> };
    if (!state[SESSION_STORE_KEY]) state[SESSION_STORE_KEY] = new Map<string, ProxySession>();
    return state[SESSION_STORE_KEY];
}

function buildQueryString(params: Record<string, string | number | undefined | null>) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        query.set(key, String(value));
    });
    const queryString = query.toString();
    return queryString ? `?${queryString}` : "";
}

function jsonResponse(status: number, payload: NewApiEnvelope<unknown> | UnknownRecord, headers?: HeadersInit) {
    return Response.json(payload, { status, headers });
}

async function readBody(request: NextRequest) {
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) return {} as UnknownRecord;
    try {
        return (await request.json()) as UnknownRecord;
    } catch {
        return {} as UnknownRecord;
    }
}

function normalizeMaybeString(value: unknown) {
    if (value === undefined || value === null) return undefined;
    const normalized = String(value).trim();
    return normalized ? normalized : undefined;
}

function isPrivateHostname(hostname: string) {
    const lower = hostname.toLowerCase();
    if (lower === "localhost" || lower === "::1") return true;
    if (/^127\./.test(lower)) return true;
    if (/^10\./.test(lower)) return true;
    if (/^192\.168\./.test(lower)) return true;
    const match172 = lower.match(/^172\.(\d+)\./);
    if (!match172) return false;
    const secondOctet = Number.parseInt(match172[1], 10);
    return secondOctet >= 16 && secondOctet <= 31;
}

function validateEndpoint(value: string) {
    const normalized = normalizeEndpoint(value);
    if (!normalized) throw new Error("缺少 EndPoint");
    let url: URL;
    try {
        url = new URL(normalized);
    } catch {
        throw new Error("EndPoint 格式不正确");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("EndPoint 仅支持 http/https");
    if (!ALLOW_PRIVATE_HOSTS && isPrivateHostname(url.hostname)) throw new Error("不允许访问私网或本地地址");
    const host = url.hostname.toLowerCase();
    const allowed = ALLOWED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
    if (!allowed) throw new Error("该 EndPoint 不在允许列表中");
    return normalized;
}

function getCookieSecureFlag(request: NextRequest) {
    const forwardedProto = String(request.headers.get("x-forwarded-proto") || "").toLowerCase();
    if (forwardedProto === "https") return true;
    return request.nextUrl.protocol === "https:";
}

function buildSessionCookie(request: NextRequest, sessionId: string, maxAgeSeconds: number) {
    const parts = [`${SESSION_COOKIE_NAME}=${sessionId}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${maxAgeSeconds}`];
    if (getCookieSecureFlag(request)) parts.push("Secure");
    return parts.join("; ");
}

function appendSetCookie(headers: Headers, cookieValue: string) {
    headers.append("set-cookie", cookieValue);
}

function parseSetCookieLines(response: Response) {
    const responseHeaders = response.headers as Headers & { getSetCookie?: () => string[] };
    if (typeof responseHeaders.getSetCookie === "function") return responseHeaders.getSetCookie();
    const raw = response.headers.get("set-cookie");
    return raw ? [raw] : [];
}

function mergeSetCookieIntoJar(jar: Record<string, string>, response: Response) {
    parseSetCookieLines(response).forEach((line) => {
        const firstPart = String(line).split(";", 1)[0]?.trim();
        if (!firstPart) return;
        const separatorIndex = firstPart.indexOf("=");
        if (separatorIndex <= 0) return;
        const key = firstPart.slice(0, separatorIndex).trim();
        const value = firstPart.slice(separatorIndex + 1).trim();
        if (!key) return;
        jar[key] = value;
    });
}

function cookieJarToHeader(jar: Record<string, string>) {
    return Object.entries(jar)
        .filter(([key, value]) => key && value)
        .map(([key, value]) => `${key}=${value}`)
        .join("; ");
}

function cleanupExpiredSessions() {
    const now = Date.now();
    const store = getSessionStore();
    for (const [sessionId, session] of store.entries()) {
        if (!session.expiresAt || session.expiresAt <= now) store.delete(sessionId);
    }
}

function getLocalSession(request: NextRequest): LocalSessionResult | null {
    cleanupExpiredSessions();
    const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionId) return null;
    const store = getSessionStore();
    const session = store.get(sessionId);
    if (!session) return null;
    session.expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
    return { sessionId, session };
}

function saveLocalSession(session: Omit<ProxySession, "expiresAt">) {
    const store = getSessionStore();
    const sessionId = crypto.randomUUID();
    store.set(sessionId, {
        ...session,
        expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    });
    return sessionId;
}

function updateLocalSession(sessionId: string, patch: Partial<ProxySession>) {
    const store = getSessionStore();
    const current = store.get(sessionId);
    if (!current) return;
    store.set(sessionId, {
        ...current,
        ...patch,
        expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    });
}

function destroyLocalSession(sessionId?: string) {
    if (!sessionId) return;
    getSessionStore().delete(sessionId);
}

async function parseUpstreamJson(response: Response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return { success: false, message: text, data: null };
    }
}

function normalizeUpstreamEnvelope(response: Response, payload: unknown): NewApiEnvelope<unknown> {
    if (payload && typeof payload === "object" && "success" in (payload as UnknownRecord)) {
        return payload as NewApiEnvelope<unknown>;
    }
    if (payload === null) {
        return {
            success: response.ok,
            message: response.ok ? "" : `Upstream returned an empty response (HTTP ${response.status || 500})`,
            data: null,
        };
    }
    if (payload && typeof payload === "object" && ("message" in (payload as UnknownRecord) || "data" in (payload as UnknownRecord) || "url" in (payload as UnknownRecord))) {
        const record = payload as UnknownRecord;
        const rawMessage = typeof record.message === "string" ? record.message.trim() : "";
        const normalizedMessage = rawMessage.toLowerCase();
        const success = response.ok && !["error", "fail", "failed"].includes(normalizedMessage);
        return {
            success,
            message: success && normalizedMessage === "success" ? "" : rawMessage,
            data: record.data ?? null,
            ...(typeof record.url === "string" && record.url ? { url: record.url } : {}),
        };
    }
    if (response.ok) {
        return { success: true, message: "", data: payload };
    }
    return {
        success: false,
        message: typeof payload === "string" && payload ? payload : `Upstream response error (HTTP ${response.status || 500})`,
        data: null,
    };
}

async function callNewApi(options: {
    endpoint: string;
    path: string;
    method?: string;
    body?: unknown;
    jar?: Record<string, string>;
    userId?: number;
}) {
    const headers = new Headers({ Accept: "application/json" });
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    const cookieHeader = cookieJarToHeader(options.jar || {});
    if (cookieHeader) headers.set("Cookie", cookieHeader);
    if (options.userId) headers.set("New-Api-User", String(options.userId));
    return fetch(`${options.endpoint}${options.path}`, {
        method: options.method || "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        redirect: "follow",
    });
}

function getRequestEndpoint(request: NextRequest, body: UnknownRecord) {
    const fromBody = normalizeMaybeString(body.endpoint);
    const fromQuery = normalizeMaybeString(request.nextUrl.searchParams.get("endpoint"));
    return validateEndpoint(fromBody || fromQuery || DEFAULT_NEW_API_ENDPOINT);
}

function withClearedSessionCookie(request: NextRequest, headers = new Headers()) {
    appendSetCookie(headers, buildSessionCookie(request, "", 0));
    return headers;
}

function copyGatewayRequestHeaders(request: NextRequest) {
    const headers = new Headers();
    request.headers.forEach((value, key) => {
        const normalizedKey = key.toLowerCase();
        if (!normalizedKey || HOP_BY_HOP_HEADERS.has(normalizedKey)) return;
        headers.set(key, value);
    });
    return headers;
}

function copyGatewayResponseHeaders(headers: Headers) {
    const result = new Headers();
    headers.forEach((value, key) => {
        const normalizedKey = key.toLowerCase();
        if (!normalizedKey || HOP_BY_HOP_HEADERS.has(normalizedKey)) return;
        result.set(key, value);
    });
    return result;
}

async function proxyGatewayRequest(request: NextRequest) {
    const endpoint = validateEndpoint(DEFAULT_NEW_API_ENDPOINT);
    const upstreamPath = request.nextUrl.pathname.slice(GATEWAY_ROUTE_PREFIX.length) || "/";
    const upstreamUrl = `${endpoint}${upstreamPath}${request.nextUrl.search}`;
    const method = request.method.toUpperCase();
    const init: RequestInit & { duplex?: "half" } = {
        method,
        headers: copyGatewayRequestHeaders(request),
        redirect: "follow",
    };

    if (!["GET", "HEAD"].includes(method)) {
        init.body = request.body;
        init.duplex = "half";
    }

    const response = await fetch(upstreamUrl, init);
    const noBody = method === "HEAD" || response.status === 204 || response.status === 304;
    return new Response(noBody ? null : response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: copyGatewayResponseHeaders(response.headers),
    });
}

async function proxyAuthed(
    request: NextRequest,
    upstreamPath: string,
    options?: {
        method?: string;
        body?: unknown;
    },
) {
    const local = getLocalSession(request);
    if (!local?.session?.user?.id) {
        return jsonResponse(401, { success: false, message: "请先登录账号中心", data: null });
    }
    const userId = Number(local.session.user.id);
    const response = await callNewApi({
        endpoint: local.session.endpoint,
        path: upstreamPath,
        method: options?.method || request.method,
        body: options?.body,
        jar: local.session.upstreamJar,
        userId: Number.isFinite(userId) ? userId : undefined,
    });
    mergeSetCookieIntoJar(local.session.upstreamJar, response);
    updateLocalSession(local.sessionId, { upstreamJar: local.session.upstreamJar });
    const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
    const headers = new Headers();
    if (!payload.success && [401, 403].includes(response.status)) {
        destroyLocalSession(local.sessionId);
        withClearedSessionCookie(request, headers);
    }
    return jsonResponse(response.status || 200, payload, headers);
}

async function handleRequest(request: NextRequest, pathSegments: string[] = []) {
    const pathname = `/${pathSegments.join("/")}`;
    const method = request.method.toUpperCase();
    if (pathname === GATEWAY_PATH_PREFIX || pathname.startsWith(`${GATEWAY_PATH_PREFIX}/`)) {
        try {
            return await proxyGatewayRequest(request);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Gateway proxy failed";
            const status = /endpoint|EndPoint|私网|允许列表|http\/https/.test(message) ? 400 : 502;
            return jsonResponse(status, { success: false, message, data: null });
        }
    }
    const body = await readBody(request);

    const tokenStatusMatch = pathname.match(/^\/tokens\/(\d+)\/status$/);
    const tokenKeyMatch = pathname.match(/^\/tokens\/(\d+)\/key$/);
    const tokenDeleteMatch = pathname.match(/^\/tokens\/(\d+)$/);

    if (pathname === "/status" && method === "GET") {
        const endpoint = getRequestEndpoint(request, body);
        const response = await callNewApi({ endpoint, path: "/api/status" });
        return jsonResponse(response.status || 200, normalizeUpstreamEnvelope(response, await parseUpstreamJson(response)));
    }

    if (pathname === "/verification" && method === "POST") {
        const endpoint = getRequestEndpoint(request, body);
        const response = await callNewApi({
            endpoint,
            path: `/api/verification${buildQueryString({ email: normalizeMaybeString(body.email) })}`,
        });
        return jsonResponse(response.status || 200, normalizeUpstreamEnvelope(response, await parseUpstreamJson(response)));
    }

    if (pathname === "/register" && method === "POST") {
        const endpoint = getRequestEndpoint(request, body);
        const response = await callNewApi({
            endpoint,
            path: "/api/user/register",
            method: "POST",
            body: {
                username: normalizeMaybeString(body.username),
                password: normalizeMaybeString(body.password),
                email: normalizeMaybeString(body.email),
                verification_code: normalizeMaybeString(body.verification_code),
                aff_code: normalizeMaybeString(body.aff_code),
            },
        });
        return jsonResponse(response.status || 200, normalizeUpstreamEnvelope(response, await parseUpstreamJson(response)));
    }

    if (pathname === "/session/login" && method === "POST") {
        const endpoint = getRequestEndpoint(request, body);
        const upstreamJar: Record<string, string> = {};
        const response = await callNewApi({
            endpoint,
            path: "/api/user/login",
            method: "POST",
            body: {
                username: normalizeMaybeString(body.username),
                password: normalizeMaybeString(body.password),
            },
        });
        mergeSetCookieIntoJar(upstreamJar, response);
        const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
        const headers = new Headers();
        if (payload.success) {
            const sessionId = saveLocalSession({
                endpoint,
                upstreamJar,
                user: (payload.data as UnknownRecord)?.require_2fa ? null : (payload.data as SessionUser),
                pendingTwoFactor: Boolean((payload.data as UnknownRecord)?.require_2fa),
            });
            appendSetCookie(headers, buildSessionCookie(request, sessionId, SESSION_TTL_SECONDS));
        }
        return jsonResponse(response.status || 200, payload, headers);
    }

    if (pathname === "/session/2fa" && method === "POST") {
        const local = getLocalSession(request);
        if (!local?.session) return jsonResponse(401, { success: false, message: "登录会话已失效，请重新登录", data: null });
        const response = await callNewApi({
            endpoint: local.session.endpoint,
            path: "/api/user/login/2fa",
            method: "POST",
            body: { code: normalizeMaybeString(body.code) },
            jar: local.session.upstreamJar,
        });
        mergeSetCookieIntoJar(local.session.upstreamJar, response);
        const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
        if (payload.success) {
            updateLocalSession(local.sessionId, {
                upstreamJar: local.session.upstreamJar,
                user: payload.data as SessionUser,
                pendingTwoFactor: false,
            });
        }
        return jsonResponse(response.status || 200, payload);
    }

    if (pathname === "/session" && method === "GET") {
        const local = getLocalSession(request);
        if (!local?.session) return jsonResponse(200, { success: true, message: "", data: null });
        const endpointInput = normalizeMaybeString(request.nextUrl.searchParams.get("endpoint"));
        if (endpointInput) {
            const endpoint = validateEndpoint(endpointInput);
            if (endpoint !== local.session.endpoint) {
                destroyLocalSession(local.sessionId);
                return jsonResponse(200, { success: true, message: "", data: null }, withClearedSessionCookie(request));
            }
        }
        const userId = Number(local.session.user?.id);
        if (!Number.isFinite(userId) || userId <= 0) return jsonResponse(200, { success: true, message: "", data: null });
        const response = await callNewApi({
            endpoint: local.session.endpoint,
            path: "/api/user/self",
            jar: local.session.upstreamJar,
            userId,
        });
        const payload = normalizeUpstreamEnvelope(response, await parseUpstreamJson(response));
        if (!payload.success) {
            destroyLocalSession(local.sessionId);
            return jsonResponse(200, { success: true, message: "", data: null }, withClearedSessionCookie(request));
        }
        updateLocalSession(local.sessionId, { user: payload.data as SessionUser });
        return jsonResponse(response.status || 200, payload);
    }

    if (pathname === "/session/logout" && method === "POST") {
        const local = getLocalSession(request);
        if (local?.session) {
            try {
                await callNewApi({
                    endpoint: local.session.endpoint,
                    path: "/api/user/logout",
                    method: "GET",
                    jar: local.session.upstreamJar,
                });
            } catch {
                // ignore upstream logout failure
            }
            destroyLocalSession(local.sessionId);
        }
        return jsonResponse(200, { success: true, message: "", data: null }, withClearedSessionCookie(request));
    }

    if (pathname === "/self" && method === "GET") return proxyAuthed(request, "/api/user/self");
    if (pathname === "/topup/info" && method === "GET") return proxyAuthed(request, "/api/user/topup/info");
    if (pathname === "/amount" && method === "POST") return proxyAuthed(request, "/api/user/amount", { method: "POST", body });
    if (pathname === "/pay" && method === "POST") return proxyAuthed(request, "/api/user/pay", { method: "POST", body });
    if (pathname === "/topup" && method === "POST") return proxyAuthed(request, "/api/user/topup", { method: "POST", body });
    if (pathname === "/subscription/plans" && method === "GET") return proxyAuthed(request, "/api/subscription/plans");
    if (pathname === "/subscription/self" && method === "GET") return proxyAuthed(request, "/api/subscription/self");
    if (pathname === "/subscription/self/preference" && method === "PUT") {
        return proxyAuthed(request, "/api/subscription/self/preference", { method: "PUT", body });
    }
    if (pathname === "/subscription/stripe/pay" && method === "POST") {
        return proxyAuthed(request, "/api/subscription/stripe/pay", { method: "POST", body });
    }
    if (pathname === "/subscription/creem/pay" && method === "POST") {
        return proxyAuthed(request, "/api/subscription/creem/pay", { method: "POST", body });
    }
    if (pathname === "/subscription/epay/pay" && method === "POST") {
        return proxyAuthed(request, "/api/subscription/epay/pay", { method: "POST", body });
    }

    if (pathname === "/tokens" && method === "GET") {
        return proxyAuthed(
            request,
            `/api/token/${buildQueryString({
                p: request.nextUrl.searchParams.get("p"),
                size: request.nextUrl.searchParams.get("size"),
            })}`,
        );
    }

    if (pathname === "/tokens" && method === "POST") return proxyAuthed(request, "/api/token/", { method: "POST", body });

    if (tokenStatusMatch && method === "PATCH") {
        return proxyAuthed(request, "/api/token/?status_only=true", {
            method: "PUT",
            body: {
                id: Number.parseInt(tokenStatusMatch[1], 10),
                status: body.status,
            },
        });
    }

    if (tokenKeyMatch && method === "POST") return proxyAuthed(request, `/api/token/${tokenKeyMatch[1]}/key`, { method: "POST" });

    if (tokenDeleteMatch && method === "DELETE") return proxyAuthed(request, `/api/token/${tokenDeleteMatch[1]}`, { method: "DELETE" });

    if (pathname === "/logs" && method === "GET") {
        return proxyAuthed(
            request,
            `/api/log/self${buildQueryString({
                p: request.nextUrl.searchParams.get("p"),
                page_size: request.nextUrl.searchParams.get("page_size"),
                type: request.nextUrl.searchParams.get("type"),
                channel: request.nextUrl.searchParams.get("channel"),
                token_name: request.nextUrl.searchParams.get("token_name"),
                model_name: request.nextUrl.searchParams.get("model_name"),
                group: request.nextUrl.searchParams.get("group"),
                request_id: request.nextUrl.searchParams.get("request_id"),
                start_timestamp: request.nextUrl.searchParams.get("start_timestamp"),
                end_timestamp: request.nextUrl.searchParams.get("end_timestamp"),
            })}`,
        );
    }

    if (pathname === "/logs/stat" && method === "GET") {
        return proxyAuthed(
            request,
            `/api/log/self/stat${buildQueryString({
                type: request.nextUrl.searchParams.get("type"),
                channel: request.nextUrl.searchParams.get("channel"),
                token_name: request.nextUrl.searchParams.get("token_name"),
                model_name: request.nextUrl.searchParams.get("model_name"),
                group: request.nextUrl.searchParams.get("group"),
                start_timestamp: request.nextUrl.searchParams.get("start_timestamp"),
                end_timestamp: request.nextUrl.searchParams.get("end_timestamp"),
            })}`,
        );
    }

    if (pathname === "/tasks" && method === "GET") {
        return proxyAuthed(
            request,
            `/api/task/self${buildQueryString({
                p: request.nextUrl.searchParams.get("p"),
                page_size: request.nextUrl.searchParams.get("page_size"),
                channel_id: request.nextUrl.searchParams.get("channel_id"),
                task_id: request.nextUrl.searchParams.get("task_id"),
                platform: request.nextUrl.searchParams.get("platform"),
                status: request.nextUrl.searchParams.get("status"),
                action: request.nextUrl.searchParams.get("action"),
                start_timestamp: request.nextUrl.searchParams.get("start_timestamp"),
                end_timestamp: request.nextUrl.searchParams.get("end_timestamp"),
            })}`,
        );
    }

    return jsonResponse(404, { success: false, message: "未找到对应代理接口", data: null });
}

type RouteContext = { params: { path?: string[] } | Promise<{ path?: string[] }> };

async function main(request: NextRequest, context: RouteContext) {
    try {
        const params = await Promise.resolve(context.params);
        return await handleRequest(request, params.path || []);
    } catch (error) {
        const message = error instanceof Error ? error.message : "代理服务异常";
        const status = /endpoint|EndPoint|私网|允许列表|http\/https/.test(message) ? 400 : 500;
        return jsonResponse(status, { success: false, message, data: null });
    }
}

export async function GET(request: NextRequest, context: RouteContext) {
    return main(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
    return main(request, context);
}

export async function PUT(request: NextRequest, context: RouteContext) {
    return main(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    return main(request, context);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    return main(request, context);
}

export async function OPTIONS() {
    return new Response(null, { status: 204 });
}
