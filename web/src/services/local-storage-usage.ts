"use client";

export type IndexedDbStoreUsage = {
    name: string;
    records: number;
    bytes: number;
};

export type IndexedDbDatabaseUsage = {
    name: string;
    version: number;
    bytes: number;
    stores: IndexedDbStoreUsage[];
    error?: string;
};

export type LocalStorageUsage = {
    usage: number | null;
    quota: number | null;
    contentBytes: number;
    database: IndexedDbDatabaseUsage;
};

const DATABASE_NAME = "infinite-canvas";
const EXPECTED_STORE_NAMES = ["app_state", "image_files", "media_files"];

export async function readLocalStorageUsage(): Promise<LocalStorageUsage> {
    const [estimate, database] = await Promise.all([readStorageEstimate(), readDatabaseUsage(DATABASE_NAME)]);
    return {
        usage: typeof estimate.usage === "number" ? estimate.usage : null,
        quota: typeof estimate.quota === "number" ? estimate.quota : null,
        contentBytes: database.bytes,
        database,
    };
}

async function readStorageEstimate(): Promise<{ usage?: number; quota?: number }> {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return {};
    try {
        return await navigator.storage.estimate();
    } catch {
        return {};
    }
}

type IndexedDbInfo = { name?: string; version?: number };

async function readDatabaseUsage(name: string): Promise<IndexedDbDatabaseUsage> {
    if (typeof indexedDB === "undefined") {
        return { name, version: 0, bytes: 0, stores: [], error: "当前浏览器不支持 IndexedDB" };
    }

    const factory = indexedDB as IDBFactory & { databases?: () => Promise<IndexedDbInfo[]> };
    if (!factory.databases) {
        return { name, version: 0, bytes: 0, stores: emptyStoreUsages(), error: "当前浏览器不支持只读检查 IndexedDB 数据库" };
    }

    let databaseInfo: IndexedDbInfo | undefined;
    try {
        databaseInfo = (await factory.databases()).find((item) => item.name === name);
    } catch (error) {
        return { name, version: 0, bytes: 0, stores: emptyStoreUsages(), error: error instanceof Error ? error.message : "无法读取 IndexedDB 数据库列表" };
    }

    if (!databaseInfo || typeof databaseInfo.version !== "number" || databaseInfo.version <= 0) {
        return { name, version: 0, bytes: 0, stores: emptyStoreUsages(), error: "当前尚未创建 IndexedDB 数据库" };
    }

    return openDatabaseUsage(name, databaseInfo.version);
}

function openDatabaseUsage(name: string, version: number): Promise<IndexedDbDatabaseUsage> {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (result: IndexedDbDatabaseUsage) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        const request = indexedDB.open(name, version);
        request.onupgradeneeded = (event) => {
            if (event.oldVersion !== 0) return;
            request.transaction?.abort();
            finish({ name, version: 0, bytes: 0, stores: emptyStoreUsages(), error: "数据库在读取前已被删除" });
        };
        request.onerror = () => finish({ name, version, bytes: 0, stores: [], error: request.error?.message || "无法读取 IndexedDB" });
        request.onblocked = () => finish({ name, version, bytes: 0, stores: [], error: "IndexedDB 当前被其他操作占用" });
        request.onsuccess = () => {
            const database = request.result;
            if (settled) {
                database.close();
                return;
            }
            const storeNames = Array.from(database.objectStoreNames);
            if (!storeNames.length) {
                const result = { name, version: database.version, bytes: 0, stores: emptyStoreUsages() };
                database.close();
                finish(result);
                return;
            }

            try {
                const transaction = database.transaction(storeNames, "readonly");
                Promise.all(storeNames.map((storeName) => readStoreUsage(transaction.objectStore(storeName))))
                    .then((stores) => {
                        const normalizedStores = mergeExpectedStores(stores);
                        finish({ name, version: database.version, bytes: normalizedStores.reduce((total, store) => total + store.bytes, 0), stores: normalizedStores });
                    })
                    .catch((error) => finish({ name, version: database.version, bytes: 0, stores: [], error: error instanceof Error ? error.message : "无法读取 IndexedDB 内容" }))
                    .finally(() => database.close());
            } catch (error) {
                database.close();
                finish({ name, version: database.version, bytes: 0, stores: [], error: error instanceof Error ? error.message : "无法读取 IndexedDB" });
            }
        };
    });
}

function emptyStoreUsages(): IndexedDbStoreUsage[] {
    return EXPECTED_STORE_NAMES.map((name) => ({ name, records: 0, bytes: 0 }));
}

function mergeExpectedStores(stores: IndexedDbStoreUsage[]) {
    const byName = new Map(stores.map((store) => [store.name, store]));
    return [...EXPECTED_STORE_NAMES, ...stores.map((store) => store.name).filter((name) => !EXPECTED_STORE_NAMES.includes(name))]
        .map((name) => byName.get(name) || { name, records: 0, bytes: 0 })
        .sort((left, right) => right.bytes - left.bytes);
}

function readStoreUsage(store: IDBObjectStore) {
    return new Promise<IndexedDbStoreUsage>((resolve, reject) => {
        let records = 0;
        let bytes = 0;
        const request = store.openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve({ name: store.name, records, bytes });
                return;
            }
            records += 1;
            bytes += valueBytes(cursor.value);
            cursor.continue();
        };
    });
}

function valueBytes(value: unknown) {
    if (value instanceof Blob) return value.size;
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
    try {
        return new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value)).byteLength;
    } catch {
        return 0;
    }
}
