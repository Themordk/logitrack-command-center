import { useCallback, useRef } from "react";

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playBeep(frequency: number, duration: number) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = frequency;
    oscillator.type = "square";
    gain.gain.value = 0.15;
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch {
    // AudioContext not available
  }
}

export function useFeedback() {
  const lastFeedback = useRef(0);

  const success = useCallback(() => {
    const now = Date.now();
    if (now - lastFeedback.current < 200) return;
    lastFeedback.current = now;

    // Vibrate
    if (navigator.vibrate) navigator.vibrate(100);
    // Beep: high pitch, short
    playBeep(800, 120);
  }, []);

  const error = useCallback(() => {
    const now = Date.now();
    if (now - lastFeedback.current < 200) return;
    lastFeedback.current = now;

    // Vibrate: pattern
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    // Beep: low pitch, longer
    playBeep(200, 300);
  }, []);

  return { success, error };
}
