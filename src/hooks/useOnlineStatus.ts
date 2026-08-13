import { useCallback, useEffect, useRef, useState } from "react";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "https://dcpmykhxysvxnpgmlyli.supabase.co";
const HEALTH_URL = `${SUPABASE_URL.replace(/\/$/, "")}/auth/v1/health`;
const PING_TIMEOUT_MS = 3000;
const INTERVAL_ONLINE_MS = 15000;
const INTERVAL_OFFLINE_MS = 5000;
/** Pings consecutivos com sucesso necessários para declarar "voltou online". */
const RECOVERY_THRESHOLD = 2;

async function pingNetwork(): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  try {
    // HEAD + no-cors: não exige apikey nem CORS; resposta opaca já comprova
    // que a rede alcançou o servidor.
    const response = await fetch(`${HEALTH_URL}?t=${Date.now()}`, {
      method: "HEAD",
      mode: "no-cors",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.type === "opaque" || response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface OnlineStatus {
  isOnline: boolean;
  lastCheckAt: Date | null;
  checkNow: () => Promise<boolean>;
}

/**
 * Status real de conexão: combina navigator.onLine com um ping leve periódico,
 * para detectar Wi-Fi conectado porém sem internet. Não dispara sincronização.
 */
export function useOnlineStatus(): OnlineStatus {
  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);
  const [lastCheckAt, setLastCheckAt] = useState<Date | null>(null);
  const successStreak = useRef(0);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const runCheck = useCallback(async () => {
    const ok = await pingNetwork();
    setLastCheckAt(new Date());
    if (ok) {
      successStreak.current += 1;
      if (isOnlineRef.current || successStreak.current >= RECOVERY_THRESHOLD) {
        setIsOnline(true);
      }
    } else {
      successStreak.current = 0;
      setIsOnline(false);
    }
    return ok;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const loop = async () => {
      if (cancelled) return;
      await runCheck();
      if (cancelled) return;
      timer = window.setTimeout(loop, isOnlineRef.current ? INTERVAL_ONLINE_MS : INTERVAL_OFFLINE_MS);
    };

    const onOffline = () => {
      successStreak.current = 0;
      setIsOnline(false);
    };
    const onOnline = () => {
      successStreak.current = 0;
      void runCheck();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void loop();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [runCheck]);

  const checkNow = useCallback(async () => {
    // Verificação manual: sucesso vale como recuperação imediata.
    const ok = await pingNetwork();
    setLastCheckAt(new Date());
    successStreak.current = ok ? RECOVERY_THRESHOLD : 0;
    setIsOnline(ok);
    return ok;
  }, []);

  return { isOnline, lastCheckAt, checkNow };
}
