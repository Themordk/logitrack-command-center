import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { SectionCard, EmptyState, chartAxis, chartColor, chartGrid, chartTooltip, fmtNumero } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { LABELS_CATEGORIA_TAREFA, formatarTempoEspera } from "../dashboard.service";

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
  className?: string;
}

/** Tarefas concluídas por tipo. Uma série = uma cor (o nome do tipo está no eixo). */
export function ComposicaoTipoChart({ data, loading, className }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  const totalTarefas = safeData.reduce((s, d) => s + (d.concluidas || 0), 0);

  const chartData = safeData
    .filter((d) => d.concluidas > 0)
    .sort((a, b) => b.concluidas - a.concluidas)
    .map((d) => ({
      nome: LABELS_CATEGORIA_TAREFA[d.categoria] || d.descricao || d.categoria,
      concluidas: d.concluidas,
      tempo_medio: d.tempo_medio_seg,
    }));

  const temDados = chartData.length > 0;

  return (
    <SectionCard
      className={className}
      title="Tarefas concluídas por tipo"
      description={temDados ? `${fmtNumero(totalTarefas)} tarefas no período` : "Quantidade e tempo médio por tipo de tarefa"}
    >
      {loading && !temDados ? (
        <Skeleton className="h-[220px] w-full" />
      ) : !temDados ? (
        <EmptyState
          className="h-[220px] py-0"
          title="Nenhuma tarefa concluída no período"
          description="O gráfico aparece quando houver tarefas concluídas nos filtros escolhidos."
        />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={6}>
              <CartesianGrid {...chartGrid} vertical horizontal={false} />
              <XAxis type="number" {...chartAxis} allowDecimals={false} tickFormatter={(v: number) => fmtNumero(v)} />
              <YAxis type="category" dataKey="nome" width={110} {...chartAxis} />
              <Tooltip
                {...chartTooltip}
                formatter={(value: number, _name: string, props: { payload?: { tempo_medio?: number } }) => [
                  `${fmtNumero(value)} tarefas · tempo médio ${formatarTempoEspera(props?.payload?.tempo_medio ?? 0)}`,
                  "Concluídas",
                ]}
              />
              <Bar dataKey="concluidas" fill={chartColor(1)} radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
