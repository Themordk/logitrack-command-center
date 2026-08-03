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
  ean?: string;
  tipo_estoque_id?: string;
  setor_id?: string;
  codigo_endereco?: number;
  marca?: string;
  apenas_multi_localizacao?: boolean;
  apenas_com_saldo?: boolean;
}

const intersect = (a: string[] | null, b: string[]): string[] => {
  if (a === null) return b;
  const set = new Set(a);
  return b.filter((x) => set.has(x));
};

export async function fetchEstoqueReport(filters: EstoqueFilter) {
  const sku = filters.sku?.trim() || undefined;
  const ean = filters.ean?.trim() || undefined;
  const marca = filters.marca?.trim() || undefined;

  // ===== A. Resolver produto_id server-side =====
  let produtoIds: string[] | null = null;
  const hasProdutoFilter =
    !!sku || !!ean || !!marca ||
    !!filters.grupo_id || !!filters.subgrupo_id || !!filters.parceiro_id;

  if (hasProdutoFilter) {
    // EAN → produto_embalagem
    if (ean) {
      const { data: embData, error: embErr } = await (supabase as any)
        .from("produto_embalagem")
        .select("produto_id")
        .eq("ean", ean);
      if (embErr) throw embErr;
      const eanIds = (embData || []).map((e: any) => e.produto_id);
      if (eanIds.length === 0) return [];
      produtoIds = intersect(produtoIds, eanIds);
    }

    // produto: sku/marca/grupo/subgrupo/parceiro
    if (sku || marca || filters.grupo_id || filters.subgrupo_id || filters.parceiro_id) {
      let pq = (supabase as any)
        .from("produto")
        .select("id")
        .eq("tenant_id", filters.tenant_id)
        .limit(5000);
      if (filters.empresa_id) pq = pq.eq("empresa_id", filters.empresa_id);
      if (sku) pq = pq.ilike("sku", `%${sku}%`);
      if (marca) pq = pq.ilike("marca", `%${marca}%`);
      if (filters.grupo_id) pq = pq.eq("grupo_id", filters.grupo_id);
      if (filters.subgrupo_id) pq = pq.eq("subgrupo_id", filters.subgrupo_id);
      if (filters.parceiro_id) pq = pq.eq("parceiro_id", filters.parceiro_id);

      const { data: prods, error: pErr } = await pq;
      if (pErr) throw pErr;
      const ids = (prods || []).map((p: any) => p.id);
      if (ids.length === 0) return [];
      produtoIds = intersect(produtoIds, ids);
      if (produtoIds.length === 0) return [];
    }
  }

  // ===== B. Resolver endereco_id server-side =====
  let enderecoIds: string[] | null = null;
  const hasEnderecoFilter =
    !!filters.armazem_id || !!filters.tipo_endereco ||
    !!filters.tipo_estoque_id || !!filters.setor_id ||
    (filters.codigo_endereco !== undefined && filters.codigo_endereco !== null);

  if (hasEnderecoFilter) {
    let eq = (supabase as any)
      .from("endereco")
      .select("id")
      .eq("tenant_id", filters.tenant_id)
      .limit(10000);
    if (filters.armazem_id) eq = eq.eq("armazem_id", filters.armazem_id);
    if (filters.tipo_endereco) eq = eq.eq("tipo_endereco", filters.tipo_endereco);
    if (filters.tipo_estoque_id) eq = eq.eq("tipo_estoque_id", filters.tipo_estoque_id);
    if (filters.setor_id) eq = eq.eq("setor_id", filters.setor_id);
    if (filters.codigo_endereco !== undefined && filters.codigo_endereco !== null) {
      eq = eq.eq("codigo_endereco", filters.codigo_endereco);
    }

    const { data: ends, error: eErr } = await eq;
    if (eErr) throw eErr;
    enderecoIds = (ends || []).map((e: any) => e.id);
    if (enderecoIds.length === 0) return [];
  }

  // ===== C. Query principal =====
  const hasRestrictiveFilter = produtoIds !== null || enderecoIds !== null;
  const limit = hasRestrictiveFilter ? 2000 : 500;

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
        fator_caixa,
        grupo_id,
        subgrupo_id,
        parceiro_id
      ),
      endereco:endereco_id (
        codigo_endereco,
        descricao,
        tipo_endereco,
        armazem_id,
        setor_id,
        tipo_estoque_id
      )
    `)
    .eq("tenant_id", filters.tenant_id)
    .order("atualizado_em", { ascending: false })
    .limit(limit);

  if (filters.empresa_id) query = query.eq("empresa_id", filters.empresa_id);
  if (produtoIds) query = query.in("produto_id", produtoIds);
  if (enderecoIds) query = query.in("endereco_id", enderecoIds);

  const { data, error } = await query;
  if (error) throw error;

  let results = (data || []).map((row: any) => ({
    id: row.id,
    sku: row.produto?.sku || "",
    descricao: row.produto?.descricao || "",
    marca: row.produto?.marca || "",
    fator_caixa: row.produto?.fator_caixa ?? null,
    lote: row.lote || "",
    data_validade: row.data_validade,
    numero_serie: row.numero_serie || "",
    codigo_endereco: row.endereco?.codigo_endereco ?? null,
    endereco_descricao: row.endereco?.descricao || "",
    tipo_endereco: row.endereco?.tipo_endereco || "",
    armazem_id: row.endereco?.armazem_id || "",
    setor_id: row.endereco?.setor_id || "",
    tipo_estoque_id: row.endereco?.tipo_estoque_id || "",
    quantidade_disponivel: Number(row.quantidade_disponivel),
    quantidade_bloqueada: Number(row.quantidade_bloqueada),
    quantidade_total: Number(row.quantidade_total),
    atualizado_em: row.atualizado_em,
    grupo_id: row.produto?.grupo_id,
    subgrupo_id: row.produto?.subgrupo_id,
    parceiro_id: row.produto?.parceiro_id,
  }));

  // Filtro: apenas posições com saldo
  if (filters.apenas_com_saldo) {
    results = results.filter((r) => r.quantidade_total > 0);
  }

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

  // Filtro: apenas SKUs com 2+ endereços distintos com saldo > 0
  let finalResults = results;
  if (filters.apenas_multi_localizacao) {
    const skuEnderecos = new Map<string, Set<string>>();
    for (const r of results) {
      if (r.quantidade_total > 0 && r.sku) {
        const key = r.codigo_endereco != null ? String(r.codigo_endereco) : (r.endereco_descricao || "");
        if (!key) continue;
        if (!skuEnderecos.has(r.sku)) skuEnderecos.set(r.sku, new Set());
        skuEnderecos.get(r.sku)!.add(key);
      }
    }
    const skusMulti = new Set(
      Array.from(skuEnderecos.entries()).filter(([, s]) => s.size >= 2).map(([sku]) => sku),
    );
    finalResults = results.filter((r) => skusMulti.has(r.sku));
  }

  return finalResults;
}
