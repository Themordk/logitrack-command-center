import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { SectionCard, EmptyState, chartAxis, chartGrid, chartTooltip, fmtNumero, toneColor, toneDot, toneText } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface TipoEnderecoOcupacao {
  tipo_endereco: string;
  tipo_nome: string;
  total: number;
  ocupados: number;
  livres: number;
  bloqueados: number;
  taxa_ocupacao: number;
}

interface Props {
  data: TipoEnderecoOcupacao[];
  loading?: boolean;
  className?: string;
}

/** Situação dos endereços: ocupado é o normal (neutro), livre é capacidade, bloqueado impede a operação. */
const SERIES = [
  { chave: "ocupados", rotulo: "Ocupados", tom: "neutral" },
  { chave: "livres", rotulo: "Livres", tom: "success" },
  { chave: "bloqueados", rotulo: "Bloqueados", tom: "danger" },
] as const;

/** Mesmos limites da Ocupação de endereços: acima de 85% é crítico, a partir de 70% pede atenção. */
const tomTaxa = (taxa: number) => (taxa > 85 ? "danger" : taxa >= 70 ? "warning" : null);

export function OcupacaoTipoEnderecoChart({ data, loading, className }: Props) {
  const safeData = Array.isArray(data) ? data : [];
  const temDados = safeData.length > 0;

  const chartData = safeData.map((t) => ({
    nome: t.tipo_nome,
    ocupados: t.ocupados,
    livres: t.livres,
    bloqueados: t.bloqueados,
  }));

  return (
    <SectionCard
      className={className}
      title="Ocupação por tipo de endereço"
      description="Endereços ocupados, livres e bloqueados em cada tipo"
    >
      {loading && !temDados ? (
        <Skeleton className="h-[220px] w-full" />
      ) : !temDados ? (
        <EmptyState
          className="h-[220px] py-0"
          title="Nenhum endereço configurado"
          description="Cadastre setores e endereços no armazém para acompanhar a ocupação."
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            {SERIES.map((s) => (
              <span key={s.chave} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                <span aria-hidden="true" className={cn("h-2 w-2 rounded-sm", toneDot[s.tom])} />
                {s.rotulo}
              </span>
            ))}
          </div>

          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={8}>
                <CartesianGrid {...chartGrid} vertical horizontal={false} />
                <XAxis type="number" {...chartAxis} allowDecimals={false} tickFormatter={(v: number) => fmtNumero(v)} />
                <YAxis type="category" dataKey="nome" width={96} {...chartAxis} />
                <Tooltip
                  {...chartTooltip}
                  formatter={(value: number, name: string) => [
                    `${fmtNumero(value)} endereços`,
                    SERIES.find((s) => s.chave === name)?.rotulo ?? name,
                  ]}
                />
                {SERIES.map((s, i) => (
                  <Bar
                    key={s.chave}
                    dataKey={s.chave}
                    stackId="situacao"
                    fill={toneColor[s.tom]}
                    fillOpacity={s.tom === "neutral" ? 0.55 : 0.9}
                    radius={i === SERIES.length - 1 ? [0, 3, 3, 0] : [0, 0, 0, 0]}
                    maxBarSize={22}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-3 sm:grid-cols-3">
            {safeData.map((t) => {
              const tom = tomTaxa(t.taxa_ocupacao);
              return (
                <div key={t.tipo_endereco} className="flex items-baseline justify-between gap-2">
                  <dt className="truncate text-body-sm text-muted-foreground">{t.tipo_nome}</dt>
                  <dd className={cn("text-body-sm font-medium tabular-nums", tom ? toneText[tom] : "text-foreground")}>
                    {fmtNumero(t.taxa_ocupacao, Number.isInteger(t.taxa_ocupacao) ? 0 : 1)}%
                  </dd>
                </div>
              );
            })}
          </dl>
        </>
      )}
    </SectionCard>
  );
}
