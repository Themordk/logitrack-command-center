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

export interface TarefaDetalheResult {
  tarefa: any;
  documento_origem: any | null;
  execucoes: any[];
}

export async function fetchTarefaDetalhe(tarefaExecucaoId: string): Promise<TarefaDetalheResult | null> {
  // 1. Fetch the tarefa_execucao to get the tarefa_id
  const { data: execucao, error: execError } = await supabase
    .from("tarefa_execucao")
    .select("tarefa_id")
    .eq("id", tarefaExecucaoId)
    .maybeSingle();

  if (execError) throw execError;
  if (!execucao) return null;

  const tarefaId = execucao.tarefa_id;

  // 2. Fetch tarefa with joins
  const { data: tarefa, error: tarefaError } = await supabase
    .from("tarefa")
    .select(`
      *,
      tipo_tarefa:tipo_tarefa_id (
        codigo,
        descricao
      ),
      produto:produto_id (
        sku,
        descricao
      )
    `)
    .eq("id", tarefaId)
    .maybeSingle();

  if (tarefaError) throw tarefaError;
  if (!tarefa) return null;

  // 3. Fetch tarefa enderecos (id_local_origem / id_local_destino)
  const endIds = [tarefa.id_local_origem, tarefa.id_local_destino].filter(Boolean);
  if (endIds.length > 0) {
    const { data: enderecos } = await supabase
      .from("endereco")
      .select("id, descricao, codigo_endereco")
      .in("id", endIds);
    if (enderecos) {
      const endMap = Object.fromEntries(enderecos.map((e: any) => [e.id, e]));
      tarefa.endereco_origem = endMap[tarefa.id_local_origem] || null;
      tarefa.endereco_destino = endMap[tarefa.id_local_destino] || null;
    }
  }

  // 4. Fetch ALL executions for this tarefa
  const { data: execucoes, error: execListError } = await supabase
    .from("tarefa_execucao")
    .select(`
      *,
      usuario:usuario_id ( nome ),
      endereco_origem:endereco_origem_id ( descricao, codigo_endereco ),
      endereco_destino:endereco_destino_id ( descricao, codigo_endereco )
    `)
    .eq("tarefa_id", tarefaId)
    .order("atribuido_em", { ascending: true });

  if (execListError) throw execListError;

  // 5. Fetch source document info
  const docOrigem = await fetchDocumentoOrigem(
    tarefa.tipo_documento_origem,
    tarefa.id_documento_origem
  );

  return {
    tarefa,
    documento_origem: docOrigem,
    execucoes: execucoes || [],
  };
}

async function fetchDocumentoOrigem(tipo: string | null, id: string | null): Promise<any | null> {
  if (!tipo || !id) return null;

  if (tipo === "MOVIMENTO_ENTRADA_ITEM") {
    const { data: item } = await supabase
      .from("movimento_entrada_item")
      .select(`
        id, qtd_esperada, qtd_conferida, qtd_armazenada, qtd_ocorrencia, status_item_movimento,
        produto:produto_id ( sku, descricao ),
        movimento_entrada:movimento_entrada_id (
          id, numero_movimento, status, observacao,
          box:box_id ( descricao )
        )
      `)
      .eq("id", id)
      .maybeSingle();

    if (!item) return { tipo, id_documento_origem: id };

    const mov = (item as any).movimento_entrada || {};
    return {
      tipo,
      tipo_label: "Mov. Entrada",
      numero: mov.numero_movimento,
      status: mov.status,
      box: mov.box?.descricao || null,
      observacao: mov.observacao,
      produto_sku: (item as any).produto?.sku,
      produto_descricao: (item as any).produto?.descricao,
      qtd_esperada: item.qtd_esperada,
      qtd_conferida: item.qtd_conferida,
      qtd_armazenada: item.qtd_armazenada,
      status_item: item.status_item_movimento,
      movimento_id: mov.id,
    };
  }

  if (tipo === "MOVIMENTO_SAIDA_ITEM") {
    const { data: item } = await supabase
      .from("movimento_saida_item")
      .select(`
        id, qtd_esperada, qtd_separada, qtde_cortada, status, valor_unit, valor_total,
        produto:produto_id ( sku, descricao ),
        movimento_saida:movimento_saida_id (
          id, numero_onda, status, destino_carga, observacao,
          rota:rota_id ( descricao )
        )
      `)
      .eq("id", id)
      .maybeSingle();

    if (!item) return { tipo, id_documento_origem: id };

    const mov = (item as any).movimento_saida || {};
    return {
      tipo,
      tipo_label: "Mov. Saída",
      numero: mov.numero_onda,
      status: mov.status,
      rota: mov.rota?.descricao || null,
      destino_carga: mov.destino_carga,
      observacao: mov.observacao,
      produto_sku: (item as any).produto?.sku,
      produto_descricao: (item as any).produto?.descricao,
      qtd_esperada: item.qtd_esperada,
      qtd_separada: item.qtd_separada,
      qtd_cortada: item.qtde_cortada,
      status_item: item.status,
      movimento_id: mov.id,
    };
  }

  if (tipo === "INVENTARIO") {
    return { tipo, tipo_label: "Inventário", id_documento_origem: id };
  }

  return { tipo, tipo_label: tipo, id_documento_origem: id };
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

export function getPrioridadeLabel(p: string | null): string {
  switch (p) {
    case "URGENTE": return "Urgente";
    case "ALTA": return "Alta";
    case "NORMAL": return "Normal";
    case "BAIXA": return "Baixa";
    default: return p || "—";
  }
}

export function getPrioridadeColor(p: string | null): string {
  switch (p) {
    case "URGENTE": return "bg-red-500/15 text-red-400 border-red-500/30";
    case "ALTA": return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "NORMAL": return "bg-blue-500/15 text-blue-400 border-blue-500/30";
    case "BAIXA": return "bg-gray-500/15 text-gray-400 border-gray-500/30";
    default: return "bg-secondary text-secondary-foreground";
  }
}
