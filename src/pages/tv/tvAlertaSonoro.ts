// Carrilhão de aviso ("ding-dong" ascendente) para o painel de TV.
// Tons de 880 Hz e 1.320 Hz (faixa 800–1.600 Hz, que se destaca do ruído grave de
// empilhadeiras sem ser estridente), envelope suave e ~1 s no total.
// Não usa sirene, tom contínuo nem bipes rápidos para não ser confundido com alarme.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** true quando o navegador já liberou o áudio (após interação ou política de kiosk). */
export function audioLiberado(): boolean {
  return getCtx()?.state === "running";
}

/** Precisa ser chamado dentro de um gesto do usuário (clique/tecla) na primeira vez. */
export async function liberarAudio(): Promise<boolean> {
  const c = getCtx();
  if (!c) return false;
  try {
    if (c.state !== "running") await c.resume();
  } catch {
    return false;
  }
  return c.state === "running";
}

function nota(c: AudioContext, freq: number, inicio: number, duracao: number, volume: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, inicio);
  gain.gain.exponentialRampToValueAtTime(volume, inicio + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(inicio);
  osc.stop(inicio + duracao + 0.05);
}

/** Toca o carrilhão. Retorna false se o áudio ainda estiver bloqueado. */
export function tocarCarrilhao(volume = 0.6): boolean {
  const c = getCtx();
  if (!c || c.state !== "running") return false;
  const t = c.currentTime + 0.02;
  nota(c, 880, t, 0.45, volume);
  nota(c, 1320, t + 0.38, 0.65, volume);
  return true;
}
