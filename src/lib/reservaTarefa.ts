/**
 * Expiração de reserva por tipo de tarefa (tipo_tarefa.reserva_acao / reserva_expira_min).
 *
 * As ações PERMITIDAS por tipo vêm do banco (rpc fn_tipo_tarefa_reserva_acoes),
 * que também valida no trigger; aqui ficam só rótulos e textos de tela.
 * A liberação/alerta roda no banco (cron_liberar_reservas_tarefas, a cada 10 min).
 */
export type ReservaAcao = "LIBERAR" | "LIBERAR_SEM_EXECUCAO" | "ALERTAR" | "NUNCA";

export const RESERVA_ACAO_LABEL: Record<ReservaAcao, string> = {
  LIBERAR: "Liberar automaticamente",
  LIBERAR_SEM_EXECUCAO: "Liberar se nada foi executado",
  ALERTAR: "Avisar o supervisor",
  NUNCA: "Nunca expira",
};

export const RESERVA_ACAO_AJUDA: Record<ReservaAcao, string> = {
  LIBERAR:
    "Sem atividade do operador no prazo, a tarefa volta para a fila e outro operador continua de onde parou.",
  LIBERAR_SEM_EXECUCAO:
    "Libera só se o operador ainda não executou nada. Se já houve coleta, avisa o supervisor (o produto pode estar com o operador).",
  ALERTAR:
    "Não libera sozinho: avisa o supervisor no painel de notificações para ele verificar com o operador.",
  NUNCA: "A reserva só termina quando o operador conclui ou alguém cancela a tarefa.",
};

export const RESERVA_EXPIRA_MIN_HORAS = 0.25; // 15 min
export const RESERVA_EXPIRA_MAX_HORAS = 168; // 7 dias

export function reservaAcaoLabel(acao?: string | null): string {
  return RESERVA_ACAO_LABEL[(acao as ReservaAcao) ?? "NUNCA"] ?? acao ?? "—";
}

export function formatarHoras(minutos?: number | null): string {
  if (minutos == null) return "—";
  const h = minutos / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(2).replace(/\.?0+$/, "")}h`;
}
