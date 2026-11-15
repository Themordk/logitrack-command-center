import { supabase } from "@/integrations/supabase/client";

/**
 * Relatório Produtos Mapeados em Picking — toda a regra roda na RPC
 * `rpc_relatorio_produtos_mapeados` (migrations 20261112163310 e 20261112164729):
 *  - mapeamentos ativos (picking_produto) da empresa, armazém opcional;
 *  - filtros de SKU, marca, parceiro, endereço (rua/prédio/nível/apto) e
 *    intervalo da data do mapeamento (fuso America/Fortaleza);
 *  - data e usuário do mapeamento = created_at / created_by (mapeamentos
 *    anteriores à auditoria vêm sem esses dados);
 *  - ordem SKU → endereço, paginada no servidor;
 *  - resumo do conjunto filtrado (SKUs, endereços, endereços compartilhados,
 *    tipos de picking, sem autoria) em cada linha, para os cards.
 */

export interface ProdutosMapeadosFilter {
  tenant_id: string;
  empresa_id: string;
  armazem_id?: string;
  sku?: string;
  marca?: string;
  parceiro_id?: string;
  data_inicio?: string;   // AAAA-MM-DD (data local do mapeamento)
  data_fim?: string;      // AAAA-MM-DD (inclusive)
  rua?: number;
  predio?: number;
  nivel?: number;
  apto?: number;
}

export interface ProdutosMapeadoRow {
  picking_id: string;
  produto_id: string;
  sku: string;
  referencia: string | null;
  descricao: string;
  marca: string | null;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  endereco_id: string | null;
  endereco_descricao: string;
  rua: number | null;
  predio: number | null;
  nivel: number | null;
  apto: number | null;
  est_minimo: number;
  est_maximo: number;
  tipo_picking: string;
  mapeado_em: string | null;
  mapeado_por: string;     // vazio quando o mapeamento não tem auditoria
  skus_no_endereco: number; // SKUs ativos mapeados no mesmo endereço
}

export interface ProdutosMapeadosResumo {
  total: number;
  qtd_skus: number;
  qtd_enderecos: number;
  qtd_enderecos_compartilhados: number;
  qtd_mapeamentos_compartilhados: number;
  qtd_fracionado: number;
  qtd_master: number;
  qtd_pdv: number;
  qtd_sem_autoria: number;
}

export interface ProdutosMapeadosPage {
  rows: ProdutosMapeadoRow[];
  resumo: ProdutosMapeadosResumo;
}

export const PRODUTOS_MAPEADOS_PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 1000; // máximo aceito pela RPC
const EXPORT_CONCORRENCIA = 4;

const num = (v: unknown) => Number(v) || 0;
const numOuNull = (v: unknown) => (v == null ? null : Number(v));

export function resumoVazio(): ProdutosMapeadosResumo {
  return {
    total: 0, qtd_skus: 0, qtd_enderecos: 0,
    qtd_enderecos_compartilhados: 0, qtd_mapeamentos_compartilhados: 0,
    qtd_fracionado: 0, qtd_master: 0, qtd_pdv: 0, qtd_sem_autoria: 0,
  };
}

function mapResumo(r: any | undefined): ProdutosMapeadosResumo {
  if (!r) return resumoVazio();
  return {
    total: num(r.total_registros),
    qtd_skus: num(r.qtd_skus),
    qtd_enderecos: num(r.qtd_enderecos),
    qtd_enderecos_compartilhados: num(r.qtd_enderecos_compartilhados),
    qtd_mapeamentos_compartilhados: num(r.qtd_mapeamentos_compartilhados),
    qtd_fracionado: num(r.qtd_fracionado),
    qtd_master: num(r.qtd_master),
    qtd_pdv: num(r.qtd_pdv),
    qtd_sem_autoria: num(r.qtd_sem_autoria),
  };
}

function toParams(f: ProdutosMapeadosFilter, limit: number, offset: number) {
  return {
    p_tenant_id: f.tenant_id,
    p_empresa_id: f.empresa_id,
    p_armazem_id: f.armazem_id || null,
    p_sku: f.sku?.trim() || null,
    p_marca: f.marca?.trim() || null,
    p_parceiro_id: f.parceiro_id || null,
    p_data_inicio: f.data_inicio || null,
    p_data_fim: f.data_fim || null,
    p_rua: f.rua ?? null,
    p_predio: f.predio ?? null,
    p_nivel: f.nivel ?? null,
    p_apto: f.apto ?? null,
    p_limit: limit,
    p_offset: offset,
  };
}

function mapRow(r: any): ProdutosMapeadoRow {
  return {
    picking_id: r.picking_id,
    produto_id: r.produto_id,
    sku: r.sku ?? "",
    referencia: r.referencia ?? null,
    descricao: r.descricao ?? "",
    marca: r.marca ?? null,
    parceiro_id: r.parceiro_id ?? null,
    parceiro_nome: r.parceiro_nome ?? null,
    endereco_id: r.endereco_id ?? null,
    endereco_descricao: r.endereco_descricao ?? "",
    rua: numOuNull(r.rua),
    predio: numOuNull(r.predio),
    nivel: numOuNull(r.nivel),
    apto: numOuNull(r.apto),
    est_minimo: num(r.est_minimo),
    est_maximo: num(r.est_maximo),
    tipo_picking: r.tipo_picking ?? "",
    mapeado_em: r.mapeado_em ?? null,
    mapeado_por: r.mapeado_por ?? "",
    skus_no_endereco: num(r.skus_no_endereco),
  };
}

async function callRpc(f: ProdutosMapeadosFilter, limit: number, offset: number): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_produtos_mapeados", toParams(f, limit, offset));
  if (error) throw error;
  return (data as any[]) || [];
}

/** Uma página do relatório + resumo do conjunto filtrado. */
export async function fetchProdutosMapeadosPage(
  filters: ProdutosMapeadosFilter,
  page: number,
  pageSize = PRODUTOS_MAPEADOS_PAGE_SIZE,
): Promise<ProdutosMapeadosPage> {
  const data = await callRpc(filters, pageSize, page * pageSize);
  return { rows: data.map(mapRow), resumo: mapResumo(data[0]) };
}

/** Todas as linhas (para Excel/PDF). Páginas de 1000, até 4 em paralelo. */
export async function fetchProdutosMapeadosAll(
  filters: ProdutosMapeadosFilter,
  total: number,
): Promise<ProdutosMapeadoRow[]> {
  const paginas = Math.ceil(total / EXPORT_PAGE_SIZE);
  const resultado: ProdutosMapeadoRow[][] = new Array(paginas);
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
