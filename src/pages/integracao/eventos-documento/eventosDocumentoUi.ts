import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Ban, CheckCircle2, Circle, Clock, FileDown, FilePen,
  FilePlus2, Filter, Receipt, Scissors, Send, ShieldAlert, Trash2, Undo2, Unlink, Warehouse, XCircle,
  type LucideIcon,
} from "lucide-react";
import type { CategoriaEvento, DirecaoEvento, EventoComNivel, EventoDocumento, OrdemEventos } from "./eventosDocumento.types";
import { MODO_EXECUCAO_UI } from "../retornos/retornosUi";
import type { ModoExecucao } from "../retornos/retornos.types";

export const DIRECAO_UI: Record<DirecaoEvento, { rotulo: string; icone: LucideIcon; texto: string; classe: string }> = {
  ERP_WMS: { rotulo: "ERP → WMS", icone: ArrowDownToLine, texto: "text-sky-400", classe: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  WMS: { rotulo: "WMS", icone: Warehouse, texto: "text-violet-400", classe: "bg-violet-500/15 text-violet-400 border-violet-500/30" },
  WMS_ERP: { rotulo: "WMS → ERP", icone: ArrowUpFromLine, texto: "text-emerald-400", classe: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
};

export interface SituacaoUi { rotulo: string; icone: LucideIcon; classe: string; tom: "sucesso" | "andamento" | "problema" | "neutro" }

const VERDE = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
const AMBAR = "bg-amber-500/15 text-amber-400 border-amber-500/30";
const VERMELHO = "bg-rose-500/15 text-rose-400 border-rose-500/30";
const CINZA = "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

export const SITUACAO_UI: Record<string, SituacaoUi> = {
  sucesso: { rotulo: "Sucesso", icone: CheckCircle2, classe: VERDE, tom: "sucesso" },
  aplicada: { rotulo: "Aplicada", icone: CheckCircle2, classe: VERDE, tom: "sucesso" },
  aplicado: { rotulo: "Aplicado", icone: CheckCircle2, classe: VERDE, tom: "sucesso" },
  cancelado: { rotulo: "Cancelado", icone: CheckCircle2, classe: VERDE, tom: "sucesso" },
  roteado: { rotulo: "Roteado", icone: CheckCircle2, classe: VERDE, tom: "sucesso" },
  pendente: { rotulo: "Pendente", icone: Clock, classe: AMBAR, tom: "andamento" },
  executando: { rotulo: "Executando", icone: Clock, classe: AMBAR, tom: "andamento" },
  aguardando_retry: { rotulo: "Aguardando nova tentativa", icone: Clock, classe: AMBAR, tom: "andamento" },
  agrupando: { rotulo: "Agrupando", icone: Clock, classe: AMBAR, tom: "andamento" },
  erro: { rotulo: "Erro", icone: XCircle, classe: VERMELHO, tom: "problema" },
  recusada: { rotulo: "Recusada", icone: XCircle, classe: VERMELHO, tom: "problema" },
  recusado: { rotulo: "Recusado", icone: XCircle, classe: VERMELHO, tom: "problema" },
  falha: { rotulo: "Falha", icone: AlertTriangle, classe: VERMELHO, tom: "problema" },
  filtrado: { rotulo: "Filtrado", icone: Filter, classe: CINZA, tom: "neutro" },
  registrado: { rotulo: "Registrado", icone: Circle, classe: CINZA, tom: "neutro" },
  observado: { rotulo: "Observado", icone: Circle, classe: CINZA, tom: "neutro" },
  descartado: { rotulo: "Descartado", icone: Circle, classe: CINZA, tom: "neutro" },
};

export function situacaoUi(situacao: string | null | undefined): SituacaoUi | null {
  if (!situacao) return null;
  return SITUACAO_UI[situacao.toLowerCase()] ?? null;
}

export const ORIGEM_UI: Record<string, string> = {
  API: "API do ERP",
  API_ERP: "API do ERP",
  INTERCEPTADOR: "Interceptador",
  AUTOMATICO: "Automático",
  MANUAL: "Manual",
  USUARIO: "Usuário",
  SINCRONIZACAO: "Sincronização",
  API_SISTEMA: "API/Sistema",
  NAO_IDENTIFICADA: "Não identificada",
};

export function origemTexto(ev: Pick<EventoDocumento, "fonte" | "origem" | "extra">): string {
  if (ev.fonte === "retorno_execucao") {
    const modo = typeof ev.extra?.modo === "string" ? ev.extra.modo : null;
    if (modo) return MODO_EXECUCAO_UI[modo as ModoExecucao] ?? modo;
  }
  if (!ev.origem) return "—";
  return ORIGEM_UI[ev.origem] ?? ev.origem;
}

export const CATEGORIA_ICONE: Record<CategoriaEvento, LucideIcon> = {
  importacao: FileDown,
  alteracao: FilePen,
  rejeicao_api: ShieldAlert,
  cancelamento: Ban,
  exclusao: Trash2,
  restauracao: Undo2,
  alteracao_operacional: Scissors,
  nf: Receipt,
  remocao_movimento: Unlink,
  operacao_wms: Activity,
  retorno_erp: Send,
  registro: FilePlus2,
};

/** Coloca cada retorno_execucao logo abaixo do retorno_evento pai presente na lista. */
export function agruparEventos(eventos: EventoDocumento[]): EventoComNivel[] {
  const idsPais = new Set(eventos.filter((e) => e.fonte === "retorno_evento").map((e) => e.id));
  const filhos = new Map<string, EventoDocumento[]>();
  const raizes: EventoDocumento[] = [];
  for (const e of eventos) {
    if (e.fonte === "retorno_execucao" && e.pai_id && idsPais.has(e.pai_id)) {
      const l = filhos.get(e.pai_id) ?? [];
      l.push(e);
      filhos.set(e.pai_id, l);
    } else raizes.push(e);
  }
  const out: EventoComNivel[] = [];
  for (const r of raizes) {
    out.push({ evento: r, filho: false });
    const fs = filhos.get(r.id);
    if (fs) [...fs].sort((a, b) => a.seq - b.seq).forEach((f) => out.push({ evento: f, filho: true }));
  }
  return out;
}

/** Retorno enviado ao ERP mais recente (maior seq) e que terminou com erro. */
export function ultimoRetornoComErroId(eventos: EventoDocumento[]): string | null {
  let melhor: EventoDocumento | null = null;
  for (const e of eventos) {
    if (e.fonte !== "retorno_execucao") continue;
    if (!melhor || e.seq > melhor.seq) melhor = e;
  }
  return melhor && melhor.situacao === "erro" ? melhor.id : null;
}

const CHAVE_ORDEM = "doc-eventos-ordem";

export function lerOrdemSalva(): OrdemEventos {
  try {
    const v = window.localStorage.getItem(CHAVE_ORDEM);
    return v === "desc" ? "desc" : "asc";
  } catch {
    return "asc";
  }
}

export function salvarOrdem(ordem: OrdemEventos) {
  try { window.localStorage.setItem(CHAVE_ORDEM, ordem); } catch { /* sem armazenamento */ }
}
