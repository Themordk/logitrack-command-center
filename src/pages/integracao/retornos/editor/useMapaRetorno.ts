import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { retornosKeys } from "../retornosKeys";
import { listarMapa } from "../retornosService";
import type { MapaItem } from "../retornos.types";

/** De-para usado pelas prévias de "Montar payload". */
export function useMapaRetorno(tenantId: string, empresaId: string, fluxoId: string | null): MapaItem[] {
  const q = useQuery({
    queryKey: retornosKeys.mapa(tenantId, empresaId, fluxoId),
    queryFn: () => listarMapa(tenantId, empresaId, fluxoId),
    enabled: !!tenantId && !!empresaId,
  });
  return useMemo(() => q.data ?? [], [q.data]);
}
