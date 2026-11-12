import { supabase } from "@/integrations/supabase/client";

/**
 * Relatório Posição de Estoque — toda a regra roda na RPC
 * `rpc_relatorio_posicao_estoque` (migration 20261112170618):
 *  - posições de estoque_geral com filtros de endereço e de produto
 *    (SKU parcial, EAN exato, marca, grupo, subgrupo, parceiro);
 *  - apenas com saldo / apenas SKUs em 2+ endereços, no servidor;
 *  - valor a custo, vencidas e posições sem atualização;
 *  - ordem SKU → validade → endereço, paginada no servidor.
 * A RPC devolve, em cada linha, o resumo do conjunto filtrado (cards).
 */

export interface EstoqueFilter {
  tenant_id: string;
  empresa_id: string;
  armazem_id?: string;
  tipo_endereco?: string;
  sku?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  parceiro_id?: string;
  ean?: string;
  tipo_estoque_id?: string;
  setor_id?: string;
  codigo_endereco?: number;
  marca?: string;
  apenas_multi_localizacao?: boolean;
  apenas_com_saldo?: boolean;
  rua?: number;
  predio?: number;
  nivel?: number;
  apto?: number;
}

export interface EstoqueRow {
  id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  marca: string;
  fator_caixa: number | null;
  preco_custo: number;
  lote: string;
  data_validade: string | null;
  numero_serie: string;
  endereco_id: string | null;
  codigo_endereco: number | null;
  endereco_descricao: string;
  tipo_endereco: string;
  armazem_id: string | null;
  setor_id: string | null;
  tipo_estoque_id: string | null;
  rua: number | null;
  predio: number | null;
  nivel: number | null;
  apto: number | null;
  quantidade_disponivel: number;
  quantidade_bloqueada: number;
  quantidade_total: number;
  valor_total: number;
  vencido: boolean;
  enderecos_do_sku: number;
  atualizado_em: string | null;
}

export interface EstoqueResumo {
  total: number;
  qtd_skus: number;
  qtd_skus_multi: number;
  qtd_enderecos: number;
  pos_picking: number;
  pos_pulmao: number;
  saldo_total: number;
  saldo_disponivel: number;
  saldo_bloqueado: number;
  pos_bloqueadas: number;
  valor_estoque: number;
  qtd_skus_sem_custo: number;
  pos_vencidas: number;
  saldo_vencido: number;
  pos_sem_atualizacao: number;
}

export interface EstoquePage {
  rows: EstoqueRow[];
  resumo: EstoqueResumo;
}

export const ESTOQUE_PAGE_SIZE = 100;
/** Corte, em dias, para "posição sem atualização". */
export const ESTOQUE_DIAS_SEM_ATUALIZACAO = 90;
const EXPORT_PAGE_SIZE = 1000; // máximo aceito pela RPC
const EXPORT_CONCORRENCIA = 4;

const num = (v: unknown) => Number(v) || 0;
const numOuNull = (v: unknown) => (v == null ? null : Number(v));

export function resumoVazio(): EstoqueResumo {
  return {
    total: 0, qtd_skus: 0, qtd_skus_multi: 0, qtd_enderecos: 0,
    pos_picking: 0, pos_pulmao: 0,
    saldo_total: 0, saldo_disponivel: 0, saldo_bloqueado: 0, pos_bloqueadas: 0,
    valor_estoque: 0, qtd_skus_sem_custo: 0,
    pos_vencidas: 0, saldo_vencido: 0, pos_sem_atualizacao: 0,
  };
}

function toParams(f: EstoqueFilter, limit: number, offset: number) {
  return {
    p_tenant_id: f.tenant_id,
    p_empresa_id: f.empresa_id,
    p_armazem_id: f.armazem_id || null,
    p_tipo_endereco: f.tipo_endereco || null,
    p_tipo_estoque_id: f.tipo_estoque_id || null,
    p_setor_id: f.setor_id || null,
    p_codigo_endereco: f.codigo_endereco ?? null,
    p_rua: f.rua ?? null,
    p_predio: f.predio ?? null,
    p_nivel: f.nivel ?? null,
    p_apto: f.apto ?? null,
    p_grupo_id: f.grupo_id || null,
    p_subgrupo_id: f.subgrupo_id || null,
    p_marca: f.marca?.trim() || null,
    p_parceiro_id: f.parceiro_id || null,
    p_sku: f.sku?.trim() || null,
    p_ean: f.ean?.trim() || null,
    p_apenas_com_saldo: f.apenas_com_saldo ?? true,
    p_apenas_multi_localizacao: !!f.apenas_multi_localizacao,
    p_dias_sem_atualizacao: ESTOQUE_DIAS_SEM_ATUALIZACAO,
    p_limit: limit,
    p_offset: offset,
  };
}

function mapRow(r: any): EstoqueRow {
  return {
    id: r.id,
    produto_id: r.produto_id,
    sku: r.sku ?? "",
    descricao: r.descricao ?? "",
    marca: r.marca ?? "",
    fator_caixa: r.fator_caixa ?? null,
    preco_custo: num(r.preco_custo),
    lote: r.lote ?? "",
    data_validade: r.data_validade ?? null,
    numero_serie: r.numero_serie ?? "",
    endereco_id: r.endereco_id ?? null,
    codigo_endereco: numOuNull(r.codigo_endereco),
    endereco_descricao: r.endereco_descricao ?? "",
    tipo_endereco: r.tipo_endereco ?? "",
    armazem_id: r.armazem_id ?? null,
    setor_id: r.setor_id ?? null,
    tipo_estoque_id: r.tipo_estoque_id ?? null,
    rua: numOuNull(r.rua),
    predio: numOuNull(r.predio),
    nivel: numOuNull(r.nivel),
    apto: numOuNull(r.apto),
    quantidade_disponivel: num(r.quantidade_disponivel),
    quantidade_bloqueada: num(r.quantidade_bloqueada),
    quantidade_total: num(r.quantidade_total),
    valor_total: num(r.valor_total),
    vencido: !!r.vencido,
    enderecos_do_sku: num(r.enderecos_do_sku),
    atualizado_em: r.atualizado_em ?? null,
  };
}

function mapResumo(r: any | undefined): EstoqueResumo {
  if (!r) return resumoVazio();
  return {
    total: num(r.total_registros),
    qtd_skus: num(r.qtd_skus),
    qtd_skus_multi: num(r.qtd_skus_multi),
    qtd_enderecos: num(r.qtd_enderecos),
    pos_picking: num(r.pos_picking),
    pos_pulmao: num(r.pos_pulmao),
    saldo_total: num(r.saldo_total),
    saldo_disponivel: num(r.saldo_disponivel),
    saldo_bloqueado: num(r.saldo_bloqueado),
    pos_bloqueadas: num(r.pos_bloqueadas),
    valor_estoque: num(r.valor_estoque),
    qtd_skus_sem_custo: num(r.qtd_skus_sem_custo),
    pos_vencidas: num(r.pos_vencidas),
    saldo_vencido: num(r.saldo_vencido),
    pos_sem_atualizacao: num(r.pos_sem_atualizacao),
  };
}

async function callRpc(f: EstoqueFilter, limit: number, offset: number): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_posicao_estoque", toParams(f, limit, offset));
  if (error) throw error;
  return (data as any[]) || [];
}

/** Uma página do relatório + resumo do conjunto filtrado. */
export async function fetchEstoquePage(
  filters: EstoqueFilter,
  page: number,
  pageSize = ESTOQUE_PAGE_SIZE,
): Promise<EstoquePage> {
  const data = await callRpc(filters, pageSize, page * pageSize);
  return { rows: data.map(mapRow), resumo: mapResumo(data[0]) };
}

/** Todas as linhas (para Excel/PDF). Páginas de 1000, até 4 em paralelo. */
export async function fetchEstoqueAll(filters: EstoqueFilter, total: number): Promise<EstoqueRow[]> {
  const paginas = Math.ceil(total / EXPORT_PAGE_SIZE);
  const resultado: EstoqueRow[][] = new Array(paginas);
  let proxima = 0;
  const worker = async () => {
    while (proxima < paginas) {
      const p = proxima++;
      const data = await callRpc(filters, EXPORT_PAGE_SIZE, p * EXPORT_PAGE_SIZE);
      resultado[p] = data.map(mapRow);
    }
  };
  await Promise.all(Array.from({ length: Math.min(EXPORT_CONCORRENCIA, paginas) }, worker));
  return resultado.flat();
}
