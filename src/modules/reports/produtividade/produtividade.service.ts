import { supabase } from "@/integrations/supabase/client";

export interface ProdutividadeFilters {
  armazemId?: string;
  dataInicio: string;
  dataFim: string;
  turnoId?: string;
  tipoOperacao?: string;
  habilidade?: string;
}

export interface TimelineEntry {
  execucao_id: string;
  tarefa_id: string;
  tipo_tarefa_codigo: string;
  tipo_tarefa_descricao: string;
  status: string;
  atribuido_em: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  quantidade_executada: number;
  quantidade_cortada: number;
  quantidade_requerida: number;
  duracao_segundos: number | null;
  espera_segundos: number | null;
  tempo_estimado_segundos: number | null;
}

export interface OperadorResumo {
  usuario_id: string;
  usuario_nome: string;
  habilidade: string | null;
  tipo_operacao: string | null;
  turno_descricao: string | null;
  turno_inicio: string | null;
  turno_fim: string | null;
  tarefas_concluidas: number;
  tempo_produtivo_segundos: number;
  quantidade_total: number;
  produtividade_hora: number;
  taxa_ocupacao: number;
}

export interface ProdutividadePorTipo {
  tipo_tarefa_codigo: string;
  tipo_tarefa_descricao: string;
  tarefas_concluidas: number;
  tempo_medio_segundos: number;
  tempo_total_segundos: number;
  quantidade_total: number;
  tempo_estimado_segundos: number | null;
}

export async function fetchProdutividadeGeral(filters: ProdutividadeFilters) {
  const query = (supabase as any)
    .from("vw_lms_timeline_operador")
    .select("*")
    .gte("concluido_em", filters.dataInicio)
    .lte("concluido_em", filters.dataFim + "T23:59:59");

  if (filters.armazemId) query.eq("armazem_id", filters.armazemId);
  if (filters.turnoId) query.eq("turno_id", filters.turnoId);
  if (filters.tipoOperacao) query.eq("tipo_operacao", filters.tipoOperacao);
  if (filters.habilidade) query.eq("habilidade", filters.habilidade);

  const { data, error } = await query.eq("status", "CONCLUIDA").order("concluido_em", { ascending: true });
  if (error) throw error;

  return processarDados(data || []);
}

export async function fetchTimelineOperador(
  usuarioId: string,
  dataInicio: string,
  dataFim: string
): Promise<TimelineEntry[]> {
  const { data, error } = await (supabase as any)
    .from("vw_lms_timeline_operador")
    .select("*")
    .eq("usuario_id", usuarioId)
    .gte("concluido_em", dataInicio)
    .lte("concluido_em", dataFim + "T23:59:59")
    .order("concluido_em", { ascending: true });

  if (error) throw error;

  return (data || []).map((d: any) => ({
    execucao_id: d.execucao_id,
    tarefa_id: d.tarefa_id,
    tipo_tarefa_codigo: d.tipo_tarefa_codigo,
    tipo_tarefa_descricao: d.tipo_tarefa_descricao,
    status: d.status,
    atribuido_em: d.atribuido_em,
    iniciado_em: d.iniciado_em,
    concluido_em: d.concluido_em,
    quantidade_executada: Number(d.quantidade_executada || 0),
    quantidade_cortada: Number(d.quantidade_cortada || 0),
    quantidade_requerida: Number(d.quantidade_requerida || 0),
    duracao_segundos: d.duracao_segundos ? Number(d.duracao_segundos) : null,
    espera_segundos: d.espera_segundos ? Number(d.espera_segundos) : null,
    tempo_estimado_segundos: d.tempo_estimado_segundos ? Number(d.tempo_estimado_segundos) : null,
  }));
}

function processarDados(rows: any[]) {
  // Group by operator
  const porOperador = new Map<string, any[]>();
  for (const row of rows) {
    const uid = row.usuario_id;
    if (!porOperador.has(uid)) porOperador.set(uid, []);
    porOperador.get(uid)!.push(row);
  }

  const operadores: OperadorResumo[] = [];
  const porTipoMap = new Map<string, { codigo: string; desc: string; count: number; tempoTotal: number; qtdTotal: number; estimado: number | null }>();

  for (const [uid, execucoes] of porOperador) {
    const first = execucoes[0];
    let tempoProdutivo = 0;
    let qtdTotal = 0;

    for (const ex of execucoes) {
      const dur = Number(ex.duracao_segundos || 0);
      tempoProdutivo += dur;
      qtdTotal += Number(ex.quantidade_executada || 0);

      // Aggregate by tipo_tarefa
      const key = ex.tipo_tarefa_codigo;
      if (!porTipoMap.has(key)) {
        porTipoMap.set(key, {
          codigo: ex.tipo_tarefa_codigo,
          desc: ex.tipo_tarefa_descricao,
          count: 0,
          tempoTotal: 0,
          qtdTotal: 0,
          estimado: ex.tempo_estimado_segundos ? Number(ex.tempo_estimado_segundos) : null,
        });
      }
      const t = porTipoMap.get(key)!;
      t.count++;
      t.tempoTotal += dur;
      t.qtdTotal += Number(ex.quantidade_executada || 0);
    }

    const horasProdutivas = tempoProdutivo / 3600;
    // Estimate shift duration: 8h if no turno info
    const turnoInicio = first.turno_inicio;
    const turnoFim = first.turno_fim;
    let tempoJornada = 8 * 3600;
    if (turnoInicio && turnoFim) {
      const [hi, mi] = turnoInicio.split(":").map(Number);
      const [hf, mf] = turnoFim.split(":").map(Number);
      let diff = (hf * 60 + mf) - (hi * 60 + mi);
      if (diff <= 0) diff += 24 * 60;
      tempoJornada = diff * 60;
    }

    operadores.push({
      usuario_id: uid,
      usuario_nome: first.usuario_nome,
      habilidade: first.habilidade,
      tipo_operacao: first.tipo_operacao,
      turno_descricao: first.turno_descricao,
      turno_inicio: first.turno_inicio,
      turno_fim: first.turno_fim,
      tarefas_concluidas: execucoes.length,
      tempo_produtivo_segundos: tempoProdutivo,
      quantidade_total: qtdTotal,
      produtividade_hora: horasProdutivas > 0 ? Math.round(qtdTotal / horasProdutivas) : 0,
      taxa_ocupacao: tempoJornada > 0 ? Math.round((tempoProdutivo / tempoJornada) * 100) : 0,
    });
  }

  // Sort by produtividade descending
  operadores.sort((a, b) => b.produtividade_hora - a.produtividade_hora);

  const porTipo: ProdutividadePorTipo[] = Array.from(porTipoMap.values()).map((t) => ({
    tipo_tarefa_codigo: t.codigo,
    tipo_tarefa_descricao: t.desc,
    tarefas_concluidas: t.count,
    tempo_medio_segundos: t.count > 0 ? Math.round(t.tempoTotal / t.count) : 0,
    tempo_total_segundos: t.tempoTotal,
    quantidade_total: t.qtdTotal,
    tempo_estimado_segundos: t.estimado,
  }));

  // KPIs
  const totalOperadores = operadores.length;
  const totalTarefas = rows.length;
  const tempoProdutivoTotal = operadores.reduce((s, o) => s + o.tempo_produtivo_segundos, 0);
  const qtdTotalGeral = operadores.reduce((s, o) => s + o.quantidade_total, 0);
  const taxaMediaOcupacao = totalOperadores > 0
    ? Math.round(operadores.reduce((s, o) => s + o.taxa_ocupacao, 0) / totalOperadores)
    : 0;
  const produtividadeMedia = totalOperadores > 0
    ? Math.round(operadores.reduce((s, o) => s + o.produtividade_hora, 0) / totalOperadores)
    : 0;

  return {
    kpis: {
      totalOperadores,
      totalTarefas,
      tempoProdutivoTotal,
      qtdTotalGeral,
      taxaMediaOcupacao,
      produtividadeMedia,
    },
    operadores,
    porTipo,
  };
}

// Helpers
export function formatSegundos(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export function getCorOcupacao(pct: number): string {
  if (pct >= 85) return "hsl(142, 71%, 45%)";
  if (pct >= 50) return "hsl(45, 93%, 47%)";
  return "hsl(0, 84%, 60%)";
}
