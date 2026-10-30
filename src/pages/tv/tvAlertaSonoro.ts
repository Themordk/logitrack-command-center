// Alertas sonoros do painel de TV.
// Cinco modelos, do mais leve ao mais chamativo. Todos são sinais curtos e
// tonais (sem sirene, sem tom contínuo, sem "whoop"), para não serem confundidos
// com alarme de incêndio/evacuação. A intensidade sobe por volume, timbre,
// número de notas e repetições.

let ctx: AudioContext | null = null;
let saida: AudioNode | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  return ctx;
}

/** Compressor na saída: aumenta o volume percebido sem distorcer quando várias notas somam. */
function getSaida(c: AudioContext): AudioNode {
  if (!saida) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 6;
    comp.attack.value = 0.003;
    comp.release.value = 0.15;
    const ganho = c.createGain();
    ganho.gain.value = 1.4;
    comp.connect(ganho);
    ganho.connect(c.destination);
    saida = comp;
  }
  return saida;
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

interface Nota {
  freq: number;
  /** início relativo em segundos */
  t: number;
  dur: number;
}

interface Timbre {
  onda: OscillatorType;
  volume: number;
  /** harmônico extra (oitava acima) para soar mais brilhante */
  brilho?: number;
  /** filtro passa-baixa para suavizar ondas quadradas/dente-de-serra */
  corte?: number;
}

function tocarNotas(c: AudioContext, notas: Nota[], timbre: Timbre) {
  const base = c.currentTime + 0.03;
  const destino = getSaida(c);
  for (const n of notas) {
    const inicio = base + n.t;
    const fim = inicio + n.dur;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, inicio);
    env.gain.exponentialRampToValueAtTime(timbre.volume, inicio + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, fim);

    const entrada: AudioNode = env;
    if (timbre.corte) {
      const filtro = c.createBiquadFilter();
      filtro.type = "lowpass";
      filtro.frequency.value = timbre.corte;
      env.connect(filtro);
      filtro.connect(destino);
    } else {
      env.connect(destino);
    }

    const osc = c.createOscillator();
    osc.type = timbre.onda;
    osc.frequency.value = n.freq;
    osc.connect(entrada);
    osc.start(inicio);
    osc.stop(fim + 0.05);

    if (timbre.brilho) {
      const g = c.createGain();
      g.gain.value = timbre.brilho;
      const harm = c.createOscillator();
      harm.type = "sine";
      harm.frequency.value = n.freq * 2;
      harm.connect(g);
      g.connect(entrada);
      harm.start(inicio);
      harm.stop(fim + 0.05);
    }
  }
}

export type NivelSom = 1 | 2 | 3 | 4 | 5;

export interface ModeloSom {
  nivel: NivelSom;
  nome: string;
  descricao: string;
  /** duração aproximada em segundos */
  duracao: number;
  notas: Nota[];
  timbre: Timbre;
}

const repetir = (padrao: Nota[], vezes: number, intervalo: number): Nota[] =>
  Array.from({ length: vezes }, (_, i) => padrao.map((n) => ({ ...n, t: n.t + i * intervalo }))).flat();

// Notas: A5 880 Hz, E6 1319 Hz, C6 1047 Hz, G6 1568 Hz, B5 988 Hz.
export const MODELOS_SOM: readonly ModeloSom[] = [
  {
    nivel: 1,
    nome: "Suave",
    descricao: "1 toque leve",
    duracao: 0.6,
    notas: [{ freq: 880, t: 0, dur: 0.6 }],
    timbre: { onda: "sine", volume: 0.35 },
  },
  {
    nivel: 2,
    nome: "Carrilhão",
    descricao: "ding-dong (som original)",
    duracao: 1.1,
    notas: [
      { freq: 880, t: 0, dur: 0.45 },
      { freq: 1320, t: 0.38, dur: 0.65 },
    ],
    timbre: { onda: "sine", volume: 0.6 },
  },
  {
    nivel: 3,
    nome: "Aviso",
    descricao: "3 notas subindo, mais brilhante",
    duracao: 1.2,
    notas: [
      { freq: 1047, t: 0, dur: 0.35 },
      { freq: 1319, t: 0.2, dur: 0.35 },
      { freq: 1568, t: 0.4, dur: 0.8 },
    ],
    timbre: { onda: "triangle", volume: 0.8, brilho: 0.35 },
  },
  {
    nivel: 4,
    nome: "Chamada",
    descricao: "3 notas, repetidas 2 vezes",
    duracao: 2.4,
    notas: repetir(
      [
        { freq: 1047, t: 0, dur: 0.3 },
        { freq: 1319, t: 0.16, dur: 0.3 },
        { freq: 1568, t: 0.32, dur: 0.55 },
      ],
      2,
      1.1,
    ),
    timbre: { onda: "square", volume: 0.55, brilho: 0.25, corte: 3500 },
  },
  {
    nivel: 5,
    nome: "Urgente",
    descricao: "ding-dong forte, repetido 3 vezes",
    duracao: 3.2,
    notas: repetir(
      [
        { freq: 988, t: 0, dur: 0.32 },
        { freq: 1319, t: 0.26, dur: 0.5 },
      ],
      3,
      1.0,
    ),
    timbre: { onda: "sawtooth", volume: 0.7, brilho: 0.4, corte: 4500 },
  },
];

export const NIVEL_SOM_PADRAO: NivelSom = 3;

export function modeloSom(nivel: number): ModeloSom {
  return MODELOS_SOM.find((m) => m.nivel === nivel) ?? MODELOS_SOM[NIVEL_SOM_PADRAO - 1];
}

export function nivelSomValido(valor: unknown): NivelSom | null {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? (n as NivelSom) : null;
}

/** Toca o alerta do nível escolhido. Retorna false se o áudio ainda estiver bloqueado. */
export function tocarAlerta(nivel: number = NIVEL_SOM_PADRAO): boolean {
  const c = getCtx();
  if (!c || c.state !== "running") return false;
  const m = modeloSom(nivel);
  tocarNotas(c, m.notas, m.timbre);
  return true;
}

/** Compatibilidade: carrilhão original (nível 2). */
export function tocarCarrilhao(): boolean {
  return tocarAlerta(2);
}
