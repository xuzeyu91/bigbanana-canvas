"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { App } from "antd";

import { applyApiKeyToConfig } from "@/services/account-key-sync";
import { bootstrapNewApiSession, ensurePrimaryTokenKey } from "@/services/new-api-service";
import { ANTSK_BASE_URL, createModelChannel, useConfigStore } from "@/stores/use-config-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const { message } = App.useApp();
    const handledConfigParams = useRef(false);
    const handledSessionKeySync = useRef(false);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const config = useConfigStore((state) => state.config);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        const importedBaseUrl = (searchParams.get("baseUrl") || searchParams.get("baseurl") || "").trim();
        const apiKey = searchParams.get("apiKey") || searchParams.get("apikey");
        if (!importedBaseUrl && !apiKey) return;
        handledConfigParams.current = true;
        searchParams.delete("baseUrl");
        searchParams.delete("baseurl");
        searchParams.delete("apiKey");
        searchParams.delete("apikey");
        window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
        const firstChannel = config.channels[0];
        updateConfig(
            "channels",
            firstChannel
                ? config.channels.map((channel, index) =>
                      index === 0
                          ? {
                                ...channel,
                                baseUrl: ANTSK_BASE_URL,
                                ...(apiKey ? { apiKey } : {}),
                            }
                          : channel,
                  )
                : [createModelChannel({ id: "default", name: "BigBanana API", baseUrl: ANTSK_BASE_URL, apiKey: apiKey || "" })],
        );
        updateConfig("baseUrl", ANTSK_BASE_URL);
        if (apiKey) updateConfig("apiKey", apiKey);
        openConfigDialog(false);
        if (importedBaseUrl && importedBaseUrl !== ANTSK_BASE_URL) message.warning(`当前 Base URL 固定为 ${ANTSK_BASE_URL}，已忽略传入地址`);
        message.success("已导入本地直连配置");
    }, [config.channels, message, openConfigDialog, updateConfig]);

    useEffect(() => {
        if (handledSessionKeySync.current) return;
        handledSessionKeySync.current = true;
        void (async () => {
            try {
                const session = await bootstrapNewApiSession();
                if (!session) return;
                const result = await ensurePrimaryTokenKey(true);
                applyApiKeyToConfig(result.key);
            } catch {
                // ignore silent bootstrap errors
            }
        })();
    }, []);

    return <>{children}</>;
}
