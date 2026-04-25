import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

const cacheKey = (uid: string) => `core_is_admin_${uid}`;

export function useIsAdmin() {
  const { usuarioId, authenticated } = useTenant();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!authenticated || !usuarioId) {
      setIsAdmin(false);
      return;
    }
    const cached = sessionStorage.getItem(cacheKey(usuarioId));
    if (cached !== null) {
      setIsAdmin(cached === "1");
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("usuario_perfil")
        .select("perfil!inner(nome)")
        .eq("usuario_id", usuarioId);
      const adm = (data || []).some((r: any) => r.perfil?.nome === "ADMINISTRADOR");
      if (cancelled) return;
      sessionStorage.setItem(cacheKey(usuarioId), adm ? "1" : "0");
      setIsAdmin(adm);
    })();
    return () => {
      cancelled = true;
    };
  }, [usuarioId, authenticated]);

  return isAdmin === true;
}
