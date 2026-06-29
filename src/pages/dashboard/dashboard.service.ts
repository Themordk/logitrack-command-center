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
}

export interface OperadorRanking {
  usuario_id: string;
  nome: string;
  tarefas: number;
  produtividade: number;
  tempo_medio_seg: number;
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
  return (data || []) as OperadorRanking[];
}

// ── RPC 3: Ocorrências ──

export async function fetchOcorrencias(f: DashboardFilters, limite = 8): Promise<OcorrenciaItem[]> {
  const { data, error } = await sb.rpc("dashboard_ocorrencias", {
    p_tenant_id: f.tenantId,
    p_empresa_id: f.empresaId || null,
    p_armazem_id: f.armazemId || null,
    p_data_ini: f.dataIni,
    p_data_fim: f.dataFim,
    p_limite: limite,
  });
  if (error) {
    console.error("dashboard_ocorrencias error:", error);
    return [];
  }
  return (data || []) as OcorrenciaItem[];
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
