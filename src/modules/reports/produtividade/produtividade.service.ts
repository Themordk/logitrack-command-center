import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

export interface ProdutividadeFilters {
  tenantId: string;
  empresaId: string | null;
  armazemId: string | null;
  dataInicio: string; // ISO date
  dataFim: string;    // ISO date
  usuarioId: string | null;
  turnoId: string | null;
}

export interface MetricaDiariaRow {
  id: string;
  tenant_id: string;
  empresa_id: string | null;
  armazem_id: string | null;
  usuario_id: string;
  data_referencia: string;
  turno_id: string | null;
  tempo_produtivo: number;
  tempo_ocioso: number;
  tempo_auxiliar: number;
  tempo_jornada: number;
  tarefas_concluidas: number;
  tarefas_canceladas: number;
  quantidade_total: number;
  peso_total: number;
  documentos_processados: number;
  skus_distintos: number;
  taxa_ocupacao: number;
  produtividade_hora: number;
  usuario?: { id: string; nome: string } | null;
  turno?: { descricao: string } | null;
}

export interface DetalheTipoTarefaRow {
  id: string;
  usuario_id: string;
  data_referencia: string;
  tipo_tarefa_id: string;
  tempo_medio_segundos: number;
  tempo_total_segundos: number;
  tarefas_concluidas: number;
  quantidade_total: number;
  usuario?: { id: string; nome: string } | null;
  tipo_tarefa?: { codigo: string; descricao: string; tempo_estimado_segundos: number | null } | null;
}

export async function fetchProdutividadeDiaria(
  filters: ProdutividadeFilters,
): Promise<MetricaDiariaRow[]> {
  let q = sb
    .from("lms_metrica_diaria")
    .select(`
      *,
      usuario:usuario_id ( id, nome ),
      turno:turno_id ( descricao )
    `)
    .eq("tenant_id", filters.tenantId)
    .gte("data_referencia", filters.dataInicio)
    .lte("data_referencia", filters.dataFim)
    .order("data_referencia", { ascending: false });

  if (filters.empresaId) q = q.eq("empresa_id", filters.empresaId);
  if (filters.armazemId) q = q.eq("armazem_id", filters.armazemId);
  if (filters.usuarioId) q = q.eq("usuario_id", filters.usuarioId);
  if (filters.turnoId) q = q.eq("turno_id", filters.turnoId);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as MetricaDiariaRow[];
}

export async function fetchDetalheTipoTarefa(
  filters: ProdutividadeFilters,
): Promise<DetalheTipoTarefaRow[]> {
  let q = sb
    .from("lms_metrica_tipo_tarefa")
    .select(`
      *,
      usuario:usuario_id ( id, nome ),
      tipo_tarefa:tipo_tarefa_id ( codigo, descricao, tempo_estimado_segundos )
    `)
    .eq("tenant_id", filters.tenantId)
    .gte("data_referencia", filters.dataInicio)
    .lte("data_referencia", filters.dataFim)
    .order("data_referencia", { ascending: false });

  if (filters.usuarioId) q = q.eq("usuario_id", filters.usuarioId);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as DetalheTipoTarefaRow[];
}

export async function fetchOperadores(
  tenantId: string,
): Promise<{ id: string; nome: string }[]> {
  const { data } = await sb
    .from("usuario")
    .select("id, nome")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("nome");
  return data || [];
}

export async function fetchTurnos(
  tenantId: string,
): Promise<{ id: string; descricao: string; armazem_id: string | null }[]> {
  const { data } = await sb
    .from("turnos")
    .select("id, descricao, armazem_id")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("descricao");
  return data || [];
}

// ----------------------------------------------------------------------------
// Mantido para compatibilidade com ProdutividadeOperadorPage (drill-down).
// ----------------------------------------------------------------------------

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

export async function fetchTimelineOperador(
  usuarioId: string,
  dataInicio: string,
  dataFim: string,
): Promise<TimelineEntry[]> {
  const { data, error } = await sb
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

export function formatSegundos(s: number): string {
  if (!s || s <= 0) return "0h00m";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export function getCorOcupacao(pct: number): string {
  if (pct >= 85) return "hsl(142, 71%, 45%)";
  if (pct >= 50) return "hsl(45, 93%, 47%)";
  return "hsl(0, 84%, 60%)";
}
