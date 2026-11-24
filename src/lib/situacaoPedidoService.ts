import { supabase } from "@/integrations/supabase/client";
import type { IntegracaoDocumento } from "@/lib/integracaoStatus";
import type { CartaoAcompanhamento, EntregaPedido, EtapaPedido } from "@/lib/situacaoPedido";

/** Linha do Acompanhamento de Pedidos (rpc_pedidos_acompanhamento). */
export interface PedidoAcompanhamento {
  id: string;
  numero_pedido: number | null;
  codigo_erp: string | null;
  data_emissao: string | null;
  status: number;
  cliente: string | null;
  cidade: string | null;
  uf: string | null;
  tipo_saida: string | null;
  numero_nf: string | null;
  etapa: EtapaPedido;
  etapa_em: string | null;
  onda_numero: number | null;
  carga_numero: number | null;
  entrega_status: EntregaPedido;
  entrega_em: string | null;
  entrega_motivo: string | null;
  entrega_tentativas: number;
  integracao: IntegracaoDocumento;
}

export interface AcompanhamentoResposta {
  total: number;
  pagina: number;
  tamanho: number;
  cartoes: Record<CartaoAcompanhamento | "entregues" | "em_rota" | "total", number>;
  linhas: PedidoAcompanhamento[];
}

export interface FiltrosAcompanhamento {
  empresaId: string;
  dataDe?: string | null;
  dataAte?: string | null;
  busca?: string | null;
  etapas?: EtapaPedido[];
  entregas?: EntregaPedido[];
  integracoes?: string[];
  cartao?: CartaoAcompanhamento | null;
  pagina?: number;
  tamanho?: number;
}

/** Situação completa de um pedido (rpc_pedido_situacao). */
export interface SituacaoPedido {
  documento_id: string;
  status: number;
  etapa: EtapaPedido;
  etapa_em: string | null;
  entrega_status: EntregaPedido;
  entrega_em: string | null;
  entrega_motivo: string | null;
  entrega_tentativas: number;
  integracao: IntegracaoDocumento | null;
  onda: { id: string; numero: number; status: string } | null;
  carga: {
    id: string; numero: number; status: string; modalidade: string | null; ativo: boolean;
    embarcado_em: string | null; placa: string | null; veiculo: string | null; motorista: string | null;
    liberada_em: string | null; fechada_em: string | null; transportadora: string | null;
  } | null;
  entrega: {
    id: string; status: string; entregador: string | null; atribuida_em: string | null; aceita_em: string | null;
    concluida_em: string | null; parada_status: string | null; parada_sequencia: number | null; recebedor_nome: string | null;
  } | null;
  tentativas: {
    id: string; numero: number; resultado: "ENTREGUE" | "NAO_ENTREGUE"; registrada_em: string; entregador: string | null;
    motivo: string | null; recebedor_nome: string | null; estornada_em: string | null; motivo_estorno: string | null;
  }[];
}

// RPCs novas (S2) ainda fora dos tipos gerados do Supabase.
type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
const rpc = (supabase as unknown as { rpc: RpcFn }).rpc.bind(supabase);

const vazio = <T,>(a: T[] | undefined | null) => (a && a.length ? a : null);

export async function listarAcompanhamento(f: FiltrosAcompanhamento): Promise<AcompanhamentoResposta> {
  const { data, error } = await rpc("rpc_pedidos_acompanhamento", {
    p_empresa_id: f.empresaId,
    p_data_de: f.dataDe || null,
    p_data_ate: f.dataAte || null,
    p_busca: f.busca?.trim() || null,
    p_etapas: vazio(f.etapas),
    p_entregas: vazio(f.entregas),
    p_integracoes: vazio(f.integracoes),
    p_cartao: f.cartao ?? null,
    p_page: f.pagina ?? 1,
    p_page_size: f.tamanho ?? 50,
  });
  if (error) throw error;
  return data as AcompanhamentoResposta;
}

export async function obterSituacaoPedido(documentoId: string): Promise<SituacaoPedido> {
  const { data, error } = await rpc("rpc_pedido_situacao", { p_documento_id: documentoId });
  if (error) throw error;
  return data as SituacaoPedido;
}

export const situacaoPedidoKeys = {
  lista: (f: FiltrosAcompanhamento) => ["pedidos-acompanhamento", f] as const,
  todas: ["pedidos-acompanhamento"] as const,
  pedido: (id: string) => ["pedido-situacao", id] as const,
};
