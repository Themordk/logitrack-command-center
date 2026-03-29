import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { usePermissions } from "@/contexts/PermissionsContext";
import { Package, ArrowDownToLine, ArrowUpFromLine, Repeat, ClipboardCheck, BarChart3, Search, Settings } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface ModuleCard {
  label: string;
  icon: React.ReactNode;
  path: string;
  color: string;
  countKey?: string;
  permModulo?: string;
}

const modules: ModuleCard[] = [
  { label: "Recebimento", icon: <ArrowDownToLine size={32} />, path: "/coletor/recebimento", color: "hsl(217,91%,50%)", permModulo: "coletor.recebimento" },
  { label: "Armazenagem", icon: <Package size={32} />, path: "/coletor/armazenagem", color: "hsl(142,76%,36%)", permModulo: "coletor.armazenagem" },
  { label: "Movimentos", icon: <Repeat size={32} />, path: "/coletor/movimentos", color: "hsl(45,93%,47%)", permModulo: "coletor.movimentos" },
  { label: "Separação", icon: <ArrowUpFromLine size={32} />, path: "/coletor/separacao/iniciar", color: "hsl(280,70%,55%)", permModulo: "coletor.separacao" },
  { label: "Conferência", icon: <ClipboardCheck size={32} />, path: "/coletor/conferencia/iniciar", color: "hsl(200,80%,50%)", permModulo: "coletor.conferencia" },
  { label: "Inventário", icon: <BarChart3 size={32} />, path: "/coletor/inventario", color: "hsl(0,84%,60%)", permModulo: "coletor.inventario" },
];

export function ColetorHomePage({ onNavigate }: Props) {
  const [pendingCounts, setPendingCounts] = useState<Record<string, number>>({});
  const { can } = usePermissions();
  const userName = localStorage.getItem("core_usuario_nome") || "Operador";
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = localStorage.getItem("core_armazem_id");

  // Filter modules by permission
  const allowedModules = modules.filter(
    (m) => !m.permModulo || can(m.permModulo, "READ") || can(m.permModulo, "EXECUTE")
  );

  useEffect(() => {
    if (!tenantId || !armazemId) return;
    (async () => {
      const { count } = await (supabase as any)
        .from("tarefa")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("armazem_id", armazemId)
        .eq("status", "CRIADA");
      setPendingCounts(prev => ({ ...prev, Recebimento: count || 0 }));
    })();
  }, [tenantId, armazemId]);

  return (
    <ColetorLayout title="CORE Coletor" onNavigate={onNavigate} showLogout>
      <div className="mb-2">
        <span className="text-lg text-[hsl(213,31%,55%)]">Olá, </span>
        <span className="text-lg font-bold text-white">{userName}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 flex-1">
        {allowedModules.map((m) => {
          const count = pendingCounts[m.label];
          const isActive = m.path !== "/coletor/home";
          return (
            <button
              key={m.label}
              onClick={() => onNavigate(m.path)}
              disabled={!isActive}
              className={`relative flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border transition-all active:scale-[0.97] ${
                isActive
                  ? "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)] active:bg-[hsl(222,35%,16%)]"
                  : "bg-[hsl(222,40%,10%)] border-[hsl(222,35%,16%)] opacity-50"
              }`}
            >
              <div style={{ color: m.color }}>{m.icon}</div>
              <span className="text-base font-semibold text-white">{m.label}</span>
              {count != null && count > 0 && (
                <span className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-[#E02424] text-white text-xs font-bold flex items-center justify-center">
                  {count}
                </span>
              )}
              {!isActive && <span className="text-[10px] text-[hsl(213,31%,45%)]">Em breve</span>}
            </button>
          );
        })}
      </div>

      {/* Footer Navigation */}
      <div className="mt-auto pt-4 border-t border-[hsl(222,35%,18%)]">
        <div className="flex justify-around items-center">
          <button
            onClick={() => onNavigate("/coletor/consulta")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl active:bg-[hsl(222,35%,16%)] transition-all"
          >
            <Search size={24} className="text-[hsl(217,91%,60%)]" />
            <span className="text-[10px] text-[hsl(213,31%,75%)] font-semibold">Consultas</span>
          </button>
          <button
            onClick={() => onNavigate("/coletor/metas")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl active:bg-[hsl(222,35%,16%)] transition-all"
          >
            <BarChart3 size={24} className="text-[hsl(280,70%,55%)]" />
            <span className="text-[10px] text-[hsl(213,31%,75%)] font-semibold">Metas</span>
          </button>
          <button
            onClick={() => onNavigate("/coletor/configuracoes")}
            className="flex flex-col items-center gap-1 p-2 rounded-xl active:bg-[hsl(222,35%,16%)] transition-all"
          >
            <Settings size={24} className="text-[hsl(213,31%,55%)]" />
            <span className="text-[10px] text-[hsl(213,31%,75%)] font-semibold">Config</span>
          </button>
        </div>
      </div>
    </ColetorLayout>
  );
}
