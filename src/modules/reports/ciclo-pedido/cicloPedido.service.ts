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
  armazem_id: string | null;

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

const MIN = 60_000;

function diffMin(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (isNaN(da) || isNaN(db)) return null;
  const d = (db - da) / MIN;
  return d < 0 ? 0 : d;
}

function classifySla(perc: number | null, isConcluded: boolean): StatusSla {
  if (!isConcluded) return "EM_ANDAMENTO";
  if (perc == null) return "EM_ANDAMENTO";
  if (perc <= 80) return "DENTRO";
  if (perc <= 100) return "ALERTA";
  return "FORA";
}

export async function fetchCicloPedidoReport(
  filters: CicloPedidoFilter
): Promise<{ rows: CicloPedidoRow[]; kpis: CicloPedidoKpis }> {
  const sla = filters.sla_horas && filters.sla_horas > 0 ? filters.sla_horas : 24;
  const slaMin = sla * 60;

  // 1) Cabeçalho de movimento_saida
  let mq: any = (supabase as any)
    .from("movimento_saida")
    .select("id, numero_onda, status, prioridade, data_emissao, finalizado_em, armazem_id, empresa_id")
    .eq("tenant_id", filters.tenant_id)
    .order("data_emissao", { ascending: false })
    .limit(2000);
  if (filters.empresa_id) mq = mq.eq("empresa_id", filters.empresa_id);
  if (filters.armazem_id) mq = mq.eq("armazem_id", filters.armazem_id);
  if (filters.status_onda) mq = mq.eq("status", filters.status_onda);
  if (filters.prioridade) mq = mq.eq("prioridade", filters.prioridade);
  if (filters.data_inicio) mq = mq.gte("data_emissao", filters.data_inicio);
  if (filters.data_fim) mq = mq.lte("data_emissao", filters.data_fim);

  const { data: movs, error: errMov } = await mq;
  if (errMov) throw errMov;
  if (!movs || movs.length === 0) return { rows: [], kpis: emptyKpis() };

  const movIds: string[] = movs.map((m: any) => m.id);

  // 2) Documentos vinculados (pedidos + parceiros)
  const { data: movDocs } = await (supabase as any)
    .from("movimento_saida_documento")
    .select("movimento_saida_id, documento_saida_id")
    .in("movimento_saida_id", movIds);

  const docIds = Array.from(new Set((movDocs || []).map((d: any) => d.documento_saida_id)));
  const docMap = new Map<string, { numero_pedido: string; parceiro_id: string }>();
  if (docIds.length > 0) {
    const { data: docs } = await (supabase as any)
      .from("documento_saida")
      .select("id, numero_pedido, parceiro_id")
      .in("id", docIds);
    for (const d of docs || []) {
      docMap.set(d.id, { numero_pedido: String(d.numero_pedido ?? "—"), parceiro_id: d.parceiro_id });
    }
  }

  const movDocMap = new Map<string, { pedidos: Set<string>; parceiros: Set<string> }>();
  for (const md of movDocs || []) {
    const ref = movDocMap.get(md.movimento_saida_id) || {
      pedidos: new Set<string>(),
      parceiros: new Set<string>(),
    };
    const d = docMap.get(md.documento_saida_id);
    if (d) {
      ref.pedidos.add(d.numero_pedido);
      if (d.parceiro_id) ref.parceiros.add(d.parceiro_id);
    }
    movDocMap.set(md.movimento_saida_id, ref);
  }

  // 3) Lookup parceiro
  const allParceiroIds = Array.from(
    new Set(Array.from(movDocMap.values()).flatMap((v) => Array.from(v.parceiros)))
  );
  const parceiroMap = new Map<string, string>();
  if (allParceiroIds.length > 0) {
    const { data: parc } = await (supabase as any)
      .from("parceiro")
      .select("id, razaosocial")
      .in("id", allParceiroIds);
    for (const p of parc || []) parceiroMap.set(p.id, p.razaosocial);
  }

  // 4) Itens da onda → para chegar nas tarefas SEP / SEP-CONF
  const { data: itens } = await (supabase as any)
    .from("movimento_saida_item")
    .select("id, movimento_saida_id")
    .in("movimento_saida_id", movIds);

  const itemToMov = new Map<string, string>();
  for (const it of itens || []) itemToMov.set(it.id, it.movimento_saida_id);
  const itemIds = Array.from(itemToMov.keys());

  // 5) Tipos de tarefa SEP / SEP-CONF
  const { data: tiposTarefa } = await (supabase as any)
    .from("tipo_tarefa")
    .select("id, codigo")
    .in("codigo", ["SEP", "SEP-CONF"]);
  const tipoSepId = (tiposTarefa || []).find((t: any) => t.codigo === "SEP")?.id;
  const tipoConfId = (tiposTarefa || []).find((t: any) => t.codigo === "SEP-CONF")?.id;

  type Marcos = {
    sep_criado_min: number | null;
    sep_atrib_min: number | null;
    sep_conc_max: number | null;
    sep_total: number;
    sep_concluidas: number;

    conf_atrib_min: number | null;
    conf_conc_max: number | null;
    conf_total: number;
    conf_concluidas: number;
  };
  const marcos = new Map<string, Marcos>();
  const ensure = (movId: string): Marcos => {
    let m = marcos.get(movId);
    if (!m) {
      m = {
        sep_criado_min: null,
        sep_atrib_min: null,
        sep_conc_max: null,
        sep_total: 0,
        sep_concluidas: 0,
        conf_atrib_min: null,
        conf_conc_max: null,
        conf_total: 0,
        conf_concluidas: 0,
      };
      marcos.set(movId, m);
    }
    return m;
  };

  const tipoIds = [tipoSepId, tipoConfId].filter(Boolean);
  if (tipoIds.length > 0 && itemIds.length > 0) {
    const chunkSize = 800;
    const tarefas: any[] = [];
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      const slice = itemIds.slice(i, i + chunkSize);
      const { data } = await (supabase as any)
        .from("tarefa")
        .select("id, criado_em, status, tipo_tarefa_id, id_documento_origem")
        .in("tipo_tarefa_id", tipoIds)
        .eq("tipo_documento_origem", "MOVIMENTO_SAIDA_ITEM")
        .in("id_documento_origem", slice);
      if (data) tarefas.push(...data);
    }

    // Atribuição: MIN(atribuido_em) por tarefa
    const tarefaIds = tarefas.map((t: any) => t.id);
    const atribMap = new Map<string, number>();
    for (let i = 0; i < tarefaIds.length; i += chunkSize) {
      const slice = tarefaIds.slice(i, i + chunkSize);
      const { data } = await (supabase as any)
        .from("tarefa_atribuicao")
        .select("tarefa_id, atribuido_em")
        .in("tarefa_id", slice)
        .not("atribuido_em", "is", null);
      for (const a of data || []) {
        const ts = new Date(a.atribuido_em).getTime();
        const prev = atribMap.get(a.tarefa_id);
        if (prev == null || ts < prev) atribMap.set(a.tarefa_id, ts);
      }
    }

    // Execução concluída: MAX(concluido_em) por tarefa
    const execMap = new Map<string, number>();
    const execStatus = new Map<string, string>();
    for (let i = 0; i < tarefaIds.length; i += chunkSize) {
      const slice = tarefaIds.slice(i, i + chunkSize);
      const { data } = await (supabase as any)
        .from("tarefa_execucao")
        .select("tarefa_id, concluido_em, status")
        .in("tarefa_id", slice)
        .not("concluido_em", "is", null);
      for (const e of data || []) {
        const ts = new Date(e.concluido_em).getTime();
        const prev = execMap.get(e.tarefa_id);
        if (prev == null || ts > prev) {
          execMap.set(e.tarefa_id, ts);
          execStatus.set(e.tarefa_id, e.status);
        }
      }
    }

    for (const t of tarefas) {
      const movId = itemToMov.get(t.id_documento_origem);
      if (!movId) continue;
      const ref = ensure(movId);
      const isSep = t.tipo_tarefa_id === tipoSepId;
      const isConf = t.tipo_tarefa_id === tipoConfId;
      const tCriado = t.criado_em ? new Date(t.criado_em).getTime() : null;
      const tAtrib = atribMap.get(t.id) ?? null;
      const tConc = execMap.get(t.id) ?? null;
      const concluida = tConc != null && execStatus.get(t.id) === "CONCLUIDA";

      if (isSep) {
        ref.sep_total += 1;
        if (concluida) ref.sep_concluidas += 1;
        if (tCriado != null)
          ref.sep_criado_min = ref.sep_criado_min == null ? tCriado : Math.min(ref.sep_criado_min, tCriado);
        if (tAtrib != null)
          ref.sep_atrib_min = ref.sep_atrib_min == null ? tAtrib : Math.min(ref.sep_atrib_min, tAtrib);
        if (tConc != null)
          ref.sep_conc_max = ref.sep_conc_max == null ? tConc : Math.max(ref.sep_conc_max, tConc);
      } else if (isConf) {
        ref.conf_total += 1;
        if (concluida) ref.conf_concluidas += 1;
        if (tAtrib != null)
          ref.conf_atrib_min = ref.conf_atrib_min == null ? tAtrib : Math.min(ref.conf_atrib_min, tAtrib);
        if (tConc != null)
          ref.conf_conc_max = ref.conf_conc_max == null ? tConc : Math.max(ref.conf_conc_max, tConc);
      }
    }
  }

  // 6) Montar linhas
  const rows: CicloPedidoRow[] = [];
  for (const m of movs) {
    const docInfo = movDocMap.get(m.id);
    const pedidos = docInfo ? Array.from(docInfo.pedidos) : [];
    const parceirosIds = docInfo ? Array.from(docInfo.parceiros) : [];
    if (filters.parceiro_id && !parceirosIds.includes(filters.parceiro_id)) continue;

    const cliente =
      parceirosIds.length === 0
        ? "—"
        : parceirosIds.length === 1
        ? parceiroMap.get(parceirosIds[0]) || "—"
        : `${parceiroMap.get(parceirosIds[0]) || "—"} +${parceirosIds.length - 1}`;

    const mk = marcos.get(m.id);
    const t0 = m.data_emissao as string | null;
    const t1 = mk?.sep_criado_min ? new Date(mk.sep_criado_min).toISOString() : null;
    const t2 = mk?.sep_atrib_min ? new Date(mk.sep_atrib_min).toISOString() : null;
    const t3 = mk?.sep_conc_max ? new Date(mk.sep_conc_max).toISOString() : null;
    const t4i = mk?.conf_atrib_min ? new Date(mk.conf_atrib_min).toISOString() : null;
    const t4f = mk?.conf_conc_max ? new Date(mk.conf_conc_max).toISOString() : null;

    let t5: string | null = m.status === "CONCLUIDA" && m.finalizado_em ? m.finalizado_em : null;
    if (!t5 && m.status === "CONCLUIDA") {
      // fallback: maior conclusão de qualquer etapa
      const candidates = [mk?.conf_conc_max, mk?.sep_conc_max].filter(Boolean) as number[];
      if (candidates.length > 0) t5 = new Date(Math.max(...candidates)).toISOString();
    }
    const isConcluded = m.status === "CONCLUIDA" && !!t5;

    const tempo_total_min = diffMin(t0, t5);
    const tempo_fila_min = diffMin(t0, t2);
    const tempo_picking_min = diffMin(t2, t3);
    const tempo_conferencia_min = diffMin(t4i, t4f);
    const tempo_pos_conf_min = diffMin(t4f, t5);
    // Ocioso = (T2-T1) + (T4i-T3) + (T5-T4f)  (apenas valores não-negativos)
    const oc1 = diffMin(t1, t2);
    const oc2 = diffMin(t3, t4i);
    const oc3 = diffMin(t4f, t5);
    const ocSum = (oc1 ?? 0) + (oc2 ?? 0) + (oc3 ?? 0);
    const tempo_ocioso_min = ocSum > 0 ? ocSum : null;

    // Pior etapa
    let pior: PiorEtapa = "—";
    const etapas: [PiorEtapa, number | null][] = [
      ["Fila", tempo_fila_min],
      ["Picking", tempo_picking_min],
      ["Conferência", tempo_conferencia_min],
      ["Pós-Conferência", tempo_pos_conf_min],
    ];
    let maxV = 0;
    for (const [n, v] of etapas) {
      if (v != null && v > maxV) {
        maxV = v;
        pior = n;
      }
    }

    const perc_sla = tempo_total_min != null ? (tempo_total_min / slaMin) * 100 : null;
    const status_sla = classifySla(perc_sla, isConcluded);

    rows.push({
      id: m.id,
      numero_onda: m.numero_onda,
      status: m.status,
      prioridade: m.prioridade,
      pedidos: pedidos.length > 0 ? pedidos.join(", ") : "—",
      cliente,
      parceiro_id: parceirosIds[0] || null,
      armazem_id: m.armazem_id,
      t0_criacao: t0,
      t1_liberado: t1,
      t2_inicio_sep: t2,
      t3_fim_sep: t3,
      t4_inicio_conf: t4i,
      t4_fim_conf: t4f,
      t5_expedicao: t5,
      tempo_total_min,
      tempo_fila_min,
      tempo_picking_min,
      tempo_conferencia_min,
      tempo_pos_conf_min,
      tempo_ocioso_min,
      pior_etapa: pior,
      status_sla,
      sla_horas: sla,
      perc_sla,
    });
  }

  // 7) Filtros pós
  let filtered = rows;
  if (filters.status_sla) filtered = filtered.filter((r) => r.status_sla === filters.status_sla);
  if (filters.apenas_concluidos) filtered = filtered.filter((r) => r.status_sla !== "EM_ANDAMENTO");

  // Ordenação default: piores SLA primeiro
  const slaRank: Record<StatusSla, number> = { FORA: 4, ALERTA: 3, EM_ANDAMENTO: 2, DENTRO: 1 };
  filtered.sort((a, b) => {
    const s = slaRank[b.status_sla] - slaRank[a.status_sla];
    if (s !== 0) return s;
    return (b.tempo_total_min ?? 0) - (a.tempo_total_min ?? 0);
  });

  // 8) KPIs
  const concluidas = filtered.filter((r) => r.status_sla !== "EM_ANDAMENTO");
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
    total_ondas: filtered.length,
    concluidas: concluidas.length,
    em_andamento: filtered.length - concluidas.length,
    dentro_sla: filtered.filter((r) => r.status_sla === "DENTRO").length,
    alerta_sla: filtered.filter((r) => r.status_sla === "ALERTA").length,
    fora_sla: filtered.filter((r) => r.status_sla === "FORA").length,
    tempo_medio_total_min: m_total,
    tempo_medio_fila_min: m_fila,
    tempo_medio_picking_min: m_pick,
    tempo_medio_conferencia_min: m_conf,
    tempo_medio_pos_conf_min: m_pos,
    tempo_medio_ocioso_min: m_ocio,
    pior_etapa,
  };

  return { rows: filtered, kpis };
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
