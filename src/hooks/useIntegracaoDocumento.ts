import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { IntegracaoDocumento } from "@/lib/integracaoStatus";

type Linha = {
  integracao_estado: string | null; integracao_evento: string | null; integracao_em: string | null;
  integracao_erro: string | null; integracao_execucao_id: string | null; integracao_erros_outros: number | null;
  status_integracao: string | null;
};

/** Status de integração (S1) de um documento, lido das colunas calculadas pelo banco. */
export function useIntegracaoDocumento(
  entidade: "documento_saida" | "documento_entrada",
  documentoId: string | null | undefined,
  tenantId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["integracao-documento", entidade, tenantId, documentoId],
    queryFn: async (): Promise<IntegracaoDocumento | null> => {
      // Colunas novas (S1) ainda fora dos tipos gerados do Supabase.
      const { data, error } = await (supabase as unknown as {
        from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: Linha | null; error: Error | null }> } } } };
      })
        .from(entidade)
        .select("integracao_estado, integracao_evento, integracao_em, integracao_erro, integracao_execucao_id, integracao_erros_outros, status_integracao")
        .eq("id", documentoId!)
        .eq("tenant_id", tenantId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        estado: (data.integracao_estado ?? "nao_integra") as IntegracaoDocumento["estado"],
        evento: data.integracao_evento, em: data.integracao_em, erro: data.integracao_erro,
        execucao_id: data.integracao_execucao_id, erros_outros: data.integracao_erros_outros,
        marcador: data.status_integracao,
      };
    },
    enabled: !!documentoId && !!tenantId,
    refetchInterval: 15_000,
  });
}
