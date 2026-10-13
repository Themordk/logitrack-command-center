import { supabase } from "@/integrations/supabase/client";

export interface RpcResultado<T> {
  sucesso: boolean;
  codigo: string;
  mensagem: string;
  dados: T | null;
}

export interface OperadorRef { nome?: string | null }
export interface AnaliseBloqueio { codigo: string; mensagem: string; operador?: OperadorRef | null }
export interface AnaliseItem {
  sku: string; produto?: string | null;
  qtd_documento?: number; qtd_esperada_atual?: number; qtd_esperada_nova?: number;
  acao: string;
  qtd_conferida?: number; qtd_a_estornar?: number;
  qtd_separada?: number; qtd_sep_endereco_cancelamento?: number; qtd_excedente?: number;
}
export interface AnaliseTarefa {
  tipo: string; sku?: string | null; status?: string | null;
  operador?: OperadorRef | null; qtd_atual?: number; qtd_nova?: number;
  acao: string; origem?: string | null;
}
export interface AnaliseRemocao {
  pode_remover: boolean;
  hash_analise: string;
  numero_movimento?: number | string | null;
  numero_documento?: string | null;
  status_movimento?: string | null;
  endereco_cancelamento?: string | null;
  bloqueios?: AnaliseBloqueio[];
  avisos?: { codigo: string; mensagem: string }[];
  itens?: AnaliseItem[];
  tarefas?: AnaliseTarefa[];
}
export interface ResultadoRemocao {
  status_atual?: string | null;
  numero_ocorrencia?: string | null;
  endereco_cancelamento?: string | null;
  transferencias_sugeridas?: { sku: string; quantidade: number; endereco_destino: string }[];
}

export interface RemocaoHistorico {
  id: string;
  numero_documento: string | null;
  numero_movimento?: number | string | null;
  removido_em: string | null;
  observacao: string | null;
  status_movimento: string | null;
  status_movimento_final: string | null;
  motivo: { descricao: string | null } | null;
  usuario: { nome: string | null } | null;
}

const SELECT_HIST =
  "id, numero_documento, removido_em, observacao, status_movimento, status_movimento_final, motivo:motivo_ocorrencia_id(descricao), usuario:removido_por(nome)";

// Ponto único de cast: tabelas/RPCs ainda fora de types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export async function rpc<T>(nome: string, params: Record<string, unknown>): Promise<RpcResultado<T>> {
  const { data, error } = await db.rpc(nome, params);
  if (error) throw error;
  return data as RpcResultado<T>;
}

export async function listarRemocoesMovimento(tipo: "ENTRADA" | "SAIDA", movimentoId: string): Promise<RemocaoHistorico[]> {
  const { data, error } = await db.from("movimento_documento_remocao").select(SELECT_HIST)
    .eq("tipo_movimento", tipo).eq("movimento_id", movimentoId).order("removido_em", { ascending: false });
  if (error) throw error;
  return (data || []) as RemocaoHistorico[];
}

export async function listarRemocoesDocumento(documentoId: string): Promise<RemocaoHistorico[]> {
  const { data, error } = await db.from("movimento_documento_remocao").select(`${SELECT_HIST}, numero_movimento`)
    .eq("documento_id", documentoId).order("removido_em", { ascending: false });
  if (error) {
    // numero_movimento pode não existir na tabela: tenta sem ele
    const r = await db.from("movimento_documento_remocao").select(SELECT_HIST)
      .eq("documento_id", documentoId).order("removido_em", { ascending: false });
    if (r.error) throw r.error;
    return (r.data || []) as RemocaoHistorico[];
  }
  return (data || []) as RemocaoHistorico[];
}

export async function listarMotivosRemocao(tenantId: string, etapa: string) {
  const buscar = async (e: string) => {
    const { data, error } = await db.from("motivo_ocorrencia").select("id, descricao, tipo_ocorrencia_padrao")
      .eq("tenant_id", tenantId).eq("ativo", true).eq("etapa_ocorrencia", e).order("descricao");
    if (error) throw error;
    return (data || []) as { id: string; descricao: string; tipo_ocorrencia_padrao: string | null }[];
  };
  let lista = await buscar(etapa);
  if (lista.length === 0) lista = await buscar("OUTROS");
  const peso = (m: { tipo_ocorrencia_padrao: string | null }) => (m.tipo_ocorrencia_padrao === "REMOCAO_DOCUMENTO_MOVIMENTO" ? 0 : 1);
  return [...lista].sort((a, b) => peso(a) - peso(b));
}
