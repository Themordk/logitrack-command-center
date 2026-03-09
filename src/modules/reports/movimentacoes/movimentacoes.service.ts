import { supabase } from "@/integrations/supabase/client";

export interface MovimentacoesFilter {
  tenant_id: string;
  data_inicio: string;
  data_fim: string;
  empresa_id?: string;
  sku?: string;
  tipo_movimento?: number;
  usuario_id?: string;
}

export async function fetchMovimentacoesReport(filters: MovimentacoesFilter) {
  let query = supabase
    .from("estoque_movimento")
    .select(`
      id,
      criado_em,
      lote,
      hu_id,
      tipo_movimento,
      quantidade,
      produto:produto_id (
        sku,
        descricao
      ),
      endereco_origem:endereco_origem_id (
        codigo_endereco,
        descricao
      ),
      endereco_destino:endereco_destino_id (
        codigo_endereco,
        descricao
      ),
      usuario:usuario_id (
        nome
      )
    `)
    .eq("tenant_id", filters.tenant_id)
    .gte("criado_em", filters.data_inicio)
    .lte("criado_em", filters.data_fim + "T23:59:59")
    .order("criado_em", { ascending: false })
    .limit(500);

  if (filters.empresa_id) query = query.eq("empresa_id", filters.empresa_id);
  if (filters.tipo_movimento) query = query.eq("tipo_movimento", filters.tipo_movimento);
  if (filters.usuario_id) query = query.eq("usuario_id", filters.usuario_id);

  const { data, error } = await query;
  if (error) throw error;

  let results = (data || []).map((row: any) => ({
    id: row.id,
    criado_em: row.criado_em,
    sku: row.produto?.sku || "",
    descricao: row.produto?.descricao || "",
    lote: row.lote || "",
    hu_id: row.hu_id || "",
    origem: row.endereco_origem?.codigo_endereco ?? row.endereco_origem?.descricao ?? "—",
    destino: row.endereco_destino?.codigo_endereco ?? row.endereco_destino?.descricao ?? "—",
    tipo_movimento: row.tipo_movimento,
    quantidade: Number(row.quantidade),
    usuario: row.usuario?.nome || "—",
  }));

  if (filters.sku) results = results.filter(r => r.sku.toLowerCase().includes(filters.sku!.toLowerCase()));

  return results;
}

export function getTipoMovimentoLabel(tipo: number): string {
  switch (tipo) {
    case 1: return "Entrada";
    case 2: return "Saída";
    case 3: return "Transferência";
    case 4: return "Armazenagem";
    case 5: return "Separação";
    default: return `Tipo ${tipo}`;
  }
}

export function getTipoMovimentoColor(tipo: number): string {
  switch (tipo) {
    case 1: return "text-[hsl(var(--status-free))]";
    case 2: return "text-[hsl(var(--status-blocked))]";
    case 3: return "text-[hsl(var(--status-moving))]";
    case 4: return "text-[hsl(var(--status-free))]";
    case 5: return "text-purple-400";
    default: return "text-muted-foreground";
  }
}
