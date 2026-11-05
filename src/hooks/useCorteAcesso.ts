import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseRpcResult } from "@/lib/errorMapper";

interface CorteAcessoDados {
  pode_cortar_direto_coletor?: boolean;
  pode_cortar_web?: boolean;
  exige_autorizacao?: boolean;
}

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
const rpc = supabase.rpc.bind(supabase) as unknown as RpcFn;

/** Regra de corte decidida pelo servidor. Em erro, falha segura: exige supervisor. */
export function useCorteAcesso(params: { armazemId?: string | null; empresaId?: string | null } = {}) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = params.armazemId ?? null;
  const empresaId = params.empresaId ?? localStorage.getItem("core_empresa_id");

  const q = useQuery({
    queryKey: ["corte-acesso", tenantId, armazemId, empresaId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<CorteAcessoDados> => {
      const { data, error } = await rpc("corte_verificar_acesso", {
        p_tenant_id: tenantId,
        p_armazem_id: armazemId,
        p_empresa_id: empresaId ?? null,
      });
      if (error) throw error;
      const r = parseRpcResult(data);
      if (!r.sucesso) throw new Error(r.codigo);
      return ((r as unknown as { dados?: CorteAcessoDados }).dados) ?? {};
    },
  });

  const falhou = q.isError || (!tenantId);
  const podeCortarDiretoColetor = !falhou && !!q.data?.pode_cortar_direto_coletor;
  const podeCortarWeb = !falhou && !!q.data?.pode_cortar_web;
  const exigeAutorizacao = falhou ? true : !!q.data?.exige_autorizacao;

  return {
    loading: q.isLoading,
    podeCortarDiretoColetor,
    podeCortarWeb,
    exigeAutorizacao,
    precisaSupervisor: exigeAutorizacao && !podeCortarDiretoColetor,
    refetch: q.refetch,
  };
}
