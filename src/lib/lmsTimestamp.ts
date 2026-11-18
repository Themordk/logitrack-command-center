/**
 * Marcação de início de tarefa (LMS).
 *
 * Fase 1.1: estas funções faziam UPDATE direto em tarefa_execucao.iniciado_em, numa
 * execução que ainda não existe no primeiro bipe; por isso nunca gravavam nada, e o
 * cliente não pode mais escrever nas tabelas de tarefa (Fase 1.2).
 * Ficam como no-op para não mexer nas telas que já as chamam. Na Fase 2 elas passam
 * a chamar a RPC rpc_tarefa_iniciar, que grava o início real no servidor.
 */

export async function markTarefaIniciada(_tarefaExecucaoId: string | null | undefined): Promise<void> {
  // no-op até a Fase 2 (rpc_tarefa_iniciar)
}

export async function markTarefaIniciadaByTarefa(
  _tarefaId: string | null | undefined,
  _usuarioId: string | null | undefined
): Promise<void> {
  // no-op até a Fase 2 (rpc_tarefa_iniciar)
}
