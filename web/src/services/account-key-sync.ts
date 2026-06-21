"use client";

import { ANTSK_BASE_URL, createModelChannel, useConfigStore } from "@/stores/use-config-store";
import { ensureTokenKeyPrefix } from "@/services/new-api-service";

export function applyApiKeyToConfig(apiKey: string) {
    const normalizedKey = ensureTokenKeyPrefix(apiKey);
    if (!normalizedKey) return;
    const state = useConfigStore.getState();
    const current = state.config;
    const channels = current.channels.length
        ? current.channels.map((channel, index) => (index === 0 ? { ...channel, baseUrl: ANTSK_BASE_URL, apiKey: normalizedKey } : channel))
        : [createModelChannel({ id: "default", name: "BigBanana API", baseUrl: ANTSK_BASE_URL, apiKey: normalizedKey })];
    state.updateConfig("channels", channels);
    state.updateConfig("baseUrl", ANTSK_BASE_URL);
    state.updateConfig("apiKey", normalizedKey);
}
