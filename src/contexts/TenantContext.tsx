import { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TenantContextType {
  tenantId: string | null;
  empresaId: string | null;
  armazemId: string | null;
  usuarioId: string | null;
  usuarioNome: string | null;
  loading: boolean;
  authenticated: boolean;
  empresaVersion: number;
  switchingEmpresa: boolean;
  login: (tipoUsuario?: string) => void;
  logout: () => void;
  changeEmpresa: (empresaId: string) => void;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  empresaId: null,
  armazemId: null,
  usuarioId: null,
  usuarioNome: null,
  loading: true,
  authenticated: false,
  empresaVersion: 0,
  switchingEmpresa: false,
  login: () => {},
  logout: () => {},
  changeEmpresa: () => {},
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [armazemId, setArmazemId] = useState<string | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [usuarioNome, setUsuarioNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [empresaVersion, setEmpresaVersion] = useState(0);
  const [switchingEmpresa, setSwitchingEmpresa] = useState(false);
  const switchTimer = useRef<number | null>(null);

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

  const login = (tipoUsuario?: string) => {
    loadFromStorage();
    setAuthenticated(true);
    if (tipoUsuario) localStorage.setItem("core_tipo_usuario", tipoUsuario);
  };

  const logout = async () => {
    // limpa caches dependentes do usuário
    sessionStorage.removeItem("core_rbac_permissions");
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("core_is_admin_"))
      .forEach((k) => sessionStorage.removeItem(k));
    await supabase.auth.signOut();
    clearStorage();
    setAuthenticated(false);
  };

  const changeEmpresa = (newEmpresaId: string) => {
    if (!newEmpresaId || newEmpresaId === empresaId) return;
    localStorage.setItem("core_empresa_id", newEmpresaId);
    setEmpresaId(newEmpresaId);
    setEmpresaVersion((v) => v + 1);
    // invalida cache de permissões (podem variar por empresa em evolução futura)
    sessionStorage.removeItem("core_rbac_permissions");
    // Overlay leve para feedback visual
    setSwitchingEmpresa(true);
    if (switchTimer.current) window.clearTimeout(switchTimer.current);
    switchTimer.current = window.setTimeout(() => setSwitchingEmpresa(false), 700);
  };

  return (
    <TenantContext.Provider
      value={{
        tenantId,
        empresaId,
        armazemId,
        usuarioId,
        usuarioNome,
        loading,
        authenticated,
        empresaVersion,
        switchingEmpresa,
        login,
        logout,
        changeEmpresa,
      }}
    >
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
