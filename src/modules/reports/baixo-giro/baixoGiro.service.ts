import { supabase } from "@/integrations/supabase/client";
import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

export interface BaixoGiroFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
  dias_limite: number; // default 90
  sku?: string;
  marca?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  classificacao?: "BAIXO_GIRO" | "OBSOLETO" | "SEM_MOVIMENTO";
  saldo_minimo?: number;
}

export interface BaixoGiroRow {
  produto_id: string;
  sku: string;
  descricao: string;
  marca: string;
  grupo_id: string | null;
  subgrupo_id: string | null;
  saldo: number;
  preco_custo: number;
  custo_total: number;
  ultima_saida: string | null;
  dias_sem_movimento: number | null; // null = nunca
  classificacao: "BAIXO_GIRO" | "OBSOLETO" | "SEM_MOVIMENTO";
}

function classifica(dias: number | null): BaixoGiroRow["classificacao"] {
  if (dias === null) return "SEM_MOVIMENTO";
  if (dias >= 180) return "OBSOLETO";
  return "BAIXO_GIRO";
}

export async function fetchBaixoGiroReport(filters: BaixoGiroFilter): Promise<BaixoGiroRow[]> {
  // 1. Saldo agregado por produto
  const saldos = await fetchAllSelectRows<any>(
    "estoque_geral",
    "produto_id, quantidade_total",
    (q) => {
      q = q.eq("tenant_id", filters.tenant_id).gt("quantidade_total", 0);
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      return q;
    },
  );

  const saldoMap = new Map<string, number>();
  for (const s of (saldos || [])) {
    saldoMap.set(s.produto_id, (saldoMap.get(s.produto_id) || 0) + Number(s.quantidade_total));
  }

  if (saldoMap.size === 0) return [];

  const produtoIds = Array.from(saldoMap.keys());

  // Helper: chunk array para evitar URL gigante no PostgREST (.in com milhares de UUIDs)
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };
  const ID_BATCH = 300;

  // 2. Última saída por produto (busca em batch)
  const ultimaSaidaMap = new Map<string, string>();
  for (const ids of chunk(produtoIds, ID_BATCH)) {
    const movs = await fetchAllSelectRows<any>(
      "estoque_movimento",
      "produto_id, criado_em",
      (q) => {
        q = q
          .eq("tenant_id", filters.tenant_id)
          .eq("tipo_movimento", 2)
          .in("produto_id", ids)
          .order("criado_em", { ascending: false });
        if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
        return q;
      },
    );
    for (const m of (movs || [])) {
      if (!ultimaSaidaMap.has(m.produto_id)) {
        ultimaSaidaMap.set(m.produto_id, m.criado_em);
      }
    }
  }

  // 3. Metadados dos produtos (em batch)
  const produtoMap = new Map<string, any>();
  for (const ids of chunk(produtoIds, ID_BATCH)) {
    const produtos = await fetchAllSelectRows<any>(
      "produto",
      "id, sku, descricao, marca, grupo_id, subgrupo_id, preco_custo",
      (q) => q.eq("tenant_id", filters.tenant_id).in("id", ids),
    );
    for (const p of (produtos || [])) produtoMap.set(p.id, p);
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let rows: BaixoGiroRow[] = produtoIds.map((pid) => {
    const p = produtoMap.get(pid);
    const ultima = ultimaSaidaMap.get(pid) || null;
    let dias: number | null = null;
    if (ultima) {
      const d = new Date(ultima);
      d.setHours(0, 0, 0, 0);
      dias = Math.floor((hoje.getTime() - d.getTime()) / 86400000);
    }
    const saldo = saldoMap.get(pid) || 0;
    const preco = Number(p?.preco_custo) || 0;
    return {
      produto_id: pid,
      sku: p?.sku || "—",
      descricao: p?.descricao || "—",
      marca: p?.marca || "",
      grupo_id: p?.grupo_id ?? null,
      subgrupo_id: p?.subgrupo_id ?? null,
      saldo,
      preco_custo: preco,
      custo_total: saldo * preco,
      ultima_saida: ultima,
      dias_sem_movimento: dias,
      classificacao: classifica(dias),
    };
  });

  // 4. Aplica regra de dias limite (mantém SEM_MOVIMENTO sempre)
  rows = rows.filter((r) => r.dias_sem_movimento === null || r.dias_sem_movimento >= filters.dias_limite);

  // 5. Filtros client-side
  if (filters.sku) {
    const s = filters.sku.toLowerCase();
    rows = rows.filter((r) => r.sku.toLowerCase().includes(s));
  }
  if (filters.marca) {
    const s = filters.marca.toLowerCase();
    rows = rows.filter((r) => r.marca.toLowerCase().includes(s));
  }
  if (filters.grupo_id) rows = rows.filter((r) => r.grupo_id === filters.grupo_id);
  if (filters.subgrupo_id) rows = rows.filter((r) => r.subgrupo_id === filters.subgrupo_id);
  if (filters.classificacao) rows = rows.filter((r) => r.classificacao === filters.classificacao);
  if (filters.saldo_minimo !== undefined) rows = rows.filter((r) => r.saldo >= filters.saldo_minimo!);

  // 6. Ordenação: SEM_MOVIMENTO primeiro, depois por dias DESC, depois custo total DESC
  rows.sort((a, b) => {
    const aD = a.dias_sem_movimento ?? Number.POSITIVE_INFINITY;
    const bD = b.dias_sem_movimento ?? Number.POSITIVE_INFINITY;
    if (aD !== bD) return bD - aD;
    return b.custo_total - a.custo_total;
  });

  return rows;
}
