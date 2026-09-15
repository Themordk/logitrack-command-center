import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Layers } from "lucide-react";
import { LABELS_CATEGORIA_TAREFA, CORES_CATEGORIA_TAREFA, formatarTempoEspera } from "../dashboard.service";

interface BreakdownItem {
  categoria: string;
  descricao: string;
  cor: string;
  concluidas: number;
  tempo_medio_seg: number;
}

interface Props {
  data: BreakdownItem[];
  loading?: boolean;
}

export function ComposicaoTipoChart({ data, loading }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  const totalTarefas = safeData.reduce((s, d) => s + (d.concluidas || 0), 0);

  const chartData = safeData
    .filter((d) => d.concluidas > 0)
    .sort((a, b) => b.concluidas - a.concluidas)
    .map((d) => ({
      nome: LABELS_CATEGORIA_TAREFA[d.categoria] || d.descricao || d.categoria,
      categoria: d.categoria,
      concluidas: d.concluidas,
      tempo_medio: d.tempo_medio_seg,
      cor: d.cor || CORES_CATEGORIA_TAREFA[d.categoria] || CORES_CATEGORIA_TAREFA.OUTROS,
    }));

  const temDados = chartData.length > 0;

  return (
    <div className="card-surface p-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Layers size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Composição de Tarefas</h3>
        </div>
        {temDados && <span className="text-xs text-muted-foreground">{totalTarefas} tarefas concluídas</span>}
      </div>

      {loading ? (
        <div className="h-[220px] rounded-lg bg-secondary/30 animate-pulse" />
      ) : !temDados ? (
        <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground text-center px-4">
          Sem tarefas concluídas no período.
        </div>
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 8 }}>
              <XAxis type="number" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="nome" width={100} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: "hsl(var(--secondary) / 0.3)" }}
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                  color: "hsl(var(--popover-foreground))",
                }}
                formatter={(value: number, _name: string, props: any) => [
                  `${value} tarefas (Tempo médio: ${formatarTempoEspera(props?.payload?.tempo_medio ?? 0)})`,
                  "Concluídas",
                ]}
                labelFormatter={(label: string) => label}
              />
              <Bar dataKey="concluidas" radius={[0, 4, 4, 0]}>
                {chartData.map((item, i) => (
                  <Cell key={i} fill={item.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
