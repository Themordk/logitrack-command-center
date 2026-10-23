import { supabase } from "@/integrations/supabase/client";
import type { PickingTransferencia, PickingsTransferenciaResposta } from "@/types/transferencia";

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (supabase as unknown as { rpc: RpcFn }).rpc.bind(supabase);

export async function buscarPickingsTransferencia(params: { produtoId: string; origemId: string }): Promise<PickingsTransferenciaResposta> {
  const { data, error } = await rpc("rpc_coletor_transferencia_picking", {
    p_tenant_id: localStorage.getItem("core_tenant_id"),
    p_empresa_id: localStorage.getItem("core_empresa_id"),
    p_armazem_id: localStorage.getItem("core_armazem_id"),
    p_produto_id: params.produtoId,
    p_endereco_origem_id: params.origemId,
  });
  if (error) throw new Error(error.message);
  const resposta = (typeof data === "string" ? JSON.parse(data) : data) as PickingsTransferenciaResposta;
  if (!resposta || resposta.sucesso === false) {
    throw new Error(resposta?.mensagem || "Não foi possível consultar os pickings.");
  }
  return resposta;
}

/** Prioriza picking utilizável e, dentro dessa prioridade, diferente da origem. */
export function ordenarPickingsTransferencia(pickings: PickingTransferencia[]): PickingTransferencia[] {
  return [...pickings].sort((a, b) => Number(b.utilizavel) - Number(a.utilizavel) || Number(a.e_origem) - Number(b.e_origem));
}

export function quantidadeNaEmbalagem(quantidade: number, fator: number, embalagem: string): string {
  const inteira = fator > 1 ? Math.floor(quantidade / fator) : quantidade;
  const resto = fator > 1 ? quantidade % fator : 0;
  return `${inteira.toLocaleString("pt-BR")} ${embalagem}${resto > 0 ? ` + ${resto.toLocaleString("pt-BR")} UN` : ""}`;
}

export function excessoPicking(picking: PickingTransferencia | undefined, quantidadeUN: number): number {
  return picking && !picking.e_origem && picking.cabe !== null ? Math.max(0, quantidadeUN - picking.cabe) : 0;
}