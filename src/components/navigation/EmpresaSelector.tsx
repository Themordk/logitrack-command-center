import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";

interface EmpresaOpcao {
  id: string;
  codigo: string | null;
  razaosocial: string;
}

/** Empresa ativa — apenas ADMINISTRADOR pode trocar (mesma regra do TopNav anterior). */
export function EmpresaSelector({ className }: { className?: string }) {
  const { tenantId, empresaId, changeEmpresa } = useTenant();
  const isAdmin = useIsAdmin();
  const [empresas, setEmpresas] = useState<EmpresaOpcao[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    supabase
      .from("empresa")
      .select("id, codigo, razaosocial")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("razaosocial")
      .then(({ data }) => setEmpresas((data as EmpresaOpcao[] | null) || []));
  }, [tenantId]);

  const atual = empresas.find((e) => e.id === empresaId);

  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", className)}>
      <MapPin size={13} className="text-muted-foreground shrink-0" />
      {isAdmin ? (
        <select
          value={empresaId || ""}
          onChange={(e) => changeEmpresa(e.target.value)}
          className="bg-transparent text-xs text-foreground border-none outline-none cursor-pointer max-w-[120px] truncate"
          title="Trocar empresa ativa"
          aria-label="Empresa ativa"
        >
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.codigo || e.id.slice(0, 8)}
            </option>
          ))}
          {empresas.length === 0 && <option value="">—</option>}
        </select>
      ) : (
        <span className="text-xs text-foreground font-medium max-w-[120px] truncate" title="Empresa ativa">
          {atual?.codigo || atual?.razaosocial || "—"}
        </span>
      )}
    </div>
  );
}
