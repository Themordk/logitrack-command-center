/**
 * Lê um parâmetro de query considerando hash routing.
 * Suporta "#/rota?param=valor" e, como fallback, "?param=valor" na URL.
 */
export function getRouteParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const value = new URLSearchParams(hash.slice(qIndex + 1)).get(name);
    if (value) return value;
  }
  return new URLSearchParams(window.location.search).get(name);
}

/** Remove um parâmetro da query do hash atual, sem recarregar a página. */
export function clearRouteParam(name: string) {
  if (typeof window === "undefined") return;
  const hash = window.location.hash.replace(/^#/, "");
  const qIndex = hash.indexOf("?");
  if (qIndex < 0) return;
  const path = hash.slice(0, qIndex);
  const params = new URLSearchParams(hash.slice(qIndex + 1));
  params.delete(name);
  const rest = params.toString();
  window.history.replaceState(null, "", `#${path}${rest ? `?${rest}` : ""}`);
}
