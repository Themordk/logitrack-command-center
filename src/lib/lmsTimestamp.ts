import { supabase } from "@/integrations/supabase/client";
import { nowBrasilia } from "./dateUtils";

/**
 * Marks `iniciado_em` on tarefa_execucao when the operator starts working.
 * Should be called on the FIRST scan/action in each execution page.
 * Uses a sessionStorage flag to avoid duplicate calls.
 */
export async function markTarefaIniciada(tarefaExecucaoId: string | null | undefined): Promise<void> {
  if (!tarefaExecucaoId) return;

  const flagKey = `lms_iniciado_${tarefaExecucaoId}`;
  if (sessionStorage.getItem(flagKey)) return; // Already marked

  try {
    const { error } = await (supabase as any)
      .from("tarefa_execucao")
      .update({ iniciado_em: nowBrasilia() })
      .eq("id", tarefaExecucaoId)
      .is("iniciado_em", null); // Only set if not already set

    if (!error) {
      sessionStorage.setItem(flagKey, "1");
    }
  } catch (err) {
    console.error("LMS: erro ao marcar iniciado_em", err);
  }
}

/**
 * Marks `iniciado_em` for a tarefa (not execucao) - finds execucao by tarefa_id + usuario_id.
 */
export async function markTarefaIniciadaByTarefa(
  tarefaId: string | null | undefined,
  usuarioId: string | null | undefined
): Promise<void> {
  if (!tarefaId || !usuarioId) return;

  const flagKey = `lms_iniciado_tarefa_${tarefaId}`;
  if (sessionStorage.getItem(flagKey)) return;

  try {
    const { data } = await (supabase as any)
      .from("tarefa_execucao")
      .select("id")
      .eq("tarefa_id", tarefaId)
      .eq("usuario_id", usuarioId)
      .is("iniciado_em", null)
      .limit(1);

    if (data && data.length > 0) {
      await markTarefaIniciada(data[0].id);
    }
    sessionStorage.setItem(flagKey, "1");
  } catch (err) {
    console.error("LMS: erro ao marcar iniciado_em por tarefa", err);
  }
}
