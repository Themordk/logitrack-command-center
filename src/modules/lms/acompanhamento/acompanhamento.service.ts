/**
 * Fase 10 · Acompanhamento do LMS: painel do turno, atingimento por período e visão da empresa.
 * Projeção, semáforo, médias e tendências vêm prontos do banco (rpc_lms_painel_turno,
 * rpc_lms_atingimento, rpc_lms_visao_empresa); aqui ficam tipos, chamadas e textos.
 */
import { supabase } from "@/integrations/supabase/client";
import type { FaixaLms } from "@/modules/lms/faixas";
import type { FaixaMeta, Metrica, Periodicidade, UnidadeMetrica } from "@/modules/lms/metas/metas.service";
import type { ClassificacaoScore, SituacaoScore } from "@/modules/lms/score/score.service";

const sb = supabase as any;

function exigir<T>(data: any, error: any, padrao: string): T {
  if (error) throw new Error(error.message);
  if (!data?.sucesso) throw new Error(data?.mensagem || padrao);
  return data as T;
}

// ── Painel do turno ──

export type StatusOperador = "EM_TAREFA" | "INDIRETA" | "SEM_TAREFA" | "SEM_SESSAO";

export interface MetaPainel {
  meta_id: string; nome: string; metrica: Metrica; rotulo_metrica: string; unidade: UnidadeMetrica; direcao: "MAIOR" | "MENOR";
  atividade: string; tipo_codigo: string | null; categoria: string | null; escopo: string | null; peso: number;
  alvo: number | null; minimo: number | null; excelencia: number | null;
  realizado: number | null; atingimento_pct: number | null; faixa_atual: FaixaMeta; participantes: number;
  amostra_suficiente: boolean; origem: string | null;
  projecao: number | null; atingimento_projetado_pct: number | null; faixa_projetada: FaixaMeta; projeta_ritmo: boolean;
}

export interface OperadorPainel {
  usuario_id: string; nome: string; status: StatusOperador; status_desde: string | null;
  tarefa: { desde: string; tipo: string | null; descricao: string | null } | null;
  indireta: { desde: string; atividade: string; tipo: "INDIRETA" | "EXCECAO" } | null;
  tarefas: number; quantidade: number; tempo_disponivel: number; tempo_direto: number; tempo_indireto: number;
  utilizacao_pct: number | null; performance_pct: number | null; eficiencia_pct: number | null; origem: "REAL" | "ESTIMADO" | null;
  score: number | null; score_situacao: SituacaoScore; score_metas_total: number; score_metas_contadas: number;
  classificacao: ClassificacaoScore;
}

export interface PainelTurno {
  data: string; atualizado_em: string | null; agora: string;
  turno: { id: string | null; descricao: string; inicio: string; fim: string; intervalo_min: number; fracao_decorrida: number };
  turnos: Array<{ id: string; descricao: string; hora_inicio: string; hora_fim: string }>;
  resumo: {
    operadores: number; em_tarefa: number; indireta: number; sem_tarefa: number; sem_sessao: number;
    tarefas: number; quantidade: number; utilizacao_pct: number | null; performance_pct: number | null; eficiencia_pct: number | null;
    score_medio: number | null; metas: number; metas_no_caminho: number; metas_em_risco: number;
  };
  metas: MetaPainel[];
  operadores: OperadorPainel[];
  faixas_lista: FaixaLms[];
  score_esperado: number | null;
}

export async function obterPainelTurno(tenantId: string, armazemId: string, turnoId: string | null): Promise<PainelTurno> {
  const { data, error } = await sb.rpc("rpc_lms_painel_turno", { p_tenant_id: tenantId, p_armazem_id: armazemId, p_turno_id: turnoId });
  return exigir<PainelTurno>(data, error, "Não foi possível carregar o painel do turno.");
}

export const ROTULO_STATUS_OPERADOR: Record<StatusOperador, { texto: string; classe: string }> = {
  EM_TAREFA:  { texto: "Em tarefa",          classe: "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400" },
  INDIRETA:   { texto: "Atividade indireta", classe: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  SEM_TAREFA: { texto: "Sem tarefa",         classe: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  SEM_SESSAO: { texto: "Sem sessão",         classe: "border-border bg-muted/40 text-muted-foreground" },
};

/** Cor do semáforo da projeção. */
export function semaforo(f: FaixaMeta): { cor: string; texto: string } {
  if (f === "EXCELENTE" || f === "NA_META") return { cor: "bg-green-500", texto: "No caminho" };
  if (f === "ACEITAVEL") return { cor: "bg-amber-500", texto: "Atenção" };
  if (f === "ABAIXO") return { cor: "bg-red-500", texto: "Em risco" };
  if (f === "ESTIMADO") return { cor: "bg-gray-400", texto: "Estimado" };
  return { cor: "bg-gray-400", texto: "Sem dados" };
}

/** Tempo desde um instante, curto ("12 min", "1 h 05"). */
export function tempoDesde(iso: string | null | undefined, agora: Date = new Date()): string {
  if (!iso) return "—";
  const seg = Math.max(0, Math.round((agora.getTime() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return "agora";
  const min = Math.floor(seg / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return `${h} h ${String(min % 60).padStart(2, "0")}`;
}

// ── Atingimento por período ──

export interface PeriodoAtingimento {
  periodo_ref: string; periodo_ini: string; periodo_fim: string; realizado: number | null; alvo: number | null;
  atingimento_pct: number | null; faixa: FaixaMeta; participantes: number; parcial: boolean;
}
export type Tendencia = "SUBINDO" | "CAINDO" | "ESTAVEL" | "SEM_HISTORICO";

export interface MetaAtingimento {
  meta_id: string; nome: string; metrica: Metrica; rotulo_metrica: string; unidade: UnidadeMetrica; direcao: "MAIOR" | "MENOR";
  periodicidade: Periodicidade; status: "ATIVA" | "ENCERRADA"; armazem_id: string | null; armazem_nome: string | null;
  atividade: string; tipo_codigo: string | null; categoria: string | null; peso: number; alvo: number;
  vigente_desde: string; vigente_ate: string | null;
  periodos: PeriodoAtingimento[]; qtd_periodos: number; periodos_contados: number; periodos_na_meta: number;
  atingimento_medio_pct: number | null; tendencia: Tendencia;
}

export interface FiltrosAtingimento {
  armazem_id?: string | null; tipo_tarefa_id?: string | null; turno_id?: string | null; equipe_id?: string | null;
  periodicidade?: Periodicidade | null;
}

export async function obterAtingimento(tenantId: string, empresaId: string, ini: string, fim: string, filtros: FiltrosAtingimento)
  : Promise<MetaAtingimento[]> {
  const limpos = Object.fromEntries(Object.entries(filtros).filter(([, v]) => v));
  const { data, error } = await sb.rpc("rpc_lms_atingimento", {
    p_tenant_id: tenantId, p_empresa_id: empresaId, p_data_ini: ini, p_data_fim: fim, p_filtros: limpos,
  });
  return exigir<{ metas: MetaAtingimento[] }>(data, error, "Não foi possível carregar o atingimento das metas.").metas;
}

export const ICONE_TENDENCIA: Record<Tendencia, { icone: string; classe: string; texto: string }> = {
  SUBINDO: { icone: "↑", classe: "text-green-500", texto: "Subindo" },
  CAINDO: { icone: "↓", classe: "text-red-500", texto: "Caindo" },
  ESTAVEL: { icone: "→", classe: "text-muted-foreground", texto: "Estável" },
  SEM_HISTORICO: { icone: "—", classe: "text-muted-foreground", texto: "Sem histórico" },
};

/** Decomposição de um período: quem ficou acima e abaixo do alvo, do maior para o menor atingimento. */
export function decompor<T extends { atingimento_pct: number | null; oficial?: boolean }>(individuais: T[]) {
  const com = individuais.filter((i) => i.atingimento_pct !== null);
  return {
    acima: com.filter((i) => Number(i.atingimento_pct) >= 100).sort((a, b) => Number(b.atingimento_pct) - Number(a.atingimento_pct)),
    abaixo: com.filter((i) => Number(i.atingimento_pct) < 100).sort((a, b) => Number(a.atingimento_pct) - Number(b.atingimento_pct)),
    sem_dados: individuais.filter((i) => i.atingimento_pct === null),
  };
}

// ── Visão da empresa ──

export interface ArmazemVisao {
  armazem_id: string; armazem: string; operadores: number; dias: number; tarefas: number; quantidade: number;
  tempo_disponivel: number; tempo_direto: number; tempo_indireto: number; horas_padrao_seg: number;
  utilizacao_pct: number | null; performance_pct: number | null; eficiencia_pct: number | null;
  pct_inicio_real: number | null; origem: "REAL" | "ESTIMADO";
  score_medio: number | null; operadores_com_score: number; metas_com_resultado: number; atingimento_medio_pct: number | null;
}

export interface VisaoEmpresa {
  armazens: ArmazemVisao[];
  total: Omit<ArmazemVisao, "armazem_id" | "armazem" | "dias" | "tempo_indireto" | "pct_inicio_real" | "origem" | "metas_com_resultado" | "atingimento_medio_pct">;
  faixas_lista: FaixaLms[];
}

export async function obterVisaoEmpresa(tenantId: string, empresaId: string, ini: string, fim: string): Promise<VisaoEmpresa> {
  const { data, error } = await sb.rpc("rpc_lms_visao_empresa", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_data_ini: ini, p_data_fim: fim });
  return exigir<VisaoEmpresa>(data, error, "Não foi possível carregar a visão da empresa.");
}
