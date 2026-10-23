import { useCallback, useEffect, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

const ISO_DATA = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

function vazio(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function normalizar(v: unknown): number | string {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.getTime();
  const s = String(v).trim();
  if (ISO_DATA.test(s)) {
    const t = Date.parse(s);
    if (!Number.isNaN(t)) return t;
  }
  return s;
}

/** Compara dois valores já não vazios: números/datas numericamente, textos em ordem natural pt-BR. */
export function compararValores(a: unknown, b: unknown): number {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (typeof na === "number" && typeof nb === "number") return na - nb;
  return String(na).localeCompare(String(nb), "pt-BR", { numeric: true, sensitivity: "base" });
}

/** Ordena sem mutar; vazios sempre no final; desempate pelo SKU. */
export function ordenarLinhas<T>(
  rows: T[],
  key: string,
  dir: SortDir,
  accessors?: Record<string, (row: T) => unknown>,
): T[] {
  const get = (row: T, k: string): unknown =>
    accessors?.[k] ? accessors[k](row) : (row as Record<string, unknown>)[k];
  const sinal = dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i }))
    .sort((x, y) => {
      const va = get(x.row, key);
      const vb = get(y.row, key);
      const ea = vazio(va);
      const eb = vazio(vb);
      if (ea !== eb) return ea ? 1 : -1;
      if (!ea) {
        const c = compararValores(va, vb);
        if (c !== 0) return c * sinal;
      }
      if (key !== "sku") {
        const sa = get(x.row, "sku");
        const sb = get(y.row, "sku");
        if (!vazio(sa) && !vazio(sb)) {
          const c = compararValores(sa, sb);
          if (c !== 0) return c;
        }
      }
      return x.i - y.i;
    })
    .map((e) => e.row);
}

/**
 * Ordenação no cliente por clique no cabeçalho.
 * `resetKey`: quando muda (ex.: id do movimento), volta para a coluna padrão em "asc".
 */
export function useTableSort<T>(
  rows: T[],
  defaultKey: string,
  accessors?: Record<string, (row: T) => unknown>,
  resetKey?: unknown,
) {
  const [sortKey, setSortKey] = useState<string>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    setSortKey(defaultKey);
    setSortDir("asc");
  }, [resetKey, defaultKey]);

  const toggleSort = useCallback(
    (key: string) => {
      if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      else {
        setSortKey(key);
        setSortDir("asc");
      }
    },
    [sortKey],
  );

  // accessors costuma ser objeto literal; a ordenação depende só dos dados e da coluna
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sortedRows = useMemo(() => ordenarLinhas(rows, sortKey, sortDir, accessors), [rows, sortKey, sortDir]);

  return { sortedRows, sortKey, sortDir, toggleSort };
}
