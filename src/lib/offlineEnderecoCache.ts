import { cacheData, getCachedData } from "@/lib/offlineStore";

const CACHE_KEY = "endereco_map";
const CACHE_TTL_MIN = 480; // 8 horas

export interface EnderecoCacheEntry {
  id: string;
  descricao: string;
  situacao: string;
  tipo_endereco: string;
  codigo_endereco: number;
}

/** Busca um endereço no cache offline pelo código escaneado. */
export async function getEnderecoFromCache(codigoEndereco: number): Promise<EnderecoCacheEntry | null> {
  const map = await getCachedData<Record<string, EnderecoCacheEntry>>(CACHE_KEY).catch(() => null);
  if (!map) return null;
  const list = Object.values(map) as EnderecoCacheEntry[];
  return list.find((e) => Number(e.codigo_endereco) === Number(codigoEndereco)) ?? null;
}

/** Salva um endereço no cache offline (merge com o mapa existente). */
export async function saveEnderecoToCache(entry: EnderecoCacheEntry): Promise<void> {
  if (!entry?.id) return;
  const map = (await getCachedData<Record<string, EnderecoCacheEntry>>(CACHE_KEY).catch(() => null)) || {};
  map[entry.id] = entry;
  await cacheData(CACHE_KEY, map, CACHE_TTL_MIN);
}

/** Salva múltiplos endereços de uma vez. */
export async function saveEnderecoBatchToCache(entries: EnderecoCacheEntry[]): Promise<void> {
  if (!entries || entries.length === 0) return;
  const map = (await getCachedData<Record<string, EnderecoCacheEntry>>(CACHE_KEY).catch(() => null)) || {};
  for (const e of entries) {
    if (e?.id) map[e.id] = e;
  }
  await cacheData(CACHE_KEY, map, CACHE_TTL_MIN);
}
