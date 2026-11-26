/**
 * Regras de exibição do relatório de Produtividade Operacional (Fase 4).
 *
 * Os números vêm prontos de rpc_lms_metricas (fonte única, ponderada no banco).
 * Aqui ficam só as regras de apresentação: faixa/cor pelas faixas do armazém
 * (F6), domínio do eixo com meta (F5), janela da paginação (F10), qualidade e
 * UPH do tipo dominante. Nada de média de percentuais no navegador (F2/F3).
 */

import { FAIXAS_PADRAO_LISTA, PALETA, classificar, type FaixaLms } from "@/modules/lms/faixas";

export interface FaixasArmazem {
  excelente: number;
  /** meta (faixa marcada com estrela no LMS) */
  bom: number;
  atencao: number;
  /** Fase 7.5: conjunto configurável (nome, cor, limite, meta) */
  lista?: FaixaLms[];
}

export const FAIXAS_PADRAO: FaixasArmazem = { excelente: 110, bom: 90, atencao: 70, lista: FAIXAS_PADRAO_LISTA };

/** Fase 7.5: classe de texto, cor e nome pela faixa configurada. */
export function classeFaixa(pct: number | null | undefined, f: FaixasArmazem = FAIXAS_PADRAO): string {
  return PALETA[classificar(pct, f.lista).cor].texto;
}
export function corFaixa(pct: number | null | undefined, f: FaixasArmazem = FAIXAS_PADRAO): string {
  return PALETA[classificar(pct, f.lista).cor].hex;
}
export function nomeFaixa(pct: number | null | undefined, f: FaixasArmazem = FAIXAS_PADRAO): string {
  return classificar(pct, f.lista).nome;
}

export type Faixa = "EXCELENTE" | "BOM" | "ATENCAO" | "CRITICO" | "SEM_DADOS";

export function faixaDe(pct: number | null | undefined, f: FaixasArmazem = FAIXAS_PADRAO): Faixa {
  if (pct == null || Number.isNaN(pct)) return "SEM_DADOS";
  if (pct >= f.excelente) return "EXCELENTE";
  if (pct >= f.bom) return "BOM";
  if (pct >= f.atencao) return "ATENCAO";
  return "CRITICO";
}

export const COR_FAIXA: Record<Faixa, string> = {
  EXCELENTE: "#22c55e",
  BOM: "#3b82f6",
  ATENCAO: "#eab308",
  CRITICO: "#ef4444",
  SEM_DADOS: "#6b7280",
};

export const CLASSE_FAIXA: Record<Faixa, string> = {
  EXCELENTE: "text-green-400",
  BOM: "text-blue-400",
  ATENCAO: "text-yellow-400",
  CRITICO: "text-red-400",
  SEM_DADOS: "text-muted-foreground",
};

export const ROTULO_FAIXA: Record<Faixa, string> = {
  EXCELENTE: "Excelente",
  BOM: "Na meta",
  ATENCAO: "Atenção",
  CRITICO: "Crítico",
  SEM_DADOS: "Sem dados",
};

/** Performance acima deste valor indica padrão (SET) a revisar, não mérito. */
export const LIMITE_AUDITAR_SET = 120;

/** Domínio dinâmico do eixo: cobre o maior valor e a meta com folga, nunca corta acima de 100% (F5). */
export function dominioEixo(valores: Array<number | null | undefined>, meta: number): [number, number] {
  const max = Math.max(meta, ...valores.map((v) => (v == null || Number.isNaN(v) ? 0 : v)));
  const teto = Math.ceil((max * 1.1) / 10) * 10;
  return [0, Math.max(teto, 10)];
}

/** Janela deslizante de páginas (F10). Sempre inclui a atual; no máximo `tamanho` números. */
export function janelaPaginas(atual: number, total: number, tamanho = 5): number[] {
  if (total <= 0) return [];
  const n = Math.min(tamanho, total);
  let ini = Math.max(1, atual - Math.floor(n / 2));
  if (ini + n - 1 > total) ini = total - n + 1;
  return Array.from({ length: n }, (_, i) => ini + i);
}

/** % de tarefas sem ocorrência registrada. */
export function qualidadePct(tarefas: number, ocorrencias: number): number | null {
  if (!tarefas || tarefas <= 0) return null;
  const ok = Math.max(tarefas - Math.min(ocorrencias || 0, tarefas), 0);
  return Math.round((10000 * ok) / tarefas) / 100;
}

export interface TipoLinha {
  codigo: string;
  descricao: string;
  unidade_medida: string | null;
  tempo_direto: number;
  uph: number | null;
}

/** UPH só faz sentido dentro de um tipo (unidades diferentes não somam): usa o tipo com mais tempo direto. */
export function tipoDominante<T extends TipoLinha>(tipos: T[]): T | null {
  let melhor: T | null = null;
  for (const t of tipos) {
    if ((t.tempo_direto || 0) <= 0) continue;
    if (!melhor || t.tempo_direto > melhor.tempo_direto) melhor = t;
  }
  return melhor;
}

/**
 * Fase 10.35: divisão do tempo disponível em segundos, sem sobreposição:
 * direto + indireto + entre tarefas + ocioso = disponível. "Entre tarefas" é a parte do
 * ocioso que foi intervalo curto entre atividades (o banco já limita ao ocioso do dia).
 */
export function divisaoTempo(l: {
  tempo_direto: number; tempo_indireto: number; tempo_ocioso: number; tempo_disponivel: number;
  tempo_entre_tarefas?: number | null;
}) {
  const ocioso = Math.max(l.tempo_ocioso || 0, 0);
  const entre = Math.min(Math.max(l.tempo_entre_tarefas || 0, 0), ocioso);
  return {
    direto: l.tempo_direto || 0,
    indireto: l.tempo_indireto || 0,
    entre,
    parado: ocioso - entre,
    disponivel: l.tempo_disponivel || 0,
  };
}

/** Composição do tempo disponível em horas (F1 / Fase 10.35): direto + indireto + entre tarefas + ocioso = disponível. */
export function composicaoHoras(l: {
  tempo_direto: number; tempo_indireto: number; tempo_ocioso: number; tempo_disponivel: number;
  tempo_entre_tarefas?: number | null; indireto_apontado?: number | null; indireto_cancelada?: number | null; indireto_esquecida?: number | null;
}) {
  const h = (s: number) => Math.round(((s || 0) / 3600) * 100) / 100;
  const d = divisaoTempo(l);
  return {
    direto: h(d.direto),
    indireto: h(d.indireto),
    entre: h(d.entre),
    ocioso: h(d.parado),
    disponivel: h(d.disponivel),
    indireto_apontado: h(l.indireto_apontado || 0),
    indireto_cancelada: h(l.indireto_cancelada || 0),
    indireto_esquecida: h(l.indireto_esquecida || 0),
  };
}

/** "Calculado às 17:45" a partir do calculado_em da consolidação (timestamptz). */
export function textoCalculadoEm(iso: string | null | undefined, agora: Date = new Date()): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const mesmoDia = d.toDateString() === agora.toDateString();
  return mesmoDia ? `Calculado às ${hm}` : `Calculado em ${d.toLocaleDateString("pt-BR")} às ${hm}`;
}

export function formatarPct(v: number | null | undefined, casas = 1): string {
  if (v == null || Number.isNaN(Number(v))) return "—";
  return `${Number(v).toFixed(casas).replace(".", ",")}%`;
}

export function formatarTempo(seg: number | null | undefined): string {
  if (!seg || seg <= 0) return "0min";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}
