import { useCallback, useEffect, useRef, useState } from "react";
import { OfflineStore } from "@/lib/offlineStore";

export interface OfflineCacheResult<T> {
  data: T | null;
  loading: boolean;
  isFromCache: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Busca dados na rede e guarda no cache offline. Sem rede, devolve o último
 * payload válido do IndexedDB (null se expirado ou inexistente).
 */
export function useOfflineCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMinutes = 60,
  enabled = true,
): OfflineCacheResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [isFromCache, setIsFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fresh = await fetcherRef.current();
      setData(fresh);
      setIsFromCache(false);
      await OfflineStore.cacheData(key, fresh, ttlMinutes).catch(() => {});
    } catch (err: any) {
      const cached = await OfflineStore.getCachedData<T>(key).catch(() => null);
      if (cached !== null && cached !== undefined) {
        setData(cached);
        setIsFromCache(true);
      } else {
        setData(null);
        setIsFromCache(false);
        setError(err?.message || "Falha ao carregar dados");
      }
    } finally {
      setLoading(false);
    }
  }, [key, ttlMinutes]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    void load();
  }, [enabled, load]);

  return { data, loading, isFromCache, error, refetch: load };
}
