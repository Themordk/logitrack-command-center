/** Rótulos, cores e textos da tela Volumes. Só exibição: as regras vêm das RPCs. */
import type { ResumoVolumes, SituacaoVolume, StatusVolume, VolumeLinha } from "./volumesService";

export const STATUS_VOLUME: Record<StatusVolume, { label: string; cls: string }> = {
  ABERTO:    { label: "Aberto",    cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  FECHADO:   { label: "Fechado",   cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  CONFERIDO: { label: "Conferido", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  EXPEDIDO:  { label: "Expedido",  cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  CANCELADO: { label: "Cancelado", cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

export const STATUS_IMPRESSAO: Record<string, { label: string; cls: string }> = {
  PENDENTE:    { label: "Na fila",     cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  PROCESSANDO: { label: "Imprimindo",  cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  REIMPRESSAO: { label: "Na fila",     cls: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  IMPRESSO:    { label: "Impressa",    cls: "bg-green-500/15 text-green-400 border-green-500/30" },
  ERRO:        { label: "Erro",        cls: "bg-red-500/15 text-red-400 border-red-500/30" },
  CANCELADO:   { label: "Cancelada",   cls: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

export const ORIGEM_IMPRESSAO: Record<string, string> = {
  PAINEL_ADMINISTRATIVO: "Tela Volumes",
  REIMPRESSAO: "Reimpressão",
  REENVIO: "Reenvio",
  NF_AUTORIZADA: "NF autorizada",
  SEPARACAO: "Separação",
  CONFERENCIA: "Conferência",
  EMBARQUE: "Embarque",
};

export interface CardResumo {
  chave: keyof ResumoVolumes;
  label: string;
  hint: string;
  /** Situação aplicada ao clicar no card (cards sem situação só informam). */
  situacao?: SituacaoVolume;
  status?: StatusVolume;
  /** Cor do número quando maior que zero. */
  alerta?: string;
}

export const CARDS_RESUMO: CardResumo[] = [
  { chave: "total", label: "Volumes", hint: "Volumes ativos com os filtros atuais" },
  { chave: "nunca_impresso", label: "Sem etiqueta", hint: "Volumes que ainda não tiveram etiqueta impressa", situacao: "NUNCA_IMPRESSO", alerta: "text-yellow-400" },
  { chave: "erro_impressao", label: "Erro de impressão", hint: "A última impressão deu erro", situacao: "ERRO_IMPRESSAO", alerta: "text-red-400" },
  { chave: "sem_nf", label: "Sem NF", hint: "Pedido ainda sem NF autorizada", situacao: "SEM_NF" },
  { chave: "nf_divergente", label: "Divergente da NF", hint: "Quantidade de volumes do pedido diferente da NF", situacao: "NF_DIVERGENTE", alerta: "text-red-400" },
  { chave: "em_carga", label: "Aguardando embarque", hint: "Na carga, ainda não bipados", situacao: "EM_CARGA" },
  { chave: "embarcados", label: "Embarcados", hint: "Bipados no veículo", situacao: "EMBARCADO" },
  { chave: "cancelados", label: "Cancelados", hint: "Volumes cancelados no período", status: "CANCELADO" },
];

export const SITUACAO_LABEL: Record<SituacaoVolume, string> = {
  SEM_PEDIDO: "Sem pedido",
  SEM_NF: "Sem NF",
  NF_DIVERGENTE: "Divergente da NF",
  NUNCA_IMPRESSO: "Sem etiqueta impressa",
  ERRO_IMPRESSAO: "Erro de impressão",
  EM_CARGA: "Aguardando embarque",
  EMBARCADO: "Embarcado",
};

const pad2 = (n: number | null | undefined) => (n == null ? "—" : String(n).padStart(2, "0"));

/** "01/03" — número do volume / total do pedido. */
export function identificacaoVolume(v: Pick<VolumeLinha, "numero_volume" | "total_volumes_pedido">): string {
  if (v.numero_volume == null) return "—";
  return v.total_volumes_pedido ? `${pad2(v.numero_volume)}/${pad2(v.total_volumes_pedido)}` : pad2(v.numero_volume);
}

/** "123-1" — número da NF com a série. */
export function textoNf(numero: string | null | undefined, serie?: string | null): string {
  if (!numero) return "";
  return serie ? `${numero}-${serie}` : numero;
}

/** Cidade / UF sem repetir a UF quando ela já vem no nome da cidade. */
export function cidadeUf(cidade: string | null | undefined, uf: string | null | undefined): string {
  const c = (cidade ?? "").trim();
  const u = (uf ?? "").trim();
  if (!c) return u;
  if (!u || new RegExp(`[(/ -]\\s*${u}\\)?\\s*$`, "i").test(c)) return c;
  return `${c} / ${u}`;
}

/** Texto curto do embarque do volume. */
export function textoEmbarque(v: Pick<VolumeLinha, "numero_carga" | "embarque_status">): string {
  if (!v.numero_carga) return "";
  if (v.embarque_status === "EMBARCADA") return `Carga #${v.numero_carga} · embarcado`;
  return `Carga #${v.numero_carga} · aguardando`;
}

/** Texto da etiqueta: quantas vezes saiu e o estado da última. */
export function textoEtiqueta(v: Pick<VolumeLinha, "etiqueta_impressoes" | "etiqueta_ultimo_status">): { texto: string; cls: string } {
  const n = v.etiqueta_impressoes ?? 0;
  if (v.etiqueta_ultimo_status === "ERRO") return { texto: "Erro na última", cls: "text-red-400" };
  if (v.etiqueta_ultimo_status === "PENDENTE" || v.etiqueta_ultimo_status === "PROCESSANDO") return { texto: "Na fila", cls: "text-yellow-400" };
  if (n === 0) return { texto: "Nunca impressa", cls: "text-yellow-400" };
  return { texto: n === 1 ? "Impressa 1x" : `Impressa ${n}x`, cls: "text-muted-foreground" };
}

/** Linha está selecionável para ações em lote (impressão e medidas)? */
export const selecionavel = (v: VolumeLinha) => v.status !== "CANCELADO";

/** Algum volume da seleção já tem etiqueta impressa: a tela já pede o motivo. */
export const precisaMotivoReimpressao = (vs: Pick<VolumeLinha, "etiqueta_impressoes">[]) =>
  vs.some((v) => (v.etiqueta_impressoes ?? 0) > 0);

/** Converte "12,5" ou "12.5" em número; vazio ou inválido = null. */
export function numeroDigitado(texto: string): number | null {
  const t = texto.trim().replace(/\./g, (m, i, s) => (s.includes(",") ? "" : m)).replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
