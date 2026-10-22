import { useEffect, useState } from "react";
import type { MapaItem } from "../retornos.types";
import { criarMapa, montarPayload } from "./avaliacao";
import { useMapaRetorno } from "./useMapaRetorno";

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
  const mapa = useMapaRetorno(tenantId, empresaId, fluxoId);
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
