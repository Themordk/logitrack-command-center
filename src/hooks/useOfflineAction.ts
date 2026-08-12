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
export function useOfflineAction() {
  const { isOnline, enqueueAction } = useOffline();

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
