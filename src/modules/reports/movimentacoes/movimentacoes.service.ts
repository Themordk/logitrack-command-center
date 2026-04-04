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
    .from("vw_estoque_movimento_relatorio")
    .select(`
      id,
      criado_em,
      tipo_movimento,
      quantidade,
      lote,
      hu_id,
      tarefa_execucao_id,
      sku,
      produto_descricao,
      endereco_origem,
      endereco_destino,
      usuario_nome,
      tipo_documento_origem,
      tipo_tarefa_codigo,
      tipo_tarefa_descricao,
      tarefa_execucao_status
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
    sku: row.sku || "",
    descricao: row.produto_descricao || "",
    lote: row.lote || "",
    hu_id: row.hu_id || "",
    origem: row.endereco_origem ?? "—",
    destino: row.endereco_destino ?? "—",
    tipo_movimento: row.tipo_movimento,
    quantidade: Number(row.quantidade),
    usuario: row.usuario_nome || "—",
    tipo_documento_origem: row.tipo_documento_origem || "",
    tarefa_execucao_id: row.tarefa_execucao_id || "",
    tipo_tarefa_codigo: row.tipo_tarefa_codigo || "",
    tipo_tarefa_descricao: row.tipo_tarefa_descricao || "",
    tarefa_execucao_status: row.tarefa_execucao_status || "",
  }));

  if (filters.sku) results = results.filter(r => r.sku.toLowerCase().includes(filters.sku!.toLowerCase()));

  return results;
}

export async function fetchTarefaDetalhe(tarefaExecucaoId: string) {
  // Fetch tarefa_execucao with tarefa details (avoid nested FK joins for endereco)
  const { data: execucao, error: execError } = await supabase
    .from("tarefa_execucao")
    .select(`
      *,
      tarefa:tarefa_id (
        *,
        tipo_tarefa:tipo_tarefa_id (
          codigo,
          descricao
        ),
        produto:produto_id (
          sku,
          descricao
        )
      ),
      usuario:usuario_id (
        nome
      ),
      endereco_origem:endereco_origem_id (
        descricao,
        codigo_endereco
      ),
      endereco_destino:endereco_destino_id (
        descricao,
        codigo_endereco
      )
    `)
    .eq("id", tarefaExecucaoId)
    .maybeSingle();

  if (execError) throw execError;
  if (!execucao) return null;

  // Fetch tarefa's endereco_origem and endereco_destino separately if they exist
  const tarefa = execucao.tarefa as any;
  if (tarefa) {
    const endIds = [tarefa.endereco_origem_id, tarefa.endereco_destino_id].filter(Boolean);
    if (endIds.length > 0) {
      const { data: enderecos } = await supabase
        .from("endereco")
        .select("id, descricao, codigo_endereco")
        .in("id", endIds);
      if (enderecos) {
        const endMap = Object.fromEntries(enderecos.map(e => [e.id, e]));
        tarefa.endereco_origem = endMap[tarefa.endereco_origem_id] || null;
        tarefa.endereco_destino = endMap[tarefa.endereco_destino_id] || null;
      }
    }
  }

  return execucao;
}

export function getTipoMovimentoLabel(tipo: number): string {
  switch (tipo) {
    case 1: return "Entrada";
    case 2: return "Saída";
    case 3: return "Transferência";
    case 4: return "Armazenagem";
    case 5: return "Separação";
    case 6: return "Inventário";
    case 99: return "Estorno";
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
    case 6: return "text-orange-400";
    case 99: return "text-yellow-400";
    default: return "text-muted-foreground";
  }
}

export function getTipoDocumentoLabel(tipo: string): string {
  switch (tipo) {
    case "MOVIMENTO_ENTRADA_ITEM": return "Mov. Entrada";
    case "MOVIMENTO_SAIDA_ITEM": return "Mov. Saída";
    case "INVENTARIO": return "Inventário";
    default: return tipo || "—";
  }
}
