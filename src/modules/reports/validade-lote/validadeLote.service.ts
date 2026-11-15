import { supabase } from "@/integrations/supabase/client";

/**
 * Relatório Validade & Lote (FEFO/FIFO) — toda a regra roda na RPC
 * `rpc_relatorio_validade_lote` (migration 20261112150602):
 *  - só produtos LOTE/VALIDADE (SERIE fica fora), saldo > 0, sem posição
 *    "sem controle" (lote vazio + validade 1900-01-01);
 *  - dias para vencer calculados no fuso America/Fortaleza;
 *  - faixas crítico/atenção configuráveis (padrão 30/60);
 *  - todos os filtros e a ordenação FEFO/FIFO no servidor.
 * A RPC é paginada e devolve, em cada linha, os totais do conjunto filtrado.
 */

export type Criticidade = "VENCIDO" | "CRITICO" | "ATENCAO" | "OK";
export type OrdemValidade = "FEFO" | "FIFO";

export interface ValidadeLoteFilter {
  tenant_id: string;
  empresa_id: string;
  armazem_id?: string;
  setor_id?: string;
  tipo_endereco?: string;
  sku?: string;
  marca?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  criticidade?: Criticidade;
  validade_ate?: string;
  ordem?: OrdemValidade;
  dias_critico: number; // padrão 30
  dias_atencao: number; // padrão 60
}

export interface ValidadeLoteRow {
  id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  marca: string;
  grupo_id: string | null;
  grupo_descricao: string | null;
  subgrupo_id: string | null;
  subgrupo_descricao: string | null;
  lote: string;
  data_fabricacao: string | null;
  data_validade: string;
  dias_para_vencer: number;
  saldo: number;
  saldo_disponivel: number;
  saldo_bloqueado: number;
  hu_id: string | null;
  codigo_hu: string;
  endereco_id: string | null;
  codigo_endereco: string;
  tipo_endereco: string;
  armazem_id: string | null;
  setor_id: string | null;
  criticidade: Criticidade;
}

export interface ValidadeLoteResumo {
  total_registros: number;
  total_saldo: number;
  qtd_vencido: number;
  qtd_critico: number;
  qtd_atencao: number;
  qtd_ok: number;
  saldo_vencido: number;
  saldo_critico: number;
  saldo_atencao: number;
}

export interface ValidadeLotePage {
  rows: ValidadeLoteRow[];
  resumo: ValidadeLoteResumo;
}

export const VALIDADE_LOTE_PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 1000; // máximo aceito pela RPC
const EXPORT_CONCORRENCIA = 4;

const RESUMO_VAZIO: ValidadeLoteResumo = {
  total_registros: 0, total_saldo: 0,
  qtd_vencido: 0, qtd_critico: 0, qtd_atencao: 0, qtd_ok: 0,
  saldo_vencido: 0, saldo_critico: 0, saldo_atencao: 0,
};

const num = (v: unknown) => Number(v) || 0;

function toParams(f: ValidadeLoteFilter, limit: number, offset: number) {
  return {
    p_tenant_id: f.tenant_id,
    p_empresa_id: f.empresa_id,
    p_armazem_id: f.armazem_id || null,
    p_setor_id: f.setor_id || null,
    p_tipo_endereco: f.tipo_endereco || null,
    p_sku: f.sku?.trim() || null,
    p_marca: f.marca?.trim() || null,
    p_grupo_id: f.grupo_id || null,
    p_subgrupo_id: f.subgrupo_id || null,
    p_criticidade: f.criticidade || null,
    p_validade_ate: f.validade_ate || null,
    p_ordem: f.ordem ?? "FEFO",
    p_dias_critico: f.dias_critico,
    p_dias_atencao: f.dias_atencao,
    p_limit: limit,
    p_offset: offset,
  };
}

function mapRow(r: any): ValidadeLoteRow {
  return {
    id: r.id,
    produto_id: r.produto_id,
    sku: r.sku ?? "—",
    descricao: r.descricao ?? "—",
    marca: r.marca ?? "",
    grupo_id: r.grupo_id ?? null,
    grupo_descricao: r.grupo_descricao ?? null,
    subgrupo_id: r.subgrupo_id ?? null,
    subgrupo_descricao: r.subgrupo_descricao ?? null,
    lote: r.lote ?? "",
    data_fabricacao: r.data_fabricacao ?? null,
    data_validade: r.data_validade,
    dias_para_vencer: num(r.dias_para_vencer),
    saldo: num(r.saldo),
    saldo_disponivel: num(r.saldo_disponivel),
    saldo_bloqueado: num(r.saldo_bloqueado),
    hu_id: r.hu_id ?? null,
    codigo_hu: r.codigo_hu ?? "",
    endereco_id: r.endereco_id ?? null,
    codigo_endereco: r.codigo_endereco ?? "",
    tipo_endereco: r.tipo_endereco ?? "",
    armazem_id: r.armazem_id ?? null,
    setor_id: r.setor_id ?? null,
    criticidade: r.criticidade,
  };
}

function mapResumo(r: any | undefined): ValidadeLoteResumo {
  if (!r) return RESUMO_VAZIO;
  return {
    total_registros: num(r.total_registros),
    total_saldo: num(r.total_saldo),
    qtd_vencido: num(r.qtd_vencido),
    qtd_critico: num(r.qtd_critico),
    qtd_atencao: num(r.qtd_atencao),
    qtd_ok: num(r.qtd_ok),
    saldo_vencido: num(r.saldo_vencido),
    saldo_critico: num(r.saldo_critico),
    saldo_atencao: num(r.saldo_atencao),
  };
}

async function callRpc(f: ValidadeLoteFilter, limit: number, offset: number): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_validade_lote", toParams(f, limit, offset));
  if (error) throw error;
  return (data as any[]) || [];
}

/** Uma página do relatório + totais do conjunto filtrado inteiro. */
export async function fetchValidadeLotePage(
  filters: ValidadeLoteFilter,
  page: number,
  pageSize = VALIDADE_LOTE_PAGE_SIZE,
): Promise<ValidadeLotePage> {
  const data = await callRpc(filters, pageSize, page * pageSize);
  return { rows: data.map(mapRow), resumo: mapResumo(data[0]) };
}

/** Todas as linhas (para Excel/PDF). Páginas de 1000, até 4 em paralelo. */
export async function fetchValidadeLoteAll(
  filters: ValidadeLoteFilter,
  totalRegistros: number,
): Promise<ValidadeLoteRow[]> {
  const paginas = Math.ceil(totalRegistros / EXPORT_PAGE_SIZE);
  const resultado: ValidadeLoteRow[][] = new Array(paginas);
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
