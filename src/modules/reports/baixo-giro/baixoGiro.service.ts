import { supabase } from "@/integrations/supabase/client";

/**
 * Relatório Baixo Giro / Obsoletos — toda a regra roda na RPC
 * `rpc_relatorio_baixo_giro` (migration 20261109151910):
 *  - saída = tipos 2 (Saída) e 5 (Separação), descontando estornos (99);
 *  - sem saída: dias contados da entrada mais antiga do saldo atual;
 *  - faixas configuráveis; armazém restringe saldo e saída; fuso America/Fortaleza.
 * A RPC é paginada e devolve, em cada linha, os totais do conjunto filtrado.
 */

export type BaixoGiroClassificacao = "BAIXO_GIRO" | "OBSOLETO" | "SEM_MOVIMENTO";
export type BaixoGiroOrdenacao = "DIAS_DESC" | "CUSTO_DESC" | "SALDO_DESC" | "SKU_ASC";

export interface BaixoGiroFilter {
  tenant_id: string;
  empresa_id: string;
  armazem_id?: string;
  dias_baixo_giro: number; // padrão 90
  dias_obsoleto: number;   // padrão 180
  sku?: string;
  marca?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  classificacao?: BaixoGiroClassificacao;
  saldo_minimo?: number;
  ordenacao?: BaixoGiroOrdenacao;
}

export interface BaixoGiroRow {
  produto_id: string;
  sku: string;
  descricao: string;
  marca: string;
  grupo_id: string | null;
  grupo_descricao: string | null;
  subgrupo_id: string | null;
  subgrupo_descricao: string | null;
  saldo: number;
  saldo_bloqueado: number;
  qtd_posicoes: number;
  preco_custo: number;
  custo_total: number;
  ultima_saida: string | null;
  entrada_mais_antiga: string | null;
  dias_parado: number | null;
  nunca_saiu: boolean;
  classificacao: BaixoGiroClassificacao;
}

export interface BaixoGiroResumo {
  total_registros: number;
  total_saldo: number;
  total_custo: number;
  qtd_baixo_giro: number;
  qtd_obsoleto: number;
  qtd_sem_movimento: number;
  qtd_sem_custo: number;
}

export interface BaixoGiroPage {
  rows: BaixoGiroRow[];
  resumo: BaixoGiroResumo;
}

export const BAIXO_GIRO_PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 1000; // máximo aceito pela RPC
const EXPORT_CONCORRENCIA = 4;

const RESUMO_VAZIO: BaixoGiroResumo = {
  total_registros: 0, total_saldo: 0, total_custo: 0,
  qtd_baixo_giro: 0, qtd_obsoleto: 0, qtd_sem_movimento: 0, qtd_sem_custo: 0,
};

function toParams(f: BaixoGiroFilter, limit: number, offset: number) {
  return {
    p_tenant_id: f.tenant_id,
    p_empresa_id: f.empresa_id,
    p_armazem_id: f.armazem_id ?? null,
    p_dias_baixo_giro: f.dias_baixo_giro,
    p_dias_obsoleto: f.dias_obsoleto,
    p_classificacao: f.classificacao ?? null,
    p_grupo_id: f.grupo_id ?? null,
    p_subgrupo_id: f.subgrupo_id ?? null,
    p_marca: f.marca?.trim() || null,
    p_sku: f.sku?.trim() || null,
    p_saldo_minimo: f.saldo_minimo ?? null,
    p_ordenacao: f.ordenacao ?? "DIAS_DESC",
    p_limit: limit,
    p_offset: offset,
  };
}

function mapRow(r: any): BaixoGiroRow {
  return {
    produto_id: r.produto_id,
    sku: r.sku ?? "—",
    descricao: r.descricao ?? "—",
    marca: r.marca ?? "",
    grupo_id: r.grupo_id ?? null,
    grupo_descricao: r.grupo_descricao ?? null,
    subgrupo_id: r.subgrupo_id ?? null,
    subgrupo_descricao: r.subgrupo_descricao ?? null,
    saldo: Number(r.saldo) || 0,
    saldo_bloqueado: Number(r.saldo_bloqueado) || 0,
    qtd_posicoes: Number(r.qtd_posicoes) || 0,
    preco_custo: Number(r.preco_custo) || 0,
    custo_total: Number(r.custo_total) || 0,
    ultima_saida: r.ultima_saida ?? null,
    entrada_mais_antiga: r.entrada_mais_antiga ?? null,
    dias_parado: r.dias_parado ?? null,
    nunca_saiu: !!r.nunca_saiu,
    classificacao: r.classificacao,
  };
}

function mapResumo(r: any | undefined): BaixoGiroResumo {
  if (!r) return RESUMO_VAZIO;
  return {
    total_registros: Number(r.total_registros) || 0,
    total_saldo: Number(r.total_saldo) || 0,
    total_custo: Number(r.total_custo) || 0,
    qtd_baixo_giro: Number(r.qtd_baixo_giro) || 0,
    qtd_obsoleto: Number(r.qtd_obsoleto) || 0,
    qtd_sem_movimento: Number(r.qtd_sem_movimento) || 0,
    qtd_sem_custo: Number(r.qtd_sem_custo) || 0,
  };
}

async function callRpc(f: BaixoGiroFilter, limit: number, offset: number): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_baixo_giro", toParams(f, limit, offset));
  if (error) throw error;
  return (data as any[]) || [];
}

/** Uma página do relatório + totais do conjunto filtrado inteiro. */
export async function fetchBaixoGiroPage(
  filters: BaixoGiroFilter,
  page: number,
  pageSize = BAIXO_GIRO_PAGE_SIZE,
): Promise<BaixoGiroPage> {
  const data = await callRpc(filters, pageSize, page * pageSize);
  return { rows: data.map(mapRow), resumo: mapResumo(data[0]) };
}

/** Todas as linhas (para Excel/PDF). Páginas de 1000, até 4 em paralelo. */
export async function fetchBaixoGiroAll(
  filters: BaixoGiroFilter,
  totalRegistros: number,
): Promise<BaixoGiroRow[]> {
  const paginas = Math.ceil(totalRegistros / EXPORT_PAGE_SIZE);
  const resultado: BaixoGiroRow[][] = new Array(paginas);
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
