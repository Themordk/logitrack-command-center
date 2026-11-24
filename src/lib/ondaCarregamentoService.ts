import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { montarRotulosOperadores } from "@/lib/operadoresAtribuidos";
import { siglaEtapa } from "@/lib/responsaveisOndaService";
import type { PendenciaPicking } from "@/lib/pendenciasPicking.types";

/**
 * Ondas de Carregamento (web, Operação › Ondas de Carregamento).
 *
 * Lista: uma chamada (rpc_ondas_carregamento_lista) que já traz tipo de saída do
 * movimento, integração ERP, operadores, aguardando NF e "sem saldo".
 * Detalhe: uma chamada por aba (rpc_onda_carregamento_detalhe, p_secao).
 * As regras continuam no banco (listar_ondas_carregamento, rpc_onda_pendencias_picking,
 * conferencia_ondas_aguardando_nf, buscar_itens_onda_carregamento e views); a tela só exibe.
 */

export type SecaoDetalheOnda = "itens" | "separacao" | "conferencia" | "informacoes";

export interface OperadorOndaBruto {
  nome: string;
  codigo: string | null;
  ativo: boolean;
}

export interface OndaListaRow {
  id: string;
  numero_onda: number;
  status: string;
  prioridade: string;
  data_emissao: string;
  parceiro_nome: string | null;
  operador_nome: string | null;
  box_descricao: string | null;
  rota_descricao: string | null;
  veiculo_placa: string | null;
  motorista: string | null;
  total_pedidos: number | null;
  total_itens: number;
  total_esperado: number;
  total_separado: number;
  total_conferido: number;
  total_cortado: number;
  total_registros: number;
  tipo_saida_descricao: string | null;
  integracao_resumo: string | null;
  /** Rótulos prontos para o card ("Ana", "Lucas (SEP, CONF)"). */
  operadores: string[];
  /** Pedidos sem NF autorizada (só ondas SEPARADO/EM_CONFERENCIA); null = não aguarda NF. */
  docs_sem_nf: number | null;
  /** Tarefas de separação sem saldo/sem picking (só ondas LIBERADO/EM_PICKING). */
  qtd_sem_saldo: number;
  /** S2: pior situação de entrega dos pedidos da onda (movimento_saida.entrega_resumo). */
  entrega_resumo: string | null;
  /** S2: pedidos com entrega própria / entregues / não entregues. */
  entrega_total: number;
  entrega_entregues: number;
  entrega_nao_entregues: number;
  /** Pedidos da onda com erro de integração no ERP (documento_saida.integracao_estado = 'erro'). */
  integracao_docs_erro: number;
}

export interface FiltrosListaOndas {
  empresaId: string | null;
  status: string | null;
  dataDe: string | null;
  dataAte: string | null;
  numeroOnda: number | null;
  numeroDocumento: number | null;
  numeroNf: string | null;
  tipoSaidaId: string | null;
  parceiroCodigoErp: string | null;
  vendedor: string | null;
  transportador: string | null;
  sku: string | null;
  page: number;
  pageSize: number;
}

export interface ItemOnda {
  id: string;
  movimento_item_id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  qtd_esperada: number;
  qtd_separada: number;
  qtd_cortada: number;
  qtd_conferida: number;
  status: string;
  motivo_descricao: string | null;
  auto_separacao: boolean;
}

export interface ItensDetalheOnda {
  cabecalho: {
    movimento_id: string;
    numero_onda: number;
    status: string;
    prioridade: string | null;
    integracao_resumo: string | null;
    tipo_saida_descricao: string | null;
  };
  itens: ItemOnda[];
  pendencias: PendenciaPicking[];
  contagens: { separacao: number; conferencia: number; documentos: number };
}

// Linhas das views de separação/conferência/documentos: mesmas colunas de antes (select *).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LinhaView = Record<string, any>;

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
// RPCs novas ainda fora de integrations/supabase/types.ts (gerado).
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as unknown as RpcFn).call(supabase, fn, args);

function lerJson<T>(data: unknown): T {
  if (typeof data === "string") return JSON.parse(data) as T;
  return data as T;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Rótulos do card a partir dos dados crus da RPC — mesma regra da tela antiga e da entrada. */
export function rotulosOperadores(operadores: OperadorOndaBruto[] | null | undefined): string[] {
  return montarRotulosOperadores(
    (operadores ?? []).map((o) => ({ nome: o.nome, sigla: siglaEtapa(o.codigo), ativo: !!o.ativo })),
  );
}

export function normalizarLinhaLista(r: Record<string, unknown>): OndaListaRow {
  const ops = lerJson<OperadorOndaBruto[] | null>(r.operadores ?? null);
  return {
    ...(r as unknown as OndaListaRow),
    total_itens: num(r.total_itens),
    total_esperado: num(r.total_esperado),
    total_separado: num(r.total_separado),
    total_conferido: num(r.total_conferido),
    total_cortado: num(r.total_cortado),
    total_registros: num(r.total_registros),
    operadores: rotulosOperadores(Array.isArray(ops) ? ops : []),
    docs_sem_nf: r.docs_sem_nf === null || r.docs_sem_nf === undefined ? null : num(r.docs_sem_nf),
    qtd_sem_saldo: num(r.qtd_sem_saldo),
    entrega_resumo: (r as { entrega_resumo?: string | null }).entrega_resumo ?? null,
    entrega_total: num((r as { entrega_total?: unknown }).entrega_total),
    entrega_entregues: num((r as { entrega_entregues?: unknown }).entrega_entregues),
    entrega_nao_entregues: num((r as { entrega_nao_entregues?: unknown }).entrega_nao_entregues),
    integracao_docs_erro: num((r as { integracao_docs_erro?: unknown }).integracao_docs_erro),
  };
}

export async function fetchListaOndas(f: FiltrosListaOndas): Promise<OndaListaRow[]> {
  const { data, error } = await rpc("rpc_ondas_carregamento_lista", {
    p_empresa_id: f.empresaId,
    p_status: f.status,
    p_data_de: f.dataDe,
    p_data_ate: f.dataAte,
    p_numero_onda: f.numeroOnda,
    p_numero_documento: f.numeroDocumento,
    p_numero_nf: f.numeroNf,
    p_tipo_saida_id: f.tipoSaidaId,
    p_parceiro_codigo_erp: f.parceiroCodigoErp,
    p_vendedor: f.vendedor,
    p_transportador: f.transportador,
    p_sku: f.sku,
    p_page: f.page,
    p_page_size: f.pageSize,
  });
  if (error) throw error;
  const linhas = lerJson<Record<string, unknown>[] | null>(data) ?? [];
  return linhas.map(normalizarLinhaLista);
}

export async function fetchItensDetalheOnda(movimentoId: string): Promise<ItensDetalheOnda> {
  const { data, error } = await rpc("rpc_onda_carregamento_detalhe", { p_movimento_id: movimentoId, p_secao: "itens" });
  if (error) throw error;
  const r = lerJson<ItensDetalheOnda>(data);
  return {
    cabecalho: r.cabecalho,
    itens: (r.itens ?? []).map((i) => ({
      ...i,
      qtd_esperada: num(i.qtd_esperada),
      qtd_separada: num(i.qtd_separada),
      qtd_cortada: num(i.qtd_cortada),
      qtd_conferida: num(i.qtd_conferida),
      auto_separacao: !!i.auto_separacao,
    })),
    pendencias: r.pendencias ?? [],
    contagens: {
      separacao: num(r.contagens?.separacao),
      conferencia: num(r.contagens?.conferencia),
      documentos: num(r.contagens?.documentos),
    },
  };
}

async function fetchSecaoView(movimentoId: string, secao: Exclude<SecaoDetalheOnda, "itens">, campo: string): Promise<LinhaView[]> {
  const { data, error } = await rpc("rpc_onda_carregamento_detalhe", { p_movimento_id: movimentoId, p_secao: secao });
  if (error) throw error;
  const r = lerJson<Record<string, LinhaView[]>>(data);
  return r?.[campo] ?? [];
}

export const fetchSeparacaoDetalheOnda = (id: string) => fetchSecaoView(id, "separacao", "separacao");
export const fetchConferenciaDetalheOnda = (id: string) => fetchSecaoView(id, "conferencia", "conferencia");
export const fetchDocumentosDetalheOnda = (id: string) => fetchSecaoView(id, "informacoes", "documentos");

/* ---------------------------------------------------------------- cache */

/**
 * Frescor (separação e conferência mudam pelo coletor a qualquer momento):
 *  - Itens: 5 s, só para o pré-carregamento do hover servir ao clique.
 *  - Demais abas: 0 — ao abrir, mostram o que tinham e buscam de novo na hora.
 *  - Lista: 15 s; o botão Filtrar e toda ação invalidam na hora.
 */
export const DETALHE_ONDA_ITENS_STALE_MS = 5_000;
export const DETALHE_ONDA_ABAS_STALE_MS = 0;
export const LISTA_ONDAS_STALE_MS = 15_000;

export const ondasKeys = {
  /** Prefixo de todas as páginas/filtros da lista do tenant. */
  listas: (tenantId: string | null | undefined) => ["ondas-carregamento-lista", tenantId ?? null] as const,
  lista: (tenantId: string | null | undefined, f: FiltrosListaOndas) => ["ondas-carregamento-lista", tenantId ?? null, f] as const,
  /** Prefixo de todos os detalhes do tenant. */
  detalhes: (tenantId: string | null | undefined) => ["onda-carregamento-detalhe", tenantId ?? null] as const,
  detalhe: (tenantId: string | null | undefined, movimentoId: string | null | undefined) =>
    ["onda-carregamento-detalhe", tenantId ?? null, movimentoId ?? null] as const,
  secao: (tenantId: string | null | undefined, movimentoId: string | null | undefined, secao: SecaoDetalheOnda) =>
    ["onda-carregamento-detalhe", tenantId ?? null, movimentoId ?? null, secao] as const,
};

export function prefetchItensDetalheOnda(qc: QueryClient, tenantId: string | null | undefined, movimentoId: string) {
  if (!tenantId) return;
  void qc.prefetchQuery({
    queryKey: ondasKeys.secao(tenantId, movimentoId, "itens"),
    queryFn: () => fetchItensDetalheOnda(movimentoId),
    staleTime: DETALHE_ONDA_ITENS_STALE_MS,
  });
}

/**
 * Depois de qualquer ação numa onda (liberar, retirar, cancelar, cortar, limpar separação/
 * conferência, abastecimento, prioridade, responsáveis, remover documento): lista e detalhe
 * DAQUELA onda deixam de valer — o que está na tela busca na hora, o resto ao ser aberto.
 * Vale também para onda que não está selecionada.
 */
export function invalidarOnda(qc: QueryClient, tenantId: string | null | undefined, movimentoId: string | null | undefined) {
  const promessas = [qc.invalidateQueries({ queryKey: ondasKeys.listas(tenantId) })];
  if (movimentoId) promessas.push(qc.invalidateQueries({ queryKey: ondasKeys.detalhe(tenantId, movimentoId) }));
  return Promise.all(promessas);
}

/** Botão Filtrar/atualizar: nenhuma lista nem detalhe em cache continua valendo. */
export function invalidarTodasOndas(qc: QueryClient, tenantId: string | null | undefined) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ondasKeys.listas(tenantId) }),
    qc.invalidateQueries({ queryKey: ondasKeys.detalhes(tenantId) }),
  ]);
}

/** Revalida a aba visível quando os dados exibidos têm mais de `maxIdadeMs`. */
export function revalidarSeAntigo(
  q: { data: unknown; dataUpdatedAt: number; isFetching: boolean; refetch: () => unknown },
  maxIdadeMs = DETALHE_ONDA_ITENS_STALE_MS,
) {
  if (q.data === undefined || q.isFetching) return;
  if (Date.now() - q.dataUpdatedAt > maxIdadeMs) void q.refetch();
}
