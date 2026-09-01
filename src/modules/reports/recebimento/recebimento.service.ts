import { supabase } from "@/integrations/supabase/client";
import { fetchAllRpcRows } from "../utils/fetchAllRpcRows";

export type StatusSla = "DENTRO" | "ALERTA" | "FORA" | "EM_ANDAMENTO";

export interface RecebimentoFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
  parceiro_id?: string;
  data_inicio?: string; // ISO (created_at >=)
  data_fim?: string;    // ISO (created_at <=)
  status_sla?: StatusSla;
  apenas_concluidos?: boolean; // default false
  sla_horas?: number; // default 24h
}

export interface RecebimentoRow {
  id: string;
  numero_movimento: number | null;
  status: string | null;
  documento: string;
  fornecedor: string;
  parceiro_id: string | null;
  armazem_id: string | null;
  total_volume: number | null;

  t0_dock: string | null;
  t1_autorizado: string | null;
  t2_conf_inicio: string | null;
  t3_conf_fim: string | null;
  t4_armz_inicio: string | null;
  t5_stock: string | null;

  tempo_total_min: number | null;
  tempo_liberacao_min: number | null;
  tempo_conferencia_min: number | null;
  tempo_armazenagem_min: number | null;
  tempo_ocioso_min: number | null;

  status_sla: StatusSla;
  sla_horas: number;
  perc_sla: number | null;
}

export interface RecebimentoKpis {
  total_recebimentos: number;
  concluidos: number;
  em_andamento: number;
  dentro_sla: number;
  fora_sla: number;
  alerta_sla: number;
  tempo_medio_total_min: number;
  tempo_medio_liberacao_min: number;
  tempo_medio_conferencia_min: number;
  tempo_medio_armazenagem_min: number;
  tempo_medio_ocioso_min: number;
  pior_etapa: "Liberação" | "Conferência" | "Armazenagem" | "Ocioso" | "—";
}

export async function fetchRecebimentoReport(filters: RecebimentoFilter): Promise<{ rows: RecebimentoRow[]; kpis: RecebimentoKpis }> {
  const sla = filters.sla_horas && filters.sla_horas > 0 ? filters.sla_horas : 24;

  const data = await fetchAllRpcRows(
    "rpc_relatorio_dock_to_stock",
    {
      p_tenant_id: filters.tenant_id,
      p_empresa_id: filters.empresa_id || null,
      p_armazem_id: filters.armazem_id || null,
      p_data_inicio: filters.data_inicio || null,
      p_data_fim: filters.data_fim || null,
      p_sla_horas: sla,
    },
  );
  if (data.length === 0) return { rows: [], kpis: emptyKpis() };

  let rows: RecebimentoRow[] = data.map((r: any) => ({
    id: r.movimento_entrada_id,
    numero_movimento: r.numero_movimento,
    status: r.status_movimento,
    documento: r.documento || "—",
    fornecedor: r.fornecedor || "—",
    parceiro_id: r.parceiro_id || null,
    armazem_id: null,
    total_volume: r.total_volume,
    t0_dock: r.t0_dock,
    t1_autorizado: r.t1_autorizado,
    t2_conf_inicio: r.t2_conf_inicio,
    t3_conf_fim: r.t3_conf_fim,
    t4_armz_inicio: r.t4_armz_inicio,
    t5_stock: r.t5_stock,
    tempo_total_min: r.tempo_total_min != null ? Number(r.tempo_total_min) : null,
    tempo_liberacao_min: r.tempo_liberacao_min != null ? Number(r.tempo_liberacao_min) : null,
    tempo_conferencia_min: r.tempo_conferencia_min != null ? Number(r.tempo_conferencia_min) : null,
    tempo_armazenagem_min: r.tempo_armazenagem_min != null ? Number(r.tempo_armazenagem_min) : null,
    tempo_ocioso_min: r.tempo_ocioso_min != null ? Number(r.tempo_ocioso_min) : null,
    status_sla: r.status_sla as StatusSla,
    sla_horas: Number(r.sla_horas),
    perc_sla: r.perc_sla != null ? Number(r.perc_sla) : null,
  }));

  if (filters.parceiro_id) rows = rows.filter((r) => r.parceiro_id === filters.parceiro_id);
  if (filters.status_sla) rows = rows.filter((r) => r.status_sla === filters.status_sla);
  if (filters.apenas_concluidos) rows = rows.filter((r) => r.status_sla !== "EM_ANDAMENTO");

  const slaRank: Record<StatusSla, number> = { FORA: 4, ALERTA: 3, DENTRO: 1, EM_ANDAMENTO: 2 };
  rows.sort((a, b) => {
    const s = slaRank[b.status_sla] - slaRank[a.status_sla];
    if (s !== 0) return s;
    return (b.tempo_total_min ?? 0) - (a.tempo_total_min ?? 0);
  });

  const concluidos = rows.filter((r) => r.status_sla !== "EM_ANDAMENTO");
  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v != null && !isNaN(v));
    return valid.length === 0 ? 0 : valid.reduce((a, b) => a + b, 0) / valid.length;
  };
  const m_total = avg(concluidos.map((r) => r.tempo_total_min));
  const m_lib = avg(concluidos.map((r) => r.tempo_liberacao_min));
  const m_conf = avg(concluidos.map((r) => r.tempo_conferencia_min));
  const m_armz = avg(concluidos.map((r) => r.tempo_armazenagem_min));
  const m_ocio = avg(concluidos.map((r) => r.tempo_ocioso_min));

  let pior: RecebimentoKpis["pior_etapa"] = "—";
  const etapas: [RecebimentoKpis["pior_etapa"], number][] = [
    ["Liberação", m_lib],
    ["Conferência", m_conf],
    ["Armazenagem", m_armz],
    ["Ocioso", m_ocio],
  ];
  const max = etapas.reduce((acc, e) => (e[1] > acc[1] ? e : acc), etapas[0]);
  if (max[1] > 0) pior = max[0];

  const kpis: RecebimentoKpis = {
    total_recebimentos: rows.length,
    concluidos: concluidos.length,
    em_andamento: rows.length - concluidos.length,
    dentro_sla: rows.filter((r) => r.status_sla === "DENTRO").length,
    fora_sla: rows.filter((r) => r.status_sla === "FORA").length,
    alerta_sla: rows.filter((r) => r.status_sla === "ALERTA").length,
    tempo_medio_total_min: m_total,
    tempo_medio_liberacao_min: m_lib,
    tempo_medio_conferencia_min: m_conf,
    tempo_medio_armazenagem_min: m_armz,
    tempo_medio_ocioso_min: m_ocio,
    pior_etapa: pior,
  };

  return { rows, kpis };
}

function emptyKpis(): RecebimentoKpis {
  return {
    total_recebimentos: 0,
    concluidos: 0,
    em_andamento: 0,
    dentro_sla: 0,
    fora_sla: 0,
    alerta_sla: 0,
    tempo_medio_total_min: 0,
    tempo_medio_liberacao_min: 0,
    tempo_medio_conferencia_min: 0,
    tempo_medio_armazenagem_min: 0,
    tempo_medio_ocioso_min: 0,
    pior_etapa: "—",
  };
}

export function formatDuration(min: number | null | undefined): string {
  if (min == null || isNaN(min)) return "—";
  if (min < 1) return "<1 min";
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min - h * 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
