"use client";

const DEFAULT_NEW_API_ENDPOINT = "https://api.antsk.cn";
const NEW_API_SESSION_STORAGE_KEY = "infinite-canvas:new-api-session";

type NewApiEnvelope<T> = {
    success: boolean;
    message: string;
    data: T;
    url?: string;
};

type UnknownRecord = Record<string, unknown>;

export interface NewApiStatus {
    system_name?: string;
    email_verification?: boolean;
    turnstile_check?: boolean;
    top_up_link?: string;
    quota_per_unit?: number;
    custom_currency_symbol?: string;
}

export interface NewApiAuthUser {
    id: number;
    username: string;
    display_name?: string;
    require_2fa?: boolean;
}

export interface NewApiUser {
    id: number;
    username: string;
    display_name?: string;
    email?: string;
    quota?: number;
    used_quota?: number;
    request_count?: number;
    group?: string;
}

export interface NewApiSession {
    endpoint: string;
    userId: number;
    username: string;
    accessToken: string;
    user?: NewApiUser;
}

export interface NewApiPage<T> {
    page: number;
    page_size: number;
    total: number;
    items: T[];
}

export interface NewApiToken {
    id: number;
    user_id: number;
    key: string;
    status: number;
    name: string;
    created_time: number;
    remain_quota: number;
    unlimited_quota: boolean;
    used_quota: number;
    group: string;
}

export interface NewApiTokenCreatePayload {
    name: string;
    remain_quota: number;
    unlimited_quota: boolean;
    expired_time: number;
}

export interface NewApiLog {
    id: number;
    created_at: number;
    type: number;
    token_name: string;
    model_name: string;
    quota: number;
    prompt_tokens: number;
    completion_tokens: number;
    use_time: number;
    channel_name?: string;
    request_id?: string;
    content?: string;
}

export interface NewApiLogStats {
    quota: number;
    rpm: number;
    tpm: number;
}

export interface NewApiPayMethod {
    name: string;
    type: string;
    color?: string;
    min_topup?: string | number;
}

export interface NewApiTopupInfo {
    pay_methods?: NewApiPayMethod[] | string;
    amount_options?: number[];
    discount?: Record<string, number>;
    min_topup?: number;
    top_up_link?: string;
}

export interface NewApiLoginResult {
    requireTwoFactor: boolean;
    session?: NewApiSession;
    user?: NewApiUser;
}

export interface NewApiLogsQuery {
    page?: number;
    pageSize?: number;
    type?: number;
    channelId?: number | string;
    tokenName?: string;
    modelName?: string;
    requestId?: string;
    startTimestamp?: number;
    endTimestamp?: number;
}

function normalizeEndpoint(endpoint: string) {
    return String(endpoint || "").trim().replace(/\/+$/, "");
}

function buildQueryString(params: Record<string, string | number | undefined>) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value === undefined || value === "") return;
        query.set(key, String(value));
    });
    const queryString = query.toString();
    return queryString ? `?${queryString}` : "";
}

function getStoredJson<T>(key: string): T | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function setStoredJson(key: string, value: unknown) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
}

function unwrapEnvelope<T>(payload: NewApiEnvelope<T>) {
    if (!payload.success) {
        throw new Error(payload.message || "请求失败");
    }
    return payload.data;
}

async function proxyFetch<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(path, {
        ...init,
        credentials: "include",
        headers: {
            Accept: "application/json",
            ...(init.body ? { "Content-Type": "application/json" } : {}),
            ...(init.headers || {}),
        },
    });
    let payload: T | null = null;
    try {
        payload = (await response.json()) as T;
    } catch {
        payload = null;
    }
    if (!response.ok) {
        const message = payload && typeof payload === "object" && "message" in (payload as UnknownRecord) ? String((payload as UnknownRecord).message || "") : "";
        throw new Error(message || `请求失败（${response.status}）`);
    }
    if (!payload) {
        throw new Error("请求失败：服务返回为空");
    }
    return payload;
}

function toSession(endpoint: string, user: NewApiUser) {
    return {
        endpoint: normalizeEndpoint(endpoint),
        userId: user.id,
        username: user.username,
        accessToken: "",
        user,
    } satisfies NewApiSession;
}

function saveSession(session: NewApiSession | null) {
    if (typeof window === "undefined") return;
    if (!session) {
        window.localStorage.removeItem(NEW_API_SESSION_STORAGE_KEY);
        return;
    }
    setStoredJson(NEW_API_SESSION_STORAGE_KEY, session);
}

function normalizePayMethods(value: NewApiPayMethod[] | string | undefined) {
    if (!value) return [] as NewApiPayMethod[];
    if (Array.isArray(value)) return value;
    try {
        const parsed = JSON.parse(value) as NewApiPayMethod[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function getNewApiEndpoint() {
    return normalizeEndpoint(DEFAULT_NEW_API_ENDPOINT);
}

export function getNewApiSession() {
    const session = getStoredJson<NewApiSession>(NEW_API_SESSION_STORAGE_KEY);
    if (!session) return null;
    const endpoint = getNewApiEndpoint();
    if (normalizeEndpoint(session.endpoint) !== endpoint) {
        saveSession(null);
        return null;
    }
    return { ...session, endpoint };
}

export function clearNewApiSession() {
    saveSession(null);
}

export function ensureTokenKeyPrefix(key: string) {
    if (!key) return "";
    return key.startsWith("sk-") ? key : `sk-${key}`;
}

export function toUnixTimestamp(value: string) {
    if (!value) return undefined;
    const timestamp = Date.parse(value);
    if (Number.isNaN(timestamp)) return undefined;
    return Math.floor(timestamp / 1000);
}

export function submitPaymentForm(url: string, params: Record<string, string>) {
    const form = document.createElement("form");
    form.action = url;
    form.method = "POST";
    form.target = "_blank";
    Object.entries(params).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
}

export function formatQuota(quota: number | undefined, status: NewApiStatus | null, fractionDigits = 2) {
    if (quota === undefined || quota === null) return "—";
    const quotaPerUnit = Number(status?.quota_per_unit ?? 500000) || 500000;
    const value = quota / quotaPerUnit;
    return `$${value.toFixed(fractionDigits)}`;
}

export function getTopupMethods(topupInfo: NewApiTopupInfo | null) {
    return normalizePayMethods(topupInfo?.pay_methods).filter((item) => item?.name && item?.type);
}

export async function fetchNewApiStatus(endpoint = getNewApiEndpoint()) {
    const payload = await proxyFetch<NewApiEnvelope<NewApiStatus>>(`/api/new-api/status${buildQueryString({ endpoint })}`);
    return unwrapEnvelope(payload);
}

export async function bootstrapNewApiSession(endpoint = getNewApiEndpoint()) {
    const payload = await proxyFetch<NewApiEnvelope<NewApiUser | null>>(`/api/new-api/session${buildQueryString({ endpoint })}`);
    const user = payload.data;
    if (!user) {
        saveSession(null);
        return null;
    }
    const session = toSession(endpoint, user);
    saveSession(session);
    return session;
}

export async function sendNewApiVerificationCode(email: string, endpoint = getNewApiEndpoint()) {
    const payload = await proxyFetch<NewApiEnvelope<null>>("/api/new-api/verification", {
        method: "POST",
        body: JSON.stringify({ endpoint, email }),
    });
    unwrapEnvelope(payload);
}

export async function registerNewApiUser(
    input: { username: string; password: string; email?: string; verification_code?: string; aff_code?: string },
    endpoint = getNewApiEndpoint(),
) {
    const payload = await proxyFetch<NewApiEnvelope<null>>("/api/new-api/register", {
        method: "POST",
        body: JSON.stringify({ endpoint, ...input }),
    });
    unwrapEnvelope(payload);
}

export async function loginNewApiUser(input: { username: string; password: string }, endpoint = getNewApiEndpoint()): Promise<NewApiLoginResult> {
    const payload = await proxyFetch<NewApiEnvelope<NewApiAuthUser>>("/api/new-api/session/login", {
        method: "POST",
        body: JSON.stringify({ endpoint, ...input }),
    });
    const authUser = unwrapEnvelope(payload);
    if (authUser.require_2fa) return { requireTwoFactor: true };
    const session = toSession(endpoint, authUser as NewApiUser);
    saveSession(session);
    return { requireTwoFactor: false, session, user: authUser as NewApiUser };
}

export async function verifyNewApiTwoFactor(code: string, endpoint = getNewApiEndpoint()): Promise<NewApiLoginResult> {
    const payload = await proxyFetch<NewApiEnvelope<NewApiAuthUser>>("/api/new-api/session/2fa", {
        method: "POST",
        body: JSON.stringify({ endpoint, code }),
    });
    const authUser = unwrapEnvelope(payload);
    const session = toSession(endpoint, authUser as NewApiUser);
    saveSession(session);
    return { requireTwoFactor: false, session, user: authUser as NewApiUser };
}

export async function logoutNewApiUser() {
    try {
        await proxyFetch<NewApiEnvelope<null>>("/api/new-api/session/logout", { method: "POST" });
    } finally {
        saveSession(null);
    }
}

export async function getNewApiSelf(endpoint = getNewApiEndpoint()) {
    const payload = await proxyFetch<NewApiEnvelope<NewApiUser>>("/api/new-api/self");
    const user = unwrapEnvelope(payload);
    saveSession(toSession(endpoint, user));
    return user;
}

export async function getNewApiTopupInfo() {
    const payload = await proxyFetch<NewApiEnvelope<NewApiTopupInfo>>("/api/new-api/topup/info");
    return unwrapEnvelope(payload);
}

export async function requestNewApiAmount(amount: number) {
    const payload = await proxyFetch<NewApiEnvelope<string | number>>("/api/new-api/amount", {
        method: "POST",
        body: JSON.stringify({ amount }),
    });
    return Number(unwrapEnvelope(payload));
}

export async function requestNewApiPay(amount: number, paymentMethod: string) {
    const payload = await proxyFetch<NewApiEnvelope<Record<string, string>>>("/api/new-api/pay", {
        method: "POST",
        body: JSON.stringify({ amount, payment_method: paymentMethod }),
    });
    return {
        url: payload.url || "",
        params: unwrapEnvelope(payload) || {},
    };
}

export async function redeemNewApiCode(code: string) {
    const payload = await proxyFetch<NewApiEnvelope<number>>("/api/new-api/topup", {
        method: "POST",
        body: JSON.stringify({ key: code }),
    });
    return unwrapEnvelope(payload);
}

export async function getNewApiTokens(page = 1, pageSize = 20) {
    const payload = await proxyFetch<NewApiEnvelope<NewApiPage<NewApiToken>>>(`/api/new-api/tokens${buildQueryString({ p: page, size: pageSize })}`);
    return unwrapEnvelope(payload);
}

export async function getNewApiTokenKey(tokenId: number) {
    const payload = await proxyFetch<NewApiEnvelope<{ key?: string }>>(`/api/new-api/tokens/${tokenId}/key`, {
        method: "POST",
    });
    const data = unwrapEnvelope(payload) || {};
    const key = String(data.key || "").trim();
    if (!key) throw new Error("未获取到完整令牌");
    return key;
}

export async function createNewApiToken(input: NewApiTokenCreatePayload) {
    const payload = await proxyFetch<NewApiEnvelope<null>>("/api/new-api/tokens", {
        method: "POST",
        body: JSON.stringify(input),
    });
    unwrapEnvelope(payload);
}

export async function updateNewApiTokenStatus(tokenId: number, status: number) {
    const payload = await proxyFetch<NewApiEnvelope<NewApiToken>>(`/api/new-api/tokens/${tokenId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
    });
    unwrapEnvelope(payload);
}

export async function deleteNewApiToken(tokenId: number) {
    const payload = await proxyFetch<NewApiEnvelope<null>>(`/api/new-api/tokens/${tokenId}`, {
        method: "DELETE",
    });
    unwrapEnvelope(payload);
}

export async function getNewApiLogs(query: NewApiLogsQuery) {
    const payload = await proxyFetch<NewApiEnvelope<NewApiPage<NewApiLog>>>(`/api/new-api/logs${buildQueryString({
        p: query.page ?? 1,
        page_size: query.pageSize ?? 20,
        type: query.type ?? 2,
        channel: query.channelId,
        token_name: query.tokenName,
        model_name: query.modelName,
        request_id: query.requestId,
        start_timestamp: query.startTimestamp,
        end_timestamp: query.endTimestamp,
    })}`);
    return unwrapEnvelope(payload);
}

export async function getNewApiLogsStat(query: Omit<NewApiLogsQuery, "page" | "pageSize" | "requestId">) {
    const payload = await proxyFetch<NewApiEnvelope<NewApiLogStats>>(`/api/new-api/logs/stat${buildQueryString({
        type: query.type ?? 2,
        channel: query.channelId,
        token_name: query.tokenName,
        model_name: query.modelName,
        start_timestamp: query.startTimestamp,
        end_timestamp: query.endTimestamp,
    })}`);
    return unwrapEnvelope(payload);
}

function pickPrimaryToken(tokens: NewApiToken[]) {
    const enabled = tokens.find((token) => token.status === 1);
    return enabled || tokens[0] || null;
}

export function buildDefaultTokenPayload(name = "BigBanana Canvas"): NewApiTokenCreatePayload {
    return {
        name,
        remain_quota: 0,
        unlimited_quota: true,
        expired_time: -1,
    };
}

export async function ensurePrimaryTokenKey(createIfMissing = true) {
    const firstPage = await getNewApiTokens(1, 20);
    let token = pickPrimaryToken(firstPage.items || []);
    let created = false;
    if (!token && createIfMissing) {
        await createNewApiToken(buildDefaultTokenPayload());
        const refreshed = await getNewApiTokens(1, 20);
        token = pickPrimaryToken(refreshed.items || []);
        created = true;
    }
    if (!token?.id) throw new Error("当前账号还没有可用令牌，请先创建 Key");
    const fullKey = ensureTokenKeyPrefix(await getNewApiTokenKey(token.id));
    return { key: fullKey, token, created };
}
