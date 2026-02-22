import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TenantContextType {
  tenantId: string | null;
  empresaId: string | null;
  armazemId: string | null;
  usuarioId: string | null;
  usuarioNome: string | null;
  loading: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => void;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  empresaId: null,
  armazemId: null,
  usuarioId: null,
  usuarioNome: null,
  loading: true,
  authenticated: false,
  login: () => {},
  logout: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [armazemId, setArmazemId] = useState<string | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [usuarioNome, setUsuarioNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const loadFromStorage = () => {
    setTenantId(localStorage.getItem("core_tenant_id"));
    setEmpresaId(localStorage.getItem("core_empresa_id"));
    setArmazemId(localStorage.getItem("core_armazem_id"));
    setUsuarioId(localStorage.getItem("core_usuario_id"));
    setUsuarioNome(localStorage.getItem("core_usuario_nome"));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        loadFromStorage();
        setAuthenticated(true);
      } else {
        clearStorage();
        setAuthenticated(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        loadFromStorage();
        setAuthenticated(true);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const clearStorage = () => {
    localStorage.removeItem("core_tenant_id");
    localStorage.removeItem("core_empresa_id");
    localStorage.removeItem("core_armazem_id");
    localStorage.removeItem("core_usuario_id");
    localStorage.removeItem("core_usuario_nome");
    setTenantId(null);
    setEmpresaId(null);
    setArmazemId(null);
    setUsuarioId(null);
    setUsuarioNome(null);
  };

  const login = () => {
    loadFromStorage();
    setAuthenticated(true);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    clearStorage();
    setAuthenticated(false);
  };

  return (
    <TenantContext.Provider value={{ tenantId, empresaId, armazemId, usuarioId, usuarioNome, loading, authenticated, login, logout }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
