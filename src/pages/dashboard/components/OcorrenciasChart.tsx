import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, EmptyState, StatusPill, chartAxis, chartColor, chartGrid, chartTooltip, fmtNumero } from "@/components/ds";
import { LABELS_TIPO_OCORRENCIA, OcorrenciasResult } from "../dashboard.service";

interface Props {
  data: OcorrenciasResult | null;
  loading?: boolean;
  onNavigate?: (path: string) => void;
  className?: string;
}

const plural = (n: number, um: string, varios: string) => `${fmtNumero(n)} ${n === 1 ? um : varios}`;

/** Os rótulos do service vêm em Title Case ("Produto Incorreto"); a interface usa caixa de frase. */
const caixaDeFrase = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);

/** Ocorrências do período por tipo, com o resumo de tratamento acima do gráfico. */
export function OcorrenciasChart({ data, loading, onNavigate, className }: Props) {
  const resumo = data?.resumo;
  const porTipoRaw = Array.isArray(data?.por_tipo) ? data!.por_tipo : [];
  const porTipo = porTipoRaw
    .map((item) => ({
      nome: caixaDeFrase(LABELS_TIPO_OCORRENCIA[item.tipo] || item.tipo),
      quantidade: item.quantidade,
      pendentes: item.pendentes,
    }))
    .sort((a, b) => b.quantidade - a.quantidade);
  const temDados = !!resumo && resumo.total > 0;

  return (
    <SectionCard
      className={className}
      title="Ocorrências operacionais"
      description={
        temDados && resumo
          ? `${plural(resumo.total, "ocorrência", "ocorrências")} · ${plural(resumo.pendentes, "pendente", "pendentes")} · ${fmtNumero(resumo.em_investigacao)} em investigação · ${plural(resumo.resolvidas, "resolvida", "resolvidas")}`
          : "Faltas, sobras, avarias e divergências registradas na operação"
      }
      actions={
        <>
          {resumo && resumo.criticas > 0 && (
            <StatusPill tone="danger">{plural(resumo.criticas, "crítica", "críticas")}</StatusPill>
          )}
          {onNavigate && (
            <Button variant="ghost" size="sm" onClick={() => onNavigate("/atividades/ocorrencias")}>
              Ver ocorrências
            </Button>
          )}
        </>
      }
    >
      {loading && !temDados ? (
        <Skeleton className="h-[240px] w-full" />
      ) : !temDados ? (
        <EmptyState
          className="h-[240px] py-0"
          title="Nenhuma ocorrência no período"
          description="Faltas, sobras e avarias registradas no coletor aparecem aqui."
        />
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porTipo} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={6}>
              <CartesianGrid {...chartGrid} vertical horizontal={false} />
              <XAxis type="number" {...chartAxis} allowDecimals={false} tickFormatter={(v: number) => fmtNumero(v)} />
              <YAxis dataKey="nome" type="category" width={150} {...chartAxis} />
              <Tooltip
                {...chartTooltip}
                formatter={(value: number, _name: string, props: { payload?: { pendentes?: number } }) => {
                  const pendentes = props?.payload?.pendentes ?? 0;
                  return [`${plural(value, "ocorrência", "ocorrências")} · ${plural(pendentes, "pendente", "pendentes")}`, "Total"];
                }}
              />
              <Bar dataKey="quantidade" fill={chartColor(1)} radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}
