import { ClipboardCheck, Clock3, Trophy, Zap } from "lucide-react";

const ICONS = {
  tasks: ClipboardCheck,
  clock: Clock3,
  speed: Zap,
  trophy: Trophy,
};

const ICON_COLORS = {
  tasks: "text-blue-400",
  clock: "text-cyan-400",
  speed: "text-green-400",
  trophy: "text-amber-400",
};

interface Props {
  label: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof ICONS;
}

export function MetasKpiCard({ label, value, subtitle, icon }: Props) {
  const Icon = ICONS[icon];

  return (
    <div className="min-h-[104px] rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={16} className={ICON_COLORS[icon]} />
        <span className="text-[10px] font-semibold uppercase text-[hsl(213,31%,55%)]">{label}</span>
      </div>
      <p className="text-xl font-bold tabular-nums text-white">{value}</p>
      {subtitle && <p className="mt-1 text-[10px] text-[hsl(213,31%,55%)]">{subtitle}</p>}
    </div>
  );
}