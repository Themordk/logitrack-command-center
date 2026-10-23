import { supabase } from "@/integrations/supabase/client";
import type { DestinoArmazenagem, DestinoRecomendado } from "@/types/armazenagem";

export function lerPulmaoHabilitado(armazemId: string | null): boolean {
  try {
    return !armazemId || localStorage.getItem(`coletor_armazem_tem_pulmao_${armazemId}`) !== "N";
  } catch {
    return true;
  }
}

export function guardarPulmaoHabilitado(armazemId: string | null, habilitado: boolean): void {
  try {
    if (armazemId) localStorage.setItem(`coletor_armazem_tem_pulmao_${armazemId}`, habilitado ? "S" : "N");
  } catch { /* O destino online continua disponível mesmo sem armazenamento local. */ }
}

export function preSelecionarDestino(destino: DestinoRecomendado, pulmaoHabilitado: boolean): "PICKING" | "PULMAO" | null {
  if (destino === "SEM_DESTINO") return null;
  if (destino === "PICKING" || destino === "DIVIDIR" || (destino === "SEM_PICKING" && !pulmaoHabilitado)) return "PICKING";
  return "PULMAO";
}

export function quantidadeSugerida(destino: DestinoArmazenagem | null, escolha: "PICKING" | "PULMAO", restante: number): number {
  const rec = destino?.recomendacao;
  return escolha === "PICKING" && rec && (rec.destino === "DIVIDIR" || (rec.destino === "PICKING" && rec.quantidade_sem_destino > 0))
    ? rec.quantidade_picking
    : (destino?.quantidade ?? restante);
}

type RpcFn = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
const rpc = (supabase as unknown as { rpc: RpcFn }).rpc.bind(supabase);

export async function buscarDestinoArmazenagem(params: {
  produtoId: string;
  tarefaId?: string | null;
  quantidade?: number | null;
}): Promise<DestinoArmazenagem> {
  const { data, error } = await rpc("rpc_coletor_armazenagem_destino", {
    p_tenant_id: localStorage.getItem("core_tenant_id"),
    p_empresa_id: localStorage.getItem("core_empresa_id"),
    p_armazem_id: localStorage.getItem("core_armazem_id"),
    p_produto_id: params.produtoId,
    p_tarefa_id: params.tarefaId ?? null,
    p_quantidade: params.quantidade ?? null,
  });
  if (error) throw new Error(error.message);
  const parsed = (typeof data === "string" ? JSON.parse(data) : data) as DestinoArmazenagem;
  if (!parsed || parsed.sucesso === false) {
    throw new Error(parsed?.mensagem || "Não foi possível calcular o destino.");
  }
  return parsed;
}

/* ───────────── Leitura de EAN na lista de itens da armazenagem ───────────── */

export interface EmbalagemEan { produto_id: string; fator: number; }
/** EAN normalizado → embalagens que o usam (mais de uma em caso de cadastro duplicado). */
export type EanMapArmazenagem = Record<string, EmbalagemEan[]>;

export const normalizarCodigoLido = (codigo: string): string => String(codigo ?? "").trim().toUpperCase();

/** Monta o mapa de EANs a partir das linhas de produto_embalagem, ignorando inativas e sem EAN. */
export function montarEanMap(
  linhas: { produto_id: string; ean: string | null; fator: number | null; ativo?: boolean | null }[],
): EanMapArmazenagem {
  const mapa: EanMapArmazenagem = {};
  for (const l of linhas || []) {
    const ean = normalizarCodigoLido(l.ean ?? "");
    if (!ean || !l.produto_id || l.ativo === false) continue;
    const lista = (mapa[ean] ||= []);
    if (!lista.some((e) => e.produto_id === l.produto_id)) {
      lista.push({ produto_id: l.produto_id, fator: Number(l.fator) > 0 ? Number(l.fator) : 1 });
    }
  }
  return mapa;
}

/** Embalagens de um produto no formato do cache `ean_emb_produto_${produto_id}` usado na conferência. */
export function embalagensDoProduto(mapa: EanMapArmazenagem, produtoId: string): { ean: string; fator: number }[] {
  const out: { ean: string; fator: number }[] = [];
  for (const [ean, lista] of Object.entries(mapa)) {
    const emb = lista.find((e) => e.produto_id === produtoId);
    if (emb) out.push({ ean, fator: emb.fator });
  }
  return out;
}

export type ResultadoLeituraArmazenagem =
  /** EAN de embalagem: confirma o produto. `fatorPorProduto` traz o fator do EAN lido. */
  | { tipo: "EAN"; codigo: string; tarefaIds: string[]; fatorPorProduto: Record<string, number> }
  /** HU: apenas localiza a tarefa; a conferência do EAN continua obrigatória. */
  | { tipo: "HU"; codigo: string; tarefaIds: string[] }
  /** EAN cadastrado em embalagem, mas sem tarefa pendente neste movimento. */
  | { tipo: "FORA_DO_MOVIMENTO"; codigo: string }
  | { tipo: "NAO_ENCONTRADO"; codigo: string };

/**
 * Identifica qual(is) tarefa(s) pendente(s) do movimento correspondem ao código lido.
 * Somente EAN de embalagem confirma o produto; SKU e referência não são aceitos.
 */
export function resolverLeituraArmazenagem(
  codigoBruto: string,
  itens: { tarefa_id: string; produto_id: string }[],
  eanMap: EanMapArmazenagem,
  huMap: Record<string, { codigo_hu: string }>,
): ResultadoLeituraArmazenagem {
  const codigo = normalizarCodigoLido(codigoBruto);
  if (!codigo) return { tipo: "NAO_ENCONTRADO", codigo };

  const tarefasPendentes = new Set(itens.map((i) => i.tarefa_id));
  const tarefasHu = Object.entries(huMap || {})
    .filter(([tid, hu]) => tarefasPendentes.has(tid) && normalizarCodigoLido(hu?.codigo_hu ?? "") === codigo)
    .map(([tid]) => tid);
  if (tarefasHu.length > 0) return { tipo: "HU", codigo, tarefaIds: tarefasHu };

  const embalagens = eanMap[codigo];
  if (!embalagens || embalagens.length === 0) return { tipo: "NAO_ENCONTRADO", codigo };

  const fatorPorProduto: Record<string, number> = {};
  for (const e of embalagens) fatorPorProduto[e.produto_id] = e.fator;
  const tarefaIds = itens.filter((i) => i.produto_id in fatorPorProduto).map((i) => i.tarefa_id);
  if (tarefaIds.length === 0) return { tipo: "FORA_DO_MOVIMENTO", codigo };
  return { tipo: "EAN", codigo, tarefaIds, fatorPorProduto };
}

/* ── Passagem da conferência de EAN da lista de itens para a tela /iniciar ── */

const CHAVE_EAN_CONFIRMADO = "coletor_armazenagem_ean_confirmado";

/** Registra que o EAN da tarefa já foi conferido na lista (vale só para essa tarefa). */
export function registrarEanConfirmado(tarefaId: string, codigo: string): void {
  try { sessionStorage.setItem(CHAVE_EAN_CONFIRMADO, JSON.stringify({ tarefa_id: tarefaId, codigo })); } catch { /* sem storage: a conferência volta a ser pedida */ }
}

/** Lê a conferência registrada; só é válida para a mesma tarefa. Não remove a chave. */
export function lerEanConfirmado(tarefaId: string | null | undefined): { codigo: string } | null {
  if (!tarefaId) return null;
  try {
    const raw = sessionStorage.getItem(CHAVE_EAN_CONFIRMADO);
    if (!raw) return null;
    const v = JSON.parse(raw) as { tarefa_id?: string; codigo?: string };
    return v?.tarefa_id === tarefaId && v.codigo ? { codigo: v.codigo } : null;
  } catch {
    return null;
  }
}

export function limparEanConfirmado(): void {
  try { sessionStorage.removeItem(CHAVE_EAN_CONFIRMADO); } catch { /* nada a limpar */ }
}
