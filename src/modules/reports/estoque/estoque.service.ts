import { supabase } from "@/integrations/supabase/client";

export interface EstoqueFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
  tipo_endereco?: string;
  sku?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  parceiro_id?: string;
  marca?: string;
}

export async function fetchEstoqueReport(filters: EstoqueFilter) {
  let query = supabase
    .from("estoque_geral")
    .select(`
      id,
      lote,
      data_validade,
      numero_serie,
      quantidade_disponivel,
      quantidade_bloqueada,
      quantidade_total,
      atualizado_em,
      produto:produto_id (
        sku,
        descricao,
        marca,
        grupo_id,
        subgrupo_id,
        parceiro_id
      ),
      endereco:endereco_id (
        codigo_endereco,
        descricao,
        tipo_endereco,
        armazem_id,
        setor_id
      )
    `)
    .eq("tenant_id", filters.tenant_id)
    .order("atualizado_em", { ascending: false })
    .limit(500);

  if (filters.empresa_id) query = query.eq("empresa_id", filters.empresa_id);

  const { data, error } = await query;
  if (error) throw error;

  // Client-side filters for joined fields
  let results = (data || []).map((row: any) => ({
    id: row.id,
    sku: row.produto?.sku || "",
    descricao: row.produto?.descricao || "",
    marca: row.produto?.marca || "",
    lote: row.lote || "",
    data_validade: row.data_validade,
    numero_serie: row.numero_serie || "",
    codigo_endereco: row.endereco?.descricao || "",
    endereco_descricao: row.endereco?.descricao || "",
    tipo_endereco: row.endereco?.tipo_endereco || "",
    armazem_id: row.endereco?.armazem_id || "",
    quantidade_disponivel: Number(row.quantidade_disponivel),
    quantidade_bloqueada: Number(row.quantidade_bloqueada),
    quantidade_total: Number(row.quantidade_total),
    atualizado_em: row.atualizado_em,
    grupo_id: row.produto?.grupo_id,
    subgrupo_id: row.produto?.subgrupo_id,
    parceiro_id: row.produto?.parceiro_id,
  }));

  if (filters.armazem_id) results = results.filter(r => r.armazem_id === filters.armazem_id);
  if (filters.tipo_endereco) results = results.filter(r => r.tipo_endereco === filters.tipo_endereco);
  if (filters.sku) results = results.filter(r => r.sku.toLowerCase().includes(filters.sku!.toLowerCase()));
  if (filters.grupo_id) results = results.filter(r => r.grupo_id === filters.grupo_id);
  if (filters.subgrupo_id) results = results.filter(r => r.subgrupo_id === filters.subgrupo_id);
  if (filters.parceiro_id) results = results.filter(r => r.parceiro_id === filters.parceiro_id);
  if (filters.marca) results = results.filter(r => r.marca?.toLowerCase().includes(filters.marca!.toLowerCase()));

  // Sort: sku, descricao, data_validade, quantidade_total DESC
  results.sort((a, b) => {
    const c1 = a.sku.localeCompare(b.sku);
    if (c1 !== 0) return c1;
    const c2 = a.descricao.localeCompare(b.descricao);
    if (c2 !== 0) return c2;
    const c3 = (a.data_validade || "").localeCompare(b.data_validade || "");
    if (c3 !== 0) return c3;
    return b.quantidade_total - a.quantidade_total;
  });

  return results;
}
