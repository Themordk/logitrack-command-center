import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detalhe do Movimento de Entrada (tela web Operação › Movimento de Entrada).
 *
 * Cada aba vem de uma chamada só de rpc_movimento_entrada_detalhe (p_secao).
 * Antes eram 8 consultas em 3 ondas; os alertas "sem picking" (armazém do
 * movimento) e "sem EAN" (embalagem ativa com EAN preenchido) são decididos no
 * banco — a tela só exibe.
 */

export type SecaoDetalheEntrada = "itens" | "conferencia" | "armazenagem" | "informacoes";

export interface ItemDetalheEntrada {
  movimento_item_id: string;
  sku: string;
  descricao: string;
  qtd_esperada: number;
  qtd_conferida: number;
  qtd_armazenada: number;
  qtd_ocorrencia: number;
  status_item_movimento: string;
  sem_picking: boolean;
  sem_ean: boolean;
}

export interface ItensDetalheEntrada {
  cabecalho: {
    movimento_id: string;
    numero_movimento: number | null;
    status: string;
    armazem_id: string | null;
  };
  itens: ItemDetalheEntrada[];
  contagens: { conferencias: number; armazenagens: number; documentos: number };
}

export interface ConferenciaDetalheEntrada {
  tarefa_execucao_id: string;
  sku: string;
  descricao: string;
  operador: string | null;
  codigo_hu: string | null;
  validade: string | null;
  fabricacao: string | null;
  serie: string | null;
  lote: string | null;
  quantidade_executada: number;
  iniciado_em: string | null;
  concluido_em: string | null;
  status: string;
}

export interface ArmazenagemDetalheEntrada {
  tarefa_execucao_id: string;
  sku: string | null;
  descricao_sku: string | null;
  login: string | null;
  codigo_hu: string | null;
  endereco: string | null;
  quantidade_executada: number;
  lote: string | null;
  fabricacao: string | null;
  validade: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
}

export interface InformacoesMovimentoEntrada {
  movimento_id: string;
  numero_movimento: number | null;
  status: string | null;
  created_at: string | null;
  finalizado_em: string | null;
  tipo_entrada_descricao: string | null;
  confirma_volume: boolean;
  total_volume: number | null;
  total_volume_conferido: number | null;
  armazem_descricao: string | null;
  box_descricao: string | null;
  placa_veiculo: string | null;
  valor_descarga: number | null;
  crossdocking: boolean;
  observacao: string | null;
}

export interface DocumentoVinculadoEntrada {
  documento_entrada_id: string | null;
  numero_nota: string;
  razaosocial: string | null;
  valor_total_nota: number;
  qtd_volume: number | null;
  total_skus: number;
}

export interface InformacoesDetalheEntrada {
  informacoes: InformacoesMovimentoEntrada;
  documentos: DocumentoVinculadoEntrada[];
}

/** As RPCs devolvem jsonb; o PostgREST pode entregar objeto ou string. */
function lerJson<T>(data: unknown): T {
  if (typeof data === "string") return JSON.parse(data) as T;
  return data as T;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const numOuNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

async function chamar<T>(movimentoId: string, secao: SecaoDetalheEntrada): Promise<T> {
  // RPC nova ainda fora de integrations/supabase/types.ts (gerado): chamada sem tipagem do schema.
  const rpc = supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  const { data, error } = await rpc.call(supabase, "rpc_movimento_entrada_detalhe", {
    p_movimento_id: movimentoId,
    p_secao: secao,
  });
  if (error) throw error;
  return lerJson<T>(data);
}

/** Normaliza os números (numeric chega como number ou string, conforme o PostgREST). */
export function normalizarItensDetalhe(raw: ItensDetalheEntrada): ItensDetalheEntrada {
  return {
    cabecalho: raw.cabecalho,
    itens: (raw.itens ?? []).map((it) => ({
      ...it,
      qtd_esperada: num(it.qtd_esperada),
      qtd_conferida: num(it.qtd_conferida),
      qtd_armazenada: num(it.qtd_armazenada),
      qtd_ocorrencia: num(it.qtd_ocorrencia),
      sem_picking: !!it.sem_picking,
      sem_ean: !!it.sem_ean,
    })),
    contagens: {
      conferencias: num(raw.contagens?.conferencias),
      armazenagens: num(raw.contagens?.armazenagens),
      documentos: num(raw.contagens?.documentos),
    },
  };
}

export async function fetchItensDetalheEntrada(movimentoId: string): Promise<ItensDetalheEntrada> {
  return normalizarItensDetalhe(await chamar<ItensDetalheEntrada>(movimentoId, "itens"));
}

export async function fetchConferenciaDetalheEntrada(movimentoId: string): Promise<ConferenciaDetalheEntrada[]> {
  const r = await chamar<{ conferencia: ConferenciaDetalheEntrada[] }>(movimentoId, "conferencia");
  return (r.conferencia ?? []).map((c) => ({ ...c, quantidade_executada: num(c.quantidade_executada) }));
}

export async function fetchArmazenagemDetalheEntrada(movimentoId: string): Promise<ArmazenagemDetalheEntrada[]> {
  const r = await chamar<{ armazenagem: ArmazenagemDetalheEntrada[] }>(movimentoId, "armazenagem");
  return (r.armazenagem ?? []).map((a) => ({ ...a, quantidade_executada: num(a.quantidade_executada) }));
}

export async function fetchInformacoesDetalheEntrada(movimentoId: string): Promise<InformacoesDetalheEntrada> {
  const r = await chamar<InformacoesDetalheEntrada>(movimentoId, "informacoes");
  const i = r.informacoes;
  return {
    informacoes: {
      ...i,
      numero_movimento: numOuNull(i.numero_movimento),
      total_volume: numOuNull(i.total_volume),
      total_volume_conferido: numOuNull(i.total_volume_conferido),
      valor_descarga: numOuNull(i.valor_descarga),
      confirma_volume: !!i.confirma_volume,
      crossdocking: !!i.crossdocking,
    },
    documentos: (r.documentos ?? []).map((d) => ({
      ...d,
      valor_total_nota: num(d.valor_total_nota),
      qtd_volume: numOuNull(d.qtd_volume),
      total_skus: num(d.total_skus),
    })),
  };
}

/* ---------------------------------------------------------------- cache */

export const DETALHE_ENTRADA_STALE_MS = 30_000;

export const detalheEntradaKeys = {
  /** Prefixo de tudo do detalhe de um movimento (invalidar depois de ações). */
  movimento: (tenantId: string | null | undefined, movimentoId: string | null | undefined) =>
    ["mov-entrada-detalhe", tenantId ?? null, movimentoId ?? null] as const,
  secao: (tenantId: string | null | undefined, movimentoId: string | null | undefined, secao: SecaoDetalheEntrada) =>
    ["mov-entrada-detalhe", tenantId ?? null, movimentoId ?? null, secao] as const,
};

/** Pré-carrega a aba Itens (hover/foco no card). Não refaz se ainda estiver fresco. */
export function prefetchItensDetalheEntrada(qc: QueryClient, tenantId: string | null | undefined, movimentoId: string) {
  if (!tenantId) return;
  void qc.prefetchQuery({
    queryKey: detalheEntradaKeys.secao(tenantId, movimentoId, "itens"),
    queryFn: () => fetchItensDetalheEntrada(movimentoId),
    staleTime: DETALHE_ENTRADA_STALE_MS,
  });
}

export function invalidarDetalheEntrada(qc: QueryClient, tenantId: string | null | undefined, movimentoId: string | null | undefined) {
  if (!movimentoId) return Promise.resolve();
  return qc.invalidateQueries({ queryKey: detalheEntradaKeys.movimento(tenantId, movimentoId) });
}
