import { supabase } from "@/integrations/supabase/client";

export interface CortesFilter {
  tenant_id: string;
  data_inicio: string;
  data_fim: string;
  empresa_id?: string;
  motivo_ocorrencia_id?: string;
  sku?: string;
}

export interface CorteRow {
  id: string;
  numero_onda: number;
  sku: string;
  descricao: string;
  preco_custo: number;
  qtde_cortada: number;
  custo_total_item: number;
  motivo: string;
  usuario: string;
  autorizado_em: string | null;
}

export async function fetchCortesReport(filters: CortesFilter): Promise<CorteRow[]> {
  let query = supabase
    .from("movimento_saida_item")
    .select(`
      id,
      qtde_cortada,
      autorizado_em,
      movimento_saida:movimento_saida_id (numero_onda),
      produto:produto_id (sku, descricao, preco_custo),
      motivo:motivo_ocorrencia (descricao),
      usuario_auth:usuario_autorizou (login)
    `)
    .gt("qtde_cortada", 0)
    .gte("autorizado_em", filters.data_inicio)
    .lte("autorizado_em", filters.data_fim + "T23:59:59");

  if (filters.motivo_ocorrencia_id) {
    query = query.eq("motivo_ocorrencia", filters.motivo_ocorrencia_id);
  }

  const { data, error } = await query.order("autorizado_em", { ascending: false });

  if (error) throw error;
  if (!data) return [];

  let rows: CorteRow[] = (data as any[]).map((r) => {
    const mov = r.movimento_saida as any;
    const prod = r.produto as any;
    const mot = r.motivo as any;
    const usr = r.usuario_auth as any;
    const precoCusto = prod?.preco_custo ?? 0;
    const qtdeCortada = Number(r.qtde_cortada ?? 0);

    return {
      id: r.id,
      numero_onda: mov?.numero_onda ?? 0,
      sku: prod?.sku ?? "",
      descricao: prod?.descricao ?? "",
      preco_custo: precoCusto,
      qtde_cortada: qtdeCortada,
      custo_total_item: precoCusto * qtdeCortada,
      motivo: mot?.descricao ?? "—",
      usuario: usr?.login ?? "—",
      autorizado_em: r.autorizado_em,
    };
  });

  // Client-side SKU filter
  if (filters.sku) {
    const skuLower = filters.sku.toLowerCase();
    rows = rows.filter((r) => r.sku.toLowerCase().includes(skuLower));
  }

  return rows;
}

export async function fetchMotivosOcorrencia(tenantId: string) {
  const { data } = await supabase
    .from("motivo_ocorrencia")
    .select("id, descricao")
    .eq("ativo", true)
    .order("descricao");
  return data ?? [];
}
