/**
 * Fluxo de Expedição · F6 Embarque — camada de acesso às RPCs de carga.
 *
 * Toda regra (elegibilidade, veículo/box, ordem, unidade de outra carga, fechamento)
 * fica no backend; aqui só tipamos os contratos e normalizamos as respostas
 * { sucesso, codigo, mensagem, dados, avisos }.
 */
import { supabase } from "@/integrations/supabase/client";

export type CargaStatus = "EM_MONTAGEM" | "LIBERADA" | "EM_CARREGAMENTO" | "FECHADA" | "CANCELADA";
export type UnidadeEmbarque = "VOLUME" | "HU" | "DOCUMENTO" | "CONFIRMACAO";
export type UnidadeStatus = "PENDENTE" | "EMBARCADA" | "CANCELADA";
/** PROPRIA = veículo do cadastro de veículos; TERCEIRO = transportadora (parceiro marcado como transportador). */
export type ModalidadeTransporte = "PROPRIA" | "TERCEIRO";

export interface TransportadoraOpcao {
  id: string;
  razaosocial: string;
  nome_fantasia: string | null;
  cnpj: string | null;
}

export interface RpcAviso { codigo: string; mensagem: string }

export interface RpcResposta<T> {
  sucesso: boolean;
  codigo: string;
  mensagem?: string;
  dados?: T;
  avisos?: RpcAviso[];
  aviso?: RpcAviso | null;
}

export interface OndaSugerida {
  movimento_saida_id: string;
  numero_onda: number;
  status: string;
  prioridade: string | null;
  veiculo_id: string | null;
  veiculo: string | null;
  placa: string | null;
  box_id: string | null;
  box: string | null;
  /** Transportadora reconhecida nos pedidos da onda (texto do ERP casado com o cadastro de parceiros). */
  transportadora_id: string | null;
  transportadora: string | null;
  /** Quantidade de transportadoras diferentes reconhecidas na onda (>1 = não cabe numa carga só). */
  transportadoras: number;
  rota: string | null;
  tipo_saida: string | null;
  parceiros: string | null;
  peso_total: number | null;
  m3: number | null;
  documentos: number;
  volumes: number;
  created_at: string | null;
  grupo_chave: string;
  grupo_rotulo: string;
}

export interface SugestaoCarga {
  criterio: "ROTA" | "PARCEIRO" | null;
  ondas: OndaSugerida[];
}

export interface CargaResumo {
  id: string;
  numero_carga: number;
  status: CargaStatus;
  unidade_embarque: UnidadeEmbarque | null;
  modalidade: ModalidadeTransporte;
  transportadora: string | null;
  veiculo: string | null;
  placa: string | null;
  box: string | null;
  motorista: string | null;
  peso_total: number;
  m3_total: number;
  ondas: number;
  documentos: number;
  unidades_total: number;
  unidades_embarcadas: number;
  created_at: string;
  liberada_em: string | null;
  fechada_em: string | null;
}

export interface CargaDocumento {
  carga_documento_id: string;
  sequencia: number;
  documento_saida_id: string;
  numero_pedido: number | null;
  codigo_erp: string | null;
  valor_pedido: number | null;
  parceiro: string | null;
  cidade: string | null;
  uf: string | null;
  /** Transportadora como veio do ERP no pedido. */
  transportador_erp: string | null;
  movimento_saida_id: string;
  numero_onda: number;
  unidades_total: number;
  unidades_embarcadas: number;
  embarcado_em: string | null;
}

export interface CargaDetalhe {
  id: string;
  numero_carga: number;
  status: CargaStatus;
  empresa_id: string;
  modalidade: ModalidadeTransporte;
  /** Placa digitada (transportadora) ou a do veículo próprio. */
  placa: string | null;
  motorista: string | null;
  motorista_documento: string | null;
  observacao: string | null;
  unidade_embarque: UnidadeEmbarque | null;
  peso_total: number;
  m3_total: number;
  volumes_total: number;
  pallets_total: number;
  created_at: string;
  liberada_em: string | null;
  iniciada_em: string | null;
  fechada_em: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  montada_por_nome: string | null;
  fechada_por_nome: string | null;
  veiculo: { id: string; descricao: string; placa: string | null; m3: number | null; peso_total: number | null; total_pallet: number | null } | null;
  transportadora: TransportadoraOpcao | null;
  /** Transportadoras reconhecidas nos pedidos da carga (normalmente 0 ou 1). */
  transportadoras_pedidos: { id: string; nome: string }[];
  box: { id: string; descricao: string } | null;
  /** O que falta preencher para fechar (só carga de transportadora). */
  pendencias_fechamento: string[];
  capacidade: { peso_pct: number | null; m3_pct: number | null; pallets_pct: number | null; excedida: boolean };
  progresso: { total: number; embarcadas: number };
  ondas: { movimento_saida_id: string; numero_onda: number; status: string; peso_total: number | null; m3: number | null; documentos: number }[];
  documentos: CargaDocumento[];
  acoes: { editar: boolean; editar_ondas: boolean; reordenar: boolean; liberar: boolean; fechar: boolean; cancelar: boolean };
}

export interface UnidadeEmbarqueItem {
  id: string;
  tipo: UnidadeEmbarque;
  codigo: string;
  descricao: string | null;
  sequencia: number;
  status: UnidadeStatus;
  embarcada_em: string | null;
  numero_pedido: number | null;
  parceiro: string | null;
  cidade: string | null;
  numero_onda: number;
}

export interface CargaEmbarque extends CargaDetalhe {
  unidades: UnidadeEmbarqueItem[];
  proxima: UnidadeEmbarqueItem | null;
}

export interface CargaColetor {
  id: string;
  numero_carga: number;
  status: CargaStatus;
  unidade_embarque: UnidadeEmbarque | null;
  modalidade: ModalidadeTransporte;
  transportadora: string | null;
  veiculo: string | null;
  placa: string | null;
  box: string | null;
  motorista: string | null;
  documentos: number;
  unidades_total: number;
  unidades_embarcadas: number;
}

export interface BipResultado {
  unidade_id: string;
  codigo: string;
  descricao: string | null;
  documento_completo: boolean;
  total: number;
  embarcadas: number;
  carga_completa: boolean;
}

export interface Romaneio {
  empresa: { razaosocial: string | null; cnpj: string | null; url_logo: string | null };
  carga: CargaDetalhe;
  operadores: string[];
  emitido_em: string;
}

/** Erro de negócio devolvido pela RPC (sucesso = false), já no formato que o errorMapper entende. */
export class CargaRpcError extends Error {
  readonly codigo: string;
  readonly mensagem: string;
  constructor(codigo: string, mensagem: string) {
    super(mensagem || codigo);
    this.name = "CargaRpcError";
    this.codigo = codigo;
    this.mensagem = mensagem;
  }
}

function normalizar<T>(data: unknown): RpcResposta<T> {
  const valor = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
  if (!valor || typeof valor !== "object") {
    throw new CargaRpcError("RESPOSTA_INVALIDA", "O servidor devolveu uma resposta inesperada.");
  }
  return valor as RpcResposta<T>;
}

/**
 * Chama uma RPC de carga. As RPCs da F6 ainda não estão nos tipos gerados do Supabase
 * (types.ts), por isso o nome passa por um cast único e localizado aqui.
 */
async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<RpcResposta<T>> {
  const rpc = supabase.rpc as unknown as (
    nome: string,
    parametros: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabase, fn, args);
  if (error) throw error;
  return normalizar<T>(data);
}

/** Para leituras: devolve os dados ou lança CargaRpcError. */
async function ler<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await chamar<T>(fn, args);
  if (!r.sucesso) throw new CargaRpcError(r.codigo, r.mensagem ?? "");
  return r.dados as T;
}

/** Para ações: devolve a resposta inteira (avisos incluídos) ou lança CargaRpcError. */
async function agir<T>(fn: string, args: Record<string, unknown>): Promise<RpcResposta<T>> {
  const r = await chamar<T>(fn, args);
  if (!r.sucesso) throw new CargaRpcError(r.codigo, r.mensagem ?? "");
  return r;
}

// ----- web: montagem -----
export const cargaService = {
  sugerir: (tenantId: string, empresaId: string) =>
    ler<SugestaoCarga>("carga_sugerir", { p_tenant_id: tenantId, p_empresa_id: empresaId }),

  listar: (tenantId: string, empresaId: string, status: CargaStatus[] | null) =>
    ler<CargaResumo[]>("carga_listar", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_status: status, p_limite: 200 }),

  obter: (tenantId: string, cargaId: string) =>
    ler<CargaDetalhe>("carga_obter", { p_tenant_id: tenantId, p_carga_id: cargaId }),

  montar: (p: {
    tenantId: string; empresaId: string; usuarioId: string; cargaId?: string | null; ondas?: string[];
    veiculoId?: string | null; boxId?: string | null; motorista?: string | null; observacao?: string | null;
    modalidade?: ModalidadeTransporte | null; transportadoraId?: string | null;
    placa?: string | null; motoristaDocumento?: string | null;
  }) =>
    agir<CargaDetalhe>("carga_montar", {
      p_tenant_id: p.tenantId, p_empresa_id: p.empresaId, p_usuario_id: p.usuarioId,
      p_carga_id: p.cargaId ?? null, p_ondas: p.ondas ?? [],
      p_veiculo_id: p.veiculoId ?? null, p_box_id: p.boxId ?? null,
      p_motorista: p.motorista ?? null, p_observacao: p.observacao ?? null,
      p_modalidade: p.modalidade ?? null, p_transportadora_id: p.transportadoraId ?? null,
      p_placa: p.placa ?? null, p_motorista_documento: p.motoristaDocumento ?? null,
    }),

  transportadoras: (tenantId: string, empresaId: string) =>
    ler<TransportadoraOpcao[]>("carga_transportadoras", { p_tenant_id: tenantId, p_empresa_id: empresaId }),

  removerOnda: (tenantId: string, usuarioId: string, cargaId: string, movimentoSaidaId: string) =>
    agir<CargaDetalhe>("carga_remover_onda", {
      p_tenant_id: tenantId, p_usuario_id: usuarioId, p_carga_id: cargaId, p_movimento_saida_id: movimentoSaidaId,
    }),

  reordenar: (tenantId: string, usuarioId: string, cargaId: string, cargaDocumentoIds: string[]) =>
    agir<CargaDetalhe>("carga_reordenar_documentos", {
      p_tenant_id: tenantId, p_usuario_id: usuarioId, p_carga_id: cargaId, p_documentos: cargaDocumentoIds,
    }),

  liberar: (tenantId: string, usuarioId: string, cargaId: string) =>
    agir<CargaDetalhe>("carga_liberar", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_carga_id: cargaId }),

  cancelar: (tenantId: string, usuarioId: string, cargaId: string, motivo: string) =>
    agir<CargaDetalhe>("carga_cancelar", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_carga_id: cargaId, p_motivo: motivo }),

  romaneio: (tenantId: string, cargaId: string) =>
    ler<Romaneio>("carga_romaneio", { p_tenant_id: tenantId, p_carga_id: cargaId }),

  // ----- coletor: embarque -----
  buscarCargasColetor: (tenantId: string, empresaId: string, usuarioId: string) =>
    ler<CargaColetor[]>("embarque_buscar_cargas", { p_tenant_id: tenantId, p_empresa_id: empresaId, p_usuario_id: usuarioId }),

  obterCargaColetor: (tenantId: string, cargaId: string, usuarioId: string) =>
    ler<CargaEmbarque>("embarque_obter_carga", { p_tenant_id: tenantId, p_carga_id: cargaId, p_usuario_id: usuarioId }),

  bipar: (p: { tenantId: string; cargaId: string; usuarioId: string; codigo?: string; unidadeId?: string }) =>
    agir<BipResultado>("embarque_bipar_unidade", {
      p_tenant_id: p.tenantId, p_carga_id: p.cargaId, p_usuario_id: p.usuarioId,
      p_codigo: p.codigo ?? null, p_carga_unidade_id: p.unidadeId ?? null,
    }),

  fechar: (tenantId: string, cargaId: string, usuarioId: string) =>
    agir<CargaDetalhe>("embarque_fechar_carga", { p_tenant_id: tenantId, p_carga_id: cargaId, p_usuario_id: usuarioId }),
};
