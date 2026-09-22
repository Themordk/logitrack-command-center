import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

export interface ProdutosMapeadosFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
  sku?: string;
  marca?: string;
  parceiro_id?: string;
}

export interface ProdutosMapeadoRow {
  picking_id: string;
  produto_id: string;
  sku: string;
  referencia: string | null;
  descricao: string;
  marca: string | null;
  parceiro_nome: string | null;
  endereco_descricao: string;
  est_minimo: number;
  est_maximo: number;
  tipo_picking: string;
}

const SELECT =
  "id, produto_id, endereco_id, est_minimo, est_maximo, tipo_picking, ativo, produto:produto_id(sku, referencia, descricao, marca, parceiro_id, parceiro:parceiro_id(razaosocial)), endereco:endereco_id(descricao)";

export async function fetchProdutosMapeados(
  filters: ProdutosMapeadosFilter,
): Promise<ProdutosMapeadoRow[]> {
  const raw = await fetchAllSelectRows<any>("picking_produto", SELECT, (q) => {
    q = q.eq("tenant_id", filters.tenant_id).eq("ativo", true);
    if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
    if (filters.armazem_id) q = q.eq("armazem_id", filters.armazem_id);
    return q;
  });

  const skuTerm = (filters.sku || "").trim().toLowerCase();

  const rows: ProdutosMapeadoRow[] = [];
  for (const r of raw) {
    const p = r.produto || {};
    if (skuTerm && !String(p.sku || "").toLowerCase().includes(skuTerm)) continue;
    if (filters.marca && p.marca !== filters.marca) continue;
    if (filters.parceiro_id && p.parceiro_id !== filters.parceiro_id) continue;

    rows.push({
      picking_id: r.id,
      produto_id: r.produto_id,
      sku: p.sku || "",
      referencia: p.referencia ?? null,
      descricao: p.descricao || "",
      marca: p.marca ?? null,
      parceiro_nome: p.parceiro?.razaosocial ?? null,
      endereco_descricao: r.endereco?.descricao || "",
      est_minimo: Number(r.est_minimo) || 0,
      est_maximo: Number(r.est_maximo) || 0,
      tipo_picking: r.tipo_picking || "",
    });
  }

  rows.sort((a, b) => a.sku.localeCompare(b.sku));
  return rows;
}
