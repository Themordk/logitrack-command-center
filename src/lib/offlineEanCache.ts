import { cacheData, getCachedData } from "@/lib/offlineStore";

const CACHE_KEY = "ean_product_map";
const CACHE_TTL_MIN = 480; // 8 horas

export interface EanCacheEntry {
  ean: string;
  fator: number;
  embalagem: string;
  produto_id: string;
}

/** Busca um EAN no cache offline. */
export async function getEanFromCache(ean: string): Promise<EanCacheEntry | null> {
  const map = await getCachedData<Record<string, EanCacheEntry>>(CACHE_KEY).catch(() => null);
  return map?.[ean] ?? null;
}

/** Salva um EAN no cache offline (merge com o mapa existente). */
export async function saveEanToCache(entry: EanCacheEntry): Promise<void> {
  if (!entry?.ean) return;
  const map = (await getCachedData<Record<string, EanCacheEntry>>(CACHE_KEY).catch(() => null)) || {};
  map[entry.ean] = entry;
  await cacheData(CACHE_KEY, map, CACHE_TTL_MIN);
}

/** Salva múltiplos EANs de uma vez. */
export async function saveEanBatchToCache(entries: EanCacheEntry[]): Promise<void> {
  if (!entries || entries.length === 0) return;
  const map = (await getCachedData<Record<string, EanCacheEntry>>(CACHE_KEY).catch(() => null)) || {};
  for (const e of entries) {
    if (e?.ean) map[e.ean] = e;
  }
  await cacheData(CACHE_KEY, map, CACHE_TTL_MIN);
}
