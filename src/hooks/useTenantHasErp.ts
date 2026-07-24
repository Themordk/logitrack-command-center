import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna true quando o tenant possui ao menos uma conexão ERP ativa.
 * Usado para condicionar a exibição do indicador ERP em telas de movimentos.
 */
export function useTenantHasErp(tenantId: string | null | undefined) {
  const q = useQuery({
    queryKey: ["tenant-has-erp", tenantId],
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("erp_conexao")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("ativo", true);
      if (error) return false;
      return (count ?? 0) > 0;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });
  return q.data === true;
}
