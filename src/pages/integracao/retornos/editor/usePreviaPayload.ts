import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { retornosKeys } from "../retornosKeys";
import { listarMapa } from "../retornosService";
import type { MapaItem } from "../retornos.types";
import { criarMapa, montarPayload } from "./avaliacao";

export interface PreviaPayload {
  valor?: unknown;
  erro?: string;
  calculando: boolean;
  mapa: MapaItem[];
}

/** Calcula no navegador o corpo do "Montar payload" com a amostra (debounce 300 ms). */
export function usePreviaPayload(
  config: Record<string, unknown> | undefined, contexto: unknown, tenantId: string, empresaId: string, fluxoId: string | null,
): PreviaPayload {
  const mapaQ = useQuery({
    queryKey: retornosKeys.mapa(tenantId, empresaId, fluxoId),
    queryFn: () => listarMapa(tenantId, empresaId, fluxoId),
    enabled: !!tenantId && !!empresaId,
  });
  const mapa = useMemo(() => mapaQ.data ?? [], [mapaQ.data]);
  const [res, setRes] = useState<{ valor?: unknown; erro?: string }>({});
  const [calculando, setCalculando] = useState(false);
  const chave = JSON.stringify(config ?? null);

  useEffect(() => {
    if (!config) { setRes({}); return; }
    let vivo = true;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const v = await montarPayload(config, contexto, criarMapa(mapa));
        if (vivo) setRes({ valor: v });
      } catch (e) {
        const err = e as { message?: string; position?: number };
        if (vivo) setRes({ erro: `${err.message ?? "Falha ao avaliar"}${typeof err.position === "number" ? ` (posição ${err.position})` : ""}` });
      } finally {
        if (vivo) setCalculando(false);
      }
    }, 300);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, contexto, mapa]);

  return { ...res, calculando, mapa };
}
