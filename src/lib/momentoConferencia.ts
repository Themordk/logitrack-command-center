/**
 * Modo de conferência do Tipo de Saída (coluna tipo_saida.momento_conferencia).
 *
 * A regra é aplicada SOMENTE no banco (fn_conferencia_validar_onda): a lista
 * do coletor, o início da conferência e a confirmação de item usam o mesmo
 * validador. O frontend só exibe/edita a configuração e as mensagens.
 */
export type MomentoConferencia = "PRE_FATURAMENTO" | "POS_FATURAMENTO";

export const MOMENTO_CONFERENCIA_LABEL: Record<MomentoConferencia, string> = {
  PRE_FATURAMENTO: "Pré-faturamento",
  POS_FATURAMENTO: "Pós-faturamento",
};

export const MOMENTO_CONFERENCIA_OPCOES: Array<{ value: MomentoConferencia; label: string }> = [
  { value: "PRE_FATURAMENTO", label: MOMENTO_CONFERENCIA_LABEL.PRE_FATURAMENTO },
  { value: "POS_FATURAMENTO", label: MOMENTO_CONFERENCIA_LABEL.POS_FATURAMENTO },
];
