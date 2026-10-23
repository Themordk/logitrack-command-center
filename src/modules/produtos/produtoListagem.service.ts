import { supabase } from "@/integrations/supabase/client";
import { sanitizeId } from "@/lib/uuid";

export interface ProdutoListagemFilters {
  sku?: string;
  descricao?: string;
  referencia?: string;
  parceiroId?: string | null;
  grupoId?: string | null;
  subgrupoId?: string | null;
  marca?: string | null;
  ean?: string;
  semEan?: boolean;
}

export interface ProdutoListagemRow {
  id: string;
  tenant_id: string;
  empresa_id: string;
  grupo_id: string | null;
  subgrupo_id: string | null;
  parceiro_id: string | null;
  sku: string;
  descricao: string;
  referencia: string | null;
  marca: string | null;
  curva_venda: string | null;
  curva_acesso: string | null;
  foto: string | null;
  url_imagem: string | null;
  preco_custo: number | null;
  tipo_controle: string | null;
  peso_variavel: boolean | null;
  tolerancia: number | null;
  peso_bruto: number | null;
  peso_liquido: number | null;
  dias_shelf: number | null;
  shelf_entrada: number | null;
  shelf_devolucao: number | null;
  lastro: number | null;
  camada: number | null;
  fator_caixa: number | null;
  usa_picking: boolean | null;
  tipo_separacao: string | null;
  varios_pickings: boolean | null;
  ativo: boolean;
  codigo_erp: string | null;
  tem_ean: boolean | null;
  parceiro_nome: string | null;
  grupo_descricao: string | null;
  subgrupo_descricao: string | null;
  total_count: number | null;
}

const clean = (v?: string | null): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export interface GrupoFiltroRow {
  id: string;
  descricao: string;
  codigo_erp: string | null;
  qtd_produtos: number;
}

export interface GrupoFiltroOption {
  value: string;
  label: string;
  descricao: string;
  description: string;
}

export function montarGrupoFiltroOptions(grupos: GrupoFiltroRow[]): GrupoFiltroOption[] {
  const contagens = new Map<string, number>();
  for (const grupo of grupos) contagens.set(grupo.descricao, (contagens.get(grupo.descricao) ?? 0) + 1);
  return grupos.map((grupo) => ({
    value: grupo.id,
    label: (contagens.get(grupo.descricao) ?? 0) > 1
      ? `${grupo.descricao} (${grupo.codigo_erp ?? "sem código"})`
      : grupo.descricao,
    descricao: grupo.descricao,
    description: `${Number(grupo.qtd_produtos).toLocaleString("pt-BR")} produtos`,
  }));
}

export async function fetchProdutoGruposFiltro(tenantId: string, empresaId: string): Promise<GrupoFiltroOption[]> {
  const { data, error } = await supabase.rpc("fn_produto_grupos_filtro", {
    p_tenant_id: tenantId,
    p_empresa_id: empresaId,
  });
  if (error) throw error;
  return montarGrupoFiltroOptions(data ?? []);
}

function buildParams(
  tenantId: string,
  empresaId: string,
  filters: ProdutoListagemFilters,
  limit: number,
  offset: number,
  comTotal: boolean,
) {
  return {
    p_tenant_id: tenantId,
    p_empresa_id: empresaId,
    p_sku: clean(filters.sku),
    p_descricao: clean(filters.descricao),
    p_referencia: clean(filters.referencia),
    p_parceiro_id: clean(filters.parceiroId),
    p_grupo_id: clean(filters.grupoId),
    p_subgrupo_id: clean(filters.subgrupoId),
    p_marca: clean(filters.marca),
    p_ean: clean(filters.ean?.replace(/\s+/g, "")),
    p_sem_ean: !!filters.semEan,
    p_limit: limit,
    p_offset: offset,
    p_com_total: comTotal,
  };
}

interface FetchParams {
  tenantId: string | null;
  empresaId: string | null;
  filters: ProdutoListagemFilters;
  page: number;
  pageSize: number;
  comTotal?: boolean;
}

export async function fetchProdutoListagem({
  tenantId,
  empresaId,
  filters,
  page,
  pageSize,
  comTotal = true,
}: FetchParams): Promise<{ rows: ProdutoListagemRow[]; total: number }> {
  const t = sanitizeId(tenantId);
  const e = sanitizeId(empresaId);
  if (!t || !e) return { rows: [], total: 0 };

  const { data, error } = await (supabase as any).rpc(
    "rpc_produto_listagem",
    buildParams(t, e, filters, pageSize, (page - 1) * pageSize, comTotal),
  );
  if (error) throw error;

  const rows = (data || []) as ProdutoListagemRow[];
  const total = comTotal ? Number(rows[0]?.total_count ?? 0) : 0;
  return { rows, total };
}

interface FetchAllParams {
  tenantId: string | null;
  empresaId: string | null;
  filters: ProdutoListagemFilters;
  maxRows?: number;
  onProgress?: (carregados: number, total: number) => void;
}

const BLOCO = 1000;

export async function fetchAllProdutoListagem({
  tenantId,
  empresaId,
  filters,
  maxRows,
  onProgress,
}: FetchAllParams): Promise<{ rows: ProdutoListagemRow[]; total: number }> {
  const t = sanitizeId(tenantId);
  const e = sanitizeId(empresaId);
  if (!t || !e) return { rows: [], total: 0 };

  const rows: ProdutoListagemRow[] = [];
  let total = 0;
  let offset = 0;
  let primeiro = true;

  while (true) {
    const restante = maxRows ? maxRows - rows.length : BLOCO;
    if (restante <= 0) break;
    const limit = Math.min(BLOCO, restante);

    const { data, error } = await (supabase as any).rpc(
      "rpc_produto_listagem",
      buildParams(t, e, filters, limit, offset, primeiro),
    );
    if (error) throw error;

    const bloco = (data || []) as ProdutoListagemRow[];
    if (primeiro) total = Number(bloco[0]?.total_count ?? 0);
    rows.push(...bloco);
    onProgress?.(rows.length, total);

    if (bloco.length < limit) break;
    if (maxRows && rows.length >= maxRows) break;
    offset += bloco.length;
    primeiro = false;
  }

  return { rows: maxRows ? rows.slice(0, maxRows) : rows, total };
}

/** Remove os campos que existem só na listagem (não existem na tabela produto). */
export function stripListagemFields(row: ProdutoListagemRow): Record<string, any> {
  const copy: Record<string, any> = { ...row };
  delete copy.tem_ean;
  delete copy.parceiro_nome;
  delete copy.grupo_descricao;
  delete copy.subgrupo_descricao;
  delete copy.total_count;
  return copy;
}
