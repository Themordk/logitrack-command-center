/**
 * HU (handling unit) — fases H0/H1 do plano da HU.
 * Toda regra (permissão, código pela sequência, ciclo de vida Aberta → Fechada → …, motivo, eventos)
 * vive nas RPCs rpc_hu_* do banco. A tela não grava direto nas tabelas hu/hu_item (a API não permite mais).
 * Este serviço só chama e tipa o retorno.
 */
import { supabase } from "@/integrations/supabase/client";

export type StatusHU =
  | "ABERTA" | "FECHADA" | "EM_TRANSITO" | "ARMAZENADA" | "EXPEDIDA" | "DESCARTADA" | "DESMONTADA";

export interface EventoHU {
  id: string;
  evento: string;
  status_anterior: string | null;
  status_novo: string | null;
  usuario: string | null;
  observacao: string | null;
  dados: Record<string, unknown>;
  created_at: string;
}

export interface ItemHUArmazenagem {
  hu_item_id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  quantidade: number;
  lote: string | null;
  validade: string | null;
  liberado: boolean;
}

export interface ResumoHUArmazenagem {
  hu: { hu_id: string; codigo_hu: string; tipo_hu: string | null; tamanho: string | null; status: StatusHU; endereco: string | null };
  itens: ItemHUArmazenagem[];
  pode_armazenar: boolean;
  motivo: string | null;
}

/**
 * Leitura do código da HU como o banco faz (_fn_hu_normalizar_codigo): tira o prefixo ]C1 do GS1-128,
 * espaços, parênteses e o separador FNC1; "(00)" + 18 dígitos vira o SSCC de 18 dígitos (H7).
 */
export function normalizarCodigoHU(codigo: string): string {
  // eslint-disable-next-line no-control-regex -- \x1d é o FNC1/GS do GS1-128 que alguns leitores enviam
  const c = String(codigo ?? "").replace(/^\]C1/, "").replace(/[\s()\x1d]/g, "").toUpperCase();
  return /^(00)?\d{18}$/.test(c) ? c.slice(-18) : c;
}

/** Código lido no coletor que é de HU: HU-000000001 ou SSCC (o resto é EAN/endereço). */
export const pareceCodigoHU = (codigo: string): boolean => {
  const c = normalizarCodigoHU(codigo);
  return /^HU-\d+$/.test(c) || /^\d{18}$/.test(c);
};

/* ───────────── Tela Atividades › HU (H5) ───────────── */

export type SituacaoHU = "AGUARDANDO_ARMAZENAGEM" | "VAZIA" | "DIVERGENTE" | "NUNCA_IMPRESSA" | "PARADA";

export interface FiltrosHU {
  status?: StatusHU | "";
  situacao?: SituacaoHU | "";
  tipo_hu?: string;
  movimento?: string;
  nf?: string;
  fornecedor?: string;
  sku?: string;
  endereco?: string;
  data_de?: string;
  data_ate?: string;
  busca?: string;
}

export interface HULinha {
  id: string;
  codigo_hu: string;
  tipo_hu: string | null;
  tamanho: string | null;
  status: StatusHU;
  disponibilidade: string | null;
  peso_bruto: number | null;
  m3: number | null;
  altura: number | null;
  created_at: string;
  criado_por_nome: string | null;
  armazem: string | null;
  endereco: string | null;
  numero_movimento: number | null;
  nfs: string | null;
  fornecedores: string | null;
  qtd_skus: number;
  qtd_total: number;
  sku_principal: string | null;
  descricao_principal: string | null;
  estoque_total: number;
  estoque_enderecos: number;
  ultimo_evento: string | null;
  ultimo_evento_em: string | null;
  etiqueta_impressoes: number;
  etiqueta_ultimo_status: string | null;
  etiqueta_ultima_em: string | null;
  horas_parada: number;
  vazia: boolean;
  aguardando_armazenagem: boolean;
  divergente: boolean;
  nunca_impressa: boolean;
  parada: boolean;
  encerrada: boolean;
}

export interface ResumoHUs {
  abertas: number; aguardando_armazenagem: number; armazenadas: number; vazias: number;
  divergentes: number; nunca_impressas: number; paradas: number; encerradas: number;
}

export interface ListaHUs { linhas: HULinha[]; total: number; pagina: number; tamanho: number; resumo: ResumoHUs }

export interface DetalheHU {
  hu: HULinha;
  itens: { hu_item_id: string; sku: string; descricao: string; quantidade: number; lote: string | null; validade: string | null;
           conferido_por: string | null; conferido_em: string }[];
  estoque: { endereco: string | null; sku: string; descricao: string; lote: string | null; validade: string | null;
             quantidade: number; disponivel: number }[];
  eventos: (Omit<EventoHU, "id">)[];
  impressoes: { id: string; status: string; criado_em: string; impresso_em: string | null; erro: string | null;
                impressora: string | null; origem: string | null; copias: number }[];
  acoes: { editar: boolean; fechar: boolean; reabrir: boolean; desmontar: boolean; descartar: boolean; imprimir: boolean;
           dividir?: boolean; juntar?: boolean };
}

/** Só manda os filtros preenchidos (sem espaços nas pontas). */
export function limparFiltrosHU(f: FiltrosHU): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(f)) {
    const t = String(v ?? "").trim();
    if (t) out[k] = t;
  }
  return out;
}

export interface ConsultaHUColetor {
  hu: HULinha;
  itens: { sku: string; descricao: string; quantidade: number; lote: string | null; validade: string | null }[];
  estoque: { endereco: string | null; sku: string; descricao: string; lote: string | null; quantidade: number }[];
  ultima_verificacao: { created_at: string; usuario: string | null; endereco: string | null; confere: boolean } | null;
}

export class HuRpcError extends Error {
  constructor(public codigo: string, message: string) {
    super(message);
    this.name = "HuRpcError";
  }
}

type Retorno = { sucesso?: boolean; codigo?: string; mensagem?: string } & Record<string, unknown>;

async function chamar<T extends Retorno>(fn: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs novas ainda fora de types.ts
  const { data, error } = await (supabase.rpc as any).call(supabase, fn, args);
  if (error) throw error;
  const r = (typeof data === "string" ? JSON.parse(data) : data) as T;
  if (!r?.sucesso) throw new HuRpcError(r?.codigo || "ERRO", r?.mensagem || "Não foi possível concluir a ação na HU.");
  return r;
}

const num = (v: unknown): number | null => (v === "" || v === null || v === undefined ? null : Number(v));

/** Status em que a HU já terminou o ciclo (não edita, não fecha, não reabre). */
export const STATUS_HU_ENCERRADOS: StatusHU[] = ["EXPEDIDA", "DESCARTADA", "DESMONTADA"];

export const huService = {
  gerar(p: { quantidade: number; tipo_hu: string; tamanho: string; empresa_id: string; armazem_id?: string | null;
             peso_bruto?: unknown; m3?: unknown; altura?: unknown }) {
    return chamar<Retorno & { hus: { hu_id: string; codigo_hu: string }[] }>("rpc_hu_gerar", {
      p_quantidade: p.quantidade, p_tipo_hu: p.tipo_hu, p_tamanho: p.tamanho, p_empresa_id: p.empresa_id,
      p_armazem_id: p.armazem_id || null, p_peso_bruto: num(p.peso_bruto), p_m3: num(p.m3), p_altura: num(p.altura),
    });
  },
  editar(huId: string, p: { tipo_hu: string; tamanho: string; peso_bruto?: unknown; m3?: unknown; altura?: unknown }) {
    return chamar("rpc_hu_editar", {
      p_hu_id: huId, p_tipo_hu: p.tipo_hu, p_tamanho: p.tamanho,
      p_peso_bruto: num(p.peso_bruto), p_m3: num(p.m3), p_altura: num(p.altura),
    });
  },
  fechar(huId: string) {
    return chamar("rpc_hu_fechar", { p_hu_id: huId });
  },
  reabrir(huId: string, motivo: string) {
    return chamar("rpc_hu_reabrir", { p_hu_id: huId, p_observacao: motivo.trim() });
  },
  descartar(huId: string, motivo: string) {
    return chamar("rpc_hu_descartar", { p_hu_id: huId, p_observacao: motivo.trim() });
  },
  /** H2: o que a HU tem e se já pode ser armazenada (coletor). */
  armazenagemResumo(codigoHu: string) {
    return chamar<Retorno & ResumoHUArmazenagem>("rpc_coletor_hu_armazenagem", { p_codigo_hu: normalizarCodigoHU(codigoHu) });
  },
  /** H8: consulta da HU no coletor (conteúdo, estoque, última verificação). */
  async consultaColetor(codigoHu: string): Promise<ConsultaHUColetor> {
    return (await chamar<Retorno & { dados: ConsultaHUColetor }>("rpc_coletor_hu_consulta", { p_codigo_hu: normalizarCodigoHU(codigoHu) })).dados;
  },
  /** H8: a HU está no endereço lido? Registra o evento VERIFICADA (confere ou não). */
  verificarLocal(huId: string, enderecoId: string) {
    return chamar<Retorno & { confere: boolean; endereco: string; endereco_sistema: string | null }>("rpc_coletor_hu_verificar_local", {
      p_hu_id: huId, p_endereco_id: enderecoId,
    });
  },
  /** H8: quanto do produto da tarefa de inventário a HU guarda no endereço (contar sem abrir). */
  inventarioHU(codigoHu: string, tarefaId: string) {
    return chamar<Retorno & { hu_id: string; codigo_hu: string; quantidade: number; outros_produtos: number }>("rpc_coletor_inventario_hu", {
      p_codigo_hu: normalizarCodigoHU(codigoHu), p_tarefa_id: tarefaId,
    });
  },
  /** H9: parte dos itens vai para uma HU nova (só HU não armazenada). */
  dividir(huId: string, itens: { hu_item_id: string; quantidade: number }[], motivo: string) {
    return chamar<Retorno & { hu_id: string; codigo_hu: string }>("rpc_hu_dividir", {
      p_hu_id: huId, p_itens: itens, p_observacao: motivo.trim(),
    });
  },
  /** H9: todos os itens da HU vão para a HU de destino; a origem fica Desmontada. */
  juntar(huOrigemId: string, codigoDestino: string, motivo: string) {
    return chamar<Retorno & { hu_id: string; codigo_hu: string }>("rpc_hu_juntar", {
      p_hu_origem_id: huOrigemId, p_codigo_destino: normalizarCodigoHU(codigoDestino), p_observacao: motivo.trim(),
    });
  },
  /** H2: armazena a HU inteira num endereço (picking desmonta a HU; regra no banco). */
  armazenar(huId: string, enderecoId: string) {
    return chamar<Retorno & { status: StatusHU; endereco: string; itens: number }>("rpc_coletor_armazenar_hu", {
      p_hu_id: huId, p_endereco_destino_id: enderecoId,
    });
  },
  async listar(empresaId: string | null, filtros: FiltrosHU, pagina = 1, tamanho = 50): Promise<ListaHUs> {
    const r = await chamar<Retorno & { dados: ListaHUs }>("rpc_hus_listar", {
      p_empresa_id: empresaId, p_filtros: limparFiltrosHU(filtros), p_pagina: pagina, p_tamanho: tamanho,
    });
    return r.dados;
  },
  async listarTodos(empresaId: string | null, filtros: FiltrosHU): Promise<HULinha[]> {
    return (await huService.listar(empresaId, filtros, 1, 5000)).linhas;
  },
  async detalhe(huId: string): Promise<DetalheHU> {
    return (await chamar<Retorno & { dados: DetalheHU }>("rpc_hu_detalhe", { p_hu_id: huId })).dados;
  },
  desmontar(huId: string, motivo: string) {
    return chamar("rpc_hu_desmontar", { p_hu_id: huId, p_observacao: motivo.trim() });
  },
  async eventos(huId: string): Promise<EventoHU[]> {
    const r = await chamar<Retorno & { eventos: EventoHU[] }>("rpc_hu_eventos", { p_hu_id: huId });
    return r.eventos ?? [];
  },
};

/** Ações permitidas pelo status (a decisão final é sempre do banco; isto só esconde botões que dariam erro). */
export function acoesHU(status: string | null | undefined) {
  const s = (status || "ABERTA") as StatusHU;
  return {
    editar: !STATUS_HU_ENCERRADOS.includes(s),
    fechar: s === "ABERTA",
    reabrir: s === "FECHADA",
    descartar: s === "ABERTA",
  };
}
