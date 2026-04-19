import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { AlertTriangle } from "lucide-react";

interface Item { descricao: string; qtd: number }

export function OcorrenciasChart({ data, loading }: { data: Item[]; loading?: boolean }) {
  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle size={14} className="text-red-400" />
          Ocorrências Operacionais
        </h3>
        <span className="text-xs text-muted-foreground">{data.reduce((s, d) => s + d.qtd, 0)} no período</span>
      </div>
      {loading ? (
        <div className="h-[280px] rounded-lg bg-secondary/30 animate-pulse" />
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">Nenhuma ocorrência registrada no período. ✓</div>
      ) : (
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis dataKey="descricao" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={140} tick={{ fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip cursor={{ fill: "hsl(var(--secondary) / 0.3)" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => <Cell key={i} fill="hsl(0 72% 55% / 0.75)" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
