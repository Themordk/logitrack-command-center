import { supabase } from "@/integrations/supabase/client";
import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

export interface PickingNaoCadastradoFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
}

export interface PickingNaoCadastradoRow {
  produto_id: string;
  sku: string;
  referencia: string | null;
  descricao: string;
  numero_movimento: number | null;
  movimento_id: string;
  created_at: string;
}

// Status considerados "em aberto" (ainda cabe cadastrar picking)
const STATUS_ABERTOS = [
  "GERADO",
  "LIBERADO",
  "ERRO_TRANSPORTADOR",
  "EM_CONFERENCIA",
  "CONFERIDO",
  "DIVERGENCIA",
  "LIB_ARMAZENAGEM",
  "ARMAZENAGEM_PARCIAL",
];

export async function fetchPickingNaoCadastrado(
  filters: PickingNaoCadastradoFilter,
): Promise<PickingNaoCadastradoRow[]> {
  // 1) Movimentos em aberto
  const movs = await fetchAllSelectRows<any>(
    "movimento_entrada",
    "id, numero_movimento, created_at, empresa_id, armazem_id, status",
    (q) => {
      q = q
        .eq("tenant_id", filters.tenant_id)
        .in("status", STATUS_ABERTOS)
        .order("created_at", { ascending: false });
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      if (filters.armazem_id) q = q.eq("armazem_id", filters.armazem_id);
      return q;
    },
  );
  if (movs.length === 0) return [];

  const movMap = new Map<string, { numero_movimento: number | null; created_at: string; armazem_id: string | null; empresa_id: string | null }>();
  for (const m of movs) movMap.set(m.id, { numero_movimento: m.numero_movimento, created_at: m.created_at, armazem_id: m.armazem_id, empresa_id: m.empresa_id });

  // 2) Itens desses movimentos
  const movIds = Array.from(movMap.keys());
  const chunk = 500;
  const itens: any[] = [];
  for (let i = 0; i < movIds.length; i += chunk) {
    const slice = movIds.slice(i, i + chunk);
    const data = await fetchAllSelectRows<any>(
      "movimento_entrada_item",
      "id, movimento_entrada_id, produto_id",
      (q) => q.in("movimento_entrada_id", slice),
    );
    itens.push(...data);
  }
  if (itens.length === 0) return [];

  const produtoIds = Array.from(new Set(itens.map((i) => i.produto_id).filter(Boolean)));

  // 3) Produtos com picking ativo
  const comPicking = new Set<string>();
  for (let i = 0; i < produtoIds.length; i += chunk) {
    const slice = produtoIds.slice(i, i + chunk);
    const data = await fetchAllSelectRows<any>(
      "picking_produto",
      "produto_id",
      (q) => {
        q = q.in("produto_id", slice).eq("ativo", true);
        if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
        if (filters.armazem_id) q = q.eq("armazem_id", filters.armazem_id);
        return q;
      },
    );
    for (const p of data) comPicking.add(p.produto_id);
  }

  const produtoIdsSemPicking = produtoIds.filter((id) => !comPicking.has(id));
  if (produtoIdsSemPicking.length === 0) return [];

  // 4) Dados dos produtos
  const produtoMap = new Map<string, { sku: string; referencia: string | null; descricao: string }>();
  for (let i = 0; i < produtoIdsSemPicking.length; i += chunk) {
    const slice = produtoIdsSemPicking.slice(i, i + chunk);
    const data = await fetchAllSelectRows<any>(
      "produto",
      "id, sku, referencia, descricao",
      (q) => q.in("id", slice),
    );
    for (const p of data) produtoMap.set(p.id, { sku: p.sku, referencia: p.referencia, descricao: p.descricao });
  }

  // 5) Montar linhas (deduplicado por produto+movimento)
  const seen = new Set<string>();
  const rows: PickingNaoCadastradoRow[] = [];
  for (const it of itens) {
    if (!it.produto_id || comPicking.has(it.produto_id)) continue;
    const key = `${it.produto_id}|${it.movimento_entrada_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const mov = movMap.get(it.movimento_entrada_id);
    const prod = produtoMap.get(it.produto_id);
    if (!mov || !prod) continue;
    rows.push({
      produto_id: it.produto_id,
      sku: prod.sku,
      referencia: prod.referencia,
      descricao: prod.descricao,
      numero_movimento: mov.numero_movimento,
      movimento_id: it.movimento_entrada_id,
      created_at: mov.created_at,
    });
  }

  rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  return rows;
}
