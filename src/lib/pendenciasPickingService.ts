import { supabase } from "@/integrations/supabase/client";
import type { CamposPendenciaPicking, PendenciaPicking, SituacaoSaldo } from "./pendenciasPicking.types";

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