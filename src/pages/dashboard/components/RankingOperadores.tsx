import { Trophy, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";

interface Operador { usuario_id: string; nome: string; tarefas: number; produtividade: number; tempo_medio_seg?: number }

function initials(nome: string) {
  const parts = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function RankingOperadores({ data, loading }: { data: Operador[]; loading?: boolean }) {
  const podio = [
    "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    "bg-slate-300/10 text-slate-300 border-slate-300/30",
    "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ];
  const podioIcon = [Trophy, Medal, Award];
  const max = Math.max(1, ...data.map((d) => d.tarefas));

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Top Operadores</h3>
        <span className="text-xs text-muted-foreground">{data.length} operadores</span>
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary/30 animate-pulse" />)}</div>
      ) : data.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">Sem dados de produtividade no período.</div>
      ) : (
        <div className="space-y-1.5">
          {data.map((op, idx) => {
            const isPodio = idx < 3;
            const Icon = isPodio ? podioIcon[idx] : null;
            const pct = Math.max(6, Math.round((op.tarefas / max) * 100));
            return (
              <div
                key={op.id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                  isPodio ? podio[idx] : "bg-secondary/30 border-transparent text-foreground hover:bg-secondary/50",
                )}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary text-[11px] font-bold shrink-0">
                  {Icon ? <Icon size={14} /> : initials(op.nome)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{op.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{op.produtividade} tarefas/h</p>
                </div>
                <div className="flex items-center gap-3 w-[200px] shrink-0">
                  <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap ml-auto">
                    {op.tarefas} tarefas
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
