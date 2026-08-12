import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Package, ArrowDownToLine, ArrowUpFromLine, Repeat, ClipboardCheck, BarChart3, Search, Settings, Loader2, Cloud } from "lucide-react";
import { useOffline } from "@/contexts/OfflineContext";


interface Props { onNavigate: (path: string) => void; }

interface ModuleCard {
  label: string;
  icon: React.ReactNode;
  path: string;
  color: string;
  badgeKey?: string;
  permModulo?: string;
}

const modules: ModuleCard[] = [
  { label: "Recebimento", icon: <ArrowDownToLine size={32} />, path: "/coletor/recebimento", color: "hsl(217,91%,50%)", permModulo: "coletor.recebimento", badgeKey: "recebimento" },
  { label: "Armazenagem", icon: <Package size={32} />, path: "/coletor/armazenagem", color: "hsl(142,76%,36%)", permModulo: "coletor.armazenagem", badgeKey: "armazenagem" },
  { label: "Movimentos", icon: <Repeat size={32} />, path: "/coletor/movimentos", color: "hsl(45,93%,47%)", permModulo: "coletor.movimentos", badgeKey: "movimentos" },
  { label: "Separação", icon: <ArrowUpFromLine size={32} />, path: "/coletor/separacao/iniciar", color: "hsl(280,70%,55%)", permModulo: "coletor.separacao", badgeKey: "separacao" },
  { label: "Conferência", icon: <ClipboardCheck size={32} />, path: "/coletor/conferencia/iniciar", color: "hsl(200,80%,50%)", permModulo: "coletor.conferencia", badgeKey: "conferencia" },
  { label: "Inventário", icon: <BarChart3 size={32} />, path: "/coletor/inventario", color: "hsl(0,84%,60%)", permModulo: "coletor.inventario", badgeKey: "inventario" },
];

export function ColetorHomePage({ onNavigate }: Props) {
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const { can, loading: permLoading } = usePermissions();
  const userName = localStorage.getItem("core_usuario_nome") || "Operador";
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const armazemId = localStorage.getItem("core_armazem_id");

  // Filter modules by permission
  const allowedModules = modules.filter(
    (m) => !m.permModulo || can(m.permModulo, "READ") || can(m.permModulo, "EXECUTE")
  );

  useEffect(() => {
    if (!tenantId || !empresaId) return;
    let cancelled = false;

    const fetchBadges = async () => {
      const { data, error } = await (supabase as any).rpc("fn_coletor_menu_badges", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armazemId || null,
      });
      if (!cancelled && data && !error) {
        setPendingCounts(data as Record<string, number>);
      }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchBadges();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tenantId, empresaId, armazemId]);

  return (
    <ColetorLayout title="CORE Coletor" onNavigate={onNavigate} showLogout>
      <div className="shrink-0 mb-1">
        <span className="text-base text-[hsl(213,31%,55%)]">Olá, </span>
        <span className="text-base font-bold text-white">{userName}</span>
        {pendingCount > 0 && (
          <button
            onClick={() => onNavigate("/coletor/offline-status")}
            className="mt-1 flex items-center gap-1.5 text-yellow-400"
          >
            <Cloud size={14} />
            <span className="text-xs font-semibold">
              {pendingCount} {pendingCount === 1 ? "ação aguardando" : "ações aguardando"} sincronização
            </span>
          </button>
        )}
      </div>


      {permLoading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" />
        </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
        <div className="grid grid-cols-2 gap-2">
          {allowedModules.map((m) => {
            const count = m.badgeKey ? pendingCounts[m.badgeKey] : 0;
            const isActive = m.path !== "/coletor/home";
            return (
              <button
                key={m.label}
                onClick={() => onNavigate(m.path)}
                disabled={!isActive}
                className={`relative flex flex-col items-center justify-center gap-2 p-3 rounded-2xl border transition-all active:scale-[0.97] ${
                  isActive
                    ? "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)] active:bg-[hsl(222,35%,16%)]"
                    : "bg-[hsl(222,40%,10%)] border-[hsl(222,35%,16%)] opacity-50"
                }`}
              >
                <div style={{ color: m.color }}>{m.icon}</div>
                <span className="text-sm font-semibold text-white">{m.label}</span>
                {count != null && count > 0 && (
                  <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-[#E02424] text-white text-xs font-bold flex items-center justify-center">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
                {!isActive && <span className="text-[10px] text-[hsl(213,31%,45%)]">Em breve</span>}
              </button>
            );
          })}
        </div>
      </div>
      )}

      {/* Footer Navigation – fixo */}
      <div className="shrink-0 pt-2 border-t border-[hsl(222,35%,18%)]">
        <div className="flex justify-around items-center">
          <button
            onClick={() => onNavigate("/coletor/consulta")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl active:bg-[hsl(222,35%,16%)] transition-all"
          >
            <Search size={22} className="text-[hsl(217,91%,60%)]" />
            <span className="text-[10px] text-[hsl(213,31%,75%)] font-semibold">Consultas</span>
          </button>
          <button
            onClick={() => onNavigate("/coletor/metas")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl active:bg-[hsl(222,35%,16%)] transition-all"
          >
            <BarChart3 size={22} className="text-[hsl(280,70%,55%)]" />
            <span className="text-[10px] text-[hsl(213,31%,75%)] font-semibold">Metas</span>
          </button>
          <button
            onClick={() => onNavigate("/coletor/configuracoes")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl active:bg-[hsl(222,35%,16%)] transition-all"
          >
            <Settings size={22} className="text-[hsl(213,31%,55%)]" />
            <span className="text-[10px] text-[hsl(213,31%,75%)] font-semibold">Config</span>
          </button>
        </div>
      </div>
    </ColetorLayout>
  );
}
