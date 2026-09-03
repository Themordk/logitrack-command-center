import { useCallback, useMemo, useState } from "react";

export interface OndasFilters {
  tipoSaida: string;
  numeroMovimento: string;
  numeroDocumento: string;
}

export const EMPTY_ONDAS_FILTERS: OndasFilters = {
  tipoSaida: "",
  numeroMovimento: "",
  numeroDocumento: "",
};

interface FiltravelOnda {
  numero_onda: number;
  pedidos: string;
  tipo_venda: string;
}

function readFilters(key: string): OndasFilters {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return EMPTY_ONDAS_FILTERS;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_ONDAS_FILTERS, ...parsed };
  } catch {
    return EMPTY_ONDAS_FILTERS;
  }
}

export function useOndasFilter(storageKey: string) {
  const [filters, setFiltersState] = useState<OndasFilters>(() => readFilters(storageKey));

  const persist = useCallback(
    (next: OndasFilters) => {
      setFiltersState(next);
      try {
        const isEmpty = !next.tipoSaida && !next.numeroMovimento && !next.numeroDocumento;
        if (isEmpty) sessionStorage.removeItem(storageKey);
        else sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage indisponível */
      }
    },
    [storageKey],
  );

  const clear = useCallback(() => persist(EMPTY_ONDAS_FILTERS), [persist]);

  const activeCount = useMemo(
    () => [filters.tipoSaida, filters.numeroMovimento, filters.numeroDocumento].filter((v) => v.trim() !== "").length,
    [filters],
  );

  const apply = useCallback(
    <T extends FiltravelOnda>(lista: T[]): T[] => {
      const tipo = filters.tipoSaida.trim().toLowerCase();
      const mov = filters.numeroMovimento.trim().toLowerCase();
      const doc = filters.numeroDocumento.trim().toLowerCase();
      if (!tipo && !mov && !doc) return lista;

      return lista.filter((o) => {
        if (tipo && (o.tipo_venda || "").trim().toLowerCase() !== tipo) return false;
        if (mov && !String(o.numero_onda ?? "").toLowerCase().includes(mov)) return false;
        if (doc && !(o.pedidos || "").toLowerCase().includes(doc)) return false;
        return true;
      });
    },
    [filters],
  );

  return { filters, setFilters: persist, clear, activeCount, apply };
}
