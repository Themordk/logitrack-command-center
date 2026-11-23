/**
 * Módulo de Entregas — camada de acesso às RPCs entrega_*.
 *
 * Toda regra (quem vê, aceite, ordem, foto obrigatória, efeito do motivo, conclusão)
 * fica no backend; aqui só tipamos os contratos e normalizamos as respostas
 * { sucesso, codigo, mensagem, dados } (mesmo formato das RPCs de carga).
 */
import { supabase } from "@/integrations/supabase/client";
import { CargaRpcError, type RpcResposta } from "@/lib/cargaService";

export type EntregaStatus = "AGUARDANDO_ACEITE" | "EM_ROTA" | "CONCLUIDA" | "CANCELADA";
export type ParadaStatus = "PENDENTE" | "ENTREGUE" | "NAO_ENTREGUE";

export interface EntregaResumo {
  id: string;
  carga_id: string;
  numero_carga: number;
  status: EntregaStatus;
  veiculo: string | null;
  placa: string | null;
  tipo_veiculo: string | null;
  atribuida_em: string;
  aceita_em: string | null;
  total_paradas: number;
  paradas_entregues: number;
  paradas_nao_entregues: number;
}

export interface ParadaOcorrencia {
  id: string;
  numero: number;
  motivo: string | null;
  observacao: string | null;
  criada_em: string;
  impede_entrega: boolean | null;
  foto_path: string | null;
}

export interface EntregaParada {
  id: string;
  /** Ordem de entrega (1 = primeira parada). */
  sequencia: number;
  /** Ordem de carregamento na carga. */
  sequencia_carga: number;
  status: ParadaStatus;
  documento_saida_id: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  telefone: string | null;
  contato: string | null;
  numero_pedido: string | null;
  numero_nf: string | null;
  serie_nf: string | null;
  /** Observação do pedido (documento_saida.observacao, vinda do ERP). */
  observacao_pedido: string | null;
  entregue_em: string | null;
  recebedor_nome: string | null;
  foto_canhoto_path: string | null;
  finalizada_em: string | null;
  ocorrencia: ParadaOcorrencia | null;
  /** Entrega garantida: exige ler os volumes do pedido antes de confirmar (tipo_saida.entrega_confere_volume). */
  confere_volume?: boolean;
  volumes_total?: number;
  volumes_conferidos?: number;
  /** Volumes do pedido na carga (só quando confere_volume). */
  volumes?: EntregaVolume[];
}

export interface EntregaVolume {
  id: string;
  codigo: string;
  descricao: string | null;
  tipo: string;
  sequencia: number;
  embarcada: boolean;
  conferido_em: string | null;
  digitado: boolean | null;
}

export interface ConferenciaVolumeResultado {
  total: number;
  conferidos: number;
  codigo: string;
  entrega: EntregaDetalhe;
}

export interface EntregaDetalhe {
  id: string;
  carga_id: string;
  numero_carga: number;
  status: EntregaStatus;
  usuario_id: string;
  usuario_nome: string | null;
  veiculo_id: string | null;
  veiculo: string | null;
  placa: string | null;
  tipo_veiculo: string | null;
  atribuida_em: string;
  aceita_em: string | null;
  concluida_em: string | null;
  cancelada_em: string | null;
  motivo_cancelamento: string | null;
  carga_fechada_em: string | null;
  /** Status atual da carga (entrega gerada com a carga montada pode chegar antes do fim do carregamento). */
  carga_status?: string;
  total_paradas: number;
  paradas_entregues: number;
  paradas_nao_entregues: number;
  proxima_parada_id: string | null;
  paradas: EntregaParada[];
}

export interface MotivoEntrega {
  id: string;
  descricao: string;
  exige_observacao: boolean;
  impede_entrega: boolean;
}

export interface Entregador {
  id: string;
  nome: string;
  login: string;
}

export interface EntregaEvento {
  tipo: string;
  ocorrido_em: string;
  usuario: string | null;
  parada_id: string | null;
  entrega_id: string;
  /** 1 = primeira saída da carga. */
  numero_saida: number;
  sequencia_parada: number | null;
  dados: Record<string, unknown>;
}

/** Tentativa na porta do cliente (entrega_tentativa): nunca some; o estorno só a marca. */
export interface EntregaTentativa {
  id: string;
  entrega_id: string;
  parada_id: string;
  numero_tentativa: number;
  resultado: "ENTREGUE" | "NAO_ENTREGUE";
  registrada_em: string;
  entregador: string | null;
  cliente: string | null;
  numero_pedido: string | null;
  motivo: string | null;
  ocorrencia_numero: number | null;
  ressalvas: { ocorrencia_id: string; numero: number | null; motivo_id: string; motivo: string }[];
  foto_path: string | null;
  recebedor_nome: string | null;
  fora_de_ordem: boolean;
  estornada_em: string | null;
  estornada_por: string | null;
  motivo_estorno: string | null;
  origem: "APP" | "RECONSTRUIDA";
}

export type EntregaSaida = EntregaDetalhe & { numero_saida: number };

export interface EntregaDaCarga {
  carga_status?: string;
  /** Saída atual (a ativa ou, sem ativa, a mais recente). */
  entrega: EntregaDetalhe | null;
  /** Todas as saídas da carga, da primeira à última (canceladas incluídas). */
  saidas: EntregaSaida[];
  tentativas: EntregaTentativa[];
  veiculo_entregador: string | null;
  motivo_sem_entrega: string | null;
  pode_gerar: boolean;
  pode_gerenciar: boolean;
  eventos: EntregaEvento[];
}

export interface Posicao {
  latitude: number;
  longitude: number;
  precisao: number;
}

function normalizar<T>(data: unknown): RpcResposta<T> {
  const valor = typeof data === "string" ? (JSON.parse(data) as unknown) : data;
  if (!valor || typeof valor !== "object") {
    throw new CargaRpcError("RESPOSTA_INVALIDA", "O servidor devolveu uma resposta inesperada.");
  }
  return valor as RpcResposta<T>;
}

/** As RPCs de entrega ainda não estão nos tipos gerados (types.ts): cast único e localizado aqui. */
async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<RpcResposta<T>> {
  const rpc = supabase.rpc as unknown as (
    nome: string,
    parametros: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc.call(supabase, fn, args);
  if (error) throw error;
  const r = normalizar<T>(data);
  if (!r.sucesso) throw new CargaRpcError(r.codigo, r.mensagem ?? "");
  return r;
}

const ler = async <T,>(fn: string, args: Record<string, unknown>) => (await chamar<T>(fn, args)).dados as T;

const pos = (p?: Posicao | null) => ({
  p_latitude: p ? Number(p.latitude.toFixed(6)) : null,
  p_longitude: p ? Number(p.longitude.toFixed(6)) : null,
});

export const entregaService = {
  // ----- coletor -----
  minhas: (tenantId: string, usuarioId: string) =>
    ler<EntregaResumo[]>("entrega_minhas_listar", { p_tenant_id: tenantId, p_usuario_id: usuarioId }),

  detalhe: (tenantId: string, usuarioId: string, entregaId: string) =>
    ler<EntregaDetalhe>("entrega_detalhe", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_entrega_id: entregaId }),

  aceitar: (tenantId: string, usuarioId: string, entregaId: string, posicao?: Posicao | null) =>
    chamar<EntregaDetalhe>("entrega_aceitar", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_entrega_id: entregaId, ...pos(posicao) }),

  confirmar: (tenantId: string, usuarioId: string, paradaId: string, fotoPath: string, recebedor: string, posicao?: Posicao | null) =>
    chamar<EntregaDetalhe>("entrega_parada_confirmar", {
      p_tenant_id: tenantId, p_usuario_id: usuarioId, p_parada_id: paradaId, p_foto_path: fotoPath,
      p_recebedor_nome: recebedor.trim() || null, ...pos(posicao),
      p_precisao_m: posicao ? Math.round(posicao.precisao) : null,
    }),

  conferirVolume: (tenantId: string, usuarioId: string, paradaId: string, codigo: string, digitado: boolean, posicao?: Posicao | null) =>
    chamar<ConferenciaVolumeResultado>("entrega_parada_conferir_volume", {
      p_tenant_id: tenantId, p_usuario_id: usuarioId, p_parada_id: paradaId, p_codigo: codigo.trim(), p_digitado: digitado, ...pos(posicao),
    }),

  motivos: (tenantId: string, usuarioId: string) =>
    ler<MotivoEntrega[]>("entrega_motivos_listar", { p_tenant_id: tenantId, p_usuario_id: usuarioId }),

  ocorrencia: (tenantId: string, usuarioId: string, paradaId: string, motivoId: string, observacao: string, fotoPath: string, posicao?: Posicao | null) =>
    chamar<EntregaDetalhe>("entrega_parada_ocorrencia", {
      p_tenant_id: tenantId, p_usuario_id: usuarioId, p_parada_id: paradaId, p_motivo_id: motivoId,
      p_observacao: observacao.trim() || null, p_foto_path: fotoPath, ...pos(posicao),
      p_precisao_m: posicao ? Math.round(posicao.precisao) : null,
    }),

  // ----- web -----
  entregadores: (tenantId: string) =>
    ler<Entregador[]>("entrega_entregadores_listar", { p_tenant_id: tenantId }),

  daCarga: (tenantId: string, usuarioId: string | null, cargaId: string) =>
    ler<EntregaDaCarga>("entrega_carga_detalhe", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_carga_id: cargaId }),

  gerarManual: (tenantId: string, usuarioId: string | null, cargaId: string) =>
    chamar<EntregaDetalhe>("entrega_gerar_manual", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_carga_id: cargaId }),

  reatribuir: (tenantId: string, usuarioId: string | null, entregaId: string, novoUsuarioId: string, motivo: string) =>
    chamar<EntregaDetalhe>("entrega_reatribuir", {
      p_tenant_id: tenantId, p_usuario_id: usuarioId, p_entrega_id: entregaId, p_novo_usuario_id: novoUsuarioId, p_motivo: motivo,
    }),

  cancelar: (tenantId: string, usuarioId: string | null, entregaId: string, motivo: string) =>
    chamar<EntregaDetalhe>("entrega_cancelar", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_entrega_id: entregaId, p_motivo: motivo }),

  estornarParada: (tenantId: string, usuarioId: string | null, paradaId: string, motivo: string) =>
    chamar<EntregaDetalhe>("entrega_parada_estornar", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_parada_id: paradaId, p_motivo: motivo }),
};
