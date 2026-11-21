/**
 * Fase 9 · Produtividade (LMS) › Metas.
 * Validação, precedência, rampa, amostra, trava de origem, aprovação e cálculo dos
 * resultados são decididos no banco (rpc_lms_meta_* / fn_lms_meta_*); a tela só
 * exibe, monta o formulário e envia.
 */
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export class MetaErro extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}

function exigir<T>(data: unknown, error: { message: string } | null): T {
  if (error) throw new MetaErro("ERRO_RPC", error.message);
  const r = data as { sucesso?: boolean; codigo?: string; mensagem?: string } | null;
  if (!r || r.sucesso === false) throw new MetaErro(r?.codigo ?? "ERRO", r?.mensagem ?? "Não foi possível concluir a operação.");
  return data as T;
}

// ---------------------------------------------------------------- tipos

export type Metrica = "PERFORMANCE" | "EFICIENCIA" | "UTILIZACAO" | "UPH" | "TAREFAS_HORA"
  | "VOLUME_UNIDADES" | "VOLUME_TAREFAS" | "PCT_INICIO_REAL" | "TEMPO_INDIRETO_PCT";
export type UnidadeMetrica = "PCT" | "POR_HORA" | "QTD";
export type Periodicidade = "DIARIO" | "SEMANAL" | "MENSAL" | "PERSONALIZADO";
export type StatusMeta = "RASCUNHO" | "EM_APROVACAO" | "ATIVA" | "ENCERRADA" | "REJEITADA";
export type Atividade = "TODAS" | "TIPO" | "CATEGORIA";
export type TipoEscopo = "TURNO" | "EQUIPE" | "USUARIO" | "PERFIL";
export type FaixaMeta = "EXCELENTE" | "NA_META" | "ACEITAVEL" | "ABAIXO" | "SEM_DADOS" | "ESTIMADO";

export interface MetricaInfo {
  codigo: Metrica; rotulo: string; unidade: UnidadeMetrica; direcao: "MAIOR" | "MENOR";
  permite_atividade: boolean; trava_origem: boolean; ajuda: string;
}

export interface Opcao { id: string; nome: string; armazem_id?: string | null; turno_id?: string | null }

export interface ModeloMeta {
  codigo: string; nome: string; descricao: string;
  metas: Array<{ metrica: Metrica; alvo: number; minimo: number | null; excelencia: number | null; periodicidade: Periodicidade }>;
}

export interface CatalogoMetas {
  sucesso: true;
  metricas: MetricaInfo[];
  tipos_tarefa: Array<{ id: string; codigo: string; descricao: string; categoria: string | null; unidade_medida: string | null }>;
  categorias: string[];
  armazens: Opcao[];
  turnos: Opcao[];
  equipes: Opcao[];
  operadores: Opcao[];
  perfis: Opcao[];
  modelos: ModeloMeta[];
  hoje: string;
  exige_aprovacao: boolean;
  pode_criar: boolean;
  pode_editar: boolean;
  pode_excluir: boolean;
  pode_aprovar: boolean;
}

export interface EscopoItem { tipo: TipoEscopo; ref_id: string; nome?: string | null }
export interface DegrauRampa { ate_semana: number; pct: number }

export interface ResultadoResumo {
  periodo_ini: string; periodo_fim: string; realizado: number | null; atingimento_pct: number | null;
  faixa: FaixaMeta; participantes: number; parcial: boolean;
}

export interface Meta {
  id: string; nome: string; metrica: Metrica; atividade: Atividade;
  tipo_tarefa_id: string | null; tipo_codigo: string | null; categoria: string | null;
  armazem_id: string | null; armazem_nome: string | null;
  periodicidade: Periodicidade; alvo: number | null; minimo: number | null; excelencia: number | null;
  /** Fase 10: peso da meta no score global do operador (0,1 a 10; padrão 1). */
  peso?: number;
  vigente_desde: string; vigente_ate: string | null; status: StatusMeta; origem: string;
  rampa_base: "PRIMEIRA_EXECUCAO" | "CADASTRO"; observacao: string | null; motivo_status: string | null;
  versao_anterior_id: string | null; criado_por: string | null; criado_em: string;
  aprovado_por: string | null; aprovado_em: string | null;
  escopo: EscopoItem[]; rampa: DegrauRampa[]; ultimo: ResultadoResumo | null;
  /** Fase 10.28 (meta guiada): objetivo escolhido, nível, foto do resultado da equipe e "medindo até". */
  objetivo?: ObjetivoCodigo | null; nivel_ambicao?: NivelAmbicao | null;
  linha_base?: number | null; linha_base_em?: string | null; medir_ate?: string | null;
}

// ---------------------------------------------------------------- meta guiada (Fase 10.28)

export type ObjetivoCodigo = "RITMO" | "TURNO" | "PARADO" | "UNIDADES_HORA" | "TAREFAS_HORA" | "VOLUME" | "INICIO" | "INDIRETO";
export type NivelAmbicao = "MANTER" | "EVOLUIR" | "DESAFIAR" | "PERSONALIZADO";
export type Realismo = "ALCANCAVEL" | "DESAFIADOR" | "ACIMA_DO_MELHOR" | "SEM_BASE";

export interface ObjetivoMeta {
  codigo: ObjetivoCodigo; ordem: number; metrica: Metrica; rotulo: string; pergunta: string; verbo: string;
  unidade: UnidadeMetrica; menor_melhor: boolean; suficiente: boolean; hoje: number | null; motivo: string | null;
  permite_atividade: boolean;
}

export interface ObjetivosMeta { sucesso: true; recomendado: ObjetivoCodigo | null; janela: { de: string; ate: string }; objetivos: ObjetivoMeta[] }

export interface LinhaBase {
  suficiente: boolean; motivo?: string; participantes: number; com_dado: number;
  janela: { de: string; ate: string }; menor_melhor: boolean; unidade: UnidadeMetrica;
  mediana?: number; p10?: number; p25?: number; p75?: number; p90?: number; valores?: number[];
  pct_inicio_real?: number | null;
  tendencia?: { antes: number; depois: number; variacao: number; direcao: "MELHORANDO" | "PIORANDO" | "ESTAVEL" } | null;
}

export interface AvaliacaoAlvo { alvo: number; atingem: number; realismo: Realismo }
export interface NivelPrevia extends AvaliacaoAlvo { codigo: Exclude<NivelAmbicao, "PERSONALIZADO">; pct: number; recomendado?: boolean; limitado?: boolean }

export interface PreviaMeta {
  sucesso: true; metrica: Metrica; unidade: UnidadeMetrica; menor_melhor: boolean; periodicidade: Periodicidade;
  objetivo: Pick<ObjetivoMeta, "codigo" | "rotulo" | "pergunta" | "verbo">;
  linha_base: LinhaBase; niveis: NivelPrevia[]; personalizado: AvaliacaoAlvo | null; medir_dias: number;
  avisos: Array<{ codigo: "INICIO_BAIXO" | "PADRAO_SEM_CALIBRAR" | "SOBREPOSICAO"; mensagem: string }>;
}

export interface MetaGuiadaEntrada {
  id?: string | null;
  empresa_id: string;
  armazem_id: string | null;
  objetivo: ObjetivoCodigo;
  atividade: Atividade;
  tipo_tarefa_id?: string | null;
  categoria?: string | null;
  periodicidade: Periodicidade;
  escopo: EscopoItem[];
  nivel?: NivelAmbicao;
  alvo?: number | null;
  medir_primeiro?: boolean;
  nome?: string;
  vigente_desde?: string;
  vigente_ate?: string | null;
  peso?: number | null;
  rampa?: DegrauRampa[];
  ativar?: boolean;
}

export interface SalvarGuiadaResultado extends SalvarMetaResultado { alvo?: number; minimo?: number; excelencia?: number; medir_ate?: string }

export async function objetivosMeta(tenantId: string, empresaId: string, armazemId: string | null): Promise<ObjetivosMeta> {
  const { data, error } = await sb.rpc("rpc_lms_meta_objetivos", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_armazem_id: armazemId });
  return exigir<ObjetivosMeta>(data, error);
}

export async function previaMeta(tenantId: string, dados: Omit<MetaGuiadaEntrada, "nivel" | "medir_primeiro" | "ativar">): Promise<PreviaMeta> {
  const { data, error } = await sb.rpc("rpc_lms_meta_previa", { p_tenant_id: tenantId, p_dados: dados });
  return exigir<PreviaMeta>(data, error);
}

export async function salvarMetaGuiada(tenantId: string, dados: MetaGuiadaEntrada): Promise<SalvarGuiadaResultado> {
  const { data, error } = await sb.rpc("rpc_lms_meta_salvar_guiada", { p_tenant_id: tenantId, p_dados: dados });
  return exigir<SalvarGuiadaResultado>(data, error);
}

export const ROTULO_NIVEL: Record<NivelAmbicao, { titulo: string; frase: string }> = {
  MANTER: { titulo: "Manter", frase: "Segurar o resultado de hoje" },
  EVOLUIR: { titulo: "Evoluir", frase: "Um passo acima do que a equipe já faz" },
  DESAFIAR: { titulo: "Desafiar", frase: "Puxar para perto dos melhores da equipe" },
  PERSONALIZADO: { titulo: "Outro valor", frase: "Você escolhe o alvo" },
};

export const ROTULO_REALISMO: Record<Realismo, { texto: string; classe: string }> = {
  ALCANCAVEL: { texto: "Alcançável", classe: "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400" },
  DESAFIADOR: { texto: "Desafiador", classe: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ACIMA_DO_MELHOR: { texto: "Acima do melhor de hoje", classe: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
  SEM_BASE: { texto: "Sem histórico para comparar", classe: "border-border bg-muted/40 text-muted-foreground" },
};

/** "2 de 5 operadores já chegam lá hoje". */
export function frasePessoasAtingem(atingem: number, comDado: number): string {
  if (!comDado) return "Ainda não dá para dizer quantos chegam lá.";
  if (atingem === 0) return `Ninguém dos ${comDado} operadores medidos chega lá hoje.`;
  if (atingem === comDado) return comDado === 1 ? "O operador medido já chega lá hoje." : `Todos os ${comDado} operadores medidos já chegam lá hoje.`;
  return `${atingem} de ${comDado} operadores já chegam lá hoje.`;
}

/** Meta guiada salva em "Medir primeiro": rascunho sem alvo. */
export function estaMedindo(m: Pick<Meta, "alvo" | "medir_ate" | "status">): boolean {
  return m.status === "RASCUNHO" && (m.alvo === null || m.alvo === undefined) && !!m.medir_ate;
}

export interface MetaEntrada {
  id?: string | null;
  empresa_id: string;
  armazem_ids?: string[];
  armazem_id?: string | null;
  nome?: string;
  metrica: Metrica;
  atividade: Atividade;
  tipo_tarefa_ids?: string[];
  tipo_tarefa_id?: string | null;
  categoria?: string | null;
  periodicidade: Periodicidade;
  alvo: number;
  minimo?: number | null;
  excelencia?: number | null;
  peso?: number | null;
  vigente_desde?: string;
  vigente_ate?: string | null;
  escopo?: EscopoItem[];
  rampa?: DegrauRampa[];
  rampa_base?: "PRIMEIRA_EXECUCAO" | "CADASTRO";
  observacao?: string | null;
  origem?: "MANUAL" | "MODELO" | "ASSISTENTE";
  versao_anterior_id?: string | null;
  ativar?: boolean;
}

export interface SalvarMetaResultado { sucesso: true; ids: string[]; quantidade: number; status: StatusMeta; mensagem: string }

export interface SugestaoMeta {
  sucesso: true; suficiente: boolean; mensagem: string;
  participantes: number; com_dado: number;
  mediana?: number; p25?: number; p75?: number;
  sugestao?: { alvo: number; minimo: number; excelencia: number };
  atingiriam_hoje?: number;
}

export interface ResultadoIndividual {
  usuario_id: string; nome: string; realizado: number | null; alvo: number | null; minimo: number | null; excelencia: number | null;
  atingimento_pct: number | null; faixa: FaixaMeta; oficial: boolean; origem: string; amostra_suficiente: boolean;
  semana_rampa: number | null;
}

export interface PeriodoResultado {
  periodo_ref: string; periodo_ini: string; periodo_fim: string; parcial: boolean;
  coletivo: { realizado: number | null; alvo: number; atingimento_pct: number | null; faixa: FaixaMeta; participantes: number; origem: string };
  individuais: ResultadoIndividual[];
}

export interface Equipe {
  id: string; nome: string; armazem_id: string | null; armazem_nome: string | null; lider_id: string | null; lider_nome: string | null;
  ativo: boolean; membros: Array<{ usuario_id: string; nome: string; desde: string }>; metas_ativas: number;
}

// ---------------------------------------------------------------- RPCs

export async function obterCatalogoMetas(tenantId: string, empresaId: string): Promise<CatalogoMetas> {
  const { data, error } = await sb.rpc("rpc_lms_metas_catalogo", { p_tenant_id: tenantId, p_empresa_id: empresaId });
  return exigir<CatalogoMetas>(data, error);
}

export async function listarMetas(tenantId: string, empresaId: string, status: StatusMeta[] | null = null): Promise<Meta[]> {
  const { data, error } = await sb.rpc("rpc_lms_metas_listar", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_status: status });
  return exigir<{ metas: Meta[] }>(data, error).metas;
}

export async function salvarMeta(tenantId: string, dados: MetaEntrada): Promise<SalvarMetaResultado> {
  const { data, error } = await sb.rpc("rpc_lms_meta_salvar", { p_tenant_id: tenantId, p_dados: dados });
  return exigir<SalvarMetaResultado>(data, error);
}

export type AcaoMeta = "ATIVAR" | "APROVAR" | "REJEITAR" | "ENCERRAR" | "EXCLUIR";

export async function acaoMeta(tenantId: string, metaId: string, acao: AcaoMeta, motivo?: string | null, data?: string | null)
  : Promise<{ status: string; mensagem: string }> {
  const r = await sb.rpc("rpc_lms_meta_acao", { p_tenant_id: tenantId, p_meta_id: metaId, p_acao: acao, p_motivo: motivo ?? null, p_data: data ?? null });
  return exigir<{ status: string; mensagem: string }>(r.data, r.error);
}

export async function copiarMetas(tenantId: string, ids: string[], vigenteDesde: string, vigenteAte: string | null): Promise<SalvarMetaResultado> {
  const { data, error } = await sb.rpc("rpc_lms_meta_copiar", { p_tenant_id: tenantId, p_meta_ids: ids, p_vigente_desde: vigenteDesde, p_vigente_ate: vigenteAte });
  return exigir<SalvarMetaResultado>(data, error);
}

export async function sugerirMeta(tenantId: string, dados: Partial<MetaEntrada> & { empresa_id: string; metrica: Metrica }): Promise<SugestaoMeta> {
  const { data, error } = await sb.rpc("rpc_lms_meta_sugerir", { p_tenant_id: tenantId, p_dados: dados });
  return exigir<SugestaoMeta>(data, error);
}

export async function resultadosMeta(tenantId: string, metaId: string): Promise<PeriodoResultado[]> {
  const { data, error } = await sb.rpc("rpc_lms_meta_resultados", { p_tenant_id: tenantId, p_meta_id: metaId, p_data_ini: null, p_data_fim: null });
  return exigir<{ periodos: PeriodoResultado[] }>(data, error).periodos;
}

export async function listarEquipes(tenantId: string, empresaId: string): Promise<{ pode_editar: boolean; equipes: Equipe[] }> {
  const { data, error } = await sb.rpc("rpc_lms_equipes_listar", { p_tenant_id: tenantId, p_empresa_id: empresaId });
  return exigir<{ pode_editar: boolean; equipes: Equipe[] }>(data, error);
}

export async function salvarEquipe(tenantId: string, dados: {
  id?: string | null; empresa_id: string; nome: string; armazem_id?: string | null; lider_id?: string | null; ativo?: boolean; membros: string[];
}): Promise<{ id: string }> {
  const { data, error } = await sb.rpc("rpc_lms_equipe_salvar", { p_tenant_id: tenantId, p_dados: dados });
  return exigir<{ id: string }>(data, error);
}

// ---------------------------------------------------------------- exibição

export const ROTULO_PERIODICIDADE: Record<Periodicidade, string> = {
  DIARIO: "Por dia (turno)", SEMANAL: "Por semana", MENSAL: "Por mês", PERSONALIZADO: "Período personalizado",
};

export const ROTULO_STATUS: Record<StatusMeta, { texto: string; classe: string }> = {
  RASCUNHO:     { texto: "Rascunho",            classe: "border-border bg-muted/40 text-muted-foreground" },
  EM_APROVACAO: { texto: "Aguardando aprovação", classe: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ATIVA:        { texto: "Ativa",               classe: "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400" },
  ENCERRADA:    { texto: "Encerrada",           classe: "border-border bg-muted/30 text-muted-foreground" },
  REJEITADA:    { texto: "Rejeitada",           classe: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
};

export const ROTULO_FAIXA: Record<FaixaMeta, { texto: string; classe: string }> = {
  EXCELENTE: { texto: "Excelente",          classe: "border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400" },
  NA_META:   { texto: "Na meta",            classe: "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  ACEITAVEL: { texto: "Aceitável",          classe: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ABAIXO:    { texto: "Abaixo",             classe: "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400" },
  SEM_DADOS: { texto: "Sem dados suficientes", classe: "border-border bg-muted/40 text-muted-foreground" },
  ESTIMADO:  { texto: "Estimado (não conta)",  classe: "border-border bg-muted/40 text-muted-foreground" },
};

export const ROTULO_ESCOPO: Record<TipoEscopo, string> = { USUARIO: "Operador", EQUIPE: "Equipe", TURNO: "Turno", PERFIL: "Perfil" };

export function infoMetrica(catalogo: Pick<CatalogoMetas, "metricas"> | null, metrica: Metrica): MetricaInfo | undefined {
  return catalogo?.metricas.find((m) => m.codigo === metrica);
}

/** "95%", "120 un/h", "1.200" conforme a unidade da métrica. */
export function formatarValorMeta(valor: number | null | undefined, unidade: UnidadeMetrica | undefined): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  const v = Number(valor);
  const n = v.toLocaleString("pt-BR", { maximumFractionDigits: unidade === "QTD" ? 0 : 1 });
  if (unidade === "PCT") return `${n}%`;
  if (unidade === "POR_HORA") return `${n}/h`;
  return n;
}

/** Quem a meta cobre, em uma linha. */
export function descreverQuem(m: Pick<Meta, "escopo" | "armazem_nome">): string {
  const onde = m.armazem_nome ? `Armazém ${m.armazem_nome}` : "Toda a empresa";
  if (!m.escopo.length) return onde;
  const grupos = new Map<TipoEscopo, string[]>();
  for (const e of m.escopo) grupos.set(e.tipo, [...(grupos.get(e.tipo) ?? []), e.nome ?? "—"]);
  const partes = [...grupos.entries()].map(([t, nomes]) => `${ROTULO_ESCOPO[t]}${nomes.length > 1 ? "s" : ""}: ${nomes.join(", ")}`);
  return `${partes.join(" · ")} (${onde.toLowerCase()})`;
}

export function descreverAtividade(m: Pick<Meta, "atividade" | "tipo_codigo" | "categoria">): string {
  if (m.atividade === "TIPO") return m.tipo_codigo ?? "Tipo de tarefa";
  if (m.atividade === "CATEGORIA") return `Categoria ${m.categoria ?? ""}`.trim();
  return "Todas as tarefas";
}

/** Mesmas regras de fn_lms_meta_validar, para retorno imediato no formulário. */
export function validarMeta(e: MetaEntrada, info: MetricaInfo | undefined): string | null {
  if (!info) return "Escolha a métrica.";
  if (e.atividade !== "TODAS" && !info.permite_atividade) return `"${info.rotulo}" só pode ser medida em todas as tarefas.`;
  if (e.atividade === "TIPO" && !(e.tipo_tarefa_ids?.length || e.tipo_tarefa_id)) return "Escolha o tipo de tarefa.";
  if (e.atividade === "CATEGORIA" && !e.categoria) return "Escolha a categoria.";
  if (!Number.isFinite(e.alvo) || e.alvo < 0) return "Informe o alvo.";
  const menor = info.direcao === "MENOR";
  if (!menor && e.alvo <= 0) return "O alvo precisa ser maior que zero.";
  const min = e.minimo ?? null;
  const exc = e.excelencia ?? null;
  if (!menor && ((min !== null && min > e.alvo) || (exc !== null && exc < e.alvo))) return "Use mínimo ≤ alvo ≤ excelência.";
  if (menor && ((min !== null && min < e.alvo) || (exc !== null && exc > e.alvo))) return "Nesta métrica menor é melhor: use mínimo ≥ alvo ≥ excelência.";
  if (info.unidade === "PCT" && [e.alvo, min, exc].some((v) => v !== null && v > 300)) return "Percentuais devem ficar entre 0% e 300%.";
  if (e.peso !== undefined && e.peso !== null && (!Number.isFinite(e.peso) || e.peso < 0.1 || e.peso > 10)) return "O peso da meta vai de 0,1 a 10.";
  if (e.periodicidade === "PERSONALIZADO" && !e.vigente_ate) return "Período personalizado precisa de data de fim.";
  if (e.vigente_ate && e.vigente_desde && e.vigente_ate < e.vigente_desde) return "A data de fim é anterior ao início.";
  if (e.rampa?.length) {
    if (menor) return "Rampa só vale para métricas em que maior é melhor.";
    const r = [...e.rampa].sort((a, b) => a.ate_semana - b.ate_semana);
    for (let i = 0; i < r.length; i++) {
      if (!(r[i].ate_semana >= 1 && r[i].ate_semana <= 52) || !(r[i].pct > 0 && r[i].pct <= 100)) return "Rampa: semana de 1 a 52 e percentual de 1% a 100%.";
      if (i > 0 && (r[i].ate_semana === r[i - 1].ate_semana || r[i].pct < r[i - 1].pct)) return "Rampa: as semanas não se repetem e o percentual não pode cair.";
    }
  }
  return null;
}

/** Quantas metas um cadastro em lote vai criar. */
export function quantidadeLote(e: Pick<MetaEntrada, "armazem_ids" | "tipo_tarefa_ids" | "atividade">): number {
  const arms = Math.max(1, e.armazem_ids?.length ?? 0);
  const tipos = e.atividade === "TIPO" ? Math.max(1, e.tipo_tarefa_ids?.length ?? 0) : 1;
  return arms * tipos;
}
