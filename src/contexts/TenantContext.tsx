import { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSubdomainTenantSlug } from "@/lib/tenantSubdomain";
import { sanitizeId } from "@/lib/uuid";

/**
 * Lê uma chave do localStorage, sanitizando contra strings inválidas como
 * "null"/"undefined"/"" gravadas indevidamente em logins anteriores.
 * Para chaves de ID (UUID), só retorna se for um UUID válido. Caso contrário,
 * limpa a chave do storage e retorna null.
 */
function readSanitizedId(key: string): string | null {
  const raw = localStorage.getItem(key);
  const clean = sanitizeId(raw);
  if (raw && !clean) {
    // strings inválidas ("null", "undefined", "") são removidas para não voltarem após reload
    localStorage.removeItem(key);
  }
  return clean;
}

function readPlainString(key: string): string | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  if (raw === "null" || raw === "undefined") {
    localStorage.removeItem(key);
    return null;
  }
  return raw;
}

interface TenantContextType {
  tenantId: string | null;
  empresaId: string | null;
  armazemId: string | null;
  armazemNome: string | null;
  armazemLoading: boolean;
  armazemErro: string | null;
  usuarioId: string | null;
  usuarioNome: string | null;
  loading: boolean;
  authenticated: boolean;
  empresaVersion: number;
  switchingEmpresa: boolean;
  login: (tipoUsuario?: string) => void;
  logout: () => void;
  changeEmpresa: (empresaId: string) => Promise<void>;
}

const TenantContext = createContext<TenantContextType>({
  tenantId: null,
  empresaId: null,
  armazemId: null,
  armazemNome: null,
  armazemLoading: false,
  armazemErro: null,
  usuarioId: null,
  usuarioNome: null,
  loading: true,
  authenticated: false,
  empresaVersion: 0,
  switchingEmpresa: false,
  login: () => {},
  logout: () => {},
  changeEmpresa: async () => {},
});


export function TenantProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [armazemId, setArmazemId] = useState<string | null>(null);
  const [armazemNome, setArmazemNome] = useState<string | null>(null);
  const [armazemLoading, setArmazemLoading] = useState(false);
  const [armazemErro, setArmazemErro] = useState<string | null>(null);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [usuarioNome, setUsuarioNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [empresaVersion, setEmpresaVersion] = useState(0);
  const [switchingEmpresa, setSwitchingEmpresa] = useState(false);
  const switchTimer = useRef<number | null>(null);

  const loadFromStorage = () => {
    setTenantId(readSanitizedId("core_tenant_id"));
    setEmpresaId(readSanitizedId("core_empresa_id"));
    setArmazemId(readSanitizedId("core_armazem_id"));
    setArmazemNome(readPlainString("core_armazem_nome"));
    setUsuarioId(readSanitizedId("core_usuario_id"));
    setUsuarioNome(readPlainString("core_usuario_nome"));
  };

  const aplicarArmazem = (res: { id: string | null; descricao: string | null; erro: string | null }) => {
    if (res.id) {
      localStorage.setItem("core_armazem_id", res.id);
      if (res.descricao) localStorage.setItem("core_armazem_nome", res.descricao);
      else localStorage.removeItem("core_armazem_nome");
    } else {
      localStorage.removeItem("core_armazem_id");
      localStorage.removeItem("core_armazem_nome");
    }
    setArmazemId(res.id);
    setArmazemNome(res.descricao);
    setArmazemErro(res.erro);
  };


  // Verifica se o tenant gravado no localStorage bate com o tenant resolvido pelo subdomínio.
  // Se houver mismatch, derruba a sessão imediatamente (defesa contra adulteração de localStorage
  // ou troca de subdomínio com sessão antiga).
  const enforceTenantSubdomainGuard = async (): Promise<boolean> => {
    const slug = getSubdomainTenantSlug();
    if (!slug) return true; // sem subdomínio (preview/dev/portal neutro) → sem trava
    try {
      const raw = sessionStorage.getItem("core_boot_tenant");
      const boot = raw ? JSON.parse(raw) : null;
      if (!boot?.id) return true; // boot ainda não resolveu
      const stored = localStorage.getItem("core_tenant_id");
      if (stored && stored !== boot.id) {
        console.warn("[TenantContext] Mismatch tenant subdomínio×sessão. Encerrando sessão.");
        await supabase.auth.signOut();
        clearStorage();
        setAuthenticated(false);
        return false;
      }
    } catch {
      /* ignore */
    }
    return true;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        const ok = await enforceTenantSubdomainGuard();
        if (!ok) { setLoading(false); return; }
        loadFromStorage();
        setAuthenticated(true);
      } else {
        clearStorage();
        setAuthenticated(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const ok = await enforceTenantSubdomainGuard();
        if (ok) {
          loadFromStorage();
          setAuthenticated(true);
        }
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
    localStorage.removeItem("core_is_platform_support");
    localStorage.removeItem("core_tipo_usuario");
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

  const changeEmpresa = async (newEmpresaId: string) => {
    if (!newEmpresaId || newEmpresaId === empresaId) return;

    setSwitchingEmpresa(true);
    if (switchTimer.current) window.clearTimeout(switchTimer.current);

    // Persiste empresa
    localStorage.setItem("core_empresa_id", newEmpresaId);
    setEmpresaId(newEmpresaId);

    // Recalcula armazém ativo coerente com a nova empresa
    let novoArmazemId: string | null = null;
    try {
      if (tenantId) {
        const { data } = await (supabase as any)
          .from("armazem")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("empresa_id", newEmpresaId)
          .eq("ativo", true)
          .order("descricao")
          .limit(1)
          .maybeSingle();
        novoArmazemId = data?.id ?? null;
      }
    } catch (e) {
      console.warn("Falha ao buscar armazém ativo da nova empresa", e);
    }

    if (novoArmazemId) {
      localStorage.setItem("core_armazem_id", novoArmazemId);
    } else {
      localStorage.removeItem("core_armazem_id");
    }
    setArmazemId(novoArmazemId);

    // Invalida cache de permissões
    sessionStorage.removeItem("core_rbac_permissions");

    // Dispara refetch global após empresa+armazém estarem coerentes
    setEmpresaVersion((v) => v + 1);

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
