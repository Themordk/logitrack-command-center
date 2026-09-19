interface Props {
  score: number;
  maxScore: number;
  faixa: {
    ring: string;
    text: string;
    label: string;
  };
}

export function MetasScoreRing({ score, maxScore, faixa }: Props) {
  const size = 96;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score / Math.max(maxScore, 1), 0), 1);
  const offset = circumference * (1 - pct);

  return (
    <div className="relative h-24 w-24 shrink-0" aria-label={`Score ${score.toFixed(0)}, faixa ${faixa.label}`}>
      <svg className="h-24 w-24 -rotate-90" viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(222 35% 22%)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={faixa.ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 motion-reduce:transition-none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums text-white">{score.toFixed(0)}</span>
        <span className="text-[9px] font-semibold uppercase text-[hsl(213,31%,55%)]">Score</span>
      </div>
    </div>
  );
}