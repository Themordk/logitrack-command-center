/**
 * Situação do pedido de saída (plano de status · S2): etapa operacional e entrega.
 *
 * Os valores são calculados só no banco (public._fn_pedido_situacao_recalcular, gatilhos de fim de
 * transação em onda, carga e entrega). Aqui ficam apenas rótulos, cores, ordem e textos.
 */

export type EtapaPedido =
  | "aguardando_onda" | "em_onda" | "em_separacao" | "separado" | "em_conferencia" | "conferido"
  | "em_carga" | "em_carregamento" | "embarcado" | "expedido" | "cancelado" | "excluido";

export type EntregaPedido =
  | "nao_se_aplica" | "aguardando_expedicao" | "entrega_nao_gerada" | "com_transportadora"
  | "aguardando_saida" | "em_rota" | "entregue" | "nao_entregue";

type Tom = "cinza" | "azul" | "ambar" | "verde" | "vermelho" | "violeta";

const CLASSE_TOM: Record<Tom, string> = {
  cinza: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
  azul: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  ambar: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  verde: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  vermelho: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
  violeta: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

export interface VisualSituacao { rotulo: string; classe: string; tom: Tom }

const v = (rotulo: string, tom: Tom): VisualSituacao => ({ rotulo, tom, classe: CLASSE_TOM[tom] });

/** Na ordem do fluxo (usada nos filtros). */
export const VISUAL_ETAPA: Record<EtapaPedido, VisualSituacao> = {
  aguardando_onda: v("Aguardando onda", "cinza"),
  em_onda: v("Em onda", "azul"),
  em_separacao: v("Em separação", "azul"),
  separado: v("Separado", "azul"),
  em_conferencia: v("Em conferência", "azul"),
  conferido: v("Conferido", "azul"),
  em_carga: v("Em carga", "violeta"),
  em_carregamento: v("Em carregamento", "violeta"),
  embarcado: v("Embarcado", "violeta"),
  expedido: v("Expedido", "verde"),
  cancelado: v("Cancelado", "vermelho"),
  excluido: v("Excluído", "vermelho"),
};

export const VISUAL_ENTREGA: Record<EntregaPedido, VisualSituacao> = {
  aguardando_expedicao: v("Aguardando expedição", "cinza"),
  aguardando_saida: v("Aguardando saída", "ambar"),
  em_rota: v("Em rota", "azul"),
  entregue: v("Entregue", "verde"),
  nao_entregue: v("Não entregue", "vermelho"),
  entrega_nao_gerada: v("Entrega não gerada", "vermelho"),
  com_transportadora: v("Com transportadora", "verde"),
  nao_se_aplica: v("Sem entrega", "cinza"),
};

export const ETAPAS_ORDEM = Object.keys(VISUAL_ETAPA) as EtapaPedido[];
export const ENTREGAS_ORDEM = Object.keys(VISUAL_ENTREGA) as EntregaPedido[];

export function etapaPedido(x: unknown): EtapaPedido | null {
  return typeof x === "string" && x in VISUAL_ETAPA ? (x as EtapaPedido) : null;
}

export function entregaPedido(x: unknown): EntregaPedido | null {
  return typeof x === "string" && x in VISUAL_ENTREGA ? (x as EntregaPedido) : null;
}

/** Explicação curta do estado de entrega (título do selo). */
export function ajudaEntrega(estado: EntregaPedido, motivo?: string | null): string {
  switch (estado) {
    case "nao_se_aplica": return "O tipo de saída deste pedido não realiza entrega própria.";
    case "aguardando_expedicao": return "A entrega é gerada quando a carga é montada ou fechada, conforme o tipo de saída.";
    case "entrega_nao_gerada": return motivo || "O momento de gerar a entrega chegou, mas ela não existe.";
    case "com_transportadora": return "A carga da transportadora foi fechada; a entrega ao cliente é feita por ela.";
    case "aguardando_saida": return "A entrega foi enviada ao entregador e aguarda o aceite.";
    case "em_rota": return "O entregador aceitou a carga e está a caminho.";
    case "entregue": return "Entrega confirmada com o canhoto.";
    case "nao_entregue": return motivo ? `Não entregue: ${motivo}` : "A última tentativa de entrega não teve sucesso.";
  }
}

/** Resumo da onda: "2 de 5 entregues" (só pedidos com entrega própria). */
export function textoResumoEntregaOnda(total: number | null | undefined, entregues: number | null | undefined): string | null {
  const t = Number(total ?? 0);
  if (t <= 0) return null;
  return `${Number(entregues ?? 0)} de ${t} entregue${t === 1 ? "" : "s"}`;
}

/** Cartões do Acompanhamento de Pedidos (ids iguais aos de rpc_pedidos_acompanhamento). */
export const CARTOES_ACOMPANHAMENTO = [
  { id: "expedidos_sem_entrega", rotulo: "Expedidos sem entrega confirmada", tom: "ambar" as Tom },
  { id: "nao_entregues", rotulo: "Não entregues", tom: "vermelho" as Tom },
  { id: "entrega_nao_gerada", rotulo: "Entrega não gerada", tom: "vermelho" as Tom },
  { id: "erro_erp", rotulo: "Erro no ERP", tom: "vermelho" as Tom },
] as const;

export type CartaoAcompanhamento = (typeof CARTOES_ACOMPANHAMENTO)[number]["id"];

export function classeTom(tom: Tom): string {
  return CLASSE_TOM[tom];
}
