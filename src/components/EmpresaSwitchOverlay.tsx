import { useTenant } from "@/contexts/TenantContext";
import { Loader2 } from "lucide-react";

export function EmpresaSwitchOverlay() {
  const { switchingEmpresa } = useTenant();
  if (!switchingEmpresa) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm flex items-center justify-center animate-fade-in">
      <div className="flex flex-col items-center gap-3 px-6 py-4 rounded-lg border border-border bg-card shadow-elevated">
        <Loader2 className="text-primary animate-spin" size={28} />
        <div className="text-sm text-foreground font-medium">Trocando empresa…</div>
      </div>
    </div>
  );
}
