/**
 * Status de integração com o ERP (plano de status · S1).
 *
 * O estado é calculado só no banco (integracao._fn_documento_integracao_recalcular), a partir das
 * execuções de retorno. Aqui ficam apenas rótulos, cores e textos — a tela nunca deduz o estado.
 */

export type EstadoIntegracao = "nao_integra" | "pendente" | "integrado" | "erro" | "ignorado";

export interface IntegracaoDocumento {
  estado: EstadoIntegracao | null;
  evento?: string | null;
  evento_nome?: string | null;
  em?: string | null;
  erro?: string | null;
  execucao_id?: string | null;
  erros_outros?: number | null;
  /** status_integracao: texto livre gravado pela regra ("retornado"...). */
  marcador?: string | null;
}

export interface VisualEstado {
  rotulo: string;
  /** Ordem do pior caso (maior = pior). */
  peso: number;
  classe: string;
  tom: "verde" | "ambar" | "vermelho" | "cinza";
}

const NAO_ENVIADO = "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400";

/** Decisão 2 do plano: "Não integra" e "Ignorado" aparecem juntos como "Não enviado" (o motivo vai no detalhe). */
export const VISUAL_ESTADO: Record<EstadoIntegracao, VisualEstado> = {
  erro: { rotulo: "Erro no ERP", peso: 5, tom: "vermelho", classe: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400" },
  pendente: { rotulo: "Aguardando envio", peso: 4, tom: "ambar", classe: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  integrado: { rotulo: "Integrado", peso: 3, tom: "verde", classe: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  ignorado: { rotulo: "Não enviado", peso: 2, tom: "cinza", classe: NAO_ENVIADO },
  nao_integra: { rotulo: "Não enviado", peso: 1, tom: "cinza", classe: NAO_ENVIADO },
};

export function estadoIntegracao(v: unknown): EstadoIntegracao | null {
  return typeof v === "string" && v in VISUAL_ESTADO ? (v as EstadoIntegracao) : null;
}

/** Motivo exibido junto de "Não enviado". */
export function motivoNaoEnviado(estado: EstadoIntegracao): string | null {
  if (estado === "nao_integra") return "Nenhuma regra de retorno rodou para este documento.";
  if (estado === "ignorado") return "As regras rodaram, mas o caminho não precisou enviar nada ao ERP (filtro ou condição).";
  return null;
}

/** Nome curto do evento para a linha "Integrado · Expedição". */
const NOME_EVENTO_CURTO: Record<string, string> = {
  "saida.documento_gerado": "Pedido recebido",
  "saida.documento_cancelado": "Cancelamento",
  "saida.onda_liberada": "Onda liberada",
  "saida.separacao_iniciada": "Início da separação",
  "saida.separacao_finalizada": "Separação",
  "saida.conferencia_finalizada": "Conferência",
  "saida.carregamento_iniciado": "Carregamento",
  "saida.expedido": "Expedição",
  "saida.onda_cancelada": "Onda cancelada",
  "saida.alteracao_aplicada": "Alteração",
  "saida.devolucao_gerada": "Devolução",
  "entrada.documento_gerado": "NF recebida",
  "entrada.documento_cancelado": "Cancelamento",
  "entrada.recebimento_liberado": "Recebimento liberado",
  "entrada.conferencia_iniciada": "Início da conferência",
  "entrada.conferencia_finalizada": "Conferência",
  "entrada.divergencia": "Divergência",
  "entrada.armazenagem_finalizada": "Armazenagem",
  "entrada.movimento_cancelado": "Recebimento cancelado",
};

export function nomeEventoCurto(evento: string | null | undefined, nomeCatalogo?: string | null): string | null {
  if (!evento) return null;
  return NOME_EVENTO_CURTO[evento] ?? nomeCatalogo ?? evento;
}

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
});

/** "Integrado · Expedição · 15/11 10:42" */
export function linhaIntegracao(i: IntegracaoDocumento): string {
  const estado = estadoIntegracao(i.estado) ?? "nao_integra";
  const partes = [VISUAL_ESTADO[estado].rotulo];
  if (estado !== "nao_integra") {
    const ev = nomeEventoCurto(i.evento, i.evento_nome);
    if (ev && estado !== "ignorado") partes.push(ev);
    if (i.em && estado !== "pendente" && estado !== "ignorado") partes.push(fmtDataHora.format(new Date(i.em)).replace(",", ""));
  }
  return partes.join(" · ");
}

/** Aviso da decisão 1: integrado agora, mas outra regra ficou com erro. */
export function avisoErrosAnteriores(i: IntegracaoDocumento): string | null {
  const n = i.erros_outros ?? 0;
  if (n <= 0 || i.estado === "erro") return null;
  return n === 1 ? "1 retorno anterior com erro" : `${n} retornos anteriores com erro`;
}

// ---------- Nó "Atualizar documento" (editor de regras) ----------

export const AUTOMATICO = "automatico";
export type ResultadoNoIntegracao = typeof AUTOMATICO | "integrado" | "ignorado" | "erro" | "nao_alterar";

export const OPCOES_RESULTADO_INTEGRACAO: { valor: ResultadoNoIntegracao; rotulo: string; ajuda: string; estado: string }[] = [
  { valor: AUTOMATICO, rotulo: "Automático (pelo envio)", estado: "automático",
    ajuda: "Integrado se algum envio deste caminho (requisição, ação do ERP, webhook) deu certo; senão Não enviado." },
  { valor: "integrado", rotulo: "Integrado", estado: "Integrado",
    ajuda: "Este caminho avisou o ERP. O documento fica Integrado, com o evento e a hora." },
  { valor: "ignorado", rotulo: "Não precisou enviar", estado: "Não enviado (mantém o último resultado de outras regras)",
    ajuda: "Caminho em que nada foi enviado de propósito (ex.: pedido bloqueado no WMS). Não apaga um Integrado anterior." },
  { valor: "erro", rotulo: "Erro de negócio", estado: "Erro",
    ajuda: "O ERP recusou ou o pedido não pode seguir. O documento fica com Erro e a mensagem abaixo, e aparece para reenvio." },
  { valor: "nao_alterar", rotulo: "Não alterar", estado: "sem alteração (vale o resultado anterior desta regra)",
    ajuda: "Só grava o marcador; o status de integração não muda." },
];

export function valorResultadoIntegracao(v: unknown): ResultadoNoIntegracao {
  return OPCOES_RESULTADO_INTEGRACAO.some((o) => o.valor === v) && v !== AUTOMATICO ? (v as ResultadoNoIntegracao) : AUTOMATICO;
}

export function rotuloResultadoIntegracao(v: unknown): string {
  return OPCOES_RESULTADO_INTEGRACAO.find((o) => o.valor === valorResultadoIntegracao(v))!.rotulo;
}
