import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

interface PermissionsContextType {
  permissions: Map<string, Set<string>>;
  loading: boolean;
  can: (modulo: string, acao: string) => boolean;
  canAny: (modulo: string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: new Map(),
  loading: true,
  can: () => false,
  canAny: () => false,
  refresh: async () => {},
});

const CACHE_KEY = "core_rbac_permissions";
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function loadFromCache(): Map<string, Set<string>> | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    const map = new Map<string, Set<string>>();
    for (const [k, v] of Object.entries(parsed.data)) {
      map.set(k, new Set(v as string[]));
    }
    return map;
  } catch {
    return null;
  }
}

function saveToCache(map: Map<string, Set<string>>) {
  const data: Record<string, string[]> = {};
  map.forEach((v, k) => { data[k] = Array.from(v); });
  sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { usuarioId, authenticated, loading: tenantLoading } = useTenant();
  const [permissions, setPermissions] = useState<Map<string, Set<string>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [resolvedUsuarioId, setResolvedUsuarioId] = useState<string | null>(null);

  const fetchPermissions = useCallback(async () => {
    if (!usuarioId) {
      setPermissions(new Map());
      setResolvedUsuarioId(null);
      setLoading(false);
      return;
    }

    // Try cache first
    const cached = loadFromCache();
    if (cached) {
      setPermissions(cached);
      setResolvedUsuarioId(usuarioId);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await (supabase as any).rpc("fn_usuario_permissoes", {
      p_usuario_id: usuarioId,
    });

    const map = new Map<string, Set<string>>();
    if (!error && data) {
      for (const row of data) {
        const existing = map.get(row.modulo_codigo) || new Set<string>();
        existing.add(row.acao);
        map.set(row.modulo_codigo, existing);
      }
    }

    setPermissions(map);
    saveToCache(map);
    setResolvedUsuarioId(usuarioId);
    setLoading(false);
  }, [usuarioId]);

  useEffect(() => {
    if (tenantLoading) {
      setLoading(true);
      return;
    }

    if (authenticated && usuarioId) {
      fetchPermissions();
    } else if (authenticated) {
      setPermissions(new Map());
      setResolvedUsuarioId(null);
      setLoading(true);
    } else {
      setPermissions(new Map());
      setResolvedUsuarioId(null);
      sessionStorage.removeItem(CACHE_KEY);
      setLoading(false);
    }
  }, [authenticated, usuarioId, fetchPermissions, tenantLoading]);

  const permissionsLoading = tenantLoading || (authenticated && (!usuarioId || resolvedUsuarioId !== usuarioId || loading));

  const can = useCallback(
    (modulo: string, acao: string) => {
      // If no permissions loaded yet (and user is authenticated), allow by default
      // This prevents blocking while loading
      if (permissions.size === 0 && permissionsLoading) return true;
      // If user has NO permissions at all (no profile assigned), grant full access
      // This is a safety fallback for existing users without RBAC setup
      if (permissions.size === 0 && !permissionsLoading) return true;
      return permissions.get(modulo)?.has(acao) ?? false;
    },
    [permissions, permissionsLoading],
  );

  const canAny = useCallback(
    (modulo: string) => {
      if (permissions.size === 0) return true;
      return permissions.has(modulo);
    },
    [permissions],
  );

  return (
    <PermissionsContext.Provider value={{ permissions, loading: permissionsLoading, can, canAny, refresh: fetchPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
