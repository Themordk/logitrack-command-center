/**
 * Trava a orientação da tela em retrato.
 *
 * A Screen Orientation API só funciona em contexto seguro e, no Chrome Android,
 * normalmente apenas quando o app está instalado (modo standalone/fullscreen).
 * Em iOS ou em aba comum a chamada falha — o erro é ignorado silenciosamente.
 */

const isColetorRoute = () => window.location.hash.toLowerCase().startsWith("#/coletor");

async function applyLock() {
  const orientation: any = (window.screen as any)?.orientation;
  if (!orientation || typeof orientation.lock !== "function") return;
  if (!isColetorRoute()) return;
  try {
    await orientation.lock("portrait");
  } catch {
    // Não suportado / bloqueado pelo navegador — ignorar.
  }
}

export function initOrientationLock() {
  if (typeof window === "undefined") return;

  void applyLock();

  // O Android pode liberar o lock ao voltar do background ou ao sair de fullscreen.
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void applyLock();
  });
  document.addEventListener("fullscreenchange", () => void applyLock());
  window.addEventListener("hashchange", () => void applyLock());
}
