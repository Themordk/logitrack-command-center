import { supabase } from "@/integrations/supabase/client";
import type { DestinoArmazenagem } from "@/types/armazenagem";

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (supabase as unknown as { rpc: RpcFn }).rpc.bind(supabase);

export async function buscarDestinoArmazenagem(params: {
  produtoId: string;
  tarefaId?: string | null;
  quantidade?: number | null;
}): Promise<DestinoArmazenagem> {
  const { data, error } = await rpc("rpc_coletor_armazenagem_destino", {
    p_tenant_id: localStorage.getItem("core_tenant_id"),
    p_empresa_id: localStorage.getItem("core_empresa_id"),
    p_armazem_id: localStorage.getItem("core_armazem_id"),
    p_produto_id: params.produtoId,
    p_tarefa_id: params.tarefaId ?? null,
    p_quantidade: params.quantidade ?? null,
  });
  if (error) throw new Error(error.message);
  const parsed = (typeof data === "string" ? JSON.parse(data) : data) as DestinoArmazenagem;
  if (!parsed || parsed.sucesso === false) {
    throw new Error(parsed?.mensagem || "Não foi possível calcular o destino.");
  }
  return parsed;
}
