import { supabase } from "@/integrations/supabase/client";

export type StatusItem = "CONFORME" | "SOBRA" | "FALTA" | "PENDENTE";
export type Severidade = "OK" | "PEQUENA" | "MEDIA" | "GRANDE";

export interface InventarioFilter {
  tenant_id: string;
  empresa_id?: string;
  inventario_id?: string;          // se vazio → considera todos os do tenant respeitando data_inicio/data_fim
  data_inicio?: string;            // ISO
  data_fim?: string;               // ISO
  armazem_id?: string;
  sku?: string;
  rua?: number;
  predio?: number;
  nivel?: number;
  apto?: number;
  status?: StatusItem;
  severidade?: Severidade;
  apenas_divergentes?: boolean;
  incluir_pendentes?: boolean;     // default true (mostra pendentes na tabela)
}

export interface InventarioRow {
  id: string;
  inventario_id: string;
  numero_inventario: number;
  inventario_status: string;
  inventario_finalizado_em: string | null;
  sku: string;
  descricao: string;
  endereco: string;
  rua: number | null;
  predio: number | null;
  nivel: number | null;
  apto: number | null;
  lote: string;                    // placeholder "—"
  qtd_sistemica: number;
  qtd_contada: number;
  diferenca: number;
  diferenca_pct: number;
  acuracidade_item: number;        // 0..100
  preco_custo: number;
  impacto_financeiro: number;
  status_calc: StatusItem;
  severidade: Severidade;
  status_view: string | null;      // status original da view
}

export interface InventarioKpis {
  total_itens: number;
  itens_conformes: number;
  itens_divergentes: number;
  itens_pendentes: number;
  acuracidade_por_item: number;
  acuracidade_ponderada_qtd: number;
  acuracidade_ponderada_valor: number;
  total_sobra: number;
  total_falta: number;
  impacto_total: number;
}

function fmtEnd(rua: number | null, predio: number | null, nivel: number | null, apto: number | null): string {
  if (rua == null && predio == null && nivel == null && apto == null) return "—";
  const p = (n: number | null) => String(n ?? 0).padStart(2, "0");
  return `R${p(rua)}-P${p(predio)}-N${p(nivel)}-A${p(apto)}`;
}

function calcSeveridade(diffPct: number): Severidade {
  const a = Math.abs(diffPct);
  if (a === 0) return "OK";
  if (a <= 5) return "PEQUENA";
  if (a <= 20) return "MEDIA";
  return "GRANDE";
}

export async function fetchInventarioReport(filters: InventarioFilter): Promise<{ rows: InventarioRow[]; kpis: InventarioKpis }> {
  // 1) Carrega cabeçalhos de inventário (filtros + lookup)
  let invQuery = (supabase as any)
    .from("inventario")
    .select("id, numero_inventario, descricao, status, iniciado_em, finalizado_em, armazem_id, empresa_id")
    .eq("tenant_id", filters.tenant_id);
  if (filters.empresa_id) invQuery = invQuery.eq("empresa_id", filters.empresa_id);
  if (filters.armazem_id) invQuery = invQuery.eq("armazem_id", filters.armazem_id);
  if (filters.inventario_id) invQuery = invQuery.eq("id", filters.inventario_id);
  if (filters.data_inicio) invQuery = invQuery.gte("iniciado_em", filters.data_inicio);
  if (filters.data_fim) invQuery = invQuery.lte("iniciado_em", filters.data_fim);

  const { data: invs, error: errInv } = await invQuery;
  if (errInv) throw errInv;
  if (!invs || invs.length === 0) {
    return { rows: [], kpis: emptyKpis() };
  }

  const invMap = new Map<string, any>();
  for (const i of invs) invMap.set(i.id, i);
  const invIds = invs.map((i: any) => i.id);

  // 2) Itens do(s) inventário(s) na view consolidada
  let itensQuery = (supabase as any)
    .from("inventario_item_resumo")
    .select("*")
    .in("inventario_id", invIds)
    .limit(5000);
  if (filters.sku) itensQuery = itensQuery.ilike("sku", `%${filters.sku}%`);
  if (filters.rua !== undefined) itensQuery = itensQuery.eq("rua", filters.rua);
  if (filters.predio !== undefined) itensQuery = itensQuery.eq("predio", filters.predio);
  if (filters.nivel !== undefined) itensQuery = itensQuery.eq("nivel", filters.nivel);
  if (filters.apto !== undefined) itensQuery = itensQuery.eq("apto", filters.apto);

  const { data: itens, error: errItens } = await itensQuery;
  if (errItens) throw errItens;
  if (!itens || itens.length === 0) {
    return { rows: [], kpis: emptyKpis() };
  }

  // 3) Carrega preço de custo dos produtos envolvidos (lookup por sku)
  const skus = Array.from(new Set(itens.map((i: any) => i.sku).filter(Boolean)));
  const precoMap = new Map<string, number>();
  if (skus.length > 0) {
    const { data: prods } = await (supabase as any)
      .from("produto")
      .select("sku, preco_custo")
      .eq("tenant_id", filters.tenant_id)
      .in("sku", skus);
    for (const p of (prods || [])) {
      precoMap.set(p.sku, Number(p.preco_custo) || 0);
    }
  }

  // 4) Mapeia para linhas do relatório
  let rows: InventarioRow[] = itens.map((it: any) => {
    const inv = invMap.get(it.inventario_id);
    const sistemico = Number(it.quantidade_requerida) || 0;
    const isPendente = it.saldo_final == null && it.primeira_contagem == null;
    const contado = Number(it.saldo_final ?? it.primeira_contagem ?? 0);
    const diferenca = contado - sistemico;
    const diferenca_pct = sistemico > 0
      ? (diferenca / sistemico) * 100
      : (contado > 0 ? 100 : 0);
    const acuracidade_item = sistemico > 0
      ? Math.max(0, (1 - Math.abs(diferenca) / sistemico) * 100)
      : (contado === 0 ? 100 : 0);
    const preco = precoMap.get(it.sku) || 0;
    const impacto = Math.abs(diferenca) * preco;

    let status_calc: StatusItem;
    if (isPendente) status_calc = "PENDENTE";
    else if (diferenca === 0) status_calc = "CONFORME";
    else if (diferenca > 0) status_calc = "SOBRA";
    else status_calc = "FALTA";

    return {
      id: it.id || `${it.inventario_id}-${it.sku}-${it.rua}-${it.predio}-${it.nivel}-${it.apto}`,
      inventario_id: it.inventario_id,
      numero_inventario: inv?.numero_inventario ?? 0,
      inventario_status: inv?.status ?? "",
      inventario_finalizado_em: inv?.finalizado_em ?? null,
      sku: it.sku || "—",
      descricao: it.descricao || "—",
      endereco: fmtEnd(it.rua, it.predio, it.nivel, it.apto),
      rua: it.rua,
      predio: it.predio,
      nivel: it.nivel,
      apto: it.apto,
      lote: "—",
      qtd_sistemica: sistemico,
      qtd_contada: contado,
      diferenca,
      diferenca_pct,
      acuracidade_item,
      preco_custo: preco,
      impacto_financeiro: impacto,
      status_calc,
      severidade: isPendente ? "OK" : calcSeveridade(diferenca_pct),
      status_view: it.status,
    };
  });

  // 5) Filtros client-side
  if (filters.status) rows = rows.filter((r) => r.status_calc === filters.status);
  if (filters.severidade) rows = rows.filter((r) => r.severidade === filters.severidade);
  if (filters.apenas_divergentes) rows = rows.filter((r) => r.status_calc !== "CONFORME" && r.status_calc !== "PENDENTE");
  if (filters.incluir_pendentes === false) rows = rows.filter((r) => r.status_calc !== "PENDENTE");

  // 6) Ordenação default: severidade desc → impacto desc
  const sevRank: Record<Severidade, number> = { GRANDE: 4, MEDIA: 3, PEQUENA: 2, OK: 1 };
  rows.sort((a, b) => {
    const s = sevRank[b.severidade] - sevRank[a.severidade];
    if (s !== 0) return s;
    return b.impacto_financeiro - a.impacto_financeiro;
  });

  // 7) KPIs (agregados — exclui pendentes do cálculo de acuracidade)
  const consideradas = rows.filter((r) => r.status_calc !== "PENDENTE");
  const totalSistemico = consideradas.reduce((a, r) => a + r.qtd_sistemica, 0);
  const totalAbsDiff = consideradas.reduce((a, r) => a + Math.abs(r.diferenca), 0);
  const totalValorSistemico = consideradas.reduce((a, r) => a + r.qtd_sistemica * r.preco_custo, 0);
  const totalImpacto = consideradas.reduce((a, r) => a + r.impacto_financeiro, 0);
  const conformes = consideradas.filter((r) => r.status_calc === "CONFORME").length;
  const divergentes = consideradas.length - conformes;
  const pendentes = rows.length - consideradas.length;
  const sobra = consideradas.filter((r) => r.diferenca > 0).reduce((a, r) => a + r.diferenca, 0);
  const falta = consideradas.filter((r) => r.diferenca < 0).reduce((a, r) => a + Math.abs(r.diferenca), 0);

  const kpis: InventarioKpis = {
    total_itens: rows.length,
    itens_conformes: conformes,
    itens_divergentes: divergentes,
    itens_pendentes: pendentes,
    acuracidade_por_item: consideradas.length > 0 ? (conformes / consideradas.length) * 100 : 0,
    acuracidade_ponderada_qtd: totalSistemico > 0 ? Math.max(0, (1 - totalAbsDiff / totalSistemico) * 100) : 100,
    acuracidade_ponderada_valor: totalValorSistemico > 0 ? Math.max(0, (1 - totalImpacto / totalValorSistemico) * 100) : 100,
    total_sobra: sobra,
    total_falta: falta,
    impacto_total: totalImpacto,
  };

  return { rows, kpis };
}

function emptyKpis(): InventarioKpis {
  return {
    total_itens: 0,
    itens_conformes: 0,
    itens_divergentes: 0,
    itens_pendentes: 0,
    acuracidade_por_item: 0,
    acuracidade_ponderada_qtd: 0,
    acuracidade_ponderada_valor: 0,
    total_sobra: 0,
    total_falta: 0,
    impacto_total: 0,
  };
}

export async function fetchInventariosLookup(tenantId: string, empresaId?: string) {
  let q = (supabase as any)
    .from("inventario")
    .select("id, numero_inventario, descricao, status, iniciado_em, finalizado_em")
    .eq("tenant_id", tenantId)
    .order("numero_inventario", { ascending: false })
    .limit(200);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data } = await q;
  return data || [];
}
