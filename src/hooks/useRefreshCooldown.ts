import { useEffect, useRef, useState, useCallback } from "react";

export type RefreshState = "idle" | "loading" | "cooldown";

export function useRefreshCooldown(loadFn: () => void | Promise<void>, cooldownMs = 3000) {
  const [state, setState] = useState<RefreshState>("idle");
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const refresh = useCallback(async () => {
    if (state !== "idle") return;
    setState("loading");
    try {
      await loadFn();
    } finally {
      const totalSec = Math.ceil(cooldownMs / 1000);
      setSecondsLeft(totalSec);
      setState("cooldown");
      clearTimer();
      intervalRef.current = window.setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearTimer();
            setState("idle");
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    }
  }, [state, loadFn, cooldownMs]);

  return { refresh, state, secondsLeft };
}
