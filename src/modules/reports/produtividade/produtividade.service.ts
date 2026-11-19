import { FAIXAS_PADRAO, type FaixasArmazem } from "./produtividadeCalculo";
import { supabase } from "@/integrations/supabase/client";
import type { ClassificacaoScore, SituacaoScore } from "@/modules/lms/score/score.service";
import { fetchAllRpcRows } from "../utils/fetchAllRpcRows";
import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

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
  score_dia?: number | null;
  tempo_transito?: number | null;
  // v3 (Fase 3/4)
  tempo_disponivel?: number | null;
  tempo_direto?: number | null;
  tempo_indireto?: number | null;
  horas_padrao_seg?: number | null;
  utilizacao_pct?: number | null;
  performance_pct?: number | null;
  eficiencia_pct?: number | null;
  estimado?: boolean | null;
  versao_regra?: number | null;
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
  tipo_tarefa?: {
    codigo: string;
    descricao: string;
    tempo_estimado_segundos: number | null;
    categoria: string | null;
    meta_unidades_hora: number | null;
    meta_tarefas_hora: number | null;
    peso_produtividade: number | null;
    cor_interface: string | null;
    unidade_medida: string | null;
  } | null;
}

export async function fetchProdutividadeDiaria(
  filters: ProdutividadeFilters,
): Promise<MetricaDiariaRow[]> {
  const data = await fetchAllSelectRows(
    "lms_metrica_diaria",
    `
      *,
      usuario:usuario_id ( id, nome ),
      turno:turno_id ( descricao )
    `,
    (q) => {
      q = q
        .eq("tenant_id", filters.tenantId)
        .gte("data_referencia", filters.dataInicio)
        .lte("data_referencia", filters.dataFim)
        .order("data_referencia", { ascending: false });

      if (filters.empresaId) q = q.eq("empresa_id", filters.empresaId);
      if (filters.armazemId) q = q.eq("armazem_id", filters.armazemId);
      if (filters.usuarioId) q = q.eq("usuario_id", filters.usuarioId);
      if (filters.turnoId) q = q.eq("turno_id", filters.turnoId);
      return q;
    },
  );
  return data as MetricaDiariaRow[];
}

export async function fetchDetalheTipoTarefa(
  filters: ProdutividadeFilters,
): Promise<DetalheTipoTarefaRow[]> {
  const data = await fetchAllSelectRows(
    "lms_metrica_tipo_tarefa",
    `
      *,
      usuario:usuario_id ( id, nome ),
      tipo_tarefa:tipo_tarefa_id ( codigo, descricao, tempo_estimado_segundos, categoria, meta_unidades_hora, meta_tarefas_hora, peso_produtividade, cor_interface, unidade_medida )
    `,
    (q) => {
      q = q
        .eq("tenant_id", filters.tenantId)
        .gte("data_referencia", filters.dataInicio)
        .lte("data_referencia", filters.dataFim)
        .order("data_referencia", { ascending: false });
      if (filters.usuarioId) q = q.eq("usuario_id", filters.usuarioId);
      return q;
    },
  );
  return data as DetalheTipoTarefaRow[];
}

// ----------------------------------------------------------------------------
// Fase 4 · fonte única: rpc_lms_metricas (v3, ponderada no banco)
// ----------------------------------------------------------------------------

export type Granularidade = "OPERADOR" | "DIA" | "OPERADOR_DIA" | "TOTAL" | "TIPO";
export type OrigemMetrica = "REAL" | "ESTIMADO";

export interface LmsLinha {
  chave: string;
  usuario_id: string | null;
  nome: string | null;
  data: string | null;
  operadores: number;
  dias: number;
  tempo_disponivel: number;
  tempo_direto: number;
  tempo_indireto: number;
  tempo_ocioso: number;
  tempo_gap: number;
  maior_gap: number;
  tempo_espera: number;
  horas_padrao_seg: number;
  utilizacao_pct: number | null;
  performance_pct: number | null;
  eficiencia_pct: number | null;
  tarefas: number;
  canceladas: number;
  quantidade: number;
  cortes: number;
  ocorrencias: number;
  execucoes: number;
  execucoes_inicio_real: number;
  pct_inicio_real: number | null;
  origem: OrigemMetrica;
  dias_estimados: number;
  fonte_disponivel: string | null;
  amostra_suficiente: boolean;
  // Fase 10 · score global das metas (granularidades OPERADOR e OPERADOR_DIA)
  score?: number | null;
  score_situacao?: SituacaoScore;
  score_metas_total?: number;
  score_metas_contadas?: number;
  classificacao?: ClassificacaoScore;
}

export interface LmsTotal {
  operadores: number;
  dias: number;
  tempo_disponivel: number;
  tempo_direto: number;
  tempo_indireto: number;
  tempo_ocioso: number;
  horas_padrao_seg: number;
  tarefas: number;
  quantidade: number;
  canceladas: number;
  cortes: number;
  utilizacao_pct: number | null;
  performance_pct: number | null;
  eficiencia_pct: number | null;
  pct_inicio_real: number | null;
  origem: OrigemMetrica;
  dias_estimados: number;
  // Fase 10 · média simples do score de quem tem score (só na granularidade OPERADOR)
  score_medio?: number | null;
  operadores_com_score?: number;
}

export interface LmsTipoLinha {
  tipo_tarefa_id: string;
  codigo: string;
  descricao: string;
  unidade_medida: string | null;
  tarefas: number;
  quantidade: number;
  tempo_direto: number;
  horas_padrao_seg: number;
  uph: number | null;
  tarefas_hora: number | null;
  performance_pct: number | null;
  pct_inicio_real: number | null;
  origem: OrigemMetrica;
}

export interface LmsResultado<L> {
  linhas: L[];
  total: LmsTotal | null;
}

const NUM_LINHA = [
  "operadores", "dias", "tempo_disponivel", "tempo_direto", "tempo_indireto", "tempo_ocioso", "tempo_gap",
  "maior_gap", "tempo_espera", "horas_padrao_seg", "tarefas", "canceladas", "quantidade", "cortes",
  "ocorrencias", "execucoes", "execucoes_inicio_real", "dias_estimados",
] as const;
const PCT = ["utilizacao_pct", "performance_pct", "eficiencia_pct", "pct_inicio_real", "uph", "tarefas_hora", "score", "score_medio"] as const;

function normalizar<T>(o: any): T {
  const r: any = { ...o };
  for (const k of NUM_LINHA) if (k in r) r[k] = Number(r[k] ?? 0);
  for (const k of PCT) if (k in r) r[k] = r[k] == null ? null : Number(r[k]);
  return r as T;
}

export async function fetchLmsMetricas<L = LmsLinha>(
  filters: ProdutividadeFilters,
  granularidade: Granularidade,
): Promise<LmsResultado<L>> {
  const { data, error } = await sb.rpc("rpc_lms_metricas", {
    p_tenant_id: filters.tenantId,
    p_data_ini: filters.dataInicio,
    p_data_fim: filters.dataFim,
    p_armazem_id: filters.armazemId || null,
    p_usuario_ids: filters.usuarioId ? [filters.usuarioId] : null,
    p_tipo_tarefa_ids: null,
    p_granularidade: granularidade,
    p_empresa_id: filters.empresaId || null,
    p_turno_id: filters.turnoId || null,
  });
  if (error) throw new Error(error.message);
  if (data?.sucesso === false) throw new Error(data.mensagem || "Não foi possível calcular as métricas.");
  return {
    linhas: ((data?.linhas as any[]) || []).map((l) => normalizar<L>(l)),
    total: data?.total ? normalizar<LmsTotal>(data.total) : null,
  };
}

export async function fetchFaixasArmazem(
  tenantId: string,
  armazemId: string | null,
): Promise<FaixasArmazem> {
  // Fase 7/7.5: faixas vêm da cascata do LMS (armazém → empresa → padrão do sistema)
  const padrao = FAIXAS_PADRAO;
  const { data, error } = await sb.rpc("rpc_lms_faixas", { p_tenant_id: tenantId, p_armazem_id: armazemId });
  if (error || !data?.sucesso) return padrao;
  return {
    excelente: Number(data.excelente ?? padrao.excelente),
    bom: Number(data.bom ?? padrao.bom),
    atencao: Number(data.atencao ?? padrao.atencao),
    lista: Array.isArray(data.lista) && data.lista.length > 0 ? data.lista : padrao.lista,
  };
}

// Fase 4.3 · qualidade do dado (rpc_lms_qualidade_dado)

export interface QualidadeTipo {
  tipo_tarefa_id: string;
  codigo: string;
  descricao: string;
  execucoes: number;
  inicio_real: number;
  pct_inicio_real: number;
  fora_de_ordem: number;
  duracao_fora_padrao: number;
  pct_fora_padrao: number;
  por_origem: Record<string, number> | null;
  ok: boolean;
}

export interface QualidadeCaso {
  execucao_id: string;
  tarefa_id: string;
  operador: string | null;
  tipo: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  duracao_seg: number | null;
  set_seg: number | null;
  origem: string;
  motivo: "FORA_DE_ORDEM" | "DURACAO_FORA_PADRAO";
}

export interface QualidadeDado {
  metas: { pct_inicio_real_min: number; fora_de_ordem_max: number; pct_fora_padrao_max: number; atribuicoes_abertas_max: number; limite_duracao_seg: number; multiplo_set: number };
  total: { execucoes: number; inicio_real: number; pct_inicio_real: number | null; fora_de_ordem: number; duracao_fora_padrao: number; pct_fora_padrao: number | null };
  por_tipo: QualidadeTipo[];
  casos: QualidadeCaso[];
  atribuicoes_abertas: { total: number; mais_antiga: string | null };
  contextos_pre_inicio: { criados: number; consumidos: number; expirados: number; pct_expirados: number | null };
  liberacoes: { total: number; sem_motivo: number };
}

export async function fetchQualidadeDado(filters: ProdutividadeFilters): Promise<QualidadeDado> {
  const { data, error } = await sb.rpc("rpc_lms_qualidade_dado", {
    p_tenant_id: filters.tenantId,
    p_data_ini: filters.dataInicio,
    p_data_fim: filters.dataFim,
    p_armazem_id: filters.armazemId || null,
  });
  if (error) throw new Error(error.message);
  if (data?.sucesso === false) throw new Error(data.mensagem || "Não foi possível medir a qualidade do dado.");
  return data as QualidadeDado;
}

// Fase 5.5 · indicadores de troca de dono (rpc_lms_trocas_dono)

export interface TrocaDonoOperador {
  usuario_id: string;
  nome: string;
  interrupcoes: number;
  segundos_interrompidos: number;
  saidas_etapa: number;
  etapas_assumidas: number;
  taxa_saida_pct: number | null;
  reatribuicoes_perdidas: number;
  reatribuicoes_recebidas: number;
}

export interface TrocasDono {
  total: {
    interrupcoes: number; segundos_interrompidos: number;
    reatribuicoes_gestor: number; movimentos_com_reatribuicao: number; movimentos_trabalhados: number;
    reatribuicoes_por_movimento: number | null;
    saidas_etapa: number; etapas_assumidas: number; taxa_saida_pct: number | null;
    liberacoes_sem_motivo: number;
  };
  troca_de_dono: { trocas: number; trocas_com_inicio: number; medio_seg: number | null; mediana_seg: number | null; p90_seg: number | null };
  por_motivo: { motivo: string; interrupcoes: number; segundos: number }[];
  por_operador: TrocaDonoOperador[];
}

export async function fetchTrocasDono(filters: ProdutividadeFilters): Promise<TrocasDono> {
  const { data, error } = await sb.rpc("rpc_lms_trocas_dono", {
    p_tenant_id: filters.tenantId,
    p_data_ini: filters.dataInicio,
    p_data_fim: filters.dataFim,
    p_armazem_id: filters.armazemId || null,
  });
  if (error) throw new Error(error.message);
  if (data?.sucesso === false) throw new Error(data.mensagem || "Não foi possível medir as trocas de dono.");
  return data as TrocasDono;
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
  tipo_tarefa_categoria: string | null;
  meta_unidades_hora: number | null;
  meta_tarefas_hora: number | null;
  peso_produtividade: number | null;
  cor_interface: string | null;
  unidade_medida: string | null;
  aderencia_meta_pct: number | null;
}

export async function fetchTimelineOperador(
  usuarioId: string,
  dataInicio: string,
  dataFim: string,
): Promise<TimelineEntry[]> {
  const data = await fetchAllSelectRows(
    "vw_lms_timeline_operador",
    "*",
    (q) => q
      .eq("usuario_id", usuarioId)
      .gte("concluido_em", dataInicio)
      .lte("concluido_em", dataFim + "T23:59:59")
      .order("concluido_em", { ascending: true }),
  );

  return data.map((d: any) => ({
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
    tipo_tarefa_categoria: d.tipo_tarefa_categoria ?? null,
    meta_unidades_hora: d.meta_unidades_hora != null ? Number(d.meta_unidades_hora) : null,
    meta_tarefas_hora: d.meta_tarefas_hora != null ? Number(d.meta_tarefas_hora) : null,
    peso_produtividade: d.peso_produtividade != null ? Number(d.peso_produtividade) : null,
    cor_interface: d.cor_interface ?? null,
    unidade_medida: d.unidade_medida ?? null,
    aderencia_meta_pct: d.aderencia_meta_pct != null ? Number(d.aderencia_meta_pct) : null,
  }));
}

/**
 * Duração de uma execução. Execuções de coletor costumam durar segundos, então abaixo de
 * 1 hora mostra minutos e segundos ("34s", "2min 05s"); acima, horas e minutos ("1h02m").
 */
export function formatSegundos(s: number): string {
  const total = Math.round(Number(s) || 0);
  if (total <= 0) return "0s";
  if (total < 60) return `${total}s`;
  if (total < 3600) {
    const m = Math.floor(total / 60);
    const seg = total % 60;
    return seg ? `${m}min ${seg.toString().padStart(2, "0")}s` : `${m}min`;
  }
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h${m.toString().padStart(2, "0")}m`;
}

export function getCorOcupacao(pct: number): string {
  if (pct >= 85) return "hsl(142, 71%, 45%)";
  if (pct >= 50) return "hsl(45, 93%, 47%)";
  return "hsl(0, 84%, 60%)";
}

// ----------------------------------------------------------------------------
// Drill-down por operador: histórico granular de tarefas no período.
// ----------------------------------------------------------------------------

export interface TarefaColaboradorRow {
  execucao_id: string;
  tarefa_id: string;
  usuario_id: string;
  usuario_nome: string;
  tipo_tarefa_codigo: string;
  tipo_tarefa_descricao: string;
  produto_sku: string | null;
  produto_descricao: string | null;
  quantidade_requerida: number | null;
  quantidade_executada: number;
  quantidade_cortada: number;
  atribuido_em: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  duracao_segundos: number | null;
  espera_segundos: number | null;
  tempo_estimado_seg: number | null;
  status_execucao: string;
  endereco_origem: string | null;
  endereco_destino: string | null;
  lote: string | null;
  documento_origem_tipo: string | null;
  documento_origem_id: string | null;
  empresa_id: string;
  armazem_id: string | null;
  tipo_tarefa_categoria?: string | null;
  cor_interface?: string | null;
  unidade_medida?: string | null;
  meta_unidades_hora?: number | null;
  meta_tarefas_hora?: number | null;
  peso_produtividade?: number | null;
  aderencia_meta_pct?: number | null;
}

export async function fetchTarefasColaborador(params: {
  tenant_id: string;
  usuario_id: string;
  data_inicio: string;
  data_fim: string;
  empresa_id?: string | null;
  armazem_id?: string | null;
  tipo_tarefa_id?: string | null;
  status?: string | null;
}): Promise<TarefaColaboradorRow[]> {
  const data = await fetchAllRpcRows(
    "rpc_relatorio_tarefas_colaborador",
    {
      p_tenant_id: params.tenant_id,
      p_data_inicio: params.data_inicio,
      p_data_fim: params.data_fim,
      p_usuario_id: params.usuario_id,
      p_empresa_id: params.empresa_id ?? null,
      p_armazem_id: params.armazem_id ?? null,
      p_tipo_tarefa_id: params.tipo_tarefa_id ?? null,
      p_status: params.status ?? null,
    },
  );
  return data as TarefaColaboradorRow[];
}
