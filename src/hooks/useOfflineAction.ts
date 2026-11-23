import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOffline } from "@/contexts/OfflineContext";
import { isNetworkError } from "@/hooks/useOfflineSync";

export interface OfflineActionResult<T = any> {
  success: boolean;
  offline: boolean;
  data?: T;
}

/**
 * Executa uma RPC com fallback offline: se não houver rede, a ação é
 * enfileirada no IndexedDB e enviada automaticamente ao reconectar.
 */
/** RPCs que não são confirmação de tarefa (não ganham o ajuste do fim). */
const SEM_AJUSTE_FIM = new Set(["rpc_tarefa_iniciar", "rpc_contexto_iniciar", "rpc_execucao_fim_dispositivo"]);

export function useOfflineAction() {
  const { isOnline, enqueueAction: enfileirar } = useOffline();

  /**
   * Fase 2.4: guarda a confirmação e, logo atrás dela na fila, o horário real do bipe,
   * para o servidor acertar o fim da execução (rpc_execucao_fim_dispositivo).
   */
  const enqueueAction = useCallback(
    async (rpcName: string, params: Record<string, any>) => {
      const ocorridoEm = new Date().toISOString();
      await enfileirar(rpcName, params);
      const tarefaId = params?.p_tarefa_id;
      if (tarefaId && !SEM_AJUSTE_FIM.has(rpcName)) {
        await enfileirar("rpc_execucao_fim_dispositivo", {
          p_tarefa_id: tarefaId,
          p_ocorrido_em: ocorridoEm,
          p_usuario_id: params.p_usuario_id ?? params.p_usuario ?? localStorage.getItem("core_usuario_id"),
        });
      }
    },
    [enfileirar],
  );

  const execute = useCallback(
    async (rpcName: string, params: Record<string, any>): Promise<OfflineActionResult> => {
      if (!isOnline) {
        await enqueueAction(rpcName, params);
        return { success: true, offline: true };
      }
      try {
        const { data, error } = await supabase.rpc(rpcName as any, params);
        if (error) {
          if (isNetworkError(error)) {
            await enqueueAction(rpcName, params);
            return { success: true, offline: true };
          }
          return { success: false, offline: false, data: error };
        }
        return { success: true, offline: false, data };
      } catch (err: any) {
        if (isNetworkError(err)) {
          await enqueueAction(rpcName, params);
          return { success: true, offline: true };
        }
        return { success: false, offline: false, data: err };
      }
    },
    [isOnline, enqueueAction],
  );

  return { execute, isOnline };
}
