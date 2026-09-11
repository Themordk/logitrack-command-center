import { supabase } from "@/integrations/supabase/client";

export interface DashboardFilters {
  tenantId: string;
  empresaId?: string | null;
  armazemId: string | null;
  dataIni: string;
  dataFim: string;
  turnoId?: string | null;
}

const sb = supabase as any;

// ── Tipos de retorno ──

export interface KpisResult {
  taxa_conclusao: {
    valor: number;
    concluidas: number;
    total: number;
    valor_anterior: number;
  };
  ocupacao: {
    valor: number;
    ocupados: number;
    livres: number;
    bloqueados: number;
    total: number;
  };
  produtividade: {
    valor: number;
    tarefas: number;
    horas: number;
    valor_anterior: number;
  };
  backlog: {
    total: number;
    tempo_medio_seg: number;
  };
  em_andamento: number;
  operadores_ativos: number;
  throughput: number;
  acuracia: {
    valor: number;
    sem_ocorrencia: number;
    total: number;
  };
  lms: {
    score_medio_equipe: number;
    taxa_ocupacao_media: number;
    produtividade_hora_media: number;
    operadores_avaliados: number;
    distribuicao_faixas: {
      excelente: number;
      bom: number;
      atencao: number;
      critico: number;
    };
  };
}

export interface OperadorRanking {
  usuario_id: string;
  nome: string;
  tarefas: number;
  produtividade: number;
  tempo_medio_seg: number;
  // Novos campos LMS:
  score_composto: number;
  faixa_performance: string; // "EXCELENTE" | "BOM" | "ATENCAO" | "CRITICO"
  quantidade_total: number;
  score_tendencia_5d: number;
  tendencia: string; // "SUBINDO" | "ESTAVEL" | "CAINDO" | "SEM_HISTORICO"
}

export interface ScorecardOperador {
  operador: {
    usuario_id: string;
    nome: string;
    tipo_operacao: string | null;
    habilidade: string | null;
    tipo_usuario: string | null;
    armazem: string | null;
    armazem_id: string | null;
    turno: string | null;
    turno_inicio: string | null;
    turno_fim: string | null;
  };
  metricas_periodo: {
    score_medio: number;
    taxa_ocupacao_media: number;
    produtividade_hora_media: number;
    total_tarefas: number;
    total_canceladas: number;
    quantidade_total: number;
    peso_total: number;
    documentos_processados: number;
    tempo_produtivo_total: number;
    tempo_transito_total: number;
    tempo_ocioso_total: number;
    dias_trabalhados: number;
    faixa_performance: string;
  };
  detalhamento_tipo: Array<{
    tipo_tarefa_codigo: string;
    tipo_tarefa_desc: string;
    categoria: string;
    cor_interface: string | null;
    tarefas: number;
    quantidade_total: number;
    tempo_medio_seg: number;
    tempo_total_seg: number;
    tempo_estimado_seg: number;
    meta_unidades_hora: number | null;
    performance_pct: number | null;
  }>;
  evolucao_diaria: Array<{
    data: string;
    score_dia: number;
    taxa_ocupacao: number;
    produtividade_hora: number;
    tarefas_concluidas: number;
    tempo_produtivo: number;
    tempo_transito: number;
    tempo_ocioso: number;
  }>;
  comparativo_equipe: {
    total_operadores: number;
    posicao: number;
    score_equipe_media: number;
    score_equipe_max: number;
    score_equipe_min: number;
  };
  periodo: {
    data_ini: string;
    data_fim: string;
  };
}

export interface OcorrenciaResumo {
  total: number;
  abertas: number;
  em_investigacao: number;
  resolvidas: number;
  canceladas: number;
  pendentes: number;
  criticas: number;
}

export interface OcorrenciaTipo {
  tipo: string;
  quantidade: number;
  pendentes: number;
}

export interface OcorrenciaEtapa {
  etapa: string;
  quantidade: number;
  pendentes: number;
}

export interface OcorrenciasResult {
  resumo: OcorrenciaResumo;
  por_tipo: OcorrenciaTipo[];
  por_etapa: OcorrenciaEtapa[];
}

export const LABELS_TIPO_OCORRENCIA: Record<string, string> = {
  FALTA: "Falta",
  SOBRA: "Sobra",
  AVARIA: "Avaria",
  DIVERGENCIA_INVENTARIO: "Divergência de Inventário",
  EXTRAVIO: "Extravio",
  PRODUTO_INCORRETO: "Produto Incorreto",
  VALIDADE_INCORRETA: "Validade Incorreta",
  LOTE_INCORRETO: "Lote Incorreto",
  OUTROS: "Outros",
};

export const LABELS_ETAPA_OCORRENCIA: Record<string, string> = {
  RECEBIMENTO: "Recebimento",
  ARMAZENAGEM: "Armazenagem",
  ABASTECIMENTO: "Abastecimento",
  MOVIMENTACAO: "Movimentação",
  SEPARACAO: "Separação",
  EXPEDICAO: "Expedição",
  INVENTARIO: "Inventário",
  AUDITORIA: "Auditoria",
};

export interface TendenciaItem {
  hora: number;
  tarefas: number;
  unidades: number;
}

// ── Funções de trend ──

function trend(curr: number, prev: number): { dir: "up" | "down" | "flat"; pct: number } {
  if (!prev) return { dir: curr > 0 ? "up" : "flat", pct: 0 };
  const pct = ((curr - prev) / prev) * 100;
  if (Math.abs(pct) < 0.5) return { dir: "flat", pct: 0 };
  return { dir: pct > 0 ? "up" : "down", pct: Math.abs(Math.round(pct * 10) / 10) };
}

// ── Formatação de tempo ──

export function formatarTempoEspera(segundos: number): string {
  if (segundos <= 0) return "0min";
  const dias = Math.floor(segundos / 86400);
  const horas = Math.floor((segundos % 86400) / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
}

// ── Helper: cor da faixa de performance LMS ──
export function corFaixaPerformance(faixa: string): { bg: string; text: string; border: string; label: string } {
  switch (faixa) {
    case "EXCELENTE": return { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/30", label: "Excelente" };
    case "BOM":       return { bg: "bg-blue-500/15",  text: "text-blue-400",  border: "border-blue-500/30",  label: "Bom" };
    case "ATENCAO":   return { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", label: "Atenção" };
    case "CRITICO":   return { bg: "bg-red-500/15",   text: "text-red-400",   border: "border-red-500/30",   label: "Crítico" };
    default:          return { bg: "bg-secondary/30",  text: "text-muted-foreground", border: "border-border/50", label: "Sem dados" };
  }
}

export function iconeTendencia(tendencia: string): { icon: string; color: string } {
  switch (tendencia) {
    case "SUBINDO":  return { icon: "↑", color: "text-green-400" };
    case "CAINDO":   return { icon: "↓", color: "text-red-400" };
    case "ESTAVEL":  return { icon: "→", color: "text-muted-foreground" };
    default:         return { icon: "—", color: "text-muted-foreground" };
  }
}

// ── RPC 1: KPIs escalares ──

export async function fetchKpis(f: DashboardFilters) {
  const { data, error } = await sb.rpc("dashboard_kpis", {
    p_tenant_id: f.tenantId,
    p_empresa_id: f.empresaId || null,
    p_armazem_id: f.armazemId || null,
    p_data_ini: f.dataIni,
    p_data_fim: f.dataFim,
    p_turno_id: f.turnoId || null,
  });
  if (error) {
    console.error("dashboard_kpis error:", error);
    return null;
  }
  const kpis = data as KpisResult;
  return {
    kpis,
    trendTaxaConclusao: trend(kpis.taxa_conclusao.valor, kpis.taxa_conclusao.valor_anterior),
    trendProdutividade: trend(kpis.produtividade.valor, kpis.produtividade.valor_anterior),
  };
}

// ── RPC 2: Ranking de operadores ──

export async function fetchRankingOperadores(f: DashboardFilters, limite = 8): Promise<OperadorRanking[]> {
  const { data, error } = await sb.rpc("dashboard_ranking_operadores", {
    p_tenant_id: f.tenantId,
    p_empresa_id: f.empresaId || null,
    p_armazem_id: f.armazemId || null,
    p_data_ini: f.dataIni,
    p_data_fim: f.dataFim,
    p_turno_id: f.turnoId || null,
    p_limite: limite,
  });
  if (error) {
    console.error("dashboard_ranking_operadores error:", error);
    return [];
  }
  // Backend retorna jsonb: pode vir como array direto ou wrappado
  const raw = data;
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    return raw[0] as OperadorRanking[];
  }
  return (raw || []) as OperadorRanking[];
}

// ── RPC 3: Ocorrências ──

export async function fetchOcorrencias(f: DashboardFilters): Promise<OcorrenciasResult> {
  const vazio: OcorrenciasResult = {
    resumo: { total: 0, abertas: 0, em_investigacao: 0, resolvidas: 0, canceladas: 0, pendentes: 0, criticas: 0 },
    por_tipo: [],
    por_etapa: [],
  };
  const { data, error } = await sb.rpc("dashboard_ocorrencias", {
    p_tenant_id: f.tenantId,
    p_empresa_id: f.empresaId || null,
    p_armazem_id: f.armazemId || null,
    p_data_ini: f.dataIni,
    p_data_fim: f.dataFim,
  });
  if (error) {
    console.error("dashboard_ocorrencias error:", error);
    return vazio;
  }
  return (data as OcorrenciasResult) || vazio;
}

// ── RPC 4: Tendência por hora ──

export async function fetchTendencia(f: DashboardFilters): Promise<TendenciaItem[]> {
  const { data, error } = await sb.rpc("dashboard_tendencia_tarefas", {
    p_tenant_id: f.tenantId,
    p_empresa_id: f.empresaId || null,
    p_armazem_id: f.armazemId || null,
    p_data_ini: f.dataIni,
    p_data_fim: f.dataFim,
    p_turno_id: f.turnoId || null,
  });
  if (error) {
    console.error("dashboard_tendencia_tarefas error:", error);
    return [];
  }
  return (data || []) as TendenciaItem[];
}

// ── RPC 5: Scorecard individual do operador ──

export async function fetchScorecardOperador(
  tenantId: string,
  usuarioId: string,
  dataIni: string,
  dataFim: string,
): Promise<ScorecardOperador | null> {
  const { data, error } = await sb.rpc("dashboard_scorecard_operador", {
    p_tenant_id: tenantId,
    p_usuario_id: usuarioId,
    p_data_ini: dataIni,
    p_data_fim: dataFim,
  });
  if (error) {
    console.error("dashboard_scorecard_operador error:", error);
    return null;
  }
  return data as ScorecardOperador;
}
