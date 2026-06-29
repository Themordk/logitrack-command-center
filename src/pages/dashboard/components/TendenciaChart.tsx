import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { TrendingUp } from "lucide-react";

interface Item {
  hora: number;
  tarefas: number;
  unidades: number;
}

function preencherHoras(data: Item[]): { hora: string; tarefas: number; unidades: number }[] {
  const arr = Array.isArray(data) ? data : [];
  const map = new Map(arr.map((d) => [d.hora, d]));
  return Array.from({ length: 24 }, (_, i) => ({
    hora: `${String(i).padStart(2, "0")}h`,
    tarefas: map.get(i)?.tarefas || 0,
    unidades: map.get(i)?.unidades || 0,
  }));
}

export function TendenciaChart({ data, loading }: { data: Item[]; loading?: boolean }) {
  const safe: Item[] = Array.isArray(data) ? data : [];
  const chartData = preencherHoras(safe);
  const temDados = safe.length > 0;
  const totalTarefas = safe.reduce((s, d) => s + d.tarefas, 0);

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp size={14} className="text-primary" />
          Ritmo Operacional por Hora
        </h3>
        {temDados && (
          <span className="text-xs text-muted-foreground">
            {totalTarefas} tarefas no período
          </span>
        )}
      </div>
      {loading ? (
        <div className="h-[200px] rounded-lg bg-secondary/30 animate-pulse" />
      ) : !temDados ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          Sem atividade registrada no período selecionado.
        </div>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 4 }}>
              <defs>
                <linearGradient id="gradTarefas" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(217 91% 60%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(217 91% 60%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
                vertical={false}
              />
              <XAxis
                dataKey="hora"
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                interval={2}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(label) => `Hora: ${label}`}
                formatter={(value: number, name: string) => {
                  if (name === "tarefas") return [`${value} tarefas`, "Tarefas"];
                  return [value, name];
                }}
              />
              <Area
                type="monotone"
                dataKey="tarefas"
                stroke="hsl(217 91% 60%)"
                strokeWidth={2}
                fill="url(#gradTarefas)"
                dot={false}
                activeDot={{ r: 4, fill: "hsl(217 91% 60%)", stroke: "hsl(var(--card))", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
