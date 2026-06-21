"use client";

import { App, Alert, Button, Form, Input, Select, Space, Statistic, Table, Tabs, Tag } from "antd";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { applyApiKeyToConfig } from "@/services/account-key-sync";
import {
    bootstrapNewApiSession,
    buildDefaultTokenPayload,
    clearNewApiSession,
    createNewApiToken,
    deleteNewApiToken,
    ensurePrimaryTokenKey,
    ensureTokenKeyPrefix,
    fetchNewApiStatus,
    formatQuota,
    getNewApiLogs,
    getNewApiLogsStat,
    getNewApiSelf,
    getNewApiTokenKey,
    getNewApiTokens,
    getNewApiTopupInfo,
    getTopupMethods,
    loginNewApiUser,
    logoutNewApiUser,
    redeemNewApiCode,
    registerNewApiUser,
    requestNewApiAmount,
    requestNewApiPay,
    sendNewApiVerificationCode,
    submitPaymentForm,
    toUnixTimestamp,
    updateNewApiTokenStatus,
    verifyNewApiTwoFactor,
    type NewApiLog,
    type NewApiLogStats,
    type NewApiSession,
    type NewApiStatus,
    type NewApiToken,
    type NewApiTopupInfo,
} from "@/services/new-api-service";
import { useConfigStore } from "@/stores/use-config-store";

const TOKEN_STATUS_ENABLED = 1;
const TOKEN_STATUS_DISABLED = 2;

const DEFAULT_LOG_TYPE = 2;

function formatDateTime(timestamp?: number) {
    if (!timestamp) return "—";
    return new Date(timestamp * 1000).toLocaleString("zh-CN", { hour12: false });
}

function formatDateTimeInput(date: Date) {
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function maskKey(value: string) {
    if (!value) return "未配置";
    if (value.length <= 12) return value;
    return `${value.slice(0, 8)}****${value.slice(-4)}`;
}

async function copyToClipboard(text: string) {
    if (!text) return false;
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fallback to legacy copy
    }
    if (typeof document === "undefined") return false;
    try {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        return copied;
    } catch {
        return false;
    }
}

function tokenStatusTag(status: number) {
    if (status === TOKEN_STATUS_ENABLED) return <Tag color="success">已启用</Tag>;
    if (status === TOKEN_STATUS_DISABLED) return <Tag>已禁用</Tag>;
    return <Tag color="default">状态 {status}</Tag>;
}

export function AccountCenterPanel() {
    const { message } = App.useApp();
    const isConfigOpen = useConfigStore((state) => state.isConfigOpen);
    const projectApiKey = useConfigStore((state) => state.config.apiKey);

    const [status, setStatus] = useState<NewApiStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);

    const [session, setSession] = useState<NewApiSession | null>(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [needsTwoFactor, setNeedsTwoFactor] = useState(false);
    const [authTab, setAuthTab] = useState<"login" | "register">("login");

    const [loginForm, setLoginForm] = useState({ username: "", password: "", twoFactorCode: "" });
    const [registerForm, setRegisterForm] = useState({ username: "", email: "", verificationCode: "", password: "", confirmPassword: "", affCode: "" });
    const [verificationLoading, setVerificationLoading] = useState(false);

    const [syncingKey, setSyncingKey] = useState(false);
    const [activeTab, setActiveTab] = useState<"tokens" | "billing" | "logs">("tokens");

    const [tokens, setTokens] = useState<NewApiToken[]>([]);
    const [tokensLoading, setTokensLoading] = useState(false);
    const [tokenPage, setTokenPage] = useState(1);
    const [tokenTotal, setTokenTotal] = useState(0);
    const tokenPageSize = 10;

    const [topupInfo, setTopupInfo] = useState<NewApiTopupInfo | null>(null);
    const [topupLoading, setTopupLoading] = useState(false);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("");
    const [selectedTopupAmount, setSelectedTopupAmount] = useState("");
    const [estimatedAmount, setEstimatedAmount] = useState<number | null>(null);
    const [estimateLoading, setEstimateLoading] = useState(false);
    const [payLoading, setPayLoading] = useState(false);
    const [redeemCode, setRedeemCode] = useState("");

    const defaultStart = useMemo(() => formatDateTimeInput(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), []);
    const defaultEnd = useMemo(() => formatDateTimeInput(new Date()), []);
    const [logType, setLogType] = useState(DEFAULT_LOG_TYPE);
    const [logTokenName, setLogTokenName] = useState("");
    const [logModelName, setLogModelName] = useState("");
    const [logStart, setLogStart] = useState(defaultStart);
    const [logEnd, setLogEnd] = useState(defaultEnd);
    const [logs, setLogs] = useState<NewApiLog[]>([]);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logStats, setLogStats] = useState<NewApiLogStats | null>(null);
    const [logPage, setLogPage] = useState(1);
    const [logTotal, setLogTotal] = useState(0);
    const logPageSize = 20;

    const topupMethods = useMemo(() => getTopupMethods(topupInfo), [topupInfo]);

    const refreshProfile = useCallback(async (silent = false) => {
        try {
            const user = await getNewApiSelf();
            setSession((current) => (current ? { ...current, user, username: user.username } : current));
        } catch (error) {
            if (!silent) {
                message.error(error instanceof Error ? error.message : "刷新账户信息失败");
            }
            throw error;
        }
    }, [message]);

    const loadTokens = useCallback(
        async (page = 1) => {
            setTokensLoading(true);
            try {
                const payload = await getNewApiTokens(page, tokenPageSize);
                setTokens(payload.items || []);
                setTokenPage(payload.page || page);
                setTokenTotal(payload.total || 0);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "获取令牌列表失败");
            } finally {
                setTokensLoading(false);
            }
        },
        [message],
    );

    const loadTopupInfo = useCallback(async () => {
        setTopupLoading(true);
        try {
            const info = await getNewApiTopupInfo();
            const methods = getTopupMethods(info);
            setTopupInfo(info);
            setSelectedPaymentMethod((current) => current || methods[0]?.type || "");
            setSelectedTopupAmount((current) => {
                if (current) return current;
                const firstAmount = info.amount_options?.[0];
                return firstAmount === undefined ? "" : String(firstAmount);
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "获取充值配置失败");
        } finally {
            setTopupLoading(false);
        }
    }, [message]);

    const loadLogs = useCallback(
        async (page = 1) => {
            setLogsLoading(true);
            try {
                const startTimestamp = toUnixTimestamp(logStart);
                const endTimestamp = toUnixTimestamp(logEnd);
                const [pageData, statData] = await Promise.all([
                    getNewApiLogs({
                        page,
                        pageSize: logPageSize,
                        type: logType,
                        tokenName: logTokenName.trim() || undefined,
                        modelName: logModelName.trim() || undefined,
                        startTimestamp,
                        endTimestamp,
                    }),
                    getNewApiLogsStat({
                        type: logType,
                        tokenName: logTokenName.trim() || undefined,
                        modelName: logModelName.trim() || undefined,
                        startTimestamp,
                        endTimestamp,
                    }),
                ]);
                setLogs(pageData.items || []);
                setLogPage(pageData.page || page);
                setLogTotal(pageData.total || 0);
                setLogStats(statData);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "获取日志失败");
            } finally {
                setLogsLoading(false);
            }
        },
        [logEnd, logModelName, logStart, logTokenName, logType, message],
    );

    const syncProjectKey = useCallback(
        async (showToast = true) => {
            setSyncingKey(true);
            try {
                const result = await ensurePrimaryTokenKey(true);
                applyApiKeyToConfig(result.key);
                if (showToast) {
                    message.success(result.created ? "已自动创建默认 Key 并同步到当前项目" : "已同步账号默认 Key 到当前项目");
                }
                return result.key;
            } catch (error) {
                if (showToast) message.warning(error instanceof Error ? error.message : "自动同步 Key 失败，请手动在令牌列表中选择");
                return "";
            } finally {
                setSyncingKey(false);
            }
        },
        [message],
    );

    const loadStatusAndSession = useCallback(
        async (silent = false) => {
            setStatusLoading(true);
            try {
                const [statusResult, sessionResult] = await Promise.allSettled([fetchNewApiStatus(), bootstrapNewApiSession()]);
                if (statusResult.status === "fulfilled") {
                    setStatus(statusResult.value);
                } else {
                    setStatus(null);
                    if (!silent) message.error(statusResult.reason instanceof Error ? statusResult.reason.message : "获取账号系统状态失败");
                }
                if (sessionResult.status === "fulfilled") {
                    setSession(sessionResult.value);
                    if (sessionResult.value) {
                        await refreshProfile(true);
                        await syncProjectKey(false);
                        await Promise.all([loadTokens(1), loadTopupInfo()]);
                    }
                } else {
                    setSession(null);
                }
            } finally {
                setStatusLoading(false);
            }
        },
        [loadTokens, loadTopupInfo, message, refreshProfile, syncProjectKey],
    );

    useEffect(() => {
        if (!isConfigOpen) return;
        void loadStatusAndSession(true);
    }, [isConfigOpen, loadStatusAndSession]);

    useEffect(() => {
        if (!session) {
            setTokens([]);
            setTokenTotal(0);
            return;
        }
        void loadTokens(1);
    }, [loadTokens, session?.userId]);

    const handleLoginSuccess = useCallback(
        async (nextSession: NewApiSession | null) => {
            setSession(nextSession);
            setNeedsTwoFactor(false);
            setActiveTab("tokens");
            await refreshProfile(true);
            const synced = await syncProjectKey(false);
            if (synced) message.success("登录成功，账号 Key 已可直接使用");
            else message.warning("登录成功，但自动同步 Key 失败，请在令牌页手动同步");
            await Promise.all([loadTokens(1), loadTopupInfo()]);
        },
        [loadTokens, loadTopupInfo, message, refreshProfile, syncProjectKey],
    );

    const handleLogin = useCallback(async () => {
        if (!loginForm.username.trim() || !loginForm.password.trim()) {
            message.warning("请输入用户名和密码");
            return;
        }
        if (status?.turnstile_check) {
            message.warning("当前账号系统启用了额外安全验证，暂不支持在此登录");
            return;
        }
        setAuthLoading(true);
        try {
            const result = await loginNewApiUser({ username: loginForm.username.trim(), password: loginForm.password });
            if (result.requireTwoFactor) {
                setNeedsTwoFactor(true);
                message.info("该账号开启了 2FA，请输入验证码继续");
                return;
            }
            await handleLoginSuccess(result.session || null);
            setLoginForm((current) => ({ ...current, password: "" }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "登录失败");
        } finally {
            setAuthLoading(false);
        }
    }, [handleLoginSuccess, loginForm.password, loginForm.username, message, status?.turnstile_check]);

    const handleVerifyTwoFactor = useCallback(async () => {
        if (!loginForm.twoFactorCode.trim()) {
            message.warning("请输入 2FA 验证码");
            return;
        }
        setAuthLoading(true);
        try {
            const result = await verifyNewApiTwoFactor(loginForm.twoFactorCode.trim());
            await handleLoginSuccess(result.session || null);
            setLoginForm((current) => ({ ...current, twoFactorCode: "", password: "" }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "2FA 验证失败");
        } finally {
            setAuthLoading(false);
        }
    }, [handleLoginSuccess, loginForm.twoFactorCode, message]);

    const handleRegister = useCallback(async () => {
        if (!registerForm.username.trim()) {
            message.warning("请输入用户名");
            return;
        }
        if (registerForm.password.length < 8) {
            message.warning("密码长度至少 8 位");
            return;
        }
        if (registerForm.password !== registerForm.confirmPassword) {
            message.warning("两次输入的密码不一致");
            return;
        }
        if (status?.email_verification && (!registerForm.email.trim() || !registerForm.verificationCode.trim())) {
            message.warning("当前注册需要邮箱和验证码");
            return;
        }
        if (status?.turnstile_check) {
            message.warning("当前账号系统启用了额外安全验证，暂不支持在此注册");
            return;
        }
        setAuthLoading(true);
        try {
            await registerNewApiUser({
                username: registerForm.username.trim(),
                password: registerForm.password,
                email: registerForm.email.trim() || undefined,
                verification_code: registerForm.verificationCode.trim() || undefined,
                aff_code: registerForm.affCode.trim() || undefined,
            });
            setAuthTab("login");
            setLoginForm((current) => ({ ...current, username: registerForm.username.trim(), password: "" }));
            message.success("注册成功，请登录");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "注册失败");
        } finally {
            setAuthLoading(false);
        }
    }, [message, registerForm, status?.email_verification, status?.turnstile_check]);

    const handleSendVerificationCode = useCallback(async () => {
        if (!registerForm.email.trim()) {
            message.warning("请先填写邮箱地址");
            return;
        }
        setVerificationLoading(true);
        try {
            await sendNewApiVerificationCode(registerForm.email.trim());
            message.success("验证码已发送，请检查邮箱");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "验证码发送失败");
        } finally {
            setVerificationLoading(false);
        }
    }, [message, registerForm.email]);

    const handleLogout = useCallback(async () => {
        setAuthLoading(true);
        try {
            await logoutNewApiUser();
            clearNewApiSession();
            setSession(null);
            setNeedsTwoFactor(false);
            setTokens([]);
            setTokenTotal(0);
            message.success("已退出登录");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "退出登录失败");
        } finally {
            setAuthLoading(false);
        }
    }, [message]);

    const handleUseToken = useCallback(
        async (token: NewApiToken) => {
            try {
                const fullKey = ensureTokenKeyPrefix(await getNewApiTokenKey(token.id));
                applyApiKeyToConfig(fullKey);
                message.success(`已将「${token.name}」设为当前项目 Key`);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "同步 Key 失败");
            }
        },
        [message],
    );

    const handleCopyToken = useCallback(
        async (token: NewApiToken) => {
            try {
                const fullKey = ensureTokenKeyPrefix(await getNewApiTokenKey(token.id));
                const copied = await copyToClipboard(fullKey);
                if (!copied) {
                    message.error("复制失败，请手动复制");
                    return;
                }
                message.success("完整 Key 已复制");
            } catch (error) {
                message.error(error instanceof Error ? error.message : "获取完整 Key 失败");
            }
        },
        [message],
    );

    const handleToggleToken = useCallback(
        async (token: NewApiToken) => {
            const nextStatus = token.status === TOKEN_STATUS_ENABLED ? TOKEN_STATUS_DISABLED : TOKEN_STATUS_ENABLED;
            try {
                await updateNewApiTokenStatus(token.id, nextStatus);
                message.success(nextStatus === TOKEN_STATUS_ENABLED ? "令牌已启用" : "令牌已禁用");
                await loadTokens(tokenPage);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "更新令牌状态失败");
            }
        },
        [loadTokens, message, tokenPage],
    );

    const handleDeleteToken = useCallback(
        async (token: NewApiToken) => {
            if (typeof window !== "undefined" && !window.confirm(`确认删除令牌「${token.name}」吗？`)) return;
            try {
                await deleteNewApiToken(token.id);
                message.success("令牌已删除");
                await loadTokens(tokenPage);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "删除令牌失败");
            }
        },
        [loadTokens, message, tokenPage],
    );

    const handleCreateDefaultToken = useCallback(async () => {
        try {
            await createNewApiToken(buildDefaultTokenPayload());
            message.success("默认令牌创建成功");
            await loadTokens(1);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "创建令牌失败");
        }
    }, [loadTokens, message]);

    const handleEstimateAmount = useCallback(async () => {
        const amount = Number(selectedTopupAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            message.warning("请选择有效充值金额");
            return;
        }
        setEstimateLoading(true);
        try {
            const estimated = await requestNewApiAmount(amount);
            setEstimatedAmount(estimated);
        } catch (error) {
            setEstimatedAmount(null);
            message.error(error instanceof Error ? error.message : "预估金额计算失败");
        } finally {
            setEstimateLoading(false);
        }
    }, [message, selectedTopupAmount]);

    const handlePay = useCallback(async () => {
        const amount = Number(selectedTopupAmount);
        if (!selectedPaymentMethod) {
            message.warning("请选择支付方式");
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            message.warning("请选择有效充值金额");
            return;
        }
        setPayLoading(true);
        try {
            const { url, params } = await requestNewApiPay(amount, selectedPaymentMethod);
            if (!url) throw new Error("支付链接为空");
            if (Object.keys(params || {}).length > 0) submitPaymentForm(url, params);
            else window.open(url, "_blank", "noopener,noreferrer");
            message.success("已拉起支付页，支付完成后可刷新余额");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "拉起支付失败");
        } finally {
            setPayLoading(false);
        }
    }, [message, selectedPaymentMethod, selectedTopupAmount]);

    const handleRedeemCode = useCallback(async () => {
        if (!redeemCode.trim()) {
            message.warning("请输入兑换码");
            return;
        }
        setPayLoading(true);
        try {
            await redeemNewApiCode(redeemCode.trim());
            setRedeemCode("");
            await refreshProfile(true);
            message.success("兑换成功，余额已刷新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "兑换失败");
        } finally {
            setPayLoading(false);
        }
    }, [message, redeemCode, refreshProfile]);

    const tokenColumns = useMemo(
        () => [
            {
                title: "令牌",
                dataIndex: "name",
                key: "name",
                render: (_: string, token: NewApiToken) => (
                    <div>
                        <div className="font-medium">{token.name || "未命名"}</div>
                        <div className="text-xs text-stone-500">ID: {token.id}</div>
                    </div>
                ),
            },
            {
                title: "状态",
                dataIndex: "status",
                key: "status",
                width: 110,
                render: (status: number) => tokenStatusTag(status),
            },
            {
                title: "额度",
                key: "quota",
                width: 180,
                render: (_: unknown, token: NewApiToken) => (token.unlimited_quota ? "无限额度" : formatQuota(token.remain_quota, status)),
            },
            {
                title: "创建时间",
                dataIndex: "created_time",
                key: "created_time",
                width: 170,
                render: (value: number) => formatDateTime(value),
            },
            {
                title: "操作",
                key: "actions",
                width: 310,
                render: (_: unknown, token: NewApiToken) => (
                    <Space wrap>
                        <Button size="small" onClick={() => void handleUseToken(token)}>
                            设为项目 Key
                        </Button>
                        <Button size="small" onClick={() => void handleCopyToken(token)}>
                            复制完整 Key
                        </Button>
                        <Button size="small" onClick={() => void handleToggleToken(token)}>
                            {token.status === TOKEN_STATUS_ENABLED ? "禁用" : "启用"}
                        </Button>
                        <Button danger size="small" onClick={() => void handleDeleteToken(token)}>
                            删除
                        </Button>
                    </Space>
                ),
            },
        ],
        [handleCopyToken, handleDeleteToken, handleToggleToken, handleUseToken, status],
    );

    const logColumns = useMemo(
        () => [
            { title: "时间", dataIndex: "created_at", key: "created_at", width: 170, render: (value: number) => formatDateTime(value) },
            { title: "令牌", dataIndex: "token_name", key: "token_name", width: 130, ellipsis: true },
            { title: "模型", dataIndex: "model_name", key: "model_name", width: 170, ellipsis: true },
            { title: "消耗", dataIndex: "quota", key: "quota", width: 110, render: (value: number) => formatQuota(value, status, 4) },
            { title: "请求ID", dataIndex: "request_id", key: "request_id", width: 180, ellipsis: true },
            { title: "内容", dataIndex: "content", key: "content", ellipsis: true },
        ],
        [status],
    );

    return (
        <div className="space-y-4">
            <Alert
                type="info"
                showIcon
                message="账号中心（api.antsk.cn）"
                description="支持注册、登录、自动同步 Key、查看日志与充值。登录后会自动拉取 Key；若无 Key 会自动创建默认 Key。"
            />

            {!session ? (
                <div className="space-y-3 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                    <div className="flex items-center justify-between">
                        <div className="text-sm text-stone-500">
                            {statusLoading ? "正在连接账号系统..." : status ? "账号系统已连接" : "未能获取账号系统状态"}
                        </div>
                        <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={statusLoading} onClick={() => void loadStatusAndSession(false)}>
                            刷新
                        </Button>
                    </div>

                    <Tabs
                        activeKey={authTab}
                        onChange={(key) => setAuthTab(key as "login" | "register")}
                        items={[
                            {
                                key: "login",
                                label: "登录",
                                children: (
                                    <Form layout="vertical">
                                        <Form.Item label="用户名">
                                            <Input value={loginForm.username} onChange={(event) => setLoginForm((current) => ({ ...current, username: event.target.value }))} />
                                        </Form.Item>
                                        <Form.Item label="密码">
                                            <Input.Password value={loginForm.password} onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))} />
                                        </Form.Item>
                                        {needsTwoFactor ? (
                                            <Form.Item label="2FA 验证码">
                                                <Input value={loginForm.twoFactorCode} onChange={(event) => setLoginForm((current) => ({ ...current, twoFactorCode: event.target.value }))} />
                                            </Form.Item>
                                        ) : null}
                                        <Space>
                                            <Button type="primary" loading={authLoading} onClick={() => void handleLogin()}>
                                                登录
                                            </Button>
                                            {needsTwoFactor ? (
                                                <Button loading={authLoading} onClick={() => void handleVerifyTwoFactor()}>
                                                    验证 2FA
                                                </Button>
                                            ) : null}
                                        </Space>
                                    </Form>
                                ),
                            },
                            {
                                key: "register",
                                label: "注册",
                                children: (
                                    <Form layout="vertical">
                                        <Form.Item label="用户名">
                                            <Input value={registerForm.username} onChange={(event) => setRegisterForm((current) => ({ ...current, username: event.target.value }))} />
                                        </Form.Item>
                                        <Form.Item label="邮箱（可选）">
                                            <Input value={registerForm.email} onChange={(event) => setRegisterForm((current) => ({ ...current, email: event.target.value }))} />
                                        </Form.Item>
                                        <Form.Item label="验证码（启用邮箱验证时必填）">
                                            <div className="flex items-center gap-2">
                                                <Input value={registerForm.verificationCode} onChange={(event) => setRegisterForm((current) => ({ ...current, verificationCode: event.target.value }))} />
                                                <Button loading={verificationLoading} onClick={() => void handleSendVerificationCode()}>
                                                    发验证码
                                                </Button>
                                            </div>
                                        </Form.Item>
                                        <Form.Item label="密码（至少 8 位）">
                                            <Input.Password value={registerForm.password} onChange={(event) => setRegisterForm((current) => ({ ...current, password: event.target.value }))} />
                                        </Form.Item>
                                        <Form.Item label="确认密码">
                                            <Input.Password value={registerForm.confirmPassword} onChange={(event) => setRegisterForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
                                        </Form.Item>
                                        <Form.Item label="邀请码（可选）">
                                            <Input value={registerForm.affCode} onChange={(event) => setRegisterForm((current) => ({ ...current, affCode: event.target.value }))} />
                                        </Form.Item>
                                        <Button type="primary" loading={authLoading} onClick={() => void handleRegister()}>
                                            注册
                                        </Button>
                                    </Form>
                                ),
                            },
                        ]}
                    />
                </div>
            ) : (
                <div className="space-y-4 rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-base font-semibold">{session.user?.display_name || session.username}</div>
                            <div className="mt-1 text-xs text-stone-500">当前项目 Key：{maskKey(projectApiKey)}</div>
                            <div className="mt-1 text-xs text-stone-500">账户余额：{formatQuota(session.user?.quota, status)}</div>
                        </div>
                        <Space wrap>
                            <Button onClick={() => void refreshProfile(false)}>刷新余额</Button>
                            <Button loading={syncingKey} onClick={() => void syncProjectKey(true)}>
                                同步账号 Key
                            </Button>
                            <Button danger loading={authLoading} onClick={() => void handleLogout()}>
                                退出登录
                            </Button>
                        </Space>
                    </div>

                    <Tabs
                        activeKey={activeTab}
                        onChange={(key) => setActiveTab(key as "tokens" | "billing" | "logs")}
                        items={[
                            {
                                key: "tokens",
                                label: "令牌",
                                children: (
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button loading={tokensLoading} onClick={() => void loadTokens(tokenPage)}>
                                                刷新令牌
                                            </Button>
                                            <Button onClick={() => void handleCreateDefaultToken()}>创建默认 Key</Button>
                                        </div>
                                        <Table
                                            rowKey="id"
                                            size="small"
                                            loading={tokensLoading}
                                            columns={tokenColumns}
                                            dataSource={tokens}
                                            pagination={{
                                                current: tokenPage,
                                                total: tokenTotal,
                                                pageSize: tokenPageSize,
                                                onChange: (page) => {
                                                    void loadTokens(page);
                                                },
                                            }}
                                        />
                                    </div>
                                ),
                            },
                            {
                                key: "billing",
                                label: "充值",
                                children: (
                                    <div className="space-y-4">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button loading={topupLoading} onClick={() => void loadTopupInfo()}>
                                                刷新充值配置
                                            </Button>
                                            <Button href={status?.top_up_link || "https://api.antsk.cn"} target="_blank" rel="noreferrer noopener">
                                                官网充值
                                            </Button>
                                        </div>

                                        <div className="grid gap-3 md:grid-cols-3">
                                            <Form.Item label="支付方式" className="mb-0">
                                                <Select
                                                    value={selectedPaymentMethod || undefined}
                                                    options={topupMethods.map((item) => ({ value: item.type, label: item.name }))}
                                                    onChange={setSelectedPaymentMethod}
                                                    placeholder="请选择支付方式"
                                                />
                                            </Form.Item>
                                            <Form.Item label="充值金额" className="mb-0">
                                                <Select
                                                    value={selectedTopupAmount || undefined}
                                                    options={(topupInfo?.amount_options || []).map((value) => ({ value: String(value), label: `${value}` }))}
                                                    onChange={setSelectedTopupAmount}
                                                    placeholder="请选择金额"
                                                />
                                            </Form.Item>
                                            <Form.Item label="预估支付金额" className="mb-0">
                                                <div className="flex h-8 items-center text-sm text-stone-700 dark:text-stone-200">{estimatedAmount === null ? "未计算" : `${status?.custom_currency_symbol || "￥"}${estimatedAmount.toFixed(2)}`}</div>
                                            </Form.Item>
                                        </div>

                                        <Space wrap>
                                            <Button loading={estimateLoading} onClick={() => void handleEstimateAmount()}>
                                                计算预估金额
                                            </Button>
                                            <Button type="primary" loading={payLoading} onClick={() => void handlePay()}>
                                                立即充值
                                            </Button>
                                        </Space>

                                        <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                                            <Input
                                                value={redeemCode}
                                                placeholder="输入兑换码"
                                                onChange={(event) => setRedeemCode(event.target.value)}
                                            />
                                            <Button loading={payLoading} onClick={() => void handleRedeemCode()}>
                                                兑换
                                            </Button>
                                        </div>
                                    </div>
                                ),
                            },
                            {
                                key: "logs",
                                label: "日志",
                                children: (
                                    <div className="space-y-3">
                                        <div className="grid gap-3 md:grid-cols-4">
                                            <Form.Item label="日志类型" className="mb-0">
                                                <Select
                                                    value={logType}
                                                    options={[
                                                        { value: 2, label: "消费日志" },
                                                        { value: 4, label: "错误日志" },
                                                        { value: 1, label: "充值日志" },
                                                        { value: 5, label: "系统日志" },
                                                    ]}
                                                    onChange={setLogType}
                                                />
                                            </Form.Item>
                                            <Form.Item label="令牌名" className="mb-0">
                                                <Input value={logTokenName} onChange={(event) => setLogTokenName(event.target.value)} placeholder="可选" />
                                            </Form.Item>
                                            <Form.Item label="模型名" className="mb-0">
                                                <Input value={logModelName} onChange={(event) => setLogModelName(event.target.value)} placeholder="可选" />
                                            </Form.Item>
                                            <Form.Item label="开始时间" className="mb-0">
                                                <Input type="datetime-local" value={logStart} onChange={(event) => setLogStart(event.target.value)} />
                                            </Form.Item>
                                        </div>
                                        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
                                            <Form.Item label="结束时间" className="mb-0">
                                                <Input type="datetime-local" value={logEnd} onChange={(event) => setLogEnd(event.target.value)} />
                                            </Form.Item>
                                            <div className="flex items-end">
                                                <Button type="primary" loading={logsLoading} onClick={() => void loadLogs(1)}>
                                                    查询日志
                                                </Button>
                                            </div>
                                        </div>

                                        {logStats ? (
                                            <div className="grid gap-3 md:grid-cols-3">
                                                <Statistic title="总消耗" value={formatQuota(logStats.quota, status, 4)} />
                                                <Statistic title="RPM" value={logStats.rpm ?? 0} />
                                                <Statistic title="TPM" value={logStats.tpm ?? 0} />
                                            </div>
                                        ) : null}

                                        <Table
                                            rowKey="id"
                                            size="small"
                                            loading={logsLoading}
                                            columns={logColumns}
                                            dataSource={logs}
                                            locale={{ emptyText: "暂无日志" }}
                                            pagination={{
                                                current: logPage,
                                                total: logTotal,
                                                pageSize: logPageSize,
                                                onChange: (page) => {
                                                    void loadLogs(page);
                                                },
                                            }}
                                        />
                                    </div>
                                ),
                            },
                        ]}
                    />
                </div>
            )}
        </div>
    );
}
