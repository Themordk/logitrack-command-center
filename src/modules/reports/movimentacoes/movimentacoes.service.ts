import { supabase } from "@/integrations/supabase/client";
import { fetchAllRpcRows } from "../utils/fetchAllRpcRows";

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
  const data = await fetchAllRpcRows(
    "rpc_historico_movimento_com_saldo",
    {
      p_tenant_id: filters.tenant_id,
      p_empresa_id: filters.empresa_id || null,
      p_data_inicio: filters.data_inicio,
      p_data_fim: filters.data_fim,
      p_sku: filters.sku || null,
      p_tipo_mov: filters.tipo_movimento ?? null,
    },
  );

  let results = data.map((row: any) => ({
    id: row.id,
    criado_em: row.criado_em,
    sku: row.sku || "",
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
    saldo_anterior_origem: row.saldo_anterior_origem != null ? Number(row.saldo_anterior_origem) : null,
    saldo_posterior_origem: row.saldo_posterior_origem != null ? Number(row.saldo_posterior_origem) : null,
    saldo_anterior_destino: row.saldo_anterior_destino != null ? Number(row.saldo_anterior_destino) : null,
    saldo_posterior_destino: row.saldo_posterior_destino != null ? Number(row.saldo_posterior_destino) : null,
    saldo_inicial: Number(row.saldo_inicial ?? 0),
    saldo_final: Number(row.saldo_final ?? 0),
  }));

  // RPC já filtra por SKU exato; mantém ILIKE no client p/ compat. com busca parcial.
  if (filters.sku) {
    results = results.filter((r) =>
      r.sku.toLowerCase().includes(filters.sku!.toLowerCase()),
    );
  }

  return results;
}

export interface TarefaDetalheResult {
  tarefa: any;
  documento_origem: any | null;
  execucoes: any[];
}

export async function fetchTarefaDetalhe(tarefaExecucaoId: string): Promise<TarefaDetalheResult | null> {
  const { data: execucao, error: execError } = await supabase
    .from("tarefa_execucao")
    .select("tarefa_id")
    .eq("id", tarefaExecucaoId)
    .maybeSingle();

  if (execError) throw execError;
  if (!execucao) return null;

  const tarefaId = execucao.tarefa_id;

  const { data: tarefa, error: tarefaError } = await supabase
    .from("tarefa")
    .select(`
      *,
      tipo_tarefa:tipo_tarefa_id ( codigo, descricao ),
      produto:produto_id ( sku, descricao )
    `)
    .eq("id", tarefaId)
    .maybeSingle();

  if (tarefaError) throw tarefaError;
  if (!tarefa) return null;

  const endIds = [tarefa.id_local_origem, tarefa.id_local_destino].filter(Boolean);
  if (endIds.length > 0) {
    const { data: enderecos } = await supabase
      .from("endereco")
      .select("id, descricao, codigo_endereco")
      .in("id", endIds);
    if (enderecos) {
      const endMap = Object.fromEntries(enderecos.map((e: any) => [e.id, e]));
      (tarefa as any).endereco_origem = endMap[tarefa.id_local_origem] || null;
      (tarefa as any).endereco_destino = endMap[tarefa.id_local_destino] || null;
    }
  }

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

  const docOrigem = await fetchDocumentoOrigem(
    tarefa.tipo_documento_origem,
    tarefa.id_documento_origem,
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
        movimento_saida:movimento_saida!fk_onda_item_onda (
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
