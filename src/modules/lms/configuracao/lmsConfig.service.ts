/**
 * Fase 7 · Produtividade (LMS) › Configurações.
 * Toda regra (valor efetivo, herança, vigência, permissão) é decidida no banco
 * pelas RPCs rpc_lms_config_*; a tela só exibe e envia a alteração.
 */
import { supabase } from "@/integrations/supabase/client";
import type { CorFaixa, FaixaLms } from "../faixas";

const sb = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

interface Consulta<T> {
  eq: (c: string, v: unknown) => Consulta<T>;
  order: (c: string) => Promise<{ data: T[] | null }>;
}
const tabela = supabase as unknown as { from: <T>(t: string) => { select: (c: string) => Consulta<T> } };

export async function listarEmpresas(tenantId: string): Promise<Array<{ id: string; nome: string }>> {
  const { data } = await tabela.from<{ id: string; razaosocial: string }>("empresa").select("id, razaosocial")
    .eq("tenant_id", tenantId).eq("ativo", true).order("razaosocial");
  return (data ?? []).map((e) => ({ id: e.id, nome: e.razaosocial }));
}

export async function listarArmazens(tenantId: string, empresaId: string): Promise<Array<{ id: string; nome: string }>> {
  const { data } = await tabela.from<{ id: string; descricao: string }>("armazem").select("id, descricao")
    .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao");
  return (data ?? []).map((a) => ({ id: a.id, nome: a.descricao }));
}

export type NivelRegra = "SISTEMA" | "CADASTRO" | "EMPRESA" | "ARMAZEM";
export type UnidadeParametro = "PERCENTUAL" | "SEGUNDOS" | "MULTIPLO" | "DIAS" | "QUANTIDADE";
export type GrupoParametro = "CLASSIFICACAO" | "JORNADA" | "QUALIDADE" | "CALIBRACAO";

export interface ParametroConfig {
  codigo: string;
  grupo: GrupoParametro;
  rotulo: string;
  ajuda: string;
  unidade: UnidadeParametro;
  padrao_sistema: number;
  minimo: number;
  maximo: number;
  niveis: Array<"EMPRESA" | "ARMAZEM">;
  editavel_neste_nivel: boolean;
  efetivo: { valor: number; nivel: NivelRegra; vigente_desde: string | null };
  herdado: { valor: number; nivel: NivelRegra };
  proprio: { id: string; valor: number | null; vigente_desde: string } | null;
  agendados: Array<{ id: string; valor: number | null; vigente_desde: string }>;
}

/** Fase 8: as três partes do tempo padrão. */
export interface PartesPadrao {
  tempo_fixo_seg: number;
  /** segundos por unidade executada (0 = não usa) */
  tempo_unidade_seg?: number;
  /** folga para necessidades pessoais, fadiga e esperas, em % (0 = não usa) */
  pfd_pct?: number;
}

export interface PadraoTempoConfig {
  tipo_tarefa_id: string;
  codigo: string;
  descricao: string;
  unidade_medida: string | null;
  categoria: string | null;
  efetivo: PartesPadrao & { nivel: NivelRegra; vigente_desde: string | null; origem: string };
  herdado: PartesPadrao & { nivel: NivelRegra };
  proprio: (Omit<PartesPadrao, "tempo_fixo_seg"> & { id: string; tempo_fixo_seg: number | null; vigente_desde: string; origem: string }) | null;
  agendados: Array<Omit<PartesPadrao, "tempo_fixo_seg"> & { id: string; tempo_fixo_seg: number | null; vigente_desde: string }>;
}

export interface RegraSistema {
  tipo_codigo: string;
  captura_ativa: boolean;
  teto_ciclo_seg: number;
  observacao: string | null;
}

export interface FaixasConfig {
  paleta: CorFaixa[];
  efetivo: { lista: FaixaLms[]; nivel: NivelRegra; vigente_desde: string | null };
  herdado: { lista: FaixaLms[]; nivel: NivelRegra };
  agendados: Array<{ id: string; herdar: boolean; lista: FaixaLms[] | null; vigente_desde: string }>;
}

export interface HistoricoRegra {
  tipo: "PARAMETRO" | "PADRAO_TEMPO" | "FAIXAS";
  faixas?: FaixaLms[] | null;
  herdar?: boolean;
  chave: string;
  rotulo: string;
  valor: number | null;
  tempo_unidade_seg?: number | null;
  pfd_pct?: number | null;
  origem?: string | null;
  vigente_desde: string;
  motivo: string | null;
  criado_em: string;
  criado_por: string | null;
}

export interface ConfigLms {
  sucesso: true;
  nivel: "EMPRESA" | "ARMAZEM";
  empresa_id: string;
  armazem_id: string | null;
  data: string;
  hoje: string;
  pode_editar: boolean;
  pode_reprocessar: boolean;
  parametros: ParametroConfig[];
  padroes_tempo: PadraoTempoConfig[];
  faixas: FaixasConfig;
  regras_sistema: RegraSistema[];
  historico: HistoricoRegra[];
}

export interface ErroLms { sucesso: false; codigo: string; mensagem: string }

export class LmsConfigErro extends Error {
  constructor(public codigo: string, mensagem: string) { super(mensagem); }
}

function exigirSucesso<T>(data: unknown, error: { message: string } | null): T {
  if (error) throw new LmsConfigErro("ERRO_RPC", error.message);
  const r = data as { sucesso?: boolean; codigo?: string; mensagem?: string } | null;
  if (!r || r.sucesso === false) {
    throw new LmsConfigErro(r?.codigo ?? "ERRO", r?.mensagem ?? "Não foi possível concluir a operação.");
  }
  return data as T;
}

export async function obterConfigLms(tenantId: string, empresaId: string, armazemId: string | null): Promise<ConfigLms> {
  const { data, error } = await sb.rpc("rpc_lms_config_obter", {
    p_tenant_id: tenantId, p_empresa_id: empresaId, p_armazem_id: armazemId,
  });
  return exigirSucesso<ConfigLms>(data, error);
}

export interface SalvarRegraInput {
  tenantId: string;
  empresaId: string;
  armazemId: string | null;
  tipo: "PARAMETRO" | "PADRAO_TEMPO";
  chave: string;
  /** null = volta a herdar do nível de cima a partir da data */
  valor: number | null;
  vigenteDesde: string;
  motivo?: string;
}

export interface SalvarRegraResultado {
  sucesso: true;
  id: string;
  vigente_desde: string;
  requer_reprocessamento: boolean;
  mensagem: string;
}

export async function salvarRegraLms(i: SalvarRegraInput): Promise<SalvarRegraResultado> {
  const { data, error } = await sb.rpc("rpc_lms_config_salvar", {
    p_tenant_id: i.tenantId, p_empresa_id: i.empresaId, p_armazem_id: i.armazemId,
    p_tipo: i.tipo, p_chave: i.chave, p_valor: i.valor, p_vigente_desde: i.vigenteDesde,
    p_motivo: i.motivo?.trim() || null,
  });
  return exigirSucesso<SalvarRegraResultado>(data, error);
}

export interface FaixaEntrada { nome: string; cor: CorFaixa; a_partir_de_pct: number; eh_meta: boolean }

/** Grava o conjunto de faixas do nível (null = volta a herdar a partir da data). */
export async function salvarFaixasLms(i: {
  tenantId: string; empresaId: string; armazemId: string | null;
  faixas: FaixaEntrada[] | null; vigenteDesde: string; motivo?: string;
}): Promise<SalvarRegraResultado> {
  const { data, error } = await sb.rpc("rpc_lms_config_salvar_faixas", {
    p_tenant_id: i.tenantId, p_empresa_id: i.empresaId, p_armazem_id: i.armazemId,
    p_faixas: i.faixas, p_vigente_desde: i.vigenteDesde, p_motivo: i.motivo?.trim() || null,
  });
  return exigirSucesso<SalvarRegraResultado>(data, error);
}

/** Mesmas regras do banco, para retorno imediato no editor. */
export function validarFaixas(faixas: FaixaEntrada[]): string | null {
  if (faixas.length < 2 || faixas.length > 6) return "Use de 2 a 6 faixas.";
  const nomes = new Set<string>();
  const limites = new Set<number>();
  for (const f of faixas) {
    const nome = f.nome.trim();
    if (!nome || nome.length > 30) return "Cada faixa precisa de um nome de até 30 caracteres.";
    if (nomes.has(nome.toLowerCase())) return `O nome "${nome}" está repetido.`;
    nomes.add(nome.toLowerCase());
    if (!Number.isFinite(f.a_partir_de_pct) || f.a_partir_de_pct < 0 || f.a_partir_de_pct > 300) return `"${nome}": o limite deve ficar entre 0% e 300%.`;
    if (limites.has(f.a_partir_de_pct)) return "Duas faixas não podem começar no mesmo percentual.";
    limites.add(f.a_partir_de_pct);
  }
  if (faixas.filter((f) => f.a_partir_de_pct === 0).length !== 1) return "A faixa mais baixa precisa começar em 0%.";
  if (faixas.filter((f) => f.eh_meta).length !== 1) return "Marque exatamente uma faixa como meta.";
  return null;
}

export async function excluirRegraAgendada(tenantId: string, tipo: "PARAMETRO" | "PADRAO_TEMPO" | "FAIXAS", id: string): Promise<void> {
  const { data, error } = await sb.rpc("rpc_lms_config_excluir_agendada", { p_tenant_id: tenantId, p_tipo: tipo, p_id: id });
  exigirSucesso(data, error);
}

export async function reprocessarLms(tenantId: string, dataIni: string): Promise<{ dias: number; linhas: number }> {
  const { data, error } = await sb.rpc("rpc_lms_config_reprocessar", { p_tenant_id: tenantId, p_data_ini: dataIni });
  return exigirSucesso<{ dias: number; linhas: number }>(data, error);
}

// ---------------------------------------------------------------- exibição

export const ROTULO_GRUPO: Record<GrupoParametro, { titulo: string; descricao: string }> = {
  CLASSIFICACAO: { titulo: "Classificação", descricao: "Faixas de performance usadas no relatório, nos painéis e no coletor." },
  JORNADA: { titulo: "Tempo e jornada", descricao: "Como o painel de operadores interpreta trânsito, ociosidade e tarefa parada." },
  QUALIDADE: { titulo: "Qualidade do dado", descricao: "Quando os números contam como reais e quando uma execução é suspeita." },
  CALIBRACAO: { titulo: "Sugestão de tempo padrão", descricao: "Quanto histórico a sugestão analisa e quantas execuções reais ela exige." },
};

export const ROTULO_NIVEL: Record<NivelRegra, string> = {
  SISTEMA: "Padrão do sistema",
  CADASTRO: "Cadastro do tipo de tarefa",
  EMPRESA: "Empresa",
  ARMAZEM: "Este armazém",
};

/** Texto da origem do valor, do ponto de vista do nível que está sendo editado. */
export function descreverOrigem(nivelValor: NivelRegra, nivelTela: "EMPRESA" | "ARMAZEM"): string {
  if (nivelValor === nivelTela) return nivelTela === "EMPRESA" ? "Definido na empresa" : "Definido neste armazém";
  if (nivelValor === "EMPRESA") return "Herdado da empresa";
  if (nivelValor === "CADASTRO") return "Herdado do cadastro do tipo";
  return "Padrão do sistema";
}

export function formatarValor(valor: number | null | undefined, unidade: UnidadeParametro | "TEMPO"): string {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return "—";
  const v = Number(valor);
  if (unidade === "PERCENTUAL") return `${v.toLocaleString("pt-BR")}%`;
  if (unidade === "MULTIPLO") return `${v.toLocaleString("pt-BR")}×`;
  if (unidade === "DIAS") return `${v.toLocaleString("pt-BR")} ${v === 1 ? "dia" : "dias"}`;
  if (unidade === "QUANTIDADE") return `${v.toLocaleString("pt-BR")} ${v === 1 ? "execução" : "execuções"}`;
  return formatarSegundos(v);
}

export function formatarSegundos(total: number): string {
  const s = Math.round(total);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return r ? `${h} h ${m} min ${r} s` : m ? `${h} h ${m} min` : `${h} h`;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** Valida no navegador só para dar retorno imediato; o banco valida de novo. */
export function validarValor(p: Pick<ParametroConfig, "minimo" | "maximo" | "rotulo">, valor: number | null): string | null {
  if (valor === null) return null;
  if (!Number.isFinite(valor)) return "Informe um número.";
  if (valor < p.minimo || valor > p.maximo) return `Use um valor entre ${p.minimo} e ${p.maximo}.`;
  return null;
}

export function ehRetroativa(vigenteDesde: string, hoje: string): boolean {
  return vigenteDesde < hoje;
}

// ---------------------------------------------------------------- Fase 8: padrão em três partes

/** Segundos com até 2 casas, sem arredondar para minutos (tempos curtos por unidade). */
export function formatarSegundosCurto(v: number): string {
  return `${Number(v.toFixed(2)).toLocaleString("pt-BR")} s`;
}

/** "2 min + 3 s/un · folga 10%" — mesma leitura em todas as telas. */
export function descreverPadrao(p: PartesPadrao | null | undefined, unidadeMedida?: string | null): string {
  if (!p) return "—";
  const fixo = Number(p.tempo_fixo_seg ?? 0);
  const un = Number(p.tempo_unidade_seg ?? 0);
  const pfd = Number(p.pfd_pct ?? 0);
  const partes: string[] = [];
  if (fixo > 0) partes.push(formatarSegundos(fixo));
  if (un > 0) partes.push(`${formatarSegundosCurto(un)}/${(unidadeMedida || "un").toLowerCase()}`);
  if (partes.length === 0) return "sem padrão";
  return partes.join(" + ") + (pfd > 0 ? ` · folga ${pfd.toLocaleString("pt-BR")}%` : "");
}

/** Horas padrão de uma execução — mesma fórmula de fn_lms_hp_seg no banco (só para prévia). */
export function horasPadraoSeg(p: PartesPadrao, qtd: number, req: number | null = null): number {
  const fator = req && req > 0 ? Math.min(1, qtd / req) : 1;
  const base = Number(p.tempo_fixo_seg ?? 0) * fator + Number(p.tempo_unidade_seg ?? 0) * Math.max(qtd, 0);
  return base * (1 + Number(p.pfd_pct ?? 0) / 100);
}

/** Mesmas regras de rpc_lms_config_salvar_padrao, para retorno imediato. */
export function validarPadrao(p: { fixo: number; unidade: number; pfd: number }): string | null {
  if (![p.fixo, p.unidade, p.pfd].every(Number.isFinite)) return "Informe números válidos.";
  if (p.fixo < 0 || p.fixo > 86400) return "O tempo por tarefa deve ficar entre 0 e 24 horas.";
  if (p.unidade < 0 || p.unidade > 3600) return "O tempo por unidade deve ficar entre 0 e 3.600 segundos.";
  if (p.pfd < 0 || p.pfd > 50) return "A folga (PFD) deve ficar entre 0% e 50%.";
  if (p.fixo === 0 && p.unidade === 0) return "Informe o tempo por tarefa ou o tempo por unidade.";
  return null;
}

export async function salvarPadraoLms(i: {
  tenantId: string; empresaId: string; armazemId: string | null; tipoTarefaId: string;
  /** null = volta a herdar */
  partes: { fixo: number; unidade: number; pfd: number } | null;
  origem: "MANUAL" | "CALIBRADO"; vigenteDesde: string; motivo?: string;
}): Promise<SalvarRegraResultado> {
  const { data, error } = await sb.rpc("rpc_lms_config_salvar_padrao", {
    p_tenant_id: i.tenantId, p_empresa_id: i.empresaId, p_armazem_id: i.armazemId, p_tipo_tarefa_id: i.tipoTarefaId,
    p_tempo_fixo_seg: i.partes ? i.partes.fixo : null,
    p_tempo_unidade_seg: i.partes ? i.partes.unidade : 0,
    p_pfd_pct: i.partes ? i.partes.pfd : 0,
    p_origem: i.origem, p_vigente_desde: i.vigenteDesde, p_motivo: i.motivo?.trim() || null,
  });
  return exigirSucesso<SalvarRegraResultado>(data, error);
}

export interface SugestaoPadrao {
  sucesso: true;
  suficiente: boolean;
  mensagem: string;
  amostra: { dias: number; de: string; ate: string; encontradas: number; usadas: number; descartadas: number; minimo: number; operadores: number };
  observado: { mediana_seg: number; p25_seg: number; p75_seg: number; quantidade_media: number; variacao_quantidade: number | null } | null;
  atual: PartesPadrao & { nivel: NivelRegra; origem: string };
  sugestao: { modelo: "FIXO" | "FIXO_MAIS_UNIDADE"; tempo_fixo_seg: number; tempo_unidade_seg: number; pfd_pct: number; r2: number | null } | null;
  impacto: {
    atual: { performance_mediana_pct: number | null; performance_total_pct: number | null };
    sugerido: { performance_mediana_pct: number | null; performance_total_pct: number | null };
  } | null;
}

export async function sugerirPadraoLms(i: {
  tenantId: string; empresaId: string; armazemId: string | null; tipoTarefaId: string; dias?: number | null; pfd?: number | null;
}): Promise<SugestaoPadrao> {
  const { data, error } = await sb.rpc("rpc_lms_padrao_sugerir", {
    p_tenant_id: i.tenantId, p_empresa_id: i.empresaId, p_armazem_id: i.armazemId, p_tipo_tarefa_id: i.tipoTarefaId,
    p_dias: i.dias ?? null, p_pfd_pct: i.pfd ?? null,
  });
  return exigirSucesso<SugestaoPadrao>(data, error);
}

// ---------------------------------------------------------------- Fase 8: atividades indiretas e paradas

export type TipoAtividade = "INDIRETA" | "EXCECAO";

export interface AtividadeIndireta {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoAtividade;
  duracao_max_min: number;
  ativo: boolean;
  ordem: number;
  usos_30d: number;
}

export const ROTULO_TIPO_ATIVIDADE: Record<TipoAtividade, { titulo: string; curto: string; efeito: string }> = {
  INDIRETA: {
    titulo: "Trabalho indireto", curto: "Indireta",
    efeito: "Trabalho útil sem tempo padrão. Conta como tempo indireto e deixa de aparecer como ocioso.",
  },
  EXCECAO: {
    titulo: "Parada fora do controle do operador", curto: "Parada",
    efeito: "Sai do tempo disponível: não pesa na utilização nem na eficiência do operador.",
  },
};

export async function listarAtividadesLms(tenantId: string, empresaId: string): Promise<{ pode_editar: boolean; atividades: AtividadeIndireta[] }> {
  const { data, error } = await sb.rpc("rpc_lms_atividades_listar", { p_tenant_id: tenantId, p_empresa_id: empresaId });
  return exigirSucesso<{ pode_editar: boolean; atividades: AtividadeIndireta[] }>(data, error);
}

export async function salvarAtividadeLms(i: {
  tenantId: string; empresaId: string; id: string | null; codigo: string; nome: string; tipo: TipoAtividade;
  duracaoMaxMin: number; ativo: boolean; ordem?: number | null;
}): Promise<{ id: string }> {
  const { data, error } = await sb.rpc("rpc_lms_atividade_salvar", {
    p_tenant_id: i.tenantId, p_empresa_id: i.empresaId, p_id: i.id, p_codigo: i.codigo, p_nome: i.nome, p_tipo: i.tipo,
    p_duracao_max_min: i.duracaoMaxMin, p_ativo: i.ativo, p_ordem: i.ordem ?? null,
  });
  return exigirSucesso<{ id: string }>(data, error);
}

export async function restaurarAtividadesPadrao(tenantId: string, empresaId: string): Promise<number> {
  const { data, error } = await sb.rpc("rpc_lms_atividades_restaurar_padrao", { p_tenant_id: tenantId, p_empresa_id: empresaId });
  return exigirSucesso<{ criadas: number }>(data, error).criadas;
}

/** Código a partir do nome: "Limpeza de doca" → "LIMPEZA_DE_DOCA". */
export function codigoDeNome(nome: string): string {
  return nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
}
