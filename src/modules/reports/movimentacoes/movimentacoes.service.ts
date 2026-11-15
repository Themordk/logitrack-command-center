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
  armazem_id?: string;
  rua?: number;
  predio?: number;
  nivel?: number;
  apto?: number;
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
      p_armazem_id: filters.armazem_id || null,
      p_rua: filters.rua ?? null,
      p_predio: filters.predio ?? null,
      p_nivel: filters.nivel ?? null,
      p_apto: filters.apto ?? null,
    },
  );

  const results = data.map((row: any) => ({
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
    // Preenchido nos estornos: tarefa_execucao_id passa a apontar para a execução estornada
    estorno_da_execucao_id: row.estorno_da_execucao_id || "",
    tipo_tarefa_codigo: row.tipo_tarefa_codigo || "",
    tipo_tarefa_descricao: row.tipo_tarefa_descricao || "",
    tarefa_execucao_status: row.tarefa_execucao_status || "",
    saldo_anterior_origem: row.saldo_anterior_origem != null ? Number(row.saldo_anterior_origem) : null,
    saldo_posterior_origem: row.saldo_posterior_origem != null ? Number(row.saldo_posterior_origem) : null,
    saldo_anterior_destino: row.saldo_anterior_destino != null ? Number(row.saldo_anterior_destino) : null,
    saldo_posterior_destino: row.saldo_posterior_destino != null ? Number(row.saldo_posterior_destino) : null,
    saldo_inicial: Number(row.saldo_inicial ?? 0),
    saldo_final: Number(row.saldo_final ?? 0),
    // Saldo total do SKU na empresa (todos os endereços/armazéns, inclui bloqueado)
    saldo_global_anterior: row.saldo_global_anterior != null ? Number(row.saldo_global_anterior) : null,
    saldo_global_posterior: row.saldo_global_posterior != null ? Number(row.saldo_global_posterior) : null,
  }));

  // A busca exata por SKU é feita no backend (rpc_historico_movimento_com_saldo).
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
    case "LIMPEZA_SEPARACAO_ITEM": return "Limpeza Separação";
    case "CANCELAMENTO_DOCUMENTO_SAIDA": return "Canc. Doc. Saída";
    case "ALTERACAO_DOCUMENTO_SAIDA": return "Alteração Doc. Saída";
    case "REMOCAO_DOCUMENTO": return "Remoção Documento";
    case "CANCELAMENTO_ENTRADA": return "Canc. Entrada";
    case "CONVERSAO_UNIDADE": return "Conversão Unidade";
    case "TRANSFERENCIA_PICKING_MASSA": return "Mudança Picking";
    case "CARGA_INICIAL": return "Carga Inicial";
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

export interface MovimentacoesResumo {
  total: number;
  entradas_qtd: number;        // soma do que aumentou o saldo global do SKU
  entradas_mov: number;
  saidas_qtd: number;          // soma do que reduziu o saldo global do SKU
  saidas_mov: number;
  internas_mov: number;        // não alteram o saldo global (transferência, armazenagem…)
  inventario_mov: number;
  inventario_liquido: number;  // efeito líquido dos ajustes de inventário
  estornos_mov: number;
  saldo_inicial: number | null; // saldo global antes do 1º movimento listado
  saldo_final: number | null;   // saldo global depois do último movimento listado
  ultimo_movimento: string | null;
  usuarios: number;
}

/**
 * Indicadores do histórico, calculados sobre as linhas já retornadas pela RPC
 * (o relatório exige SKU, então a tela já tem o conjunto completo do período).
 * Entrada/saída/interna pelo efeito no saldo global do SKU
 * (saldo_global_posterior − saldo_global_anterior). A RPC ordena do mais
 * recente para o mais antigo; a função não depende dessa ordem.
 */
export function calcularResumoMovimentacoes(rows: any[]): MovimentacoesResumo {
  const r: MovimentacoesResumo = {
    total: rows.length,
    entradas_qtd: 0, entradas_mov: 0,
    saidas_qtd: 0, saidas_mov: 0,
    internas_mov: 0,
    inventario_mov: 0, inventario_liquido: 0,
    estornos_mov: 0,
    saldo_inicial: null, saldo_final: null,
    ultimo_movimento: null,
    usuarios: 0,
  };
  if (rows.length === 0) return r;

  const usuarios = new Set<string>();
  let primeiro: any = null;
  let ultimo: any = null;
  // Ordena por instante (Date.parse) e desempata por id, como a RPC.
  const antes = (a: any, b: any) => {
    const ta = Date.parse(a.criado_em ?? "") || 0;
    const tb = Date.parse(b.criado_em ?? "") || 0;
    return ta !== tb ? ta < tb : String(a.id ?? "") < String(b.id ?? "");
  };

  for (const row of rows) {
    const ant = row.saldo_global_anterior;
    const pos = row.saldo_global_posterior;
    const efeito = ant != null && pos != null ? Number(pos) - Number(ant) : 0;
    if (efeito > 0) { r.entradas_qtd += efeito; r.entradas_mov++; }
    else if (efeito < 0) { r.saidas_qtd += -efeito; r.saidas_mov++; }
    else r.internas_mov++;

    if (Number(row.tipo_movimento) === 6) { r.inventario_mov++; r.inventario_liquido += efeito; }
    if (Number(row.tipo_movimento) === 99 || row.estorno_da_execucao_id) r.estornos_mov++;
    if (row.usuario && row.usuario !== "—") usuarios.add(row.usuario);

    if (!primeiro || antes(row, primeiro)) primeiro = row;
    if (!ultimo || antes(ultimo, row)) ultimo = row;
  }

  r.usuarios = usuarios.size;
  r.saldo_inicial = primeiro?.saldo_global_anterior != null ? Number(primeiro.saldo_global_anterior) : null;
  r.saldo_final = ultimo?.saldo_global_posterior != null ? Number(ultimo.saldo_global_posterior) : null;
  r.ultimo_movimento = ultimo?.criado_em ?? null;
  return r;
}
