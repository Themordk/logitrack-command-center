import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

interface PermissionsContextType {
  permissions: Map<string, Set<string>>;
  loading: boolean;
  can: (modulo: string, acao: string) => boolean;
  canAny: (modulo: string) => boolean;
  /** Recarrega do banco, ignorando o cache (ex.: depois de salvar um perfil). */
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: new Map(),
  loading: true,
  can: () => false,
  canAny: () => false,
  refresh: async () => {},
});

// v2: o cache passou a guardar se o usuário tem perfil (semPerfil).
const CACHE_KEY = "core_rbac_permissions_v2";
const CACHE_TTL = 5 * 60 * 1000; // 5 min
const SEM_PERMISSOES = new Map<string, Set<string>>();

interface PermissoesCarregadas {
  usuarioId: string;
  map: Map<string, Set<string>>;
  /** Usuário sem nenhum perfil (legado, antes do RBAC): mantém acesso total. */
  semPerfil: boolean;
}

function loadFromCache(usuarioId: string): PermissoesCarregadas | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; usuarioId: string; semPerfil: boolean; data: Record<string, string[]> };
    if (Date.now() - parsed.ts > CACHE_TTL || parsed.usuarioId !== usuarioId) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    const map = new Map<string, Set<string>>();
    for (const [k, v] of Object.entries(parsed.data)) map.set(k, new Set(v));
    return { usuarioId, map, semPerfil: parsed.semPerfil };
  } catch {
    return null;
  }
}

function saveToCache(p: PermissoesCarregadas) {
  try {
    const data: Record<string, string[]> = {};
    p.map.forEach((v, k) => { data[k] = Array.from(v); });
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), usuarioId: p.usuarioId, semPerfil: p.semPerfil, data }));
  } catch {
    // sessionStorage indisponível: segue sem cache
  }
}

function clearCache() {
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* sem storage */ }
}

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { usuarioId, authenticated, loading: tenantLoading } = useTenant();
  const [carregadas, setCarregadas] = useState<PermissoesCarregadas | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPermissions = useCallback(async (ignorarCache = false) => {
    if (!usuarioId) {
      setCarregadas(null);
      setLoading(false);
      return;
    }

    const cached = ignorarCache ? null : loadFromCache(usuarioId);
    if (cached) {
      setCarregadas(cached);
      setLoading(false);
      return;
    }

    setLoading(true);
    const [permRes, perfilRes] = await Promise.all([
      supabase.rpc("fn_usuario_permissoes", { p_usuario_id: usuarioId }),
      supabase.from("usuario_perfil").select("id", { count: "exact", head: true }).eq("usuario_id", usuarioId),
    ]);

    const map = new Map<string, Set<string>>();
    for (const row of permRes.data ?? []) {
      const existing = map.get(row.modulo_codigo) || new Set<string>();
      existing.add(row.acao);
      map.set(row.modulo_codigo, existing);
    }

    // Só quem realmente não tem perfil mantém o acesso total legado. Um perfil com
    // todos os menus ocultos devolve lista vazia e NÃO pode virar acesso total.
    // Em erro de leitura, nega (não grava cache, para tentar de novo no próximo carregamento).
    const falhou = !!permRes.error || !!perfilRes.error;
    const resultado: PermissoesCarregadas = {
      usuarioId,
      map,
      semPerfil: !falhou && (perfilRes.count ?? 0) === 0,
    };
    if (falhou) console.error("[RBAC] falha ao carregar permissões", permRes.error ?? perfilRes.error);
    else saveToCache(resultado);

    setCarregadas(resultado);
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
      setCarregadas(null);
      setLoading(true);
    } else {
      setCarregadas(null);
      clearCache();
      setLoading(false);
    }
  }, [authenticated, usuarioId, fetchPermissions, tenantLoading]);

  const permissionsLoading =
    tenantLoading || (authenticated && (!usuarioId || carregadas?.usuarioId !== usuarioId || loading));
  // Permissões já resolvidas para este usuário (inclusive durante um refresh).
  const pronto = !!carregadas && carregadas.usuarioId === usuarioId;
  const permissions = pronto ? carregadas.map : SEM_PERMISSOES;
  const semPerfil = pronto && carregadas.semPerfil;

  const can = useCallback(
    (modulo: string, acao: string) => {
      // Antes do primeiro carregamento não bloqueia a tela (o guard de rota espera o loading).
      if (!pronto) return true;
      if (semPerfil) return true;
      return permissions.get(modulo)?.has(acao) ?? false;
    },
    [permissions, pronto, semPerfil],
  );

  const canAny = useCallback(
    (modulo: string) => {
      if (!pronto || semPerfil) return true;
      return permissions.has(modulo);
    },
    [permissions, pronto, semPerfil],
  );

  const refresh = useCallback(async () => {
    clearCache();
    await fetchPermissions(true);
  }, [fetchPermissions]);

  return (
    <PermissionsContext.Provider value={{ permissions, loading: permissionsLoading, can, canAny, refresh }}>
      {children}
    </PermissionsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook do contexto, padrão do projeto
export function usePermissions() {
  return useContext(PermissionsContext);
}
