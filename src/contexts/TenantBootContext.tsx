import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getSubdomainTenantSlug, isMultiTenantHost } from "@/lib/tenantSubdomain";

export type TenantBootStatus =
  | "loading"
  | "ready"
  | "no-subdomain"
  | "not-found"
  | "inactive"
  | "error";

export interface BootTenant {
  id: string;
  nome: string;
  slug: string;
}

interface TenantBootContextType {
  status: TenantBootStatus;
  tenant: BootTenant | null;
  slug: string | null;
  errorMessage: string | null;
  retry: () => void;
}

const TenantBootContext = createContext<TenantBootContextType>({
  status: "loading",
  tenant: null,
  slug: null,
  errorMessage: null,
  retry: () => {},
});

const SS_KEY = "core_boot_tenant";
const RESOLVE_TIMEOUT_MS = 8000;

function readCached(slug: string): BootTenant | null {
  try {
    const raw = sessionStorage.getItem(SS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.slug?.toLowerCase() === slug.toLowerCase() && parsed?.id) {
      return { id: parsed.id, nome: parsed.nome, slug: parsed.slug };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeCached(t: BootTenant) {
  try {
    sessionStorage.setItem(SS_KEY, JSON.stringify(t));
  } catch {
    /* ignore */
  }
}

function clearCached() {
  try {
    sessionStorage.removeItem(SS_KEY);
  } catch {
    /* ignore */
  }
}

async function resolveTenantOnce(slug: string): Promise<{
  status: TenantBootStatus;
  tenant: BootTenant | null;
  message: string | null;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const { data, error } = await supabase.functions.invoke("resolve-tenant", {
      body: { slug },
    });

    clearTimeout(timer);

    if (error) {
      // FunctionsHttpError carrega .context.status
      const status = (error as any)?.context?.status;
      if (status === 404) {
        return { status: "not-found", tenant: null, message: null };
      }
      if (status === 403) {
        return { status: "inactive", tenant: null, message: null };
      }
      console.error("[TenantBoot] erro ao resolver tenant", error);
      return { status: "error", tenant: null, message: "Não foi possível conectar ao servidor." };
    }

    if (data?.success && data?.tenant?.id) {
      return {
        status: "ready",
        tenant: { id: data.tenant.id, nome: data.tenant.nome, slug: data.tenant.slug },
        message: null,
      };
    }

    if (data?.error === "TENANT_NOT_FOUND") {
      return { status: "not-found", tenant: null, message: null };
    }
    if (data?.error === "TENANT_INACTIVE") {
      return { status: "inactive", tenant: null, message: null };
    }

    return { status: "error", tenant: null, message: "Resposta inválida do servidor." };
  } catch (e: any) {
    clearTimeout(timer);
    const isAbort = e?.name === "AbortError";
    return {
      status: "error",
      tenant: null,
      message: isAbort ? "Tempo esgotado ao validar o cliente." : "Falha de rede ao validar o cliente.",
    };
  }
}

export function TenantBootProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<TenantBootStatus>("loading");
  const [tenant, setTenant] = useState<BootTenant | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const slug = getSubdomainTenantSlug();
  const startedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Sem subdomínio (raiz, app, localhost, lovable.app) → portal neutro
      if (!slug) {
        if (!isMultiTenantHost()) {
          // Ambiente dev/preview: tratamos como "no-subdomain" mas o app pode operar em modo legado.
          setStatus("no-subdomain");
        } else {
          setStatus("no-subdomain");
        }
        clearCached();
        setTenant(null);
        return;
      }

      // Cache de sessão para o mesmo slug
      const cached = readCached(slug);
      if (cached) {
        if (!cancelled) {
          setTenant(cached);
          setStatus("ready");
        }
      } else {
        setStatus("loading");
      }

      // Sempre revalida no backend (mesmo com cache, em background)
      let result = await resolveTenantOnce(slug);
      if (cancelled) return;

      // 1 retry em caso de erro de rede
      if (result.status === "error") {
        await new Promise((r) => setTimeout(r, 600));
        if (cancelled) return;
        result = await resolveTenantOnce(slug);
      }
      if (cancelled) return;

      if (result.status === "ready" && result.tenant) {
        writeCached(result.tenant);
        setTenant(result.tenant);
        setErrorMessage(null);
        setStatus("ready");
      } else {
        clearCached();
        setTenant(null);
        setErrorMessage(result.message);
        setStatus(result.status);
      }
    }

    startedRef.current = true;
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, attempt]);

  return (
    <TenantBootContext.Provider
      value={{
        status,
        tenant,
        slug,
        errorMessage,
        retry: () => setAttempt((a) => a + 1),
      }}
    >
      {children}
    </TenantBootContext.Provider>
  );
}

export function useTenantBoot() {
  return useContext(TenantBootContext);
}
