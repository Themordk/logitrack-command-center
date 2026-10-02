import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { retornosKeys } from "./retornosKeys";
import { obterCatalogo, obterConfig } from "./retornosService";

export const MODULO_RETORNO = "web.config.integracao";

export function useCatalogoRetorno() {
  return useQuery({
    queryKey: retornosKeys.catalogo(),
    queryFn: obterCatalogo,
    staleTime: 10 * 60 * 1000,
  });
}

export function useRetornoConfig() {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  return useQuery({
    queryKey: retornosKeys.config(tenantId, empresaId, empresaVersion),
    queryFn: () => obterConfig(tenantId as string, empresaId as string),
    enabled: !!tenantId && !!empresaId,
    refetchInterval: 30_000,
  });
}

export function usePermissaoRetorno() {
  const { can } = usePermissions();
  return { podeVer: can(MODULO_RETORNO, "READ"), podeEditar: can(MODULO_RETORNO, "UPDATE") };
}
