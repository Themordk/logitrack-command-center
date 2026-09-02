import { supabase } from "@/integrations/supabase/client";
import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

const LIMITE_A = 0.80;
const LIMITE_B = 0.95;

export interface CurvaAbcFilter {
  tenant_id: string;
  empresa_id?: string;
  armazem_id?: string;
  data_inicio: string; // ISO yyyy-mm-dd
  data_fim: string;    // ISO yyyy-mm-dd
  sku?: string;
  marca?: string;
  grupo_id?: string;
  subgrupo_id?: string;
  classe?: "A" | "B" | "C";
}

export interface CurvaAbcRow {
  produto_id: string;
  sku: string;
  descricao: string;
  marca: string;
  grupo_id: string | null;
  subgrupo_id: string | null;
  qtd_saida: number;
  participacao: number;     // 0..1
  acumulado: number;        // 0..1
  saldo_atual: number;
  classe: "A" | "B" | "C";
}

export async function fetchCurvaAbcReport(filters: CurvaAbcFilter): Promise<CurvaAbcRow[]> {
  // 1. Saídas no período (tipo_movimento = 2 → Saída)
  const dataFimEnd = `${filters.data_fim}T23:59:59`;
  const movimentos = await fetchAllSelectRows<any>(
    "estoque_movimento",
    "produto_id, quantidade",
    (q) => {
      q = q
        .eq("tenant_id", filters.tenant_id)
        .eq("tipo_movimento", 2)
        .gte("criado_em", filters.data_inicio)
        .lte("criado_em", dataFimEnd);
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      return q;
    },
  );

  // Agregação em memória
  const aggregado = new Map<string, number>();
  for (const m of (movimentos || [])) {
    aggregado.set(m.produto_id, (aggregado.get(m.produto_id) || 0) + Number(m.quantidade));
  }

  if (aggregado.size === 0) return [];

  const produtoIds = Array.from(aggregado.keys());

  // 2. Metadados dos produtos
  const produtos = await fetchAllSelectRows<any>(
    "produto",
    "id, sku, descricao, marca, grupo_id, subgrupo_id",
    (q) => q.eq("tenant_id", filters.tenant_id).in("id", produtoIds),
  );

  const produtoMap = new Map<string, any>();
  for (const p of (produtos || [])) produtoMap.set(p.id, p);

  // 3. Saldo atual por produto
  const saldos = await fetchAllSelectRows<any>(
    "estoque_geral",
    "produto_id, quantidade_total",
    (q) => {
      q = q.eq("tenant_id", filters.tenant_id).in("produto_id", produtoIds);
      if (filters.empresa_id) q = q.eq("empresa_id", filters.empresa_id);
      return q;
    },
  );

  const saldoMap = new Map<string, number>();
  for (const s of (saldos || [])) {
    saldoMap.set(s.produto_id, (saldoMap.get(s.produto_id) || 0) + Number(s.quantidade_total));
  }

  // 4. Monta linhas, ordena DESC por qtd_saida, calcula participação, acumulado e classe
  let rows: CurvaAbcRow[] = produtoIds.map((pid) => {
    const p = produtoMap.get(pid);
    return {
      produto_id: pid,
      sku: p?.sku || "—",
      descricao: p?.descricao || "—",
      marca: p?.marca || "",
      grupo_id: p?.grupo_id ?? null,
      subgrupo_id: p?.subgrupo_id ?? null,
      qtd_saida: aggregado.get(pid) || 0,
      participacao: 0,
      acumulado: 0,
      saldo_atual: saldoMap.get(pid) || 0,
      classe: "C" as const,
    };
  });

  rows.sort((a, b) => b.qtd_saida - a.qtd_saida);

  const total = rows.reduce((acc, r) => acc + r.qtd_saida, 0);
  let acum = 0;
  for (const r of rows) {
    r.participacao = total > 0 ? r.qtd_saida / total : 0;
    acum += r.participacao;
    r.acumulado = acum;
    if (acum <= LIMITE_A) r.classe = "A";
    else if (acum <= LIMITE_B) r.classe = "B";
    else r.classe = "C";
  }

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
  if (filters.classe) rows = rows.filter((r) => r.classe === filters.classe);

  return rows;
}
