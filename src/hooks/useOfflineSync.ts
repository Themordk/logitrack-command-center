import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { OfflineStore, type PendingAction } from "@/lib/offlineStore";

export interface SyncProgress {
  current: number;
  total: number;
}

export interface OfflineSyncState {
  pendingCount: number;
  failedCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  syncProgress: SyncProgress;
  refreshCounts: () => Promise<void>;
  syncNow: () => Promise<void>;
  retryAction: (id: string) => Promise<void>;
}

export function isNetworkError(err: any): boolean {
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network request failed") ||
    msg.includes("load failed") ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    err?.name === "AbortError" ||
    err?.name === "TypeError"
  );
}

/** Considera "já processado" no servidor — idempotência. */
function isAlreadyProcessed(err: any): boolean {
  const code = String(err?.code ?? "");
  const msg = String(err?.message ?? "").toLowerCase();
  return (
    code === "409" ||
    code === "23505" ||
    msg.includes("já foi") ||
    msg.includes("ja foi") ||
    msg.includes("already processed") ||
    msg.includes("duplicate key")
  );
}

export function useOfflineSync(isOnline: boolean): OfflineSyncState {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({ current: 0, total: 0 });
  const syncingRef = useRef(false);
  const wasOnlineRef = useRef(isOnline);

  const refreshCounts = useCallback(async () => {
    try {
      const [p, f] = await Promise.all([OfflineStore.getPendingCount(), OfflineStore.getFailedCount()]);
      setPendingCount(p);
      setFailedCount(f);
    } catch {
      /* IndexedDB indisponível */
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const queue: PendingAction[] = await OfflineStore.getPendingActions();
      setSyncProgress({ current: 0, total: queue.length });
      let index = 0;
      for (const item of queue) {
        index += 1;
        setSyncProgress({ current: index, total: queue.length });
        await OfflineStore.markActionSyncing(item.id);
        try {
          const { data, error } = await supabase.rpc(item.action as any, item.params);
          if (error) {
            if (isNetworkError(error)) {
              await OfflineStore.markActionPending(item.id);
              break; // pausa a fila; tenta no próximo ciclo
            }
            if (isAlreadyProcessed(error)) {
              await OfflineStore.markActionSynced(item.id);
              continue;
            }
            await OfflineStore.markActionFailed(item.id, error.message || "Erro ao sincronizar");
            continue;
          }
          const payload: any = typeof data === "string" ? safeParse(data) : data;
          if (payload && typeof payload === "object" && !Array.isArray(payload) && payload.sucesso === false) {
            await OfflineStore.markActionFailed(item.id, payload.mensagem || "Ação rejeitada pelo servidor");
            continue;
          }
          await OfflineStore.markActionSynced(item.id);
        } catch (err: any) {
          if (isNetworkError(err)) {
            await OfflineStore.markActionPending(item.id);
            break;
          }
          await OfflineStore.markActionFailed(item.id, err?.message || "Erro ao sincronizar");
        }
      }
      setLastSyncAt(new Date());
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
      setSyncProgress({ current: 0, total: 0 });
      await refreshCounts();
    }
  }, [refreshCounts]);

  // Contagens iniciais + atualização periódica leve
  useEffect(() => {
    void refreshCounts();
    const iv = setInterval(() => { void refreshCounts(); }, 5000);
    return () => clearInterval(iv);
  }, [refreshCounts]);

  // Transição offline -> online dispara sincronização
  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (isOnline && !wasOnline) {
      void processQueue();
    }
  }, [isOnline, processQueue]);

  // Sincronização oportunista quando há pendências e estamos online
  useEffect(() => {
    if (!isOnline || pendingCount === 0 || syncingRef.current) return;
    const t = setTimeout(() => { void processQueue(); }, 3000);
    return () => clearTimeout(t);
  }, [isOnline, pendingCount, processQueue]);

  // Limpeza de ações sincronizadas a cada 1h
  useEffect(() => {
    void OfflineStore.clearSyncedActions();
    void OfflineStore.clearExpiredCache();
    const iv = setInterval(() => {
      void OfflineStore.clearSyncedActions();
      void OfflineStore.clearExpiredCache();
    }, 60 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const syncNow = useCallback(async () => {
    await processQueue();
  }, [processQueue]);

  const retryAction = useCallback(async (id: string) => {
    await OfflineStore.markActionPending(id);
    await refreshCounts();
    await processQueue();
  }, [processQueue, refreshCounts]);

  return { pendingCount, failedCount, isSyncing, lastSyncAt, syncProgress, refreshCounts, syncNow, retryAction };
}

function safeParse(v: string) {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
