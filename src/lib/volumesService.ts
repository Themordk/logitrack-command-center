/**
 * Tela Atividades › Volumes (Fase 4 do plano de etiqueta de volume).
 * Toda regra (filtros, cards, permissão, reimpressão com motivo, cancelamento, correções)
 * vive nas RPCs rpc_volume_* / rpc_volumes_listar / fn_cancelar_volume_expedicao.
 * Este serviço só chama e tipa o retorno.
 */
import { supabase } from "@/integrations/supabase/client";

export type StatusVolume = "ABERTO" | "FECHADO" | "CONFERIDO" | "EXPEDIDO" | "CANCELADO";
export type SituacaoVolume =
  | "SEM_PEDIDO" | "SEM_NF" | "NF_DIVERGENTE" | "NUNCA_IMPRESSO" | "ERRO_IMPRESSAO" | "EM_CARGA" | "EMBARCADO";

export interface FiltrosVolumes {
  status?: StatusVolume | "";
  situacao?: SituacaoVolume | "";
  numero_onda?: string;
  pedido?: string;
  nf?: string;
  cliente?: string;
  numero_carga?: string;
  data_de?: string;
  data_ate?: string;
  busca?: string;
}

export interface VolumeLinha {
  id: string;
  codigo_volume: string;
  numero_volume: number | null;
  total_volumes_pedido: number | null;
  status: StatusVolume;
  peso_bruto: number | null;
  m3: number | null;
  created_at: string;
  criado_por_nome: string | null;
  movimento_saida_id: string | null;
  documento_saida_id: string | null;
  numero_onda: number | null;
  numero_pedido: number | null;
  parceiro_nome: string | null;
  parceiro_cidade: string | null;
  parceiro_uf: string | null;
  destino_carga: string | null;
  nf_id: string | null;
  nf_numero: string | null;
  nf_serie: string | null;
  nf_qtd_volumes: number | null;
  carga_id: string | null;
  numero_carga: number | null;
  embarque_status: string | null;
  embarcada_em: string | null;
  etiqueta_impressoes: number | null;
  etiqueta_ultimo_status: string | null;
  etiqueta_ultima_em: string | null;
  sem_pedido?: boolean;
  sem_nf?: boolean;
  nf_divergente?: boolean;
  nunca_impresso?: boolean;
  erro_impressao?: boolean;
  /** Só em cancelados */
  motivo_cancelamento?: string;
  cancelado_em?: string;
  cancelado_por_nome?: string | null;
  status_anterior?: string | null;
}

export interface ResumoVolumes {
  total: number;
  nunca_impresso: number;
  erro_impressao: number;
  sem_pedido: number;
  sem_nf: number;
  nf_divergente: number;
  em_carga: number;
  embarcados: number;
  expedidos: number;
  abertos: number;
  cancelados: number;
}

export interface ListaVolumes {
  linhas: VolumeLinha[];
  total: number;
  pagina: number;
  tamanho: number;
  resumo: ResumoVolumes;
}

export interface ImpressaoVolume {
  id: string;
  status: string;
  origem: string | null;
  criado_em: string;
  impresso_em: string | null;
  erro_mensagem: string | null;
  tentativas: number | null;
  quantidade_copias: number | null;
  impressora_nome: string | null;
  template_nome: string | null;
  solicitado_por_nome: string | null;
  motivo: string | null;
  nota_fiscal: string | null;
}

export interface DetalheVolume {
  volume: VolumeLinha & Record<string, unknown>;
  cancelamento: { motivo: string; cancelado_em: string; status_anterior: string | null; cancelado_por_nome: string | null } | null;
  etiqueta: Record<string, string> | null;
  conferencia_nf: {
    nota_fiscal: string | null; nf_qtd_volumes: number | null; wms_volumes: number; regra: string; divergente: boolean;
  } | null;
  pedidos_da_onda: { documento_saida_id: string; numero_pedido: number | null; parceiro_nome: string | null }[];
  volumes_do_pedido: { id: string; codigo_volume: string; numero_volume: number | null; status: string }[];
  impressoes: ImpressaoVolume[];
  embarque: {
    carga_id: string; numero_carga: number; carga_status: string; unidade_status: string;
    embarcada_em: string | null; embarcada_por_nome: string | null; incluida_em: string;
  }[];
  ocorrencias: { id: string; numero: number | null; status: string; prioridade: string; observacao: string | null; criado_em: string }[];
}

export interface AvisoVolume { codigo: string; mensagem: string }

export interface RespostaVolume<T> {
  sucesso: boolean;
  codigo: string;
  mensagem?: string;
  dados?: T;
  avisos?: AvisoVolume[];
  ja_impressos?: string[];
}

/** Erro de negócio devolvido pela RPC ({sucesso:false, codigo, mensagem}). */
export class VolumeRpcError extends Error {
  constructor(public codigo: string, mensagem: string, public resposta?: RespostaVolume<unknown>) {
    super(mensagem);
    this.name = "VolumeRpcError";
  }
}

async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<RespostaVolume<T>> {
  // RPCs novas ainda não estão nos tipos gerados do Supabase.
  const rpc = supabase.rpc as unknown as (nome: string, parametros: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc(fn, args);
  if (error) throw error;
  const r = (typeof data === "string" ? JSON.parse(data) : data) as RespostaVolume<T> | null;
  if (!r || typeof r !== "object") throw new VolumeRpcError("RESPOSTA_INVALIDA", "O servidor devolveu uma resposta inesperada.");
  return r;
}

async function agir<T>(fn: string, args: Record<string, unknown>): Promise<RespostaVolume<T>> {
  const r = await chamar<T>(fn, args);
  if (!r.sucesso) throw new VolumeRpcError(r.codigo, r.mensagem ?? "Não foi possível concluir a ação.", r as RespostaVolume<unknown>);
  return r;
}

/** Remove filtros vazios antes de enviar. */
export function limparFiltros(f: FiltrosVolumes): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) out[k] = t;
  }
  return out;
}

export const volumesService = {
  listar: async (empresaId: string | null, filtros: FiltrosVolumes, pagina: number, tamanho: number) =>
    (await agir<ListaVolumes>("rpc_volumes_listar", {
      p_empresa_id: empresaId, p_filtros: limparFiltros(filtros), p_pagina: pagina, p_tamanho: tamanho,
    })).dados as ListaVolumes,

  /** Todas as linhas dos filtros (para exportar), em páginas de 500. */
  listarTodos: async (empresaId: string | null, filtros: FiltrosVolumes, limite = 10000): Promise<VolumeLinha[]> => {
    const out: VolumeLinha[] = [];
    for (let pagina = 1; out.length < limite; pagina++) {
      const r = await volumesService.listar(empresaId, filtros, pagina, 500);
      out.push(...r.linhas);
      if (r.linhas.length < 500 || out.length >= r.total) break;
    }
    return out;
  },

  detalhe: async (volumeId: string) =>
    (await agir<DetalheVolume>("rpc_volume_detalhe", { p_volume_id: volumeId })).dados as DetalheVolume,

  /** Devolve a resposta inteira: MOTIVO_REIMPRESSAO_OBRIGATORIO e falhas de impressora são tratados pela tela. */
  imprimir: (p: { volumeIds: string[]; armazemId: string; impressoraId: string | null; templateId: string | null; copias: number; motivo?: string | null }) =>
    chamar<{ enviados: number; falhas: { codigo_volume: string; erro: string }[]; impressora_nome: string | null; aviso?: string | null; reimpressoes?: number; interrompido?: boolean }>(
      "rpc_volume_imprimir", {
        p_volume_ids: p.volumeIds, p_armazem_id: p.armazemId, p_impressora_id: p.impressoraId,
        p_template_id: p.templateId, p_copias: p.copias, p_motivo: p.motivo?.trim() || null,
      }),

  reenviarJob: (jobId: string) => agir<{ job_id: string }>("rpc_volume_reenviar_job", { p_job_id: jobId }),

  cancelar: (volumeId: string, motivo: string) =>
    agir<{ codigo_volume: string; jobs_cancelados: number; volumes_restantes: { id: string; codigo_volume: string; numero_volume: number | null }[] }>(
      "fn_cancelar_volume_expedicao", { p_volume_id: volumeId, p_motivo: motivo.trim() }),

  vincularPedido: (volumeId: string, documentoSaidaId: string) =>
    agir<{ numero_volume: number }>("rpc_volume_vincular_pedido", { p_volume_id: volumeId, p_documento_saida_id: documentoSaidaId }),

  acrescentar: (movimentoSaidaId: string, documentoSaidaId: string, quantidade: number, motivo: string) =>
    agir<{ novos: string[]; volumes_do_pedido: string[]; carga: number | null }>("rpc_volume_acrescentar", {
      p_movimento_saida_id: movimentoSaidaId, p_documento_saida_id: documentoSaidaId,
      p_quantidade: quantidade, p_motivo: motivo.trim(),
    }),

  registrarMedidas: (volumeIds: string[], pesoBruto: number | null, m3: number | null) =>
    agir<{ atualizados: number }>("rpc_volume_registrar_medidas", { p_volume_ids: volumeIds, p_peso_bruto: pesoBruto, p_m3: m3 }),
};
