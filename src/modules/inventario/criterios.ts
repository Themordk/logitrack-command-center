export type CriterioRotativo = "SAIDAS" | "CORTES" | "ESTORNOS" | "DEVOLUCOES";

export const CRITERIO_ROTATIVO_OPTIONS = [
  { value: "SAIDAS", label: "Saídas do período", descricao: "Produtos que tiveram saída (separação) no período." },
  { value: "CORTES", label: "Cortes do período", descricao: "Produtos que tiveram corte na separação no período." },
  { value: "ESTORNOS", label: "Cancelamentos do período", descricao: "Produtos com tarefas de entrada ou saída canceladas no período." },
  { value: "DEVOLUCOES", label: "Devoluções do período", descricao: "Produtos recebidos em entradas do tipo devolução no período." },
] as const satisfies readonly { value: CriterioRotativo; label: string; descricao: string }[];

export const CRITERIO_LABELS: Record<string, string> = {
  ...Object.fromEntries(CRITERIO_ROTATIVO_OPTIONS.map(({ value, label }) => [value, label])),
  CURVA_VENDAS: "Curva de Vendas (legado)",
  CURVA_ACESSO: "Curva de Acesso (legado)",
};