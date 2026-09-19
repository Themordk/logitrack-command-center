import { Flame, Trophy } from "lucide-react";

interface Props {
  diasConsecutivos: number;
  melhorStreak: number;
}

export function MetasStreakBadge({ diasConsecutivos, melhorStreak }: Props) {
  const isRecord = diasConsecutivos >= melhorStreak && melhorStreak > 0;

  return (
    <div className="flex min-h-11 items-center gap-2 rounded-xl border border-orange-500/25 bg-orange-500/10 px-3 py-2">
      <Flame size={19} className="text-orange-400 motion-safe:animate-pulse" />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-orange-300">
          {diasConsecutivos} dias
          {isRecord && <Trophy size={13} aria-label="Recorde pessoal" />}
        </div>
        <p className="truncate text-[10px] text-orange-200/70">
          {isRecord ? "Seu melhor resultado" : `Melhor sequência: ${melhorStreak} dias`}
        </p>
      </div>
    </div>
  );
}