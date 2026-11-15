import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Resumo de integração com o ERP (S1) das ondas ou recebimentos da página atual.
 * As RPCs de lista não devolvem a coluna; uma consulta por página (ids) evita mudar o contrato delas.
 */
export function useIntegracaoResumo(
  tabela: "movimento_saida" | "movimento_entrada",
  tenantId: string | null | undefined,
  ids: string[],
  habilitado = true,
) {
  const chave = ids.join(",");
  return useQuery({
    queryKey: ["integracao-resumo", tabela, tenantId, chave],
    queryFn: async () => {
      const mapa = new Map<string, string>();
      if (!ids.length) return mapa;
      // Coluna nova (S1) ainda fora dos tipos gerados do Supabase.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => { eq: (k: string, v: string) => { in: (k: string, v: string[]) => Promise<{ data: { id: string; integracao_resumo: string | null }[] | null; error: Error | null }> } };
        };
      })
        .from(tabela)
        .select("id, integracao_resumo")
        .eq("tenant_id", tenantId!)
        .in("id", ids);
      if (error) throw error;
      for (const r of data ?? []) mapa.set(r.id, r.integracao_resumo ?? "nao_integra");
      return mapa;
    },
    enabled: habilitado && !!tenantId && ids.length > 0,
    staleTime: 15_000,
  });
}
