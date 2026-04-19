import { Trophy, Medal, Award, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface Operador { id: string; nome: string; tarefas: number; produtividade: number }

export function RankingOperadores({ data, loading }: { data: Operador[]; loading?: boolean }) {
  const podio = ["bg-yellow-500/15 text-yellow-400 border-yellow-500/30", "bg-slate-300/10 text-slate-300 border-slate-300/30", "bg-orange-500/15 text-orange-400 border-orange-500/30"];
  const podioIcon = [Trophy, Medal, Award];

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
            const Icon = isPodio ? podioIcon[idx] : User;
            return (
              <div key={op.id} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors", isPodio ? podio[idx] : "bg-secondary/30 border-transparent text-foreground hover:bg-secondary/50")}>
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-background/40 shrink-0">
                  {isPodio ? <Icon size={14} /> : <span className="text-xs font-semibold text-muted-foreground">{idx + 1}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{op.nome}</p>
                  <p className="text-[11px] text-muted-foreground">{op.produtividade} tarefas/h</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold tabular-nums">{op.tarefas}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">tarefas</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
