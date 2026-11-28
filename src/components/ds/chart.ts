/**
 * Design system · tema dos gráficos (Recharts).
 *
 * Use estas props em todo gráfico para que eixos, grade e tooltip sejam iguais
 * em todas as telas. Cores de série: `chartColor(1..6)`, nessa ordem; status
 * (livre/ocupado/bloqueado…) usa `toneColor`.
 */
import type { Tone } from "./tones";

export const chartColor = (n: 1 | 2 | 3 | 4 | 5 | 6) => `hsl(var(--chart-${n}))`;

export const toneColor: Record<Tone, string> = {
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--danger))",
  info: "hsl(var(--info))",
  neutral: "hsl(var(--neutral))",
};

/** Eixos: 12px, cor secundária, sem linha de eixo nem tracinhos. */
export const chartAxis = {
  tick: { fontSize: 12, fill: "hsl(var(--muted-foreground))" },
  axisLine: false,
  tickLine: false,
} as const;

/** Grade horizontal discreta. */
export const chartGrid = {
  stroke: "hsl(var(--border))",
  vertical: false,
} as const;

/** Tooltip com a aparência de popover do produto. */
export const chartTooltip = {
  cursor: { fill: "hsl(var(--muted) / 0.5)" },
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 8,
    boxShadow: "var(--shadow-overlay)",
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
    padding: "8px 10px",
  },
  itemStyle: { color: "hsl(var(--popover-foreground))", padding: 0 },
  labelStyle: { color: "hsl(var(--muted-foreground))", marginBottom: 4 },
} as const;

/** Número pt-BR para eixos e tooltips. */
export const fmtNumero = (v: number | null | undefined, casas = 0) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
