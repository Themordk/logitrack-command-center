import { supabase } from "@/integrations/supabase/client";

export interface OcupacaoFilter {
  tenant_id: string;
  empresa_id: string;
  armazem_id: string;
  setor_id?: string;
  tipo_endereco?: string;
  status_ocupacao?: string;
}

export interface EnderecoOcupacao {
  id: string;
  descricao: string;
  setor_id: string;
  setor_descricao: string;
  tipo_endereco: string;
  situacao: string;
  total_pallet: number | null;
  m3: number | null;
  quantidade_total: number;
  skus_count: number;
  ultima_movimentacao: string | null;
  status_ocupacao: "LIVRE" | "PARCIAL" | "OCUPADO" | "BLOQUEADO";
  percentual_ocupacao: number;
}

export interface SetorResumo {
  setor_id: string;
  setor_descricao: string;
  total_enderecos: number;
  enderecos_ocupados: number;
  enderecos_livres: number;
  enderecos_bloqueados: number;
  percentual_ocupacao: number;
}

export interface OcupacaoKPIs {
  total_enderecos: number;
  enderecos_ocupados: number;
  percentual_ocupados: number;
  enderecos_livres: number;
  percentual_livres: number;
  taxa_media_ocupacao: number;
  setor_mais_saturado: string;
  setor_mais_ocioso: string;
}

export interface OcupacaoData {
  kpis: OcupacaoKPIs;
  setores: SetorResumo[];
  enderecos: EnderecoOcupacao[];
  statusDistribution: { name: string; value: number; fill: string }[];
}

function deriveStatus(situacao: string, qtdTotal: number): "LIVRE" | "PARCIAL" | "OCUPADO" | "BLOQUEADO" {
  if (situacao === "BLOQUEADO") return "BLOQUEADO";
  if (qtdTotal === 0) return "LIVRE";
  if (qtdTotal > 0) return "OCUPADO";
  return "LIVRE";
}

function derivePercentual(qtdTotal: number, skusCount: number): number {
  // Since capacity fields are often null, we use a presence-based approach:
  // If there's stock, we consider it occupied. For a more granular view,
  // we use skus_count as a proxy (1 SKU = ~33%, 2 = ~66%, 3+ = 100%)
  if (qtdTotal === 0) return 0;
  if (skusCount >= 3) return 100;
  if (skusCount === 2) return 66;
  return 33;
}

export async function fetchOcupacaoData(filters: OcupacaoFilter): Promise<OcupacaoData> {
  // 1. Fetch enderecos
  let endQuery = supabase
    .from("endereco")
    .select("id, descricao, setor_id, tipo_endereco, situacao, total_pallet, m3")
    .eq("tenant_id", filters.tenant_id)
    .eq("armazem_id", filters.armazem_id)
    .eq("ativo", true);

  if (filters.setor_id) endQuery = endQuery.eq("setor_id", filters.setor_id);
  if (filters.tipo_endereco) endQuery = endQuery.eq("tipo_endereco", filters.tipo_endereco);

  // 2. Fetch setores for this armazem
  const setoresQuery = supabase
    .from("setor")
    .select("id, descricao")
    .eq("tenant_id", filters.tenant_id)
    .eq("armazem_id", filters.armazem_id)
    .eq("ativo", true);

  // 3. Fetch estoque_geral aggregated
  const estoqueQuery = supabase
    .from("estoque_geral")
    .select("endereco_id, quantidade_total, produto_id")
    .eq("tenant_id", filters.tenant_id)
    .eq("empresa_id", filters.empresa_id)
    .gt("quantidade_total", 0);

  // Run all in parallel
  const [endResult, setoresResult, estoqueResult] = await Promise.all([
    endQuery,
    setoresQuery,
    estoqueQuery,
  ]);

  if (endResult.error) throw endResult.error;
  if (setoresResult.error) throw setoresResult.error;
  if (estoqueResult.error) throw estoqueResult.error;

  const enderecosList = endResult.data || [];
  const setoresList = setoresResult.data || [];
  const estoqueList = estoqueResult.data || [];

  // Build setor map
  const setorMap = new Map(setoresList.map(s => [s.id, s.descricao]));

  // Aggregate estoque by endereco_id
  const estoqueByEndereco = new Map<string, { qtdTotal: number; skus: Set<string> }>();
  for (const row of estoqueList) {
    if (!row.endereco_id) continue;
    const existing = estoqueByEndereco.get(row.endereco_id);
    if (existing) {
      existing.qtdTotal += Number(row.quantidade_total);
      existing.skus.add(row.produto_id);
    } else {
      estoqueByEndereco.set(row.endereco_id, {
        qtdTotal: Number(row.quantidade_total),
        skus: new Set([row.produto_id]),
      });
    }
  }

  // Build enderecos with ocupacao
  const enderecos: EnderecoOcupacao[] = enderecosList.map(end => {
    const estoque = estoqueByEndereco.get(end.id);
    const qtdTotal = estoque?.qtdTotal || 0;
    const skusCount = estoque?.skus.size || 0;
    const status = deriveStatus(end.situacao, qtdTotal);
    const percentual = status === "BLOQUEADO" ? 0 : derivePercentual(qtdTotal, skusCount);

    return {
      id: end.id,
      descricao: end.descricao,
      setor_id: end.setor_id,
      setor_descricao: setorMap.get(end.setor_id) || "—",
      tipo_endereco: end.tipo_endereco,
      situacao: end.situacao,
      total_pallet: end.total_pallet,
      m3: end.m3,
      quantidade_total: qtdTotal,
      skus_count: skusCount,
      ultima_movimentacao: null, // Will be enriched if needed
      status_ocupacao: status,
      percentual_ocupacao: percentual,
    };
  });

  // Apply status filter
  const filtered = filters.status_ocupacao
    ? enderecos.filter(e => e.status_ocupacao === filters.status_ocupacao)
    : enderecos;

  // Build setores resumo
  const setorAgg = new Map<string, SetorResumo>();
  for (const end of filtered) {
    const existing = setorAgg.get(end.setor_id);
    if (existing) {
      existing.total_enderecos++;
      if (end.status_ocupacao === "OCUPADO" || end.status_ocupacao === "PARCIAL") existing.enderecos_ocupados++;
      if (end.status_ocupacao === "LIVRE") existing.enderecos_livres++;
      if (end.status_ocupacao === "BLOQUEADO") existing.enderecos_bloqueados++;
    } else {
      setorAgg.set(end.setor_id, {
        setor_id: end.setor_id,
        setor_descricao: end.setor_descricao,
        total_enderecos: 1,
        enderecos_ocupados: end.status_ocupacao === "OCUPADO" || end.status_ocupacao === "PARCIAL" ? 1 : 0,
        enderecos_livres: end.status_ocupacao === "LIVRE" ? 1 : 0,
        enderecos_bloqueados: end.status_ocupacao === "BLOQUEADO" ? 1 : 0,
        percentual_ocupacao: 0,
      });
    }
  }

  const setores: SetorResumo[] = Array.from(setorAgg.values()).map(s => ({
    ...s,
    percentual_ocupacao: s.total_enderecos > 0 ? Math.round((s.enderecos_ocupados / s.total_enderecos) * 100) : 0,
  })).sort((a, b) => b.percentual_ocupacao - a.percentual_ocupacao);

  // KPIs
  const totalEnd = filtered.length;
  const ocupados = filtered.filter(e => e.status_ocupacao === "OCUPADO" || e.status_ocupacao === "PARCIAL").length;
  const livres = filtered.filter(e => e.status_ocupacao === "LIVRE").length;
  const taxaMedia = totalEnd > 0 ? Math.round((ocupados / totalEnd) * 100) : 0;

  const kpis: OcupacaoKPIs = {
    total_enderecos: totalEnd,
    enderecos_ocupados: ocupados,
    percentual_ocupados: totalEnd > 0 ? Math.round((ocupados / totalEnd) * 100) : 0,
    enderecos_livres: livres,
    percentual_livres: totalEnd > 0 ? Math.round((livres / totalEnd) * 100) : 0,
    taxa_media_ocupacao: taxaMedia,
    setor_mais_saturado: setores[0]?.setor_descricao || "—",
    setor_mais_ocioso: setores[setores.length - 1]?.setor_descricao || "—",
  };

  // Status distribution for pie chart
  const bloqueados = filtered.filter(e => e.status_ocupacao === "BLOQUEADO").length;
  const statusDistribution = [
    { name: "Ocupado", value: ocupados, fill: "hsl(0 84% 60%)" },
    { name: "Livre", value: livres, fill: "hsl(142 76% 36%)" },
    { name: "Bloqueado", value: bloqueados, fill: "hsl(45 93% 47%)" },
  ].filter(s => s.value > 0);

  return { kpis, setores, enderecos: filtered, statusDistribution };
}

export function getOcupacaoColor(percentual: number): string {
  if (percentual > 85) return "text-[hsl(var(--status-blocked))]";
  if (percentual >= 70) return "text-[hsl(var(--status-busy))]";
  return "text-[hsl(var(--status-free))]";
}

export function getOcupacaoBgColor(percentual: number): string {
  if (percentual > 85) return "bg-[hsl(var(--status-blocked))]";
  if (percentual >= 70) return "bg-[hsl(var(--status-busy))]";
  return "bg-[hsl(var(--status-free))]";
}

export function getOcupacaoProgressColor(percentual: number): string {
  if (percentual > 85) return "hsl(0 84% 60%)";
  if (percentual >= 70) return "hsl(45 93% 47%)";
  return "hsl(142 76% 36%)";
}
