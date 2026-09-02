import { supabase } from "@/integrations/supabase/client";
import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

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
      const embData = await fetchAllSelectRows<any>(
        "produto_embalagem",
        "produto_id",
        (q) => q.eq("ean", ean),
      );
      const eanIds = embData.map((e: any) => e.produto_id);
      if (eanIds.length === 0) return [];
      produtoIds = intersect(produtoIds, eanIds);
    }

    // produto: sku/marca/grupo/subgrupo/parceiro
    if (sku || marca || filters.grupo_id || filters.subgrupo_id || filters.parceiro_id) {
      const prods = await fetchAllSelectRows<any>("produto", "id", (q) => {
        q = q.eq("tenant_id", filters.tenant_id);
        if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
        if (sku) q = q.ilike("sku", `%${sku}%`);
        if (marca) q = q.ilike("marca", `%${marca}%`);
        if (filters.grupo_id) q = q.eq("grupo_id", filters.grupo_id);
        if (filters.subgrupo_id) q = q.eq("subgrupo_id", filters.subgrupo_id);
        if (filters.parceiro_id) q = q.eq("parceiro_id", filters.parceiro_id);
        return q;
      });
      const ids = prods.map((p: any) => p.id);
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
    const ends = await fetchAllSelectRows<any>("endereco", "id", (q) => {
      q = q.eq("tenant_id", filters.tenant_id);
      if (filters.armazem_id) q = q.eq("armazem_id", filters.armazem_id);
      if (filters.tipo_endereco) q = q.eq("tipo_endereco", filters.tipo_endereco);
      if (filters.tipo_estoque_id) q = q.eq("tipo_estoque_id", filters.tipo_estoque_id);
      if (filters.setor_id) q = q.eq("setor_id", filters.setor_id);
      if (filters.codigo_endereco !== undefined && filters.codigo_endereco !== null) {
        q = q.eq("codigo_endereco", filters.codigo_endereco);
      }
      return q;
    });
    enderecoIds = ends.map((e: any) => e.id);
    if (enderecoIds.length === 0) return [];
  }

  // ===== C. Query principal =====
  const query = fetchAllSelectRows<any>(
    "estoque_geral",
    `
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
    `,
    (q) => {
      q = q
        .eq("tenant_id", filters.tenant_id)
        .order("atualizado_em", { ascending: false });
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      if (produtoIds) q = q.in("produto_id", produtoIds);
      if (enderecoIds) q = q.in("endereco_id", enderecoIds);
      return q;
    },
  );

  const data = await query;

  let results = data.map((row: any) => ({
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
