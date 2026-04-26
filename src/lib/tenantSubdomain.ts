// Utilitários para identificar o tenant a partir do subdomínio.
//
// Domínio principal: corelogitrack.com.br
// Wildcard ativo: {slug}.corelogitrack.com.br
//
// Subdomínios reservados (não são tenants): www, app
// Ambientes sem multi-tenant por subdomínio: localhost, *.lovable.app, IPs

const ROOT_DOMAIN = "corelogitrack.com.br";
const RESERVED_SUBDOMAINS = new Set(["www", "app", ""]);
const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export function getCurrentHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

export function isMultiTenantHost(host: string = getCurrentHost()): boolean {
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1") return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  if (host.endsWith(".lovable.app")) return false;
  if (host.endsWith(".lovable.dev")) return false;
  return host === ROOT_DOMAIN || host.endsWith(`.${ROOT_DOMAIN}`);
}

/**
 * Extrai o slug do tenant a partir do subdomínio.
 * Retorna null quando estamos na raiz, em domínio reservado, ou em ambiente de desenvolvimento.
 */
export function getSubdomainTenantSlug(host: string = getCurrentHost()): string | null {
  if (!isMultiTenantHost(host)) return null;
  if (host === ROOT_DOMAIN) return null;

  const suffix = `.${ROOT_DOMAIN}`;
  if (!host.endsWith(suffix)) return null;

  const sub = host.slice(0, -suffix.length).trim();
  // Apenas o primeiro nível (não suportamos a.b.corelogitrack.com.br)
  const first = sub.split(".")[0];
  if (!first) return null;
  if (RESERVED_SUBDOMAINS.has(first)) return null;
  if (!SLUG_RE.test(first)) return null;
  return first;
}

export function buildTenantUrl(slug: string): string {
  return `https://${slug}.${ROOT_DOMAIN}`;
}

export function buildAppUrl(): string {
  return `https://app.${ROOT_DOMAIN}`;
}

export function getRootDomain(): string {
  return ROOT_DOMAIN;
}
