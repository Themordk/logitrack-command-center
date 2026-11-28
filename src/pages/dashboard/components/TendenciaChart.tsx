import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { SectionCard, EmptyState, chartAxis, chartColor, chartGrid, chartTooltip, fmtNumero } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";

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

/** Tarefas concluídas em cada hora do dia: mostra picos e vales do turno. */
export function TendenciaChart({ data, loading, className }: { data: Item[]; loading?: boolean; className?: string }) {
  const safe: Item[] = Array.isArray(data) ? data : [];
  const chartData = preencherHoras(safe);
  const temDados = safe.length > 0;
  const totalTarefas = safe.reduce((s, d) => s + d.tarefas, 0);

  return (
    <SectionCard
      className={className}
      title="Ritmo por hora"
      description={temDados ? `${fmtNumero(totalTarefas)} tarefas concluídas no período` : "Tarefas concluídas em cada hora do dia"}
    >
      {loading && !temDados ? (
        <Skeleton className="h-[220px] w-full" />
      ) : !temDados ? (
        <EmptyState
          className="h-[220px] py-0"
          title="Nenhuma atividade registrada no período"
          description="O ritmo aparece quando houver tarefas concluídas nos filtros escolhidos."
        />
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap={3}>
              <CartesianGrid {...chartGrid} />
              <XAxis dataKey="hora" {...chartAxis} interval={2} />
              <YAxis {...chartAxis} allowDecimals={false} tickFormatter={(v: number) => fmtNumero(v)} />
              <Tooltip
                {...chartTooltip}
                labelFormatter={(label: string) => `Das ${label.replace("h", "")}h às ${String(Number(label.replace("h", "")) + 1).padStart(2, "0")}h`}
                formatter={(value: number) => [`${fmtNumero(value)} tarefas`, "Concluídas"]}
              />
              <Bar dataKey="tarefas" fill={chartColor(1)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
