import { supabase } from "@/integrations/supabase/client";

/**
 * Relatório Acuracidade de Inventário — toda a regra roda na RPC
 * `rpc_relatorio_inventario` (migrations 20261112160514 e 20261112161645):
 *  - itens = tarefas INV-AUDIT/INV-ATU do inventário (canceladas fora);
 *  - PENDENTE = tarefa ainda não contada (status CRIADA/ATRIBUIDA/EM_ANDAMENTO/PAUSADA);
 *  - qtd. contada = última contagem; preço de custo pelo produto da tarefa;
 *  - data da contagem = conclusão da tarefa (ou última execução concluída),
 *    filtrada por intervalo no fuso America/Fortaleza;
 *  - tipo de execução (Auditoria / Atualização) com filtro, e usuário da última contagem;
 *  - status, severidade, ordenação (severidade ↓, impacto ↓) e KPIs no servidor.
 * A RPC é paginada e devolve, em cada linha, os KPIs do conjunto filtrado.
 */

export type StatusItem = "CONFORME" | "SOBRA" | "FALTA" | "PENDENTE";
export type Severidade = "OK" | "PEQUENA" | "MEDIA" | "GRANDE";
export type TipoExecucao = "AUDITORIA" | "ATUALIZACAO";

export interface InventarioFilter {
  tenant_id: string;
  empresa_id: string;
  inventario_id?: string;          // vazio → todos os inventários da empresa
  armazem_id?: string;
  data_contagem_inicio?: string;   // AAAA-MM-DD (data local da contagem)
  data_contagem_fim?: string;      // AAAA-MM-DD (inclusive)
  sku?: string;
  rua?: number;
  predio?: number;
  nivel?: number;
  apto?: number;
  status?: StatusItem;
  severidade?: Severidade;
  apenas_divergentes?: boolean;
  tipo_execucao?: TipoExecucao;
}

export interface InventarioRow {
  id: string;
  inventario_id: string;
  numero_inventario: number;
  inventario_status: string;
  inventario_finalizado_em: string | null;
  produto_id: string;
  sku: string;
  descricao: string;
  endereco: string;
  rua: number | null;
  predio: number | null;
  nivel: number | null;
  apto: number | null;
  qtd_sistemica: number;
  qtd_contada: number;
  diferenca: number;
  diferenca_pct: number;
  acuracidade_item: number;        // 0..100
  preco_custo: number;
  impacto_financeiro: number;
  status_calc: StatusItem;
  severidade: Severidade;
  status_tarefa: string;
  numero_contagens: number;
  data_contagem: string | null;
  tipo_execucao: TipoExecucao;
  usuario_contagem: string;        // vazio em pendentes
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

export interface InventarioPage {
  rows: InventarioRow[];
  kpis: InventarioKpis;
}

export const INVENTARIO_PAGE_SIZE = 100;
const EXPORT_PAGE_SIZE = 1000; // máximo aceito pela RPC
const EXPORT_CONCORRENCIA = 4;

const num = (v: unknown) => Number(v) || 0;
const numOuNull = (v: unknown) => (v == null ? null : Number(v));

export function emptyKpis(): InventarioKpis {
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

export function fmtEnd(rua: number | null, predio: number | null, nivel: number | null, apto: number | null): string {
  if (rua == null && predio == null && nivel == null && apto == null) return "—";
  const p = (n: number | null) => String(n ?? 0).padStart(2, "0");
  return `R${p(rua)}-P${p(predio)}-N${p(nivel)}-A${p(apto)}`;
}

function toParams(f: InventarioFilter, limit: number, offset: number) {
  return {
    p_tenant_id: f.tenant_id,
    p_empresa_id: f.empresa_id,
    p_inventario_id: f.inventario_id || null,
    p_armazem_id: f.armazem_id || null,
    p_data_contagem_inicio: f.data_contagem_inicio || null,
    p_data_contagem_fim: f.data_contagem_fim || null,
    p_sku: f.sku?.trim() || null,
    p_rua: f.rua ?? null,
    p_predio: f.predio ?? null,
    p_nivel: f.nivel ?? null,
    p_apto: f.apto ?? null,
    p_status: f.status || null,
    p_severidade: f.severidade || null,
    p_apenas_divergentes: !!f.apenas_divergentes,
    p_tipo_execucao: f.tipo_execucao || null,
    p_limit: limit,
    p_offset: offset,
  };
}

function mapRow(r: any): InventarioRow {
  const rua = numOuNull(r.rua);
  const predio = numOuNull(r.predio);
  const nivel = numOuNull(r.nivel);
  const apto = numOuNull(r.apto);
  return {
    id: r.id,
    inventario_id: r.inventario_id,
    numero_inventario: num(r.numero_inventario),
    inventario_status: r.inventario_status ?? "",
    inventario_finalizado_em: r.inventario_finalizado_em ?? null,
    produto_id: r.produto_id,
    sku: r.sku || "—",
    descricao: r.descricao || "—",
    endereco: fmtEnd(rua, predio, nivel, apto),
    rua, predio, nivel, apto,
    qtd_sistemica: num(r.qtd_sistemica),
    qtd_contada: num(r.qtd_contada),
    diferenca: num(r.diferenca),
    diferenca_pct: num(r.diferenca_pct),
    acuracidade_item: num(r.acuracidade_item),
    preco_custo: num(r.preco_custo),
    impacto_financeiro: num(r.impacto_financeiro),
    status_calc: r.status_calc,
    severidade: r.severidade,
    status_tarefa: r.status_tarefa ?? "",
    numero_contagens: num(r.numero_contagens),
    data_contagem: r.data_contagem ?? null,
    tipo_execucao: r.tipo_execucao,
    usuario_contagem: r.usuario_contagem ?? "",
  };
}

function mapKpis(r: any | undefined): InventarioKpis {
  if (!r) return emptyKpis();
  return {
    total_itens: num(r.total_itens),
    itens_conformes: num(r.itens_conformes),
    itens_divergentes: num(r.itens_divergentes),
    itens_pendentes: num(r.itens_pendentes),
    acuracidade_por_item: num(r.acuracidade_por_item),
    acuracidade_ponderada_qtd: num(r.acuracidade_ponderada_qtd),
    acuracidade_ponderada_valor: num(r.acuracidade_ponderada_valor),
    total_sobra: num(r.total_sobra),
    total_falta: num(r.total_falta),
    impacto_total: num(r.impacto_total),
  };
}

async function callRpc(f: InventarioFilter, limit: number, offset: number): Promise<any[]> {
  const { data, error } = await (supabase as any).rpc("rpc_relatorio_inventario", toParams(f, limit, offset));
  if (error) throw error;
  return (data as any[]) || [];
}

/** Uma página do relatório + KPIs do conjunto filtrado inteiro. */
export async function fetchInventarioPage(
  filters: InventarioFilter,
  page: number,
  pageSize = INVENTARIO_PAGE_SIZE,
): Promise<InventarioPage> {
  const data = await callRpc(filters, pageSize, page * pageSize);
  return { rows: data.map(mapRow), kpis: mapKpis(data[0]) };
}

/** Todas as linhas (para Excel/PDF). Páginas de 1000, até 4 em paralelo. */
export async function fetchInventarioAll(
  filters: InventarioFilter,
  totalItens: number,
): Promise<InventarioRow[]> {
  const paginas = Math.ceil(totalItens / EXPORT_PAGE_SIZE);
  const resultado: InventarioRow[][] = new Array(paginas);
  let proxima = 0;
  const worker = async () => {
    while (proxima < paginas) {
      const p = proxima++;
      const data = await callRpc(filters, EXPORT_PAGE_SIZE, p * EXPORT_PAGE_SIZE);
      resultado[p] = data.map(mapRow);
    }
  };
  await Promise.all(Array.from({ length: Math.min(EXPORT_CONCORRENCIA, paginas) }, worker));
  return resultado.flat();
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
