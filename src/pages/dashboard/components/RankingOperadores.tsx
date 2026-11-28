import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionCard, EmptyState } from "@/components/ds";
import { ScoreBadge } from "@/modules/lms/score/ScoreDetalhe";
import { estiloClassificacao, formatarScore, textoSemScore, type ClassificacaoScore, type SituacaoScore } from "@/modules/lms/score/score.service";

interface Operador {
  usuario_id: string;
  nome: string;
  tarefas: number;
  produtividade: number;
  tempo_medio_seg?: number;
  score_composto?: number;
  faixa_performance?: string;
  faixa_nome?: string;
  faixa_cor?: string;
  tendencia?: string;
  score_tendencia_5d?: number;
  eficiencia_pct?: number | null;
  performance_pct?: number | null;
  utilizacao_pct?: number | null;
  origem?: "REAL" | "ESTIMADO";
  amostra_suficiente?: boolean;
  score?: number | null;
  score_situacao?: SituacaoScore;
  score_metas_contadas?: number;
  score_metas_total?: number;
  classificacao?: ClassificacaoScore;
}

const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const TENDENCIA = {
  SUBINDO: { Icone: ArrowUpRight, cls: "text-success", rotulo: "Score subindo nos últimos 5 dias" },
  CAINDO: { Icone: ArrowDownRight, cls: "text-danger", rotulo: "Score caindo nos últimos 5 dias" },
  ESTAVEL: { Icone: ArrowRight, cls: "text-muted-foreground", rotulo: "Score estável nos últimos 5 dias" },
} as const;

/**
 * Ranking da equipe pelo score global das metas (ordem vem do banco).
 * A barra é proporcional ao score; a cor vem da classificação do LMS.
 */
export function RankingOperadores({
  data,
  loading,
  onNavigate,
  className,
}: {
  data: Operador[];
  loading?: boolean;
  onNavigate?: (path: string) => void;
  className?: string;
}) {
  const safeData: Operador[] = Array.isArray(data) ? data : [];
  const valor = (d: Operador) => d.score ?? 0;
  const max = Math.max(1, ...safeData.map(valor));

  return (
    <SectionCard
      flush
      className={className}
      title="Ranking da equipe"
      description="Ordenado pelo score global das metas de cada operador"
      actions={
        onNavigate &&
        safeData.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onNavigate("/relatorios/produtividade")}>
            Ver relatório
          </Button>
        )
      }
    >
      {loading && safeData.length === 0 ? (
        <div className="space-y-2 p-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : safeData.length === 0 ? (
        <EmptyState
          title="Nenhum operador concluiu tarefas no período"
          description="O ranking aparece quando os operadores com metas concluem tarefas nos filtros escolhidos."
        />
      ) : (
        <ol className="divide-y divide-border">
          {safeData.map((op, idx) => {
            const pct = Math.max(4, Math.round((valor(op) / max) * 100));
            const tendencia = op.tendencia ? TENDENCIA[op.tendencia as keyof typeof TENDENCIA] : undefined;
            const metas = op.score_metas_total ? `${op.score_metas_contadas ?? 0}/${op.score_metas_total} metas` : null;
            return (
              <li key={op.usuario_id}>
                <button
                  type="button"
                  onClick={() => onNavigate?.(`/atividades/scorecard/${op.usuario_id}`)}
                  className="grid w-full grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                >
                  <span className="font-mono text-body-sm tabular-nums text-muted-foreground">{idx + 1}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-body font-medium text-foreground">{op.nome}</span>
                      <ScoreBadge classificacao={op.classificacao} situacao={op.score_situacao} />
                    </span>
                    <span className="mt-0.5 block truncate text-caption text-muted-foreground">
                      {op.tarefas.toLocaleString("pt-BR")} tarefas · performance {fmtPct(op.performance_pct ?? op.score_composto)} · eficiência{" "}
                      {fmtPct(op.eficiencia_pct)}
                      {metas && ` · ${metas}`}
                      {op.origem === "ESTIMADO" && (
                        <span className="text-warning" title="Menos de 95% das execuções com início real">
                          {" "}
                          · estimado
                        </span>
                      )}
                      {op.amostra_suficiente === false && <span title="Menos de 8 h diretas no período"> · amostra pequena</span>}
                    </span>
                  </span>
                  <span className="flex w-[180px] items-center justify-end gap-3">
                    {tendencia && (
                      <tendencia.Icone className={cn("h-4 w-4 shrink-0", tendencia.cls)} aria-label={tendencia.rotulo} />
                    )}
                    <span
                      className={cn(
                        "whitespace-nowrap text-body-sm tabular-nums",
                        op.score != null ? "font-semibold text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {op.score != null ? formatarScore(op.score) : textoSemScore(op.score_situacao)}
                    </span>
                    <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      {op.score != null && (
                        <span
                          className={cn("block h-full rounded-full", estiloClassificacao(op.classificacao).barra)}
                          style={{ width: `${pct}%` }}
                        />
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
