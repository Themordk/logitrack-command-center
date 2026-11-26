// Botão "Importar do ERP" executado por um fluxo do Retorno ao ERP (docs/retorno-erp/CONTRATO_FRONTEND.md §6.4).
// Funções puras: a decisão (fluxo ativo, prévia, gravação) é sempre do banco e do dispatcher.
import type { EventoImportacao, Importacao, StatusExecucao } from "@/pages/integracao/retornos/retornos.types";

/** Situação da tela a partir da importação devolvida pelo servidor. */
export type SituacaoImportacao = "executando" | "aguardando" | "sucesso" | "erro" | "filtrado" | "descartado";

const EM_ANDAMENTO: StatusExecucao[] = ["pendente", "executando", "agrupando", "agrupado", "aguardando_retry"];

export function situacaoImportacao(imp: Pick<Importacao, "status"> | null | undefined): SituacaoImportacao {
  const s = imp?.status;
  if (!s || EM_ANDAMENTO.includes(s)) return "executando";
  if (s === "aguardando_confirmacao") return "aguardando";
  if (s === "sucesso" || s === "filtrado" || s === "descartado" || s === "erro") return s;
  return "erro";
}

/** A tela pode parar de consultar: o fluxo terminou ou está esperando o usuário. */
export const importacaoParada = (imp: Pick<Importacao, "status"> | null | undefined) => situacaoImportacao(imp) !== "executando";

/** Mensagem de erro para o usuário: o passo que falhou primeiro, depois o erro geral da execução. */
export function mensagemErroImportacao(imp: Importacao | null | undefined): string {
  if (!imp) return "Não foi possível concluir a importação. Tente de novo.";
  const passo = imp.passos?.find((p) => p.status === "erro" && p.erro);
  const texto = imp.erro || passo?.erro || "";
  const http = imp.erro_http_status ?? passo?.http_status ?? null;
  if (!texto) return http ? `O ERP respondeu com HTTP ${http}. Confira o código e tente de novo.` : "O fluxo terminou com erro. Confira o código e tente de novo.";
  return http && !texto.includes(String(http)) ? `${texto} (HTTP ${http})` : texto;
}

export interface CampoPrevia { chave: string; valor: string }

const formatarValor = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "number") return v.toLocaleString("pt-BR");
  return String(v);
};

/**
 * Prévia como lista de campos quando é um objeto raso (o caso comum de um cadastro);
 * null quando precisa ser mostrada como JSON (objetos aninhados, listas).
 */
export function camposPrevia(previa: unknown): CampoPrevia[] | null {
  if (!previa || typeof previa !== "object" || Array.isArray(previa)) return null;
  const entradas = Object.entries(previa as Record<string, unknown>);
  if (!entradas.length || entradas.length > 30) return null;
  if (entradas.some(([, v]) => v !== null && typeof v === "object")) return null;
  return entradas.map(([chave, v]) => ({ chave, valor: formatarValor(v) }));
}

/** Rótulo do status devolvido pela API do LogiTrack ao gravar. */
export function rotuloRegistroGravado(status: string | null | undefined): string {
  switch ((status ?? "").toLowerCase()) {
    case "inserido": case "criado": case "created": case "success": return "Registro criado no LogiTrack.";
    case "atualizado": case "updated": return "Registro atualizado no LogiTrack.";
    case "already_imported": case "ja_existia": return "O registro já existia no LogiTrack.";
    default: return "Registro gravado no LogiTrack.";
  }
}

/** Link da execução na tela de Retorno ao ERP (para suporte acompanhar os passos). */
export const linkExecucaoImportacao = (imp: Pick<Importacao, "execucao_id" | "fluxo_id">) =>
  `/config/integracao/retornos?aba=execucoes&fluxo=${imp.fluxo_id}&execucao=${imp.execucao_id}`;

/** Evento do Retorno ao ERP de cada tela com botão Importar do ERP. */
export const EVENTO_IMPORTACAO = {
  produto: "importar.produto",
  parceiro: "importar.parceiro",
  grupo_produto: "importar.grupo_produto",
  subgrupo_produto: "importar.subgrupo_produto",
  rota: "importar.rota",
  tipo_entrada: "importar.tipo_entrada",
  tipo_saida: "importar.tipo_saida",
  documento_entrada: "importar.documento_entrada",
  documento_saida: "importar.documento_saida",
} as const satisfies Record<string, EventoImportacao>;
