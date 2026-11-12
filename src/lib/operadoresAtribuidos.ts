import { supabase } from "@/integrations/supabase/client";
import { siglaEtapa } from "@/lib/responsaveisOndaService";

export type TipoMovimentoOrigem = "MOVIMENTO_SAIDA_ITEM" | "MOVIMENTO_ENTRADA_ITEM";

/** Status de tarefa que ainda têm trabalho a fazer. */
const STATUS_TAREFA_ABERTA = ["CRIADA", "ATRIBUIDA", "EM_ANDAMENTO", "PAUSADA"];

export interface EntradaRotulo {
  nome: string;
  sigla: string | null;
  /** Está com tarefa aberta agora (aparece antes de quem só participou). */
  ativo?: boolean;
}

/**
 * Junta nome + etapa em rótulos únicos: primeiro quem está com tarefa aberta,
 * depois quem já participou; cada grupo por nome.
 * Ex.: [{Lucas, SEP}, {Lucas, CONF}, {Ana, null}] -> ["Ana", "Lucas (SEP, CONF)"]
 */
export function montarRotulosOperadores(entradas: EntradaRotulo[]): string[] {
  const porNome = new Map<string, { siglas: Set<string>; ativo: boolean }>();
  for (const e of entradas) {
    if (!e.nome) continue;
    const atual = porNome.get(e.nome) ?? { siglas: new Set<string>(), ativo: false };
    if (e.sigla) atual.siglas.add(e.sigla);
    atual.ativo = atual.ativo || !!e.ativo;
    porNome.set(e.nome, atual);
  }
  const ordemSigla = ["SEP", "CONF", "EMB"];
  return [...porNome.entries()]
    .sort(([a, x], [b, y]) => Number(y.ativo) - Number(x.ativo) || a.localeCompare(b))
    .map(([nome, { siglas }]) => {
      const lista = [...siglas].sort((p, q) => ordemSigla.indexOf(p) - ordemSigla.indexOf(q));
      return lista.length ? `${nome} (${lista.join(", ")})` : nome;
    });
}

/** Divide em lotes para não estourar o tamanho da URL do PostgREST. */
function lotes<T>(lista: T[], tamanho = 200): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) r.push(lista.slice(i, i + tamanho));
  return r;
}

/**
 * Participantes de cada movimento (Map<movimentoId, rótulos>):
 *  - quem está com a tarefa agora (atribuição aberta em tarefa aberta) e
 *  - quem executou alguma tarefa (tarefa_execucao), mesmo com o movimento concluído.
 * Desde a convocação híbrida a atribuição é encerrada ao concluir a tarefa, por isso
 * o histórico vem das execuções. Na saída o rótulo indica a etapa (SEP / CONF).
 * Queries agregadas para todos os IDs visíveis (sem N+1).
 */
export async function fetchOperadoresAtribuidos(
  tenantId: string,
  movimentoIds: string[],
  tipo: TipoMovimentoOrigem,
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (!tenantId || movimentoIds.length === 0) return result;

  // 1) itens dos movimentos visíveis
  const { data: itens, error: itensErr } =
    tipo === "MOVIMENTO_SAIDA_ITEM"
      ? await supabase
          .from("movimento_saida_item")
          .select("id, mov:movimento_saida_id")
          .eq("tenant_id", tenantId)
          .in("movimento_saida_id", movimentoIds)
      : await supabase
          .from("movimento_entrada_item")
          .select("id, mov:movimento_entrada_id")
          .eq("tenant_id", tenantId)
          .in("movimento_entrada_id", movimentoIds);
  if (itensErr || !itens || itens.length === 0) return result;

  const itemToMov = new Map<string, string>();
  itens.forEach((i) => itemToMov.set(i.id, i.mov));

  // 2) tarefas desses itens (exceto canceladas)
  const tarefas: Array<{ id: string; id_documento_origem: string | null; tipo_tarefa_id: string; status: string }> = [];
  for (const lote of lotes([...itemToMov.keys()])) {
    const { data, error } = await supabase
      .from("tarefa")
      .select("id, id_documento_origem, tipo_tarefa_id, status")
      .eq("tenant_id", tenantId)
      .eq("tipo_documento_origem", tipo)
      .neq("status", "CANCELADA")
      .in("id_documento_origem", lote);
    if (error) return result;
    tarefas.push(...(data || []));
  }
  if (tarefas.length === 0) return result;

  const tarefaInfo = new Map<string, { mov: string; tipo: string; aberta: boolean }>();
  tarefas.forEach((t) => {
    const mov = t.id_documento_origem ? itemToMov.get(t.id_documento_origem) : undefined;
    if (mov) tarefaInfo.set(t.id, { mov, tipo: t.tipo_tarefa_id, aberta: STATUS_TAREFA_ABERTA.includes(t.status) });
  });
  if (tarefaInfo.size === 0) return result;

  // 3) atribuições abertas (quem está com a tarefa agora) + execuções (quem participou)
  const abertas = [...tarefaInfo.entries()].filter(([, v]) => v.aberta).map(([id]) => id);
  const todas = [...tarefaInfo.keys()];
  const vinculos: Array<{ tarefa_id: string; usuario_id: string; ativo: boolean }> = [];

  for (const lote of lotes(abertas)) {
    const { data } = await supabase
      .from("tarefa_atribuicao")
      .select("tarefa_id, usuario_id")
      .eq("tenant_id", tenantId)
      .in("tarefa_id", lote)
      .is("liberado_em", null);
    (data || []).forEach((a) => vinculos.push({ tarefa_id: a.tarefa_id, usuario_id: a.usuario_id, ativo: true }));
  }
  for (const lote of lotes(todas)) {
    const { data } = await supabase
      .from("tarefa_execucao")
      .select("tarefa_id, usuario_id")
      .eq("tenant_id", tenantId)
      .in("tarefa_id", lote);
    (data || []).forEach((e) => vinculos.push({ tarefa_id: e.tarefa_id, usuario_id: e.usuario_id, ativo: false }));
  }
  if (vinculos.length === 0) return result;

  // 4) códigos das etapas + nomes
  const [{ data: tipos }, { data: usuarios }] = await Promise.all([
    supabase.from("tipo_tarefa").select("id, codigo").in("id", [...new Set([...tarefaInfo.values()].map((v) => v.tipo))]),
    supabase.from("usuario").select("id, nome").in("id", [...new Set(vinculos.map((v) => v.usuario_id).filter(Boolean))]),
  ]);
  const codigoPorTipo = new Map<string, string>((tipos || []).map((t) => [t.id, t.codigo]));
  const nomeById = new Map<string, string>((usuarios || []).map((u) => [u.id, u.nome]));

  const porMov = new Map<string, EntradaRotulo[]>();
  vinculos.forEach((v) => {
    const info = tarefaInfo.get(v.tarefa_id);
    const nome = nomeById.get(v.usuario_id);
    if (!info || !nome) return;
    const sigla = tipo === "MOVIMENTO_SAIDA_ITEM" ? siglaEtapa(codigoPorTipo.get(info.tipo)) : null;
    if (!porMov.has(info.mov)) porMov.set(info.mov, []);
    porMov.get(info.mov)!.push({ nome, sigla, ativo: v.ativo });
  });

  porMov.forEach((entradas, movId) => result.set(movId, montarRotulosOperadores(entradas)));
  return result;
}
