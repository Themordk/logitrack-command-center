import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TenantContextType {
  tenantId: string | null;
  empresaId: string | null;
  setTenantId: (id: string) => void;
  setEmpresaId: (id: string) => void;
  loading: boolean;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  empresaId: null,
  setTenantId: () => {},
  setEmpresaId: () => {},
  loading: true,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [empresaId, setEmpresaIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("core_tenant_id");
    const storedEmpresa = localStorage.getItem("core_empresa_id");
    if (stored) setTenantIdState(stored);
    if (storedEmpresa) setEmpresaIdState(storedEmpresa);
    setLoading(false);
  }, []);

  const setTenantId = (id: string) => {
    setTenantIdState(id);
    localStorage.setItem("core_tenant_id", id);
  };

  const setEmpresaId = (id: string) => {
    setEmpresaIdState(id);
    localStorage.setItem("core_empresa_id", id);
  };

  return (
    <TenantContext.Provider value={{ tenantId, empresaId, setTenantId, setEmpresaId, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
