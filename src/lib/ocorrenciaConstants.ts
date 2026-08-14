export const STATUS_BADGE: Record<string, string> = {
  ABERTA: "bg-red-500/15 text-red-400 border-red-500/30",
  EM_INVESTIGACAO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  EM_TRATAMENTO: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  RESOLVIDA: "bg-green-500/15 text-green-400 border-green-500/30",
  CANCELADA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

export const STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta",
  EM_INVESTIGACAO: "Em investigação",
  EM_TRATAMENTO: "Em tratamento",
  RESOLVIDA: "Resolvida",
  CANCELADA: "Cancelada",
};

export const STATUS_DOT: Record<string, string> = {
  ABERTA: "bg-red-500 text-red-50",
  EM_INVESTIGACAO: "bg-yellow-500 text-yellow-50",
  EM_TRATAMENTO: "bg-purple-500 text-purple-50",
  RESOLVIDA: "bg-green-500 text-green-50",
  CANCELADA: "bg-gray-500 text-gray-50",
};

export const PRIORIDADE_BADGE: Record<string, string> = {
  BAIXA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  NORMAL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  ALTA: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  CRITICA: "bg-red-500/15 text-red-400 border-red-500/30",
};

export const PRIORIDADE_CLASS: Record<string, string> = {
  BAIXA: "text-gray-400",
  NORMAL: "text-blue-400",
  ALTA: "text-yellow-400",
  CRITICA: "text-red-400",
};

export const PRIORIDADE_LABEL: Record<string, string> = {
  BAIXA: "Baixa",
  NORMAL: "Normal",
  ALTA: "Alta",
  CRITICA: "Crítica",
};

export const CATEGORIA_BADGE: Record<string, string> = {
  PREVENTIVA: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CORRETIVA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

export const CATEGORIA_LABEL: Record<string, string> = {
  PREVENTIVA: "Preventiva",
  CORRETIVA: "Corretiva",
};

export const ETAPA_LABEL: Record<string, string> = {
  RECEBIMENTO: "Recebimento",
  ARMAZENAGEM: "Armazenagem",
  ABASTECIMENTO: "Abastecimento",
  MOVIMENTACAO: "Movimentação",
  SEPARACAO: "Separação",
  EXPEDICAO: "Expedição",
  INVENTARIO: "Inventário",
  AUDITORIA: "Auditoria",
  CONFERENCIA: "Conferência",
  EXCLUSAO: "Exclusão",
  OUTROS: "Outros",
};

export const TIPO_LABEL: Record<string, string> = {
  FALTA: "Falta",
  SOBRA: "Sobra",
  AVARIA: "Avaria",
  DIVERGENCIA_INVENTARIO: "Divergência de inventário",
  EXTRAVIO: "Extravio",
  PRODUTO_INCORRETO: "Produto incorreto",
  VALIDADE_INCORRETA: "Validade incorreta",
  LOTE_INCORRETO: "Lote incorreto",
  EXCLUSAO_DOCUMENTO: "Exclusão de documento",
  OUTROS: "Outros",
};

export const TIPO_DOC_LABEL: Record<string, string> = {
  DOCUMENTO_ENTRADA: "Doc. Entrada",
  DOCUMENTO_SAIDA: "Doc. Saída",
  MOVIMENTO_ENTRADA: "Mov. Entrada",
  MOVIMENTO_SAIDA: "Mov. Saída",
  MOVIMENTO_ENTRADA_ITEM: "Mov. Entrada",
  INVENTARIO: "Inventário",
};

/** Tempo relativo desde a criação, com cor progressiva (verde → vermelho). */
export function tempoRelativo(criadoEm: string): { texto: string; cor: string } {
  const agora = Date.now();
  const criado = new Date(criadoEm).getTime();
  const diffMs = Math.max(0, agora - criado);
  const horas = diffMs / 3600000;

  if (horas < 1) {
    const min = Math.max(1, Math.round(diffMs / 60000));
    return { texto: `${min}min`, cor: "text-green-400" };
  }
  if (horas < 4) return { texto: `${Math.round(horas)}h`, cor: "text-green-400" };
  if (horas < 24) return { texto: `${Math.round(horas)}h`, cor: "text-yellow-400" };
  const dias = Math.round(horas / 24);
  if (dias === 1) return { texto: "1 dia", cor: "text-orange-400" };
  return { texto: `${dias} dias`, cor: "text-red-400" };
}
