// Camada de persistência offline do coletor (IndexedDB nativo, sem dependências).
// Dois object stores: fila de ações (client -> server) e cache de leitura.

const DB_NAME = "core_logitrack_offline";
const DB_VERSION = 1;
const STORE_ACTIONS = "pending_actions";
const STORE_CACHE = "cached_data";

export type PendingActionStatus = "pending" | "syncing" | "synced" | "failed";

export interface PendingAction {
  id: string;
  timestamp: number;
  action: string;
  params: Record<string, any>;
  status: PendingActionStatus;
  retryCount: number;
  errorMessage?: string;
  tenantId: string | null;
  empresaId: string | null;
  usuarioId: string | null;
}

export interface CachedEntry<T = any> {
  key: string;
  data: T;
  cachedAt: number;
  expiresAt: number;
  tenantId: string | null;
}

export interface ActionContext {
  tenantId?: string | null;
  empresaId?: string | null;
  usuarioId?: string | null;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB indisponível neste dispositivo."));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ACTIONS)) {
        const store = db.createObjectStore(STORE_ACTIONS, { keyPath: "id" });
        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_timestamp", "timestamp", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_CACHE)) {
        const store = db.createObjectStore(STORE_CACHE, { keyPath: "key" });
        store.createIndex("by_tenant", "tenantId", { unique: false });
        store.createIndex("by_expires", "expiresAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let request: IDBRequest<T> | void;
        try {
          request = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        transaction.oncomplete = () => resolve((request as IDBRequest<T>)?.result as T);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      }),
  );
}

function getAll<T>(storeName: string): Promise<T[]> {
  return tx<T[]>(storeName, "readonly", (store) => store.getAll() as IDBRequest<T[]>).then((r) => r || []);
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `off-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/* ---------------------------------- Fila --------------------------------- */

export async function enqueueAction(
  action: string,
  params: Record<string, any>,
  context: ActionContext = {},
): Promise<string> {
  const record: PendingAction = {
    id: generateId(),
    timestamp: Date.now(),
    action,
    params,
    status: "pending",
    retryCount: 0,
    tenantId: context.tenantId ?? null,
    empresaId: context.empresaId ?? null,
    usuarioId: context.usuarioId ?? null,
  };
  await tx(STORE_ACTIONS, "readwrite", (store) => store.put(record));
  return record.id;
}

export async function getAllActions(): Promise<PendingAction[]> {
  const all = await getAll<PendingAction>(STORE_ACTIONS);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const all = await getAllActions();
  return all.filter((a) => a.status === "pending" || a.status === "syncing");
}

export async function getFailedActions(): Promise<PendingAction[]> {
  const all = await getAllActions();
  return all.filter((a) => a.status === "failed");
}

async function updateAction(id: string, patch: Partial<PendingAction>): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_ACTIONS, "readwrite");
    const store = transaction.objectStore(STORE_ACTIONS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const current = getReq.result as PendingAction | undefined;
      if (current) store.put({ ...current, ...patch });
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export function markActionSyncing(id: string): Promise<void> {
  return updateAction(id, { status: "syncing" });
}

export function markActionSynced(id: string): Promise<void> {
  return updateAction(id, { status: "synced", errorMessage: undefined });
}

export async function markActionFailed(id: string, error: string): Promise<void> {
  const all = await getAllActions();
  const current = all.find((a) => a.id === id);
  await updateAction(id, {
    status: "failed",
    errorMessage: error,
    retryCount: (current?.retryCount ?? 0) + 1,
  });
}

export function markActionPending(id: string): Promise<void> {
  return updateAction(id, { status: "pending", errorMessage: undefined });
}

export async function getPendingCount(): Promise<number> {
  return (await getPendingActions()).length;
}

export async function getFailedCount(): Promise<number> {
  return (await getFailedActions()).length;
}

export async function deleteAction(id: string): Promise<void> {
  await tx(STORE_ACTIONS, "readwrite", (store) => store.delete(id));
}

/** Remove ações já sincronizadas com mais de 24h. */
export async function clearSyncedActions(): Promise<void> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const all = await getAllActions();
  const stale = all.filter((a) => a.status === "synced" && a.timestamp < cutoff);
  for (const a of stale) await deleteAction(a.id);
}

/* --------------------------------- Cache --------------------------------- */

export async function cacheData(key: string, data: any, ttlMinutes = 60): Promise<void> {
  const now = Date.now();
  const record: CachedEntry = {
    key,
    data,
    cachedAt: now,
    expiresAt: now + ttlMinutes * 60 * 1000,
    tenantId: localStorage.getItem("core_tenant_id"),
  };
  await tx(STORE_CACHE, "readwrite", (store) => store.put(record));
}

export async function getCachedData<T>(key: string): Promise<T | null> {
  const entry = await tx<CachedEntry<T> | undefined>(STORE_CACHE, "readonly", (store) => store.get(key) as IDBRequest<CachedEntry<T>>);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) return null;
  return entry.data;
}

export async function getCacheEntries(): Promise<CachedEntry[]> {
  return getAll<CachedEntry>(STORE_CACHE);
}

export async function clearExpiredCache(): Promise<void> {
  const entries = await getCacheEntries();
  const now = Date.now();
  for (const e of entries) {
    if (e.expiresAt < now) {
      await tx(STORE_CACHE, "readwrite", (store) => store.delete(e.key));
    }
  }
}

export async function clearAllCache(): Promise<void> {
  await tx(STORE_CACHE, "readwrite", (store) => store.clear());
}

/** Tamanho aproximado (bytes) do cache serializado. */
export async function getCacheSizeBytes(): Promise<number> {
  const entries = await getCacheEntries();
  let total = 0;
  for (const e of entries) {
    try {
      total += new Blob([JSON.stringify(e.data)]).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

export const OfflineStore = {
  enqueueAction,
  getAllActions,
  getPendingActions,
  getFailedActions,
  markActionSyncing,
  markActionSynced,
  markActionFailed,
  markActionPending,
  getPendingCount,
  getFailedCount,
  deleteAction,
  clearSyncedActions,
  cacheData,
  getCachedData,
  getCacheEntries,
  clearExpiredCache,
  clearAllCache,
  getCacheSizeBytes,
};
