/** Rótulos, cores e textos da tela Atividades › HU (H5). Nenhuma regra: só exibição do que o banco devolve. */
import type { HULinha, ResumoHUs, SituacaoHU, StatusHU } from "./huService";

export const STATUS_HU: Record<StatusHU, { label: string; cls: string }> = {
  ABERTA: { label: "Aberta", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  FECHADA: { label: "Fechada", cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  EM_TRANSITO: { label: "Em trânsito", cls: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  ARMAZENADA: { label: "Armazenada", cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  EXPEDIDA: { label: "Expedida", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  DESMONTADA: { label: "Desmontada", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  DESCARTADA: { label: "Descartada", cls: "bg-red-500/15 text-red-400 border-red-500/30" },
};

export const SITUACAO_HU_LABEL: Record<SituacaoHU, string> = {
  AGUARDANDO_ARMAZENAGEM: "Aguardando armazenagem",
  VAZIA: "Vazia",
  DIVERGENTE: "Divergente do estoque",
  NUNCA_IMPRESSA: "Nunca impressa",
  PARADA: "Parada há mais de 24 h",
};

export const EVENTO_HU_LABEL: Record<string, string> = {
  CRIADA: "Criada", EDITADA: "Editada", ITEM_ADICIONADO: "Item adicionado", ITEM_REMOVIDO: "Item retirado",
  FECHADA: "Fechada", REABERTA: "Reaberta", ARMAZENADA: "Armazenada", MOVIDA: "Mudou de endereço",
  DESMONTADA: "Desmontada", EXPEDIDA: "Expedida", DESCARTADA: "Descartada", IMPRESSA: "Etiqueta enviada",
};

export interface CardResumoHU {
  chave: keyof ResumoHUs;
  label: string;
  hint: string;
  situacao?: SituacaoHU;
  status?: StatusHU;
  alerta?: string;
}

export const CARDS_RESUMO_HU: CardResumoHU[] = [
  { chave: "abertas", label: "Abertas", hint: "HUs abertas, recebendo itens", status: "ABERTA" },
  { chave: "aguardando_armazenagem", label: "Aguardando armazenagem", hint: "Com itens, ainda não armazenadas", situacao: "AGUARDANDO_ARMAZENAGEM" },
  { chave: "armazenadas", label: "Armazenadas", hint: "No estoque, num endereço", status: "ARMAZENADA" },
  { chave: "vazias", label: "Vazias", hint: "Abertas sem nenhum item", situacao: "VAZIA" },
  { chave: "divergentes", label: "Divergentes", hint: "Estoque da HU não bate com o status (sem saldo ou em mais de um endereço)", situacao: "DIVERGENTE", alerta: "text-red-400" },
  { chave: "nunca_impressas", label: "Nunca impressas", hint: "Sem etiqueta enviada para a impressora", situacao: "NUNCA_IMPRESSA", alerta: "text-yellow-400" },
  { chave: "paradas", label: "Paradas +24 h", hint: "Com itens, sem movimento há mais de 24 horas", situacao: "PARADA", alerta: "text-yellow-400" },
  { chave: "encerradas", label: "Encerradas", hint: "Expedidas, desmontadas ou descartadas (filtre pelo status)" },
];

const num = (v: number | null | undefined) => Number(v ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** "1 SKU · 150 un." ou "3 SKUs · 420 un." */
export function textoConteudo(h: Pick<HULinha, "qtd_skus" | "qtd_total">): string {
  if (!h.qtd_skus) return "Vazia";
  return `${h.qtd_skus} SKU${h.qtd_skus === 1 ? "" : "s"} · ${num(h.qtd_total)} un.`;
}

/** Idade desde o último evento, em texto curto. */
export function textoIdade(horas: number | null | undefined): string {
  const h = Number(horas ?? 0);
  if (h < 1) return `${Math.max(0, Math.round(h * 60))} min`;
  if (h < 24) return `${Math.floor(h)} h`;
  return `${Math.floor(h / 24)} d ${Math.floor(h % 24)} h`;
}

export function textoEtiquetaHU(h: Pick<HULinha, "etiqueta_impressoes" | "etiqueta_ultimo_status">): { texto: string; cls: string } {
  if (!h.etiqueta_impressoes) return { texto: "Nunca impressa", cls: "text-yellow-400" };
  const erro = h.etiqueta_ultimo_status === "ERRO";
  return {
    texto: `${h.etiqueta_impressoes}x${erro ? " · último com erro" : ""}`,
    cls: erro ? "text-red-400" : "text-foreground",
  };
}

/** Por que a HU está divergente (texto para o supervisor). */
export function motivoDivergencia(h: Pick<HULinha, "status" | "estoque_enderecos" | "estoque_total">): string | null {
  if (h.status === "ARMAZENADA" && h.estoque_enderecos === 0) return "Armazenada, mas sem saldo no estoque";
  if (h.status === "ARMAZENADA" && h.estoque_enderecos > 1) return `Saldo em ${h.estoque_enderecos} endereços`;
  if ((h.status === "ABERTA" || h.status === "FECHADA") && h.estoque_total > 0) return "Tem saldo no estoque sem ter sido armazenada";
  return null;
}
