import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export type KPISeverity = "good" | "warn" | "bad" | "neutral";

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  severity?: KPISeverity;
  trend?: { dir: "up" | "down" | "flat"; pct: number };
  trendGoodWhen?: "up" | "down";
  onClick?: () => void;
  tooltip?: string;
}

const severityMap: Record<KPISeverity, { iconBg: string; bar: string; valueColor: string }> = {
  good: { iconBg: "bg-green-500/15 text-green-400", bar: "bg-green-500", valueColor: "text-green-400" },
  warn: { iconBg: "bg-yellow-500/15 text-yellow-400", bar: "bg-yellow-500", valueColor: "text-yellow-400" },
  bad: { iconBg: "bg-red-500/15 text-red-400", bar: "bg-red-500", valueColor: "text-red-400" },
  neutral: { iconBg: "bg-blue-500/15 text-blue-400", bar: "bg-blue-500", valueColor: "text-foreground" },
};

export function KPICardPro({ title, value, subtitle, icon, severity = "neutral", trend, trendGoodWhen = "up", onClick, tooltip }: Props) {
  const sev = severityMap[severity];
  const goodTrend =
    trend?.dir === "flat" ? null :
    (trendGoodWhen === "up" ? trend?.dir === "up" : trend?.dir === "down");
  const trendColor = trend?.dir === "flat" ? "text-muted-foreground" : goodTrend ? "text-green-400" : "text-red-400";
  const TrendIcon = trend?.dir === "up" ? TrendingUp : trend?.dir === "down" ? TrendingDown : Minus;

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      title={tooltip}
      className={cn(
        "card-surface p-5 text-left w-full transition-all",
        onClick && "hover:border-primary/40 hover:scale-[1.01] cursor-pointer",
        !onClick && "cursor-default"
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("flex items-center justify-center w-11 h-11 rounded-xl shrink-0", sev.iconBg)}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
            {trend && (
              <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", trendColor)}>
                <TrendIcon size={12} />
                {trend.pct > 0 ? `${trend.pct}%` : ""}
              </span>
            )}
          </div>
          <p className={cn("text-2xl font-bold mt-0.5 leading-none", sev.valueColor)}>{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1.5 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="mt-3 h-1 rounded-full bg-secondary/40 overflow-hidden">
        <div className={cn("h-full transition-all", sev.bar)} style={{ width: severity === "neutral" ? "60%" : "100%", opacity: severity === "neutral" ? 0.4 : 0.8 }} />
      </div>
    </button>
  );
}
