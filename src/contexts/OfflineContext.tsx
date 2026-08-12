import { createContext, useCallback, useContext, useMemo } from "react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useOfflineSync, type SyncProgress } from "@/hooks/useOfflineSync";
import { OfflineStore } from "@/lib/offlineStore";

interface OfflineContextValue {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncAt: Date | null;
  lastCheckAt: Date | null;
  syncProgress: SyncProgress;
  enqueueAction: (action: string, params: Record<string, any>) => Promise<string>;
  getCachedData: <T>(key: string) => Promise<T | null>;
  cacheData: (key: string, data: any, ttlMinutes?: number) => Promise<void>;
  syncNow: () => Promise<void>;
  retryAction: (id: string) => Promise<void>;
  refreshCounts: () => Promise<void>;
  checkNow: () => Promise<boolean>;
}

const OfflineContext = createContext<OfflineContextValue | null>(null);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const { isOnline, lastCheckAt, checkNow } = useOnlineStatus();
  const sync = useOfflineSync(isOnline);

  const enqueueAction = useCallback(
    async (action: string, params: Record<string, any>) => {
      const id = await OfflineStore.enqueueAction(action, params, {
        tenantId: localStorage.getItem("core_tenant_id"),
        empresaId: localStorage.getItem("core_empresa_id"),
        usuarioId: localStorage.getItem("core_usuario_id"),
      });
      await sync.refreshCounts();
      return id;
    },
    [sync],
  );

  const value = useMemo<OfflineContextValue>(
    () => ({
      isOnline,
      isSyncing: sync.isSyncing,
      pendingCount: sync.pendingCount,
      failedCount: sync.failedCount,
      lastSyncAt: sync.lastSyncAt,
      lastCheckAt,
      syncProgress: sync.syncProgress,
      enqueueAction,
      getCachedData: OfflineStore.getCachedData,
      cacheData: OfflineStore.cacheData,
      syncNow: sync.syncNow,
      retryAction: sync.retryAction,
      refreshCounts: sync.refreshCounts,
      checkNow,
    }),
    [isOnline, lastCheckAt, checkNow, enqueueAction, sync],
  );

  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>;
}

/** Valor neutro caso algum componente do coletor seja usado fora do provider. */
const FALLBACK: OfflineContextValue = {
  isOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  lastSyncAt: null,
  lastCheckAt: null,
  syncProgress: { current: 0, total: 0 },
  enqueueAction: async () => "",
  getCachedData: async () => null,
  cacheData: async () => {},
  syncNow: async () => {},
  retryAction: async () => {},
  refreshCounts: async () => {},
  checkNow: async () => (typeof navigator === "undefined" ? true : navigator.onLine),
};

export function useOffline(): OfflineContextValue {
  return useContext(OfflineContext) ?? FALLBACK;
}
