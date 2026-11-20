import { FAIXAS_PADRAO, type FaixasArmazem } from "./produtividadeCalculo";
import { supabase } from "@/integrations/supabase/client";
import type { ClassificacaoScore, SituacaoScore } from "@/modules/lms/score/score.service";
import { fetchAllRpcRows } from "../utils/fetchAllRpcRows";

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
// Fase 10.15 (P3): execuções detalhadas da ficha com o tempo que entra na conta.
// Vem de rpc_lms_execucoes_operador, que usa a mesma regra da consolidação:
// a soma de duracao_efetiva_seg do dia é o "Tempo direto" do cartão.
// Horários vêm no fuso do armazém (inicio_local / fim_local, sem fuso).
// ----------------------------------------------------------------------------

export interface ExecucaoOperador {
  execucao_id: string;
  tarefa_id: string;
  dia: string;
  tipo_tarefa_codigo: string;
  tipo_tarefa_descricao: string;
  tipo_tarefa_categoria: string | null;
  cor_interface: string | null;
  inicio_local: string;
  fim_local: string;
  inicio_real: boolean;
  pausa_seg: number;
  duracao_bruta_seg: number;
  sobreposicao_seg: number;
  duracao_efetiva_seg: number;
  tempo_padrao_seg: number;
  quantidade: number;
  quantidade_requerida: number;
  quantidade_cortada: number;
}

export async function fetchExecucoesOperador(
  tenantId: string,
  usuarioId: string,
  dataInicio: string,
  dataFim: string,
): Promise<{ linhas: ExecucaoOperador[]; fuso: string | null }> {
  const { data, error } = await sb.rpc("rpc_lms_execucoes_operador", {
    p_tenant_id: tenantId, p_usuario_id: usuarioId, p_data_ini: dataInicio, p_data_fim: dataFim,
  });
  if (error) throw new Error(error.message);
  if (data?.sucesso === false) throw new Error(data.mensagem || "Não foi possível carregar as execuções.");
  const num = (v: unknown) => Number(v ?? 0) || 0;
  return {
    fuso: data?.fuso ?? null,
    linhas: ((data?.linhas as Record<string, string | null>[] | undefined) || []).map((d) => ({
      execucao_id: String(d.execucao_id), tarefa_id: String(d.tarefa_id), dia: String(d.dia),
      tipo_tarefa_codigo: String(d.tipo_tarefa_codigo ?? ""), tipo_tarefa_descricao: String(d.tipo_tarefa_descricao ?? ""),
      tipo_tarefa_categoria: d.tipo_tarefa_categoria ?? null, cor_interface: d.cor_interface ?? null,
      inicio_local: d.inicio_local ?? "", fim_local: d.fim_local ?? "", inicio_real: !!d.inicio_real,
      pausa_seg: num(d.pausa_seg), duracao_bruta_seg: num(d.duracao_bruta_seg), sobreposicao_seg: num(d.sobreposicao_seg),
      duracao_efetiva_seg: num(d.duracao_efetiva_seg), tempo_padrao_seg: num(d.tempo_padrao_seg),
      quantidade: num(d.quantidade), quantidade_requerida: num(d.quantidade_requerida), quantidade_cortada: num(d.quantidade_cortada),
    })),
  };
}

/** "2026-11-18T11:53:59" (hora local do armazém) → minutos desde 00:00, sem passar pelo fuso do navegador. */
export function minutosDoDiaLocal(local: string): number {
  const m = /T(\d{2}):(\d{2})/.exec(local || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

/** "2026-11-18T11:53:59" → "18/11 11:53" (hora local do armazém). */
export function formatarLocalCurto(local: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local || "");
  return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : "—";
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

// ----------------------------------------------------------------------------
// Fase 10.19 (P8): dias do período sem captura de tempo (antes do coletor
// registrar o início das tarefas). A regra fica no banco (rpc_lms_captura_periodo);
// a tela só mostra o aviso com textoSemCaptura.
// ----------------------------------------------------------------------------

export interface CapturaPeriodo {
  captura_desde: string | null;
  dias_sem_captura: number;
  dias_periodo: number;
  dias_estimados: number;
  dias_operador: number;
}

export async function fetchCapturaPeriodo(
  tenantId: string, dataInicio: string, dataFim: string, usuarioIds?: string[] | null,
): Promise<CapturaPeriodo | null> {
  const { data, error } = await sb.rpc("rpc_lms_captura_periodo", {
    p_tenant_id: tenantId, p_data_ini: dataInicio, p_data_fim: dataFim, p_usuario_ids: usuarioIds?.length ? usuarioIds : null,
  });
  if (error || data?.sucesso === false) return null;  // aviso é complementar: sem ele a tela segue
  return {
    captura_desde: data?.captura_desde ?? null,
    dias_sem_captura: Number(data?.dias_sem_captura ?? 0),
    dias_periodo: Number(data?.dias_periodo ?? 0),
    dias_estimados: Number(data?.dias_estimados ?? 0),
    dias_operador: Number(data?.dias_operador ?? 0),
  };
}

/** Frase do aviso, ou null quando o período inteiro tem captura. */
export function textoSemCaptura(c: CapturaPeriodo | null | undefined): string | null {
  if (!c || c.dias_sem_captura <= 0) return null;
  const desde = c.captura_desde ? c.captura_desde.split("-").reverse().join("/") : null;
  const parte = c.dias_sem_captura >= c.dias_periodo
    ? "Todo o período é anterior à captura de tempo"
    : `${c.dias_sem_captura} de ${c.dias_periodo} dias do período são anteriores à captura de tempo`;
  return `${parte}${desde ? ` (começou em ${desde})` : " (ainda não há execução com início registrado)"}. `
    + "Nesses dias a duração das tarefas é zero e os indicadores são estimados: não use esses dias para avaliar o operador.";
}
