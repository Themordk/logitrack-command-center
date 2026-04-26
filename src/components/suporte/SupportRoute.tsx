import { ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Props {
  children: ReactNode;
  onUnauthorized: () => void;
}

/**
 * Guard de rotas /suporte/*. Revalida via edge function support-whoami.
 * O localStorage é apenas otimização visual; a autoridade é o JWT no servidor.
 */
export function SupportRoute({ children, onUnauthorized }: Props) {
  const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        if (!sess.session) {
          if (!cancelled) setStatus("denied");
          return;
        }
        const { data, error } = await supabase.functions.invoke("support-whoami");
        if (cancelled) return;
        if (error || !data?.success) {
          localStorage.removeItem("core_is_platform_support");
          setStatus("denied");
          return;
        }
        localStorage.setItem("core_is_platform_support", "1");
        if (data.nome) localStorage.setItem("core_usuario_nome", data.nome);
        setStatus("ok");
      } catch {
        if (!cancelled) setStatus("denied");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "checking") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (status === "denied") {
    setTimeout(onUnauthorized, 0);
    return null;
  }

  return <>{children}</>;
}
