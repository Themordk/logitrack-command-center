import { supabase } from "@/integrations/supabase/client";

export type TipoMovimentoOrigem = "MOVIMENTO_SAIDA_ITEM" | "MOVIMENTO_ENTRADA_ITEM";

/**
 * Status da `tarefa_atribuicao` considerados "atribuição ativa" (operador
 * ainda detém a tarefa; não foi liberada nem cancelada).
 */
const STATUS_ATRIBUICAO_ATIVA = ["ATRIBUIDA", "ATIVO", "COLETA_PENDENTE"];

/**
 * Busca operadores com tarefas atribuídas (não liberadas/canceladas) agrupados
 * por movimento. Retorna um Map<movimentoId, string[]> com nomes únicos.
 *
 * Faz queries agregadas (sem N+1) para todos os IDs visíveis. A fonte da
 * verdade é a tabela `tarefa_atribuicao`, NÃO `tarefa_execucao` (esta só
 * existe após o operador iniciar a execução no Coletor).
 */
export async function fetchOperadoresAtribuidos(
  tenantId: string,
  movimentoIds: string[],
  tipo: TipoMovimentoOrigem,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!tenantId || movimentoIds.length === 0) return result;

  const itemTable =
    tipo === "MOVIMENTO_SAIDA_ITEM" ? "movimento_saida_item" : "movimento_entrada_item";
  const fk =
    tipo === "MOVIMENTO_SAIDA_ITEM" ? "movimento_saida_id" : "movimento_entrada_id";

  // 1) IDs de itens dos movimentos visíveis
  const { data: itens, error: itensErr } = await (supabase as any)
    .from(itemTable)
    .select(`id, ${fk}`)
    .eq("tenant_id", tenantId)
    .in(fk, movimentoIds);

  if (itensErr || !itens || itens.length === 0) return result;

  const itemIds: string[] = itens.map((i: any) => i.id);
  const itemToMov = new Map<string, string>();
  itens.forEach((i: any) => itemToMov.set(i.id, i[fk]));

  // 2) tarefas vinculadas a esses itens (qualquer status — filtragem real é
  //    feita pela atribuição). Filtro por tipo evita colisão de IDs.
  const { data: tarefas, error: tarefasErr } = await (supabase as any)
    .from("tarefa")
    .select("id, id_documento_origem, tipo_documento_origem")
    .eq("tenant_id", tenantId)
    .eq("tipo_documento_origem", tipo)
    .in("id_documento_origem", itemIds);

  if (tarefasErr || !tarefas || tarefas.length === 0) return result;

  const tarefaToMov = new Map<string, string>();
  tarefas.forEach((t: any) => {
    const mov = itemToMov.get(t.id_documento_origem);
    if (mov) tarefaToMov.set(t.id, mov);
  });

  // 3) atribuições ativas (não liberadas)
  const { data: atribs, error: atribErr } = await (supabase as any)
    .from("tarefa_atribuicao")
    .select("tarefa_id, usuario_id, status, liberado_em, usuario:usuario_id(nome)")
    .eq("tenant_id", tenantId)
    .in("tarefa_id", Array.from(tarefaToMov.keys()))
    .in("status", STATUS_ATRIBUICAO_ATIVA)
    .is("liberado_em", null);

  if (atribErr || !atribs) return result;

  const movToNomes = new Map<string, Set<string>>();
  atribs.forEach((a: any) => {
    const movId = tarefaToMov.get(a.tarefa_id);
    const nome = a.usuario?.nome;
    if (!movId || !nome) return;
    if (!movToNomes.has(movId)) movToNomes.set(movId, new Set());
    movToNomes.get(movId)!.add(nome);
  });

  movToNomes.forEach((set, movId) => {
    result.set(movId, Array.from(set).sort((a, b) => a.localeCompare(b)));
  });

  return result;
}

export interface TarefaPendenteDetalhe {
  /** Id da `tarefa_atribuicao` (usado para reatribuir/cancelar). */
  tarefa_atribuicao_id: string;
  tarefa_id: string;
  usuario_id: string;
  usuario_nome: string;
  /** Indica se a tarefa já foi iniciada (existe execução em curso). */
  iniciado_em: string | null;
  atribuido_em: string;
  /** Status atual em `tarefa.status` (para sinalizar EM_ANDAMENTO). */
  tarefa_status: string;
}

/**
 * Lista todas as atribuições ativas de uma onda (saída) — usado pelo modal
 * de reatribuição. Inclui o status atual da `tarefa` para sinalizar
 * tarefas já em andamento.
 */
export async function fetchTarefasPendentesOnda(
  tenantId: string,
  movimentoSaidaId: string,
): Promise<TarefaPendenteDetalhe[]> {
  const { data: itens } = await (supabase as any)
    .from("movimento_saida_item")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("movimento_saida_id", movimentoSaidaId);

  const itemIds = (itens || []).map((i: any) => i.id);
  if (itemIds.length === 0) return [];

  const { data: tarefas } = await (supabase as any)
    .from("tarefa")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("tipo_documento_origem", "MOVIMENTO_SAIDA_ITEM")
    .in("id_documento_origem", itemIds);

  const tarefaIds = (tarefas || []).map((t: any) => t.id);
  if (tarefaIds.length === 0) return [];
  const tarefaStatusMap = new Map<string, string>();
  (tarefas || []).forEach((t: any) => tarefaStatusMap.set(t.id, t.status));

  const { data: atribs } = await (supabase as any)
    .from("tarefa_atribuicao")
    .select("id, tarefa_id, usuario_id, atribuido_em, liberado_em, status, usuario:usuario_id(nome)")
    .eq("tenant_id", tenantId)
    .in("tarefa_id", tarefaIds)
    .in("status", STATUS_ATRIBUICAO_ATIVA)
    .is("liberado_em", null);

  // Quais tarefas já têm execução iniciada?
  const { data: execs } = await (supabase as any)
    .from("tarefa_execucao")
    .select("tarefa_id, iniciado_em")
    .eq("tenant_id", tenantId)
    .in("tarefa_id", tarefaIds)
    .not("iniciado_em", "is", null);
  const tarefasIniciadas = new Set<string>((execs || []).map((e: any) => e.tarefa_id));

  return (atribs || []).map((a: any) => ({
    tarefa_atribuicao_id: a.id,
    tarefa_id: a.tarefa_id,
    usuario_id: a.usuario_id,
    usuario_nome: a.usuario?.nome || "—",
    iniciado_em: tarefasIniciadas.has(a.tarefa_id) ? "iniciado" : null,
    atribuido_em: a.atribuido_em,
    tarefa_status: tarefaStatusMap.get(a.tarefa_id) || "",
  }));
}
