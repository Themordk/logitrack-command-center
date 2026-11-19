export type Tab = "metas" | "resumo" | "ranking" | "evolucao";

/**
 * Fase 6 (decisão 5): sem ranking vindo do banco (operador), a aba Ranking some.
 * Fase 10: a primeira aba é "Metas" (score global e o detalhe por meta).
 */
export function abasDisponiveis(temRanking: boolean): Tab[] {
  return temRanking ? ["metas", "resumo", "ranking", "evolucao"] : ["metas", "resumo", "evolucao"];
}
