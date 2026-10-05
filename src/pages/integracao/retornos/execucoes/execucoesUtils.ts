import { formatTime } from "@/utils/dateTime";
import type { ExecucaoResumo, FiltrosExecucao, ModoExecucao, StatusExecucao } from "../retornos.types";

export const STATUS_FILTRAVEIS: StatusExecucao[] = [
  "sucesso", "erro", "pendente", "aguardando_retry", "executando", "agrupando", "filtrado", "descartado",
];
export const STATUS_PADRAO: StatusExecucao[] = STATUS_FILTRAVEIS.filter((s) => s !== "filtrado");
export const STATUS_PENDENTES: StatusExecucao[] = ["pendente", "executando", "aguardando_retry", "agrupando"];
export const STATUS_FINAIS_DETALHE: StatusExecucao[] = ["sucesso", "erro", "filtrado", "descartado", "agrupado"];

export const PODE_REPROCESSAR: StatusExecucao[] = ["erro", "descartado", "sucesso"];
export const PODE_DESCARTAR: StatusExecucao[] = ["pendente", "aguardando_retry", "erro", "agrupando"];

export type Periodo = "hoje" | "24h" | "7d" | "personalizado";
export const PERIODOS: { valor: Periodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "24h", rotulo: "24 h" },
  { valor: "7d", rotulo: "7 dias" },
  { valor: "personalizado", rotulo: "Personalizado" },
];

export interface FiltrosTela {
  fluxo: string;
  status: StatusExecucao[];
  modo: ModoExecucao | "";
  periodo: Periodo;
  de: string; // yyyy-mm-dd
  ate: string;
  busca: string;
  pagina: number;
}

const MODOS: ModoExecucao[] = ["automatico", "manual", "teste", "simulacao", "lote"];

export function lerFiltros(params: URLSearchParams): FiltrosTela {
  const st = params.get("status");
  const status = st
    ? st.split(",").filter((s): s is StatusExecucao => STATUS_FILTRAVEIS.includes(s as StatusExecucao))
    : STATUS_PADRAO;
  const modo = params.get("modo") as ModoExecucao | null;
  const periodo = params.get("periodo") as Periodo | null;
  return {
    fluxo: params.get("fluxo") ?? "",
    status: status.length ? status : STATUS_PADRAO,
    modo: modo && MODOS.includes(modo) ? modo : "",
    periodo: periodo && PERIODOS.some((p) => p.valor === periodo) ? periodo : "7d",
    de: params.get("de") ?? "",
    ate: params.get("ate") ?? "",
    busca: params.get("busca") ?? "",
    pagina: Math.max(1, Number(params.get("pagina")) || 1),
  };
}

export function urlFiltros(f: FiltrosTela, execucao?: string | null): string {
  const p = new URLSearchParams({ aba: "execucoes" });
  if (f.fluxo) p.set("fluxo", f.fluxo);
  const padrao = f.status.length === STATUS_PADRAO.length && STATUS_PADRAO.every((s) => f.status.includes(s));
  if (!padrao) p.set("status", f.status.join(","));
  if (f.modo) p.set("modo", f.modo);
  if (f.periodo !== "7d") p.set("periodo", f.periodo);
  if (f.periodo === "personalizado") {
    if (f.de) p.set("de", f.de);
    if (f.ate) p.set("ate", f.ate);
  }
  if (f.busca) p.set("busca", f.busca);
  if (f.pagina > 1) p.set("pagina", String(f.pagina));
  if (execucao) p.set("execucao", execucao);
  return `/config/integracao/retornos?${p.toString()}`;
}

/** Converte filtros da tela para o contrato. `agora` fixo evita trocar a chave da consulta a cada render. */
export function paraFiltrosApi(f: FiltrosTela, agora: number): FiltrosExecucao {
  const api: FiltrosExecucao = { status: f.status };
  if (f.fluxo) api.fluxo_id = f.fluxo;
  if (f.modo) api.modo = f.modo;
  if (f.busca.trim()) api.busca = f.busca.trim();
  if (f.periodo === "hoje") {
    const d = new Date(agora); d.setHours(0, 0, 0, 0); api.de = d.toISOString();
  } else if (f.periodo === "24h") {
    api.de = new Date(agora - 24 * 3600_000).toISOString();
  } else if (f.periodo === "7d") {
    api.de = new Date(agora - 7 * 24 * 3600_000).toISOString();
  } else {
    if (f.de) api.de = new Date(`${f.de}T00:00:00`).toISOString();
    if (f.ate) api.ate = new Date(`${f.ate}T23:59:59.999`).toISOString();
  }
  return api;
}

export interface ErroAmigavel { texto: string; irDestinos?: boolean }

/** Traduz o erro técnico do ERP em linguagem clara. */
export function erroAmigavel(e: Pick<ExecucaoResumo, "erro" | "erro_http_status" | "processar_apos">): ErroAmigavel | null {
  const msg = (e.erro ?? "").toLowerCase();
  const http = e.erro_http_status;
  if (!e.erro && !http) return null;
  if (msg.includes("pausad")) return { texto: "Destino pausado após falhas seguidas.", irDestinos: true };
  if (http === 429) {
    return { texto: e.processar_apos ? `O ERP limitou os envios; nova tentativa às ${formatTime(e.processar_apos)}.` : "O ERP limitou os envios." };
  }
  if (http === 401 || http === 403) return { texto: "O ERP recusou a autenticação. Revise o destino.", irDestinos: true };
  if (http != null && http >= 500) return { texto: "O ERP está com erro interno." };
  if (msg.includes("timeout") || msg.includes("tempo esgotado") || msg.includes("timed out") || msg.includes("abort")) {
    return { texto: "O ERP não respondeu a tempo." };
  }
  return null;
}
