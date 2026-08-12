import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOffline } from "@/contexts/OfflineContext";
import { OfflineBanner } from "@/components/coletor/OfflineBanner";

import { Wifi, WifiOff, LogOut } from "lucide-react";


interface ColetorLayoutProps {
  children: React.ReactNode;
  title?: string;
  titleBadge?: React.ReactNode;
  onNavigate: (path: string) => void;
  showBack?: boolean;
  backPath?: string;
  showLogout?: boolean;
}

export function ColetorLayout({ children, title = "CORE Coletor", titleBadge, onNavigate, showBack, backPath, showLogout }: ColetorLayoutProps) {
  const { isOnline: online } = useOffline();
  const sessionIdRef = useRef<string | null>(localStorage.getItem("coletor_session_id"));
  const onlineRef = useRef(online);
  onlineRef.current = online;

  // Heartbeat every 30s (pausa quando offline)
  useEffect(() => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    const iv = setInterval(async () => {
      if (!onlineRef.current) return;
      await (supabase as any).from("log_sessao_usuario").update({ ultimo_heartbeat: new Date().toISOString() }).eq("id", sid);
    }, 30000);
    return () => clearInterval(iv);
  }, []);


  const handleLogout = async () => {
    const sid = sessionIdRef.current;
    if (sid) {
      await (supabase as any).from("log_sessao_usuario").update({ fim_sessao: new Date().toISOString() }).eq("id", sid);
      localStorage.removeItem("coletor_session_id");
    }
    await supabase.auth.signOut();
    localStorage.removeItem("core_tenant_id");
    localStorage.removeItem("core_empresa_id");
    localStorage.removeItem("core_armazem_id");
    localStorage.removeItem("core_usuario_id");
    localStorage.removeItem("core_usuario_nome");
    onNavigate("/coletor/login");
  };

  return (
    <div className="h-screen bg-[#0f1117] flex flex-col overflow-hidden">
      {/* Header – 56px fixed */}
      <header className="h-14 bg-[hsl(217,91%,40%)] flex items-center justify-between px-3 shrink-0 z-50">
        <div className="flex items-center gap-2">
          {showBack && (
            <button onClick={() => onNavigate(backPath || "/coletor/home")} className="text-white p-1.5">
              <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
            </button>
          )}
          <span className="text-white font-bold text-lg truncate">{title}</span>
          {titleBadge}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {online ? <Wifi size={18} className="text-green-300" /> : <WifiOff size={18} className="text-red-300" />}
            <span className={`text-xs font-semibold ${online ? "text-green-300" : "text-red-300"}`}>
              {online ? "ONLINE" : "OFFLINE"}
            </span>
          </div>
          {showLogout && (
            <button onClick={handleLogout} className="text-white/80 hover:text-white p-1">
              <LogOut size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col p-3 gap-3 overflow-y-auto min-h-0">
        {children}
      </main>
    </div>
  );
}