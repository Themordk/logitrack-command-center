import { useCallback, useMemo, useState } from "react";

export interface RecebimentoFilters {
  tipoEntrada: string;
  numeroMovimento: string;
  numeroDocumento: string;
  parceiro: string;
}

export const EMPTY_RECEBIMENTO_FILTERS: RecebimentoFilters = {
  tipoEntrada: "",
  numeroMovimento: "",
  numeroDocumento: "",
  parceiro: "",
};

interface FiltravelMovimento {
  numero_movimento: number;
  notas: string | null;
  tipo_entrada: string | null;
  parceiro: string | null;
  parceiro_busca: string | null;
}

function readFilters(key: string): RecebimentoFilters {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return EMPTY_RECEBIMENTO_FILTERS;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_RECEBIMENTO_FILTERS, ...parsed };
  } catch {
    return EMPTY_RECEBIMENTO_FILTERS;
  }
}

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function useRecebimentoFilter(storageKey: string) {
  const [filters, setFiltersState] = useState<RecebimentoFilters>(() => readFilters(storageKey));

  const persist = useCallback(
    (next: RecebimentoFilters) => {
      setFiltersState(next);
      try {
        const isEmpty =
          !next.tipoEntrada && !next.numeroMovimento && !next.numeroDocumento && !next.parceiro;
        if (isEmpty) sessionStorage.removeItem(storageKey);
        else sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage indisponível */
      }
    },
    [storageKey],
  );

  const clear = useCallback(() => persist(EMPTY_RECEBIMENTO_FILTERS), [persist]);

  const activeCount = useMemo(
    () =>
      [filters.tipoEntrada, filters.numeroMovimento, filters.numeroDocumento, filters.parceiro].filter(
        (v) => v.trim() !== "",
      ).length,
    [filters],
  );

  const apply = useCallback(
    <T extends FiltravelMovimento>(lista: T[]): T[] => {
      const tipo = filters.tipoEntrada.trim().toLowerCase();
      const mov = filters.numeroMovimento.trim().toLowerCase();
      const doc = filters.numeroDocumento.trim().toLowerCase();
      const parc = normalizar(filters.parceiro.trim());
      if (!tipo && !mov && !doc && !parc) return lista;

      return lista.filter((m) => {
        if (tipo && (m.tipo_entrada || "").trim().toLowerCase() !== tipo) return false;
        if (mov && !String(m.numero_movimento ?? "").toLowerCase().includes(mov)) return false;
        if (doc && !(m.notas ?? "").toLowerCase().includes(doc)) return false;
        if (parc && !normalizar(m.parceiro_busca ?? m.parceiro ?? "").includes(parc)) return false;
        return true;
      });
    },
    [filters],
  );

  return { filters, setFilters: persist, clear, activeCount, apply };
}
