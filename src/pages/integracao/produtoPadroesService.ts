import { supabase } from "@/integrations/supabase/client";
import type {
  ModoPadrao, RegraPadraoProduto, ResultadoAplicar, RpcResultado, ValorPadrao,
} from "./produtoPadroes.types";

// As RPCs ainda não estão nos tipos gerados do Supabase: único cast concentrado aqui.
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);

const parse = <T,>(data: unknown): T => (typeof data === "string" ? JSON.parse(data) : data) as T;

export async function listarRegrasPadrao(empresaId: string | null): Promise<RegraPadraoProduto[]> {
  const { data, error } = await rpc("rpc_produto_regra_padrao_listar", { p_empresa_id: empresaId });
  if (error) throw new Error(error.message);
  return (parse<RegraPadraoProduto[]>(data) ?? []).map((r) => ({
    ...r,
    valor: parse<ValorPadrao>(r.valor),
  }));
}

export async function salvarRegraPadrao(params: {
  empresaId: string | null; campo: string; valor: ValorPadrao; modo: ModoPadrao;
}): Promise<RpcResultado<{ id: string; campo: string }>> {
  const { data, error } = await rpc("rpc_produto_regra_padrao_salvar", {
    p_empresa_id: params.empresaId,
    p_campo: params.campo,
    p_valor: params.valor,
    p_modo: params.modo,
    p_ativo: true,
    p_observacao: null,
  });
  if (error) return { sucesso: false, mensagem: error.message };
  return parse(data);
}

export async function removerRegraPadrao(empresaId: string | null, campo: string): Promise<RpcResultado<{ removidos: number }>> {
  const { data, error } = await rpc("rpc_produto_regra_padrao_remover", { p_empresa_id: empresaId, p_campo: campo });
  if (error) return { sucesso: false, mensagem: error.message };
  return parse(data);
}

export async function aplicarRegrasPadrao(empresaId: string | null, simular: boolean): Promise<RpcResultado<ResultadoAplicar>> {
  const { data, error } = await rpc("rpc_produto_regra_padrao_aplicar", { p_empresa_id: empresaId, p_simular: simular });
  if (error) return { sucesso: false, mensagem: error.message };
  return parse(data);
}

export const regrasPadraoQueryKey = (empresaId: string | null) => ["produto-regras-padrao", empresaId] as const;
