import { supabase } from "@/integrations/supabase/client";

export type StatusSla = "DENTRO" | "ALERTA" | "FORA" | "EM_ANDAMENTO";
export type PiorEtapa = "Fila" | "Picking" | "Conferência" | "Pós-Conferência" | "—";

export interface CicloPedidoFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
  parceiro_id?: string;
  status_onda?: string;
  prioridade?: string;
  data_inicio?: string;
  data_fim?: string;
  status_sla?: StatusSla;
  apenas_concluidos?: boolean;
  sla_horas?: number;
}

export interface CicloPedidoRow {
  id: string;
  numero_onda: number | null;
  status: string | null;
  prioridade: string | null;
  pedidos: string;
  cliente: string;
  parceiro_id: string | null;
  box_id: string | null;

  t0_criacao: string | null;
  t1_liberado: string | null;
  t2_inicio_sep: string | null;
  t3_fim_sep: string | null;
  t4_inicio_conf: string | null;
  t4_fim_conf: string | null;
  t5_expedicao: string | null;

  tempo_total_min: number | null;
  tempo_fila_min: number | null;
  tempo_picking_min: number | null;
  tempo_conferencia_min: number | null;
  tempo_pos_conf_min: number | null;
  tempo_ocioso_min: number | null;

  pior_etapa: PiorEtapa;
  status_sla: StatusSla;
  sla_horas: number;
  perc_sla: number | null;
}

export interface CicloPedidoKpis {
  total_ondas: number;
  concluidas: number;
  em_andamento: number;
  dentro_sla: number;
  alerta_sla: number;
  fora_sla: number;
  tempo_medio_total_min: number;
  tempo_medio_fila_min: number;
  tempo_medio_picking_min: number;
  tempo_medio_conferencia_min: number;
  tempo_medio_pos_conf_min: number;
  tempo_medio_ocioso_min: number;
  pior_etapa: PiorEtapa;
}

export async function fetchCicloPedidoReport(
  filters: CicloPedidoFilter
): Promise<{ rows: CicloPedidoRow[]; kpis: CicloPedidoKpis }> {
  const sla = filters.sla_horas && filters.sla_horas > 0 ? filters.sla_horas : 24;

  const { data, error } = await (supabase as any).rpc("rpc_relatorio_ciclo_pedido", {
    p_tenant_id: filters.tenant_id,
    p_empresa_id: filters.empresa_id || null,
    p_armazem_id: filters.armazem_id || null,
    p_data_inicio: filters.data_inicio || null,
    p_data_fim: filters.data_fim || null,
    p_status_onda: filters.status_onda || null,
    p_prioridade: filters.prioridade || null,
    p_sla_horas: sla,
  });
  if (error) throw error;
  if (!data || data.length === 0) return { rows: [], kpis: emptyKpis() };

  let rows: CicloPedidoRow[] = (data as any[]).map((r) => {
    const tempo_total = r.tempo_total_min != null ? Number(r.tempo_total_min) : null;
    const tempo_fila = r.tempo_fila_min != null ? Number(r.tempo_fila_min) : null;
    const tempo_picking = r.tempo_picking_min != null ? Number(r.tempo_picking_min) : null;
    const tempo_conf = r.tempo_conferencia_min != null ? Number(r.tempo_conferencia_min) : null;
    const tempo_pos = r.tempo_pos_conf_min != null ? Number(r.tempo_pos_conf_min) : null;
    const tempo_ocioso = r.tempo_ocioso_min != null ? Number(r.tempo_ocioso_min) : null;

    let pior: PiorEtapa = "—";
    let maxV = 0;
    const etapas: [PiorEtapa, number | null][] = [
      ["Fila", tempo_fila],
      ["Picking", tempo_picking],
      ["Conferência", tempo_conf],
      ["Pós-Conferência", tempo_pos],
    ];
    for (const [n, v] of etapas) {
      if (v != null && v > maxV) {
        maxV = v;
        pior = n;
      }
    }

    return {
      id: r.movimento_saida_id,
      numero_onda: r.numero_onda,
      status: r.status_onda,
      prioridade: r.prioridade,
      pedidos: r.pedidos || "—",
      cliente: r.cliente || "—",
      parceiro_id: r.parceiro_id || null,
      box_id: r.box_id || null,
      t0_criacao: r.t0_criacao,
      t1_liberado: r.t1_liberado,
      t2_inicio_sep: r.t2_inicio_sep,
      t3_fim_sep: r.t3_fim_sep,
      t4_inicio_conf: r.t4_inicio_conf,
      t4_fim_conf: r.t4_fim_conf,
      t5_expedicao: r.t5_expedicao,
      tempo_total_min: tempo_total,
      tempo_fila_min: tempo_fila,
      tempo_picking_min: tempo_picking,
      tempo_conferencia_min: tempo_conf,
      tempo_pos_conf_min: tempo_pos,
      tempo_ocioso_min: tempo_ocioso,
      pior_etapa: pior,
      status_sla: r.status_sla as StatusSla,
      sla_horas: Number(r.sla_horas),
      perc_sla: r.perc_sla != null ? Number(r.perc_sla) : null,
    };
  });

  if (filters.parceiro_id) rows = rows.filter((r) => r.parceiro_id === filters.parceiro_id);
  if (filters.status_sla) rows = rows.filter((r) => r.status_sla === filters.status_sla);
  if (filters.apenas_concluidos) rows = rows.filter((r) => r.status_sla !== "EM_ANDAMENTO");

  const slaRank: Record<StatusSla, number> = { FORA: 4, ALERTA: 3, EM_ANDAMENTO: 2, DENTRO: 1 };
  rows.sort((a, b) => {
    const s = slaRank[b.status_sla] - slaRank[a.status_sla];
    if (s !== 0) return s;
    return (b.tempo_total_min ?? 0) - (a.tempo_total_min ?? 0);
  });

  const concluidas = rows.filter((r) => r.status_sla !== "EM_ANDAMENTO");
  const avg = (arr: (number | null)[]) => {
    const valid = arr.filter((v): v is number => v != null && !isNaN(v));
    return valid.length === 0 ? 0 : valid.reduce((a, b) => a + b, 0) / valid.length;
  };
  const m_total = avg(concluidas.map((r) => r.tempo_total_min));
  const m_fila = avg(concluidas.map((r) => r.tempo_fila_min));
  const m_pick = avg(concluidas.map((r) => r.tempo_picking_min));
  const m_conf = avg(concluidas.map((r) => r.tempo_conferencia_min));
  const m_pos = avg(concluidas.map((r) => r.tempo_pos_conf_min));
  const m_ocio = avg(concluidas.map((r) => r.tempo_ocioso_min));

  const etapasAvg: [PiorEtapa, number][] = [
    ["Fila", m_fila],
    ["Picking", m_pick],
    ["Conferência", m_conf],
    ["Pós-Conferência", m_pos],
  ];
  const piorAgg = etapasAvg.reduce((acc, e) => (e[1] > acc[1] ? e : acc), etapasAvg[0]);
  const pior_etapa: PiorEtapa = piorAgg[1] > 0 ? piorAgg[0] : "—";

  const kpis: CicloPedidoKpis = {
    total_ondas: rows.length,
    concluidas: concluidas.length,
    em_andamento: rows.length - concluidas.length,
    dentro_sla: rows.filter((r) => r.status_sla === "DENTRO").length,
    alerta_sla: rows.filter((r) => r.status_sla === "ALERTA").length,
    fora_sla: rows.filter((r) => r.status_sla === "FORA").length,
    tempo_medio_total_min: m_total,
    tempo_medio_fila_min: m_fila,
    tempo_medio_picking_min: m_pick,
    tempo_medio_conferencia_min: m_conf,
    tempo_medio_pos_conf_min: m_pos,
    tempo_medio_ocioso_min: m_ocio,
    pior_etapa,
  };

  return { rows, kpis };
}

function emptyKpis(): CicloPedidoKpis {
  return {
    total_ondas: 0,
    concluidas: 0,
    em_andamento: 0,
    dentro_sla: 0,
    alerta_sla: 0,
    fora_sla: 0,
    tempo_medio_total_min: 0,
    tempo_medio_fila_min: 0,
    tempo_medio_picking_min: 0,
    tempo_medio_conferencia_min: 0,
    tempo_medio_pos_conf_min: 0,
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
