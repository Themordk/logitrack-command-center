import { supabase } from "@/integrations/supabase/client";
import { siglaEtapa } from "@/lib/responsaveisOndaService";

export type TipoMovimentoOrigem = "MOVIMENTO_SAIDA_ITEM" | "MOVIMENTO_ENTRADA_ITEM";

/** Status de tarefa que ainda têm trabalho a fazer. */
const STATUS_TAREFA_ABERTA = ["CRIADA", "ATRIBUIDA", "EM_ANDAMENTO", "PAUSADA"];

/**
 * Junta nome + etapa em rótulos únicos, ordenados por nome.
 * Ex.: [{Lucas, SEP}, {Lucas, CONF}, {Ana, null}] -> ["Ana", "Lucas (SEP, CONF)"]
 */
export function montarRotulosOperadores(entradas: Array<{ nome: string; sigla: string | null }>): string[] {
  const porNome = new Map<string, Set<string>>();
  for (const e of entradas) {
    if (!e.nome) continue;
    if (!porNome.has(e.nome)) porNome.set(e.nome, new Set());
    if (e.sigla) porNome.get(e.nome)!.add(e.sigla);
  }
  const ordemSigla = ["SEP", "CONF", "EMB"];
  return [...porNome.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([nome, siglas]) => {
      const lista = [...siglas].sort((x, y) => ordemSigla.indexOf(x) - ordemSigla.indexOf(y));
      return lista.length ? `${nome} (${lista.join(", ")})` : nome;
    });
}

/**
 * Operadores que hoje têm tarefa ABERTA em cada movimento (Map<movimentoId, rótulos>).
 * Fonte da verdade: atribuição aberta (`liberado_em IS NULL`) em tarefa ainda não
 * concluída/cancelada. Na saída o rótulo indica a etapa (SEP / CONF).
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

  // 2) tarefas ABERTAS desses itens
  const { data: tarefas, error: tarefasErr } = await supabase
    .from("tarefa")
    .select("id, id_documento_origem, tipo_tarefa_id")
    .eq("tenant_id", tenantId)
    .eq("tipo_documento_origem", tipo)
    .in("status", STATUS_TAREFA_ABERTA as never[])
    .in("id_documento_origem", [...itemToMov.keys()]);
  if (tarefasErr || !tarefas || tarefas.length === 0) return result;

  const tarefaInfo = new Map<string, { mov: string; tipo: string }>();
  tarefas.forEach((t) => {
    const mov = t.id_documento_origem ? itemToMov.get(t.id_documento_origem) : undefined;
    if (mov) tarefaInfo.set(t.id, { mov, tipo: t.tipo_tarefa_id });
  });
  if (tarefaInfo.size === 0) return result;

  // 3) atribuições abertas + códigos das etapas + nomes
  const [{ data: atribs }, { data: tipos }] = await Promise.all([
    supabase
      .from("tarefa_atribuicao")
      .select("tarefa_id, usuario_id")
      .eq("tenant_id", tenantId)
      .in("tarefa_id", [...tarefaInfo.keys()])
      .is("liberado_em", null),
    supabase
      .from("tipo_tarefa")
      .select("id, codigo")
      .in("id", [...new Set([...tarefaInfo.values()].map((v) => v.tipo))]),
  ]);
  if (!atribs || atribs.length === 0) return result;

  const codigoPorTipo = new Map<string, string>((tipos || []).map((t) => [t.id, t.codigo]));
  const usuarioIds = [...new Set(atribs.map((a) => a.usuario_id).filter(Boolean))];
  const { data: usuarios } = await supabase.from("usuario").select("id, nome").in("id", usuarioIds);
  const nomeById = new Map<string, string>((usuarios || []).map((u) => [u.id, u.nome]));

  const porMov = new Map<string, Array<{ nome: string; sigla: string | null }>>();
  atribs.forEach((a) => {
    const info = tarefaInfo.get(a.tarefa_id);
    const nome = nomeById.get(a.usuario_id);
    if (!info || !nome) return;
    const sigla = tipo === "MOVIMENTO_SAIDA_ITEM" ? siglaEtapa(codigoPorTipo.get(info.tipo)) : null;
    if (!porMov.has(info.mov)) porMov.set(info.mov, []);
    porMov.get(info.mov)!.push({ nome, sigla });
  });

  porMov.forEach((entradas, movId) => result.set(movId, montarRotulosOperadores(entradas)));
  return result;
}
