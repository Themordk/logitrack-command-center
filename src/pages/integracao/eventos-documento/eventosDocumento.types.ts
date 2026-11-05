export type EntidadeDocumentoEvento = "documento_saida" | "documento_entrada";
export type DirecaoEvento = "ERP_WMS" | "WMS" | "WMS_ERP";
export type OrdemEventos = "asc" | "desc";
export type FonteEvento =
  | "documento"
  | "documento_alteracao"
  | "api_erro"
  | "documento_saida_cancelamento"
  | "documento_evento_log"
  | "documento_saida_alteracao"
  | "evento_integracao"
  | "movimento_documento_remocao"
  | "retorno_evento"
  | "retorno_execucao";

export type CategoriaEvento =
  | "registro" | "importacao" | "alteracao" | "rejeicao_api" | "cancelamento"
  | "exclusao" | "restauracao" | "alteracao_operacional" | "nf"
  | "remocao_movimento" | "operacao_wms" | "retorno_erp";

export interface EventoDocumento {
  id: string;
  seq: number;
  fonte: FonteEvento;
  direcao: DirecaoEvento;
  categoria: CategoriaEvento;
  titulo: string;
  codigo: string | null;
  situacao: string | null;
  problema: boolean;
  mensagem: string | null;
  origem: string | null;
  ator_nome: string | null;
  ocorrido_em: string | null;
  request_id: string | null;
  id_alteracao: string | null;
  pai_id: string | null;
  vinculo: "documento" | "codigo_erp";
  sintetico: boolean;
  extra: Record<string, unknown>;
  tem_detalhe: boolean;
}

export interface ResumoEventos {
  total: number; erp_wms: number; wms: number; wms_erp: number;
  problemas: number; pendentes: number;
  primeiro_em: string | null; ultimo_em: string | null;
}

export interface EventosDocumentoResposta {
  documento: { id: string; entidade: EntidadeDocumentoEvento; codigo_erp: string | null; numero: string | null; status_integracao: string | null };
  resumo: ResumoEventos;
  total_filtrado: number;
  limite: number;
  offset: number;
  eventos: EventoDocumento[];
}

export interface FiltrosEventos {
  direcao: DirecaoEvento | null;
  somenteProblemas: boolean;
  ordem: OrdemEventos;
}

export interface DetalheEventoResposta {
  fonte: FonteEvento;
  dados: Record<string, unknown>;
}

export interface EventoComNivel { evento: EventoDocumento; filho: boolean }
