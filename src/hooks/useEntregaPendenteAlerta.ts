/**
 * Módulo de Entregas · RN17 — alerta sonoro de entrega aguardando aceite.
 *
 * Fica ligado no ColetorLayout (qualquer tela do coletor) para quem tem coletor.entregas.
 * Fonte: entrega_minhas_listar; atualiza por Realtime (mudanças em `entrega` do próprio usuário),
 * a cada 30 s e quando a tela volta a ficar visível. Enquanto houver entrega em
 * AGUARDANDO_ACEITE, toca o alerta + vibração na hora e a cada 30 s; para no aceite.
 *
 * O estado fica no módulo porque cada tela do coletor monta o próprio ColetorLayout:
 * trocar de tela não pode repetir o bipe antes do intervalo nem refazer a consulta à toa.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/contexts/PermissionsContext";
import { entregaService, type EntregaResumo } from "@/lib/entregaService";
import { ALERTA_ENTREGA_INTERVALO_MS } from "@/lib/entregaExibicao";
import { liberarAudio, tocarAlerta } from "@/pages/tv/tvAlertaSonoro";

/** Modelo intermediário do painel de TV (2 notas, tonal, não parece alarme de incêndio). */
const NIVEL_SOM = 3;
const VIBRACAO = [200, 100, 200];
const CACHE_MS = 10_000;

let ultimoAlertaEm = 0;
let ultimaConsulta: { usuarioId: string; em: number; dados: EntregaResumo[] } | null = null;
let ouvinteAudio = false;

function prepararAudio() {
  if (ouvinteAudio || typeof document === "undefined") return;
  ouvinteAudio = true;
  // O navegador só libera som após um toque: o primeiro toque em qualquer lugar libera.
  const liberar = () => { void liberarAudio(); };
  document.addEventListener("pointerdown", liberar, { passive: true });
  document.addEventListener("keydown", liberar);
}

function alertar(): void {
  ultimoAlertaEm = Date.now();
  tocarAlerta(NIVEL_SOM);
  try { navigator.vibrate?.(VIBRACAO); } catch { /* sem vibração */ }
}

const EVENTO_ATUALIZAR = "core:entregas-atualizadas";

/** Avise o alerta que as entregas mudaram (ex.: aceite feito nesta tela) para ele parar na hora. */
export function avisarEntregasAtualizadas() {
  ultimaConsulta = null;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_ATUALIZAR));
}

/** Só para testes. */
export function __resetEntregaAlerta() {
  ultimoAlertaEm = 0;
  ultimaConsulta = null;
}

export function useEntregaPendenteAlerta() {
  const { can, loading } = usePermissions();
  const habilitado = !loading && can("coletor.entregas", "EXECUTE");
  const tenantId = typeof localStorage !== "undefined" ? localStorage.getItem("core_tenant_id") : null;
  const usuarioId = typeof localStorage !== "undefined" ? localStorage.getItem("core_usuario_id") : null;

  const [entregas, setEntregas] = useState<EntregaResumo[]>(() =>
    ultimaConsulta && ultimaConsulta.usuarioId === usuarioId ? ultimaConsulta.dados : [],
  );
  const montado = useRef(true);

  const consultar = useCallback(async (forcar = false) => {
    if (!habilitado || !tenantId || !usuarioId) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    if (!forcar && ultimaConsulta && ultimaConsulta.usuarioId === usuarioId && Date.now() - ultimaConsulta.em < CACHE_MS) {
      setEntregas(ultimaConsulta.dados);
      return;
    }
    try {
      const dados = await entregaService.minhas(tenantId, usuarioId);
      ultimaConsulta = { usuarioId, em: Date.now(), dados };
      if (montado.current) setEntregas(dados);
    } catch {
      /* sem bloqueio: o alerta tenta de novo no próximo ciclo */
    }
  }, [habilitado, tenantId, usuarioId]);

  useEffect(() => {
    montado.current = true;
    if (!habilitado || !tenantId || !usuarioId) return;
    prepararAudio();
    void consultar();
    const iv = setInterval(() => { void consultar(true); }, ALERTA_ENTREGA_INTERVALO_MS);
    const onVisivel = () => { if (document.visibilityState === "visible") void consultar(true); };
    const onOnline = () => { void consultar(true); };
    document.addEventListener("visibilitychange", onVisivel);
    window.addEventListener("online", onOnline);
    window.addEventListener(EVENTO_ATUALIZAR, onOnline);
    const canal = supabase
      .channel(`entrega-alerta-${usuarioId}-${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "entrega", filter: `usuario_id=eq.${usuarioId}` },
        () => { void consultar(true); })
      .subscribe();
    return () => {
      montado.current = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisivel);
      window.removeEventListener("online", onOnline);
      window.removeEventListener(EVENTO_ATUALIZAR, onOnline);
      void supabase.removeChannel(canal);
    };
  }, [habilitado, tenantId, usuarioId, consultar]);

  const pendentes = habilitado ? entregas.filter((e) => e.status === "AGUARDANDO_ACEITE") : [];
  const temPendente = pendentes.length > 0;

  // Toca na hora (respeitando o intervalo entre telas) e repete enquanto houver pendente.
  useEffect(() => {
    if (!temPendente) return;
    const restante = ALERTA_ENTREGA_INTERVALO_MS - (Date.now() - ultimoAlertaEm);
    let iv: ReturnType<typeof setInterval> | undefined;
    const t = setTimeout(() => {
      alertar();
      iv = setInterval(alertar, ALERTA_ENTREGA_INTERVALO_MS);
    }, Math.max(0, restante));
    return () => { clearTimeout(t); if (iv) clearInterval(iv); };
  }, [temPendente]);

  return { pendentes, atualizar: () => consultar(true) };
}
