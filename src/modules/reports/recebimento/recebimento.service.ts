import { supabase } from "@/integrations/supabase/client";

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
  documento: string;          // NF(s) — concatenadas
  fornecedor: string;         // razaosocial parceiro
  parceiro_id: string | null;
  armazem_id: string | null;
  total_volume: number | null;

  t0_dock: string | null;            // created_at
  t1_autorizado: string | null;      // autorizado_em (date)
  t2_conf_inicio: string | null;     // conferencia_iniciada_em
  t3_conf_fim: string | null;        // conferencia_finalizada_em
  t4_armz_inicio: string | null;     // primeiro tarefa.criado_em (ENTR-ARMZ)
  t5_stock: string | null;           // último tarefa_execucao.concluido_em (ENTR-ARMZ)

  tempo_total_min: number | null;        // T5 - T0
  tempo_liberacao_min: number | null;    // T1 - T0
  tempo_conferencia_min: number | null;  // T3 - T2
  tempo_armazenagem_min: number | null;  // T5 - T4
  tempo_ocioso_min: number | null;       // (T2-T1) + (T4-T3)

  status_sla: StatusSla;
  sla_horas: number;
  perc_sla: number | null;               // tempo_total / SLA  (%)
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

export async function fetchRecebimentoReport(filters: RecebimentoFilter): Promise<{ rows: RecebimentoRow[]; kpis: RecebimentoKpis }> {
  const sla = filters.sla_horas && filters.sla_horas > 0 ? filters.sla_horas : 24;
  const slaMin = sla * 60;

  // 1) Cabeçalho de movimento_entrada (com filtros)
  let mq: any = (supabase as any)
    .from("movimento_entrada")
    .select("id, numero_movimento, status, created_at, autorizado_em, conferencia_iniciada_em, conferencia_finalizada_em, finalizado_em, total_volume, armazem_id, empresa_id")
    .eq("tenant_id", filters.tenant_id)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (filters.empresa_id) mq = mq.eq("empresa_id", filters.empresa_id);
  if (filters.armazem_id) mq = mq.eq("armazem_id", filters.armazem_id);
  if (filters.data_inicio) mq = mq.gte("created_at", filters.data_inicio);
  if (filters.data_fim) mq = mq.lte("created_at", filters.data_fim);

  const { data: movs, error: errMov } = await mq;
  if (errMov) throw errMov;
  if (!movs || movs.length === 0) return { rows: [], kpis: emptyKpis() };

  const movIds: string[] = movs.map((m: any) => m.id);

  // 2) Documentos vinculados → para listar NFs e parceiro
  const { data: movDocs } = await (supabase as any)
    .from("movimento_entrada_documento")
    .select("movimento_entrada_id, documento_entrada_id")
    .in("movimento_entrada_id", movIds);

  const docIds = Array.from(new Set((movDocs || []).map((d: any) => d.documento_entrada_id)));
  const docMap = new Map<string, { numero_nota: string; parceiro_id: string }>();
  if (docIds.length > 0) {
    const { data: docs } = await (supabase as any)
      .from("documento_entrada")
      .select("id, numero_nota, parceiro_id")
      .in("id", docIds);
    for (const d of (docs || [])) docMap.set(d.id, { numero_nota: d.numero_nota, parceiro_id: d.parceiro_id });
  }

  // map mov → [{nota, parceiro_id}]
  const movDocMap = new Map<string, { notas: Set<string>; parceiros: Set<string> }>();
  for (const md of (movDocs || [])) {
    const ref = movDocMap.get(md.movimento_entrada_id) || { notas: new Set<string>(), parceiros: new Set<string>() };
    const d = docMap.get(md.documento_entrada_id);
    if (d) {
      ref.notas.add(d.numero_nota);
      if (d.parceiro_id) ref.parceiros.add(d.parceiro_id);
    }
    movDocMap.set(md.movimento_entrada_id, ref);
  }

  // 3) Lookup parceiro
  const allParceiroIds = Array.from(new Set(
    Array.from(movDocMap.values()).flatMap((v) => Array.from(v.parceiros))
  ));
  const parceiroMap = new Map<string, string>();
  if (allParceiroIds.length > 0) {
    const { data: parc } = await (supabase as any)
      .from("parceiro").select("id, razaosocial").in("id", allParceiroIds);
    for (const p of (parc || [])) parceiroMap.set(p.id, p.razaosocial);
  }

  // 4) Itens dos movimentos para chegar nas tarefas ENTR-ARMZ
  const { data: itens } = await (supabase as any)
    .from("movimento_entrada_item")
    .select("id, movimento_entrada_id")
    .in("movimento_entrada_id", movIds);

  const itemToMov = new Map<string, string>();
  for (const it of (itens || [])) itemToMov.set(it.id, it.movimento_entrada_id);
  const itemIds = Array.from(itemToMov.keys());

  // 5) Tarefas ENTR-ARMZ vinculadas a esses itens
  // tipo_tarefa_id de ENTR-ARMZ
  const { data: tipoArmz } = await (supabase as any)
    .from("tipo_tarefa").select("id").eq("codigo", "ENTR-ARMZ").maybeSingle();
  const tipoArmzId = tipoArmz?.id;

  // mov → marcos de armazenagem
  const armzMap = new Map<string, { criadoMin: number | null; concluidoMax: number | null; tarefas: number; concluidas: number }>();

  if (tipoArmzId && itemIds.length > 0) {
    // Buscar em chunks (limite IN ~1000)
    const chunkSize = 800;
    const tarefas: any[] = [];
    for (let i = 0; i < itemIds.length; i += chunkSize) {
      const slice = itemIds.slice(i, i + chunkSize);
      const { data } = await (supabase as any)
        .from("tarefa")
        .select("id, criado_em, status, id_documento_origem")
        .eq("tipo_tarefa_id", tipoArmzId)
        .eq("tipo_documento_origem", "MOVIMENTO_ENTRADA_ITEM")
        .in("id_documento_origem", slice);
      if (data) tarefas.push(...data);
    }

    // Tarefa execucoes
    const tarefaIds = tarefas.map((t: any) => t.id);
    const execMap = new Map<string, string | null>(); // tarefa_id → último concluido_em (string)
    for (let i = 0; i < tarefaIds.length; i += chunkSize) {
      const slice = tarefaIds.slice(i, i + chunkSize);
      const { data } = await (supabase as any)
        .from("tarefa_execucao")
        .select("tarefa_id, concluido_em, status")
        .in("tarefa_id", slice)
        .not("concluido_em", "is", null);
      for (const e of (data || [])) {
        const prev = execMap.get(e.tarefa_id);
        if (!prev || new Date(e.concluido_em).getTime() > new Date(prev).getTime()) {
          execMap.set(e.tarefa_id, e.concluido_em);
        }
      }
    }

    for (const t of tarefas) {
      const movId = itemToMov.get(t.id_documento_origem);
      if (!movId) continue;
      const ref = armzMap.get(movId) || { criadoMin: null, concluidoMax: null, tarefas: 0, concluidas: 0 };
      ref.tarefas += 1;

      const tCriado = t.criado_em ? new Date(t.criado_em).getTime() : null;
      if (tCriado != null) {
        ref.criadoMin = ref.criadoMin == null ? tCriado : Math.min(ref.criadoMin, tCriado);
      }

      const execConc = execMap.get(t.id);
      if (execConc) {
        ref.concluidas += 1;
        const tConc = new Date(execConc).getTime();
        ref.concluidoMax = ref.concluidoMax == null ? tConc : Math.max(ref.concluidoMax, tConc);
      }

      armzMap.set(movId, ref);
    }
  }

  // 6) Filtro por parceiro (client-side: usa primeiro parceiro do movimento)
  const rows: RecebimentoRow[] = [];
  for (const m of movs) {
    const docInfo = movDocMap.get(m.id);
    const notas = docInfo ? Array.from(docInfo.notas) : [];
    const parceirosIds = docInfo ? Array.from(docInfo.parceiros) : [];
    const fornecedor = parceirosIds.length > 0
      ? parceirosIds.map((pid) => parceiroMap.get(pid) || "—").join(" / ")
      : "—";

    if (filters.parceiro_id && !parceirosIds.includes(filters.parceiro_id)) continue;

    const armz = armzMap.get(m.id);
    const t0 = m.created_at as string | null;
    const t1 = m.autorizado_em as string | null;
    const t2 = m.conferencia_iniciada_em as string | null;
    const t3 = m.conferencia_finalizada_em as string | null;
    const t4 = armz?.criadoMin ? new Date(armz.criadoMin).toISOString() : null;
    // T5: prioriza ultima execução de armazenagem; se status do mov = ARMAZENADO mas sem execução, usa finalizado_em
    let t5: string | null = armz?.concluidoMax ? new Date(armz.concluidoMax).toISOString() : null;
    if (!t5 && m.status === "ARMAZENADO" && m.finalizado_em) t5 = m.finalizado_em;

    const isConcluded = !!t5 && (armz ? armz.tarefas > 0 && armz.concluidas === armz.tarefas : m.status === "ARMAZENADO");

    const tempo_total_min = diffMin(t0, t5);
    const tempo_liberacao_min = diffMin(t0, t1);
    const tempo_conferencia_min = diffMin(t2, t3);
    const tempo_armazenagem_min = diffMin(t4, t5);
    const ociosoConfArmz = diffMin(t3, t4);
    const ociosoLibConf = diffMin(t1, t2);
    const tempo_ocioso_min =
      (ociosoLibConf ?? 0) + (ociosoConfArmz ?? 0) || null;

    const perc_sla = tempo_total_min != null ? (tempo_total_min / slaMin) * 100 : null;
    const status_sla = classifySla(perc_sla, isConcluded);

    rows.push({
      id: m.id,
      numero_movimento: m.numero_movimento,
      status: m.status,
      documento: notas.length > 0 ? notas.join(", ") : "—",
      fornecedor,
      parceiro_id: parceirosIds[0] || null,
      armazem_id: m.armazem_id,
      total_volume: m.total_volume,
      t0_dock: t0,
      t1_autorizado: t1,
      t2_conf_inicio: t2,
      t3_conf_fim: t3,
      t4_armz_inicio: t4,
      t5_stock: t5,
      tempo_total_min,
      tempo_liberacao_min,
      tempo_conferencia_min,
      tempo_armazenagem_min,
      tempo_ocioso_min,
      status_sla,
      sla_horas: sla,
      perc_sla,
    });
  }

  // 7) Filtros pós
  let filtered = rows;
  if (filters.status_sla) filtered = filtered.filter((r) => r.status_sla === filters.status_sla);
  if (filters.apenas_concluidos) filtered = filtered.filter((r) => r.status_sla !== "EM_ANDAMENTO");

  // Ordenação default: piores SLA primeiro, depois mais recentes
  const slaRank: Record<StatusSla, number> = { FORA: 4, ALERTA: 3, DENTRO: 1, EM_ANDAMENTO: 2 };
  filtered.sort((a, b) => {
    const s = slaRank[b.status_sla] - slaRank[a.status_sla];
    if (s !== 0) return s;
    return (b.tempo_total_min ?? 0) - (a.tempo_total_min ?? 0);
  });

  // 8) KPIs
  const concluidos = filtered.filter((r) => r.status_sla !== "EM_ANDAMENTO");
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
    total_recebimentos: filtered.length,
    concluidos: concluidos.length,
    em_andamento: filtered.length - concluidos.length,
    dentro_sla: filtered.filter((r) => r.status_sla === "DENTRO").length,
    fora_sla: filtered.filter((r) => r.status_sla === "FORA").length,
    alerta_sla: filtered.filter((r) => r.status_sla === "ALERTA").length,
    tempo_medio_total_min: m_total,
    tempo_medio_liberacao_min: m_lib,
    tempo_medio_conferencia_min: m_conf,
    tempo_medio_armazenagem_min: m_armz,
    tempo_medio_ocioso_min: m_ocio,
    pior_etapa: pior,
  };

  return { rows: filtered, kpis };
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
