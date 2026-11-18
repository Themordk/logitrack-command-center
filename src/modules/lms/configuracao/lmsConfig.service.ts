/**
 * Fase 7 · Produtividade (LMS) › Configurações.
 * Toda regra (valor efetivo, herança, vigência, permissão) é decidida no banco
 * pelas RPCs rpc_lms_config_*; a tela só exibe e envia a alteração.
 */
import { supabase } from "@/integrations/supabase/client";

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
export type UnidadeParametro = "PERCENTUAL" | "SEGUNDOS" | "MULTIPLO";
export type GrupoParametro = "CLASSIFICACAO" | "JORNADA" | "QUALIDADE";

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

export interface PadraoTempoConfig {
  tipo_tarefa_id: string;
  codigo: string;
  descricao: string;
  unidade_medida: string | null;
  categoria: string | null;
  efetivo: { tempo_fixo_seg: number; nivel: NivelRegra; vigente_desde: string | null; origem: string };
  herdado: { tempo_fixo_seg: number; nivel: NivelRegra };
  proprio: { id: string; tempo_fixo_seg: number | null; vigente_desde: string; origem: string } | null;
  agendados: Array<{ id: string; tempo_fixo_seg: number | null; vigente_desde: string }>;
}

export interface RegraSistema {
  tipo_codigo: string;
  captura_ativa: boolean;
  teto_ciclo_seg: number;
  observacao: string | null;
}

export interface HistoricoRegra {
  tipo: "PARAMETRO" | "PADRAO_TEMPO";
  chave: string;
  rotulo: string;
  valor: number | null;
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

export async function excluirRegraAgendada(tenantId: string, tipo: "PARAMETRO" | "PADRAO_TEMPO", id: string): Promise<void> {
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
