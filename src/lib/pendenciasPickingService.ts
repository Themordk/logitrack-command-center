import { supabase } from "@/integrations/supabase/client";
import type { CamposPendenciaPicking, EnderecoAlternativoPicking, PendenciaPicking, SituacaoSaldo } from "./pendenciasPicking.types";
import { parseRpcResult, type RpcResult } from "./errorMapper";

const rpc = supabase.rpc.bind(supabase) as unknown as (nome: string, parametros: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
export function situacaoTarefa(tarefa: CamposPendenciaPicking): SituacaoSaldo {
  if (tarefa.situacao_saldo) return tarefa.situacao_saldo;
  if (!tarefa.endereco_id) return "SEM_PICKING_MAPEADO";
  if (tarefa.saldo_endereco !== undefined && Number(tarefa.saldo_endereco) <= 0) return tarefa.tipo_endereco === "PULMAO" ? "SEM_SALDO_ENDERECO" : "SEM_SALDO_PICKING";
  return "OK";
}
export function ordenarTarefasPicking<T extends CamposPendenciaPicking & { ordem_tarefa?: number }>(tarefas: T[]): T[] {
  return [...tarefas].sort((a, b) => Number(situacaoTarefa(a) !== "OK") - Number(situacaoTarefa(b) !== "OK") || Number(a.ordem_tarefa || 0) - Number(b.ordem_tarefa || 0));
}
export function quantidadeAbastecimento(faltante: number, saldo: number): number {
  return Math.max(0, Math.min(faltante, saldo));
}
export async function listarPendenciasPicking(tenantId: string, ids: string[]): Promise<PendenciaPicking[]> {
  const { data, error } = await rpc("rpc_onda_pendencias_picking", { p_tenant_id: tenantId, p_movimento_saida_ids: ids });
  if (error) throw error;
  const linhas = typeof data === "string" ? JSON.parse(data) : data;
  return Array.isArray(linhas) ? linhas : [];
}
export async function recarregarTarefasPicking<T extends CamposPendenciaPicking & { tarefa_id: string; ordem_tarefa?: number }>(tenantId: string, empresaId: string, movimentoId: string, usuarioId: string): Promise<T[]> {
  const { data, error } = await rpc("separacao_buscar_tarefas", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_movimento_saida_id: movimentoId, p_usuario_id: usuarioId });
  if (error) throw error;
  const linhas = typeof data === "string" ? JSON.parse(data) : data;
  if (!Array.isArray(linhas)) throw linhas;
  return ordenarTarefasPicking(linhas as T[]);
}
/** Endereços para onde a tarefa pode ser trocada (mesma regra que separacao_trocar_endereco valida). */
export async function listarEnderecosAlternativos(tenantId: string, tarefaId: string): Promise<EnderecoAlternativoPicking[]> {
  const { data, error } = await rpc("separacao_listar_enderecos_alternativos", { p_tenant_id: tenantId, p_tarefa_id: tarefaId });
  if (error) throw error;
  const linhas = typeof data === "string" ? JSON.parse(data) : data;
  if (!Array.isArray(linhas)) return [];
  return linhas.map((l: EnderecoAlternativoPicking) => ({ ...l, saldo: Number(l.saldo ?? 0) }));
}

/** Grava no backend o endereço escolhido pelo operador. A tarefa passa a apontar para ele. */
export async function trocarEnderecoTarefa(tenantId: string, tarefaId: string, enderecoId: string, usuarioId: string): Promise<RpcResult> {
  const { data, error } = await rpc("separacao_trocar_endereco", { p_tenant_id: tenantId, p_tarefa_id: tarefaId, p_endereco_id: enderecoId, p_usuario_id: usuarioId });
  if (error) throw error;
  return parseRpcResult(data);
}
