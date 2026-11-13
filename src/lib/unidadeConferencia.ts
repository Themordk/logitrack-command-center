/**
 * Fluxo de Expedição · F5.4 — unidade de conferência no coletor.
 * A unidade é escolhida e reservada só pelo backend (_fn_onda_assumir); aqui só se lê o que
 * conferencia_buscar_tarefas / rpc_coletor_onda_resumo devolveram, para exibir ao operador.
 */
export interface UnidadeConferencia { sequencia: number; descricao: string; total: number }

interface TarefaComUnidade {
  unidade_sequencia?: number | null;
  unidade_descricao?: string | null;
  unidades_total?: number | null;
}

/** A unidade das tarefas do operador; null quando a onda é conferida inteira (0 ou 1 unidade). */
export function unidadeDasTarefas(tarefas: TarefaComUnidade[] | null | undefined): UnidadeConferencia | null {
  const t = (tarefas ?? []).find((x) => x.unidade_sequencia != null);
  if (!t || !t.unidades_total || t.unidades_total <= 1) return null;
  return { sequencia: Number(t.unidade_sequencia), descricao: t.unidade_descricao || "", total: Number(t.unidades_total) };
}

export function rotuloUnidade(u: UnidadeConferencia): string {
  return `Unidade ${u.sequencia} de ${u.total}${u.descricao ? ` · ${u.descricao}` : ""}`;
}

export interface ResumoUnidades {
  total: number; livres: number; em_andamento: number; concluidas: number;
  minha: { sequencia: number; descricao: string | null } | null;
}

/** Linha do painel do coletor; null quando a etapa não está dividida em unidades. */
export function descreverUnidades(u: ResumoUnidades | null | undefined, etapa: "SEP" | "SEP-CONF"): string | null {
  if (!u || u.total <= 1) return null;
  const nome = etapa === "SEP-CONF" ? "unidades de conferência" : "grupos de separação";
  return `${u.total} ${nome}: ${u.livres} livre(s), ${u.em_andamento} em andamento, ${u.concluidas} concluída(s)`;
}
