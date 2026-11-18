export type Tab = "resumo" | "ranking" | "evolucao";

/** Fase 6 (decisão 5): sem ranking vindo do banco (operador), a aba Ranking some. */
export function abasDisponiveis(temRanking: boolean): Tab[] {
  return temRanking ? ["resumo", "ranking", "evolucao"] : ["resumo", "evolucao"];
}
