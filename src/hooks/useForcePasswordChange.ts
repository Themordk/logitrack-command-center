import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Verifica, após a autenticação, se o usuário precisa trocar a senha
 * (flag `deve_trocar_senha` setada pelo reset administrativo).
 * Usado como gate global no painel administrativo.
 */
export function useForcePasswordChange(enabled: boolean) {
  const [loading, setLoading] = useState(enabled);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [mustChange, setMustChange] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!enabled) {
      setLoading(false);
      setMustChange(false);
      setUsuarioId(null);
      return;
    }

    (async () => {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const uid = userData.user?.id;
        if (!uid) {
          if (!cancelled) {
            setMustChange(false);
            setLoading(false);
          }
          return;
        }
        const { data } = await (supabase as any)
          .from("usuario")
          .select("id, deve_trocar_senha")
          .eq("auth_user_id", uid)
          .maybeSingle();

        if (cancelled) return;
        setUsuarioId(data?.id ?? null);
        setMustChange(!!data?.deve_trocar_senha);
      } catch {
        if (!cancelled) setMustChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const clear = useCallback(() => setMustChange(false), []);

  return { loading, mustChange, usuarioId, clear };
}
