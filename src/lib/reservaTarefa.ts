/**
 * Expiração de reserva por tipo de tarefa (tipo_tarefa.reserva_acao / reserva_expira_min).
 * Desde a Fase 10.9 vale para todos os tipos; o cadastro fica em Produtividade (LMS) ›
 * Configurações (rpc_lms_tipos_tarefa / rpc_lms_tipo_tarefa_salvar).
 *
 * As ações PERMITIDAS por tipo vêm do banco (rpc fn_tipo_tarefa_reserva_acoes),
 * que também valida no trigger; aqui ficam só rótulos e textos de tela.
 * A liberação/alerta roda no banco (cron_liberar_reservas_tarefas, a cada 10 min),
 * do mesmo jeito que "Sair da etapa" do coletor (atribuição LIBERADA, motivo
 * DEVOLUCAO_FILA, evento REATRIBUICAO). Tarefas designadas pelo gestor ou com
 * coleta pendente nunca são liberadas sozinhas: geram aviso.
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
    "Sem atividade do operador no prazo, a tarefa volta para a fila e outro operador continua de onde parou. Tarefas designadas pelo gestor só geram aviso.",
  LIBERAR_SEM_EXECUCAO:
    "Libera só se o operador ainda não executou nada desde que pegou a tarefa. Se já executou, avisa o supervisor (o produto pode estar com o operador).",
  ALERTAR:
    "Não libera sozinho: avisa o supervisor no painel de notificações para ele verificar com o operador.",
  NUNCA: "A reserva só termina quando o operador conclui ou alguém cancela a tarefa.",
};

/** Prazo da reserva em minutos (mesmos limites do banco: rpc_lms_tipo_tarefa_salvar e ck_tipo_tarefa_reserva_expira_min). */
export const RESERVA_EXPIRA_MIN_MINUTOS = 5;
export const RESERVA_EXPIRA_MAX_MINUTOS = 10080; // 7 dias

export function reservaAcaoLabel(acao?: string | null): string {
  return RESERVA_ACAO_LABEL[(acao as ReservaAcao) ?? "NUNCA"] ?? acao ?? "—";
}

export function formatarHoras(minutos?: number | null): string {
  if (minutos == null) return "—";
  if (minutos < 60) return `${minutos}min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}
