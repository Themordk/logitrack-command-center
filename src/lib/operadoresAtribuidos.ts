import { supabase } from "@/integrations/supabase/client";

export type TipoMovimentoOrigem = "MOVIMENTO_SAIDA_ITEM" | "MOVIMENTO_ENTRADA_ITEM";

/**
 * Busca operadores com tarefas pendentes (status='COLETA_PENDENTE') agrupados
 * por movimento. Retorna um Map<movimentoId, string[]> com nomes únicos dos operadores.
 *
 * Faz 1 query agregada (sem N+1) para todos os IDs visíveis.
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

  // 1) IDs de itens que pertencem aos movimentos visíveis
  const { data: itens, error: itensErr } = await (supabase as any)
    .from(itemTable)
    .select(`id, ${fk}`)
    .eq("tenant_id", tenantId)
    .in(fk, movimentoIds);

  if (itensErr || !itens || itens.length === 0) return result;

  const itemIds: string[] = itens.map((i: any) => i.id);
  const itemToMov = new Map<string, string>();
  itens.forEach((i: any) => itemToMov.set(i.id, i[fk]));

  // 2) tarefas vinculadas a esses itens
  const { data: tarefas, error: tarefasErr } = await (supabase as any)
    .from("tarefa")
    .select("id, id_documento_origem")
    .eq("tenant_id", tenantId)
    .eq("tipo_documento_origem", tipo)
    .in("id_documento_origem", itemIds);

  if (tarefasErr || !tarefas || tarefas.length === 0) return result;

  const tarefaToMov = new Map<string, string>();
  tarefas.forEach((t: any) => {
    const mov = itemToMov.get(t.id_documento_origem);
    if (mov) tarefaToMov.set(t.id, mov);
  });

  // 3) execuções pendentes
  const { data: execs, error: execErr } = await (supabase as any)
    .from("tarefa_execucao")
    .select("tarefa_id, usuario_id, usuario:usuario_id(nome)")
    .eq("tenant_id", tenantId)
    .eq("status", "COLETA_PENDENTE")
    .in("tarefa_id", Array.from(tarefaToMov.keys()));

  if (execErr || !execs) return result;

  const movToNomes = new Map<string, Set<string>>();
  execs.forEach((e: any) => {
    const movId = tarefaToMov.get(e.tarefa_id);
    const nome = e.usuario?.nome;
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
  tarefa_execucao_id: string;
  tarefa_id: string;
  usuario_id: string;
  usuario_nome: string;
  iniciado_em: string | null;
  atribuido_em: string;
}

/**
 * Lista todas as tarefa_execucao pendentes de uma onda (saída).
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
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("tipo_documento_origem", "MOVIMENTO_SAIDA_ITEM")
    .in("id_documento_origem", itemIds);

  const tarefaIds = (tarefas || []).map((t: any) => t.id);
  if (tarefaIds.length === 0) return [];

  const { data: execs } = await (supabase as any)
    .from("tarefa_execucao")
    .select("id, tarefa_id, usuario_id, iniciado_em, atribuido_em, usuario:usuario_id(nome)")
    .eq("tenant_id", tenantId)
    .eq("status", "COLETA_PENDENTE")
    .in("tarefa_id", tarefaIds);

  return (execs || []).map((e: any) => ({
    tarefa_execucao_id: e.id,
    tarefa_id: e.tarefa_id,
    usuario_id: e.usuario_id,
    usuario_nome: e.usuario?.nome || "—",
    iniciado_em: e.iniciado_em,
    atribuido_em: e.atribuido_em,
  }));
}
