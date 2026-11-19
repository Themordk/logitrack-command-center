import { Trophy, Medal, Award } from "lucide-react";
import { cn } from "@/lib/utils";
import { iconeTendencia } from "@/pages/dashboard/dashboard.service";
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

const fmtPct = (v: number | null | undefined) => (v == null ? "—" : `${Number(v).toFixed(1).replace(".", ",")}%`);

function initials(nome: string) {
  const parts = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function RankingOperadores({ data, loading, onNavigate }: { data: Operador[]; loading?: boolean; onNavigate?: (path: string) => void }) {
  const safeData: Operador[] = Array.isArray(data) ? data : [];
  const podio = [
    "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
    "bg-slate-300/10 text-slate-300 border-slate-300/30",
    "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ];
  const podioIcon = [Trophy, Medal, Award];
  // Fase 10: ordem (do banco) e barra = score global das metas; quem não tem metas vem por último.
  const valor = (d: Operador) => d.score ?? 0;
  const max = Math.max(1, ...safeData.map(valor));

  return (
    <div className="card-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground" title="Ordenado pelo score global: média ponderada do atingimento das metas do operador">Ranking LMS · score das metas</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{safeData.length} operadores</span>
          {onNavigate && safeData.length > 0 && (
            <button
              onClick={() => onNavigate("/relatorios/produtividade")}
              className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Ver relatório →
            </button>
          )}
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary/30 animate-pulse" />)}</div>
      ) : safeData.length === 0 ? (
        <div className="text-center py-8 text-sm text-muted-foreground">Nenhum operador concluiu tarefas no período. Verifique se há tarefas atribuídas.</div>
      ) : (
        <div className="space-y-1.5">
          {safeData.map((op, idx) => {
            const isPodio = idx < 3;
            const Icon = isPodio ? podioIcon[idx] : null;
            const pct = Math.max(6, Math.round((valor(op) / max) * 100));
            return (
              <button
                key={op.usuario_id}
                onClick={() => onNavigate?.(`/atividades/scorecard/${op.usuario_id}`)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors w-full text-left",
                  isPodio ? podio[idx] : "bg-secondary/30 border-transparent text-foreground hover:bg-secondary/50",
                  onNavigate && "cursor-pointer hover:scale-[1.01]",
                )}
              >
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/15 text-primary text-[11px] font-bold shrink-0">
                  {Icon ? <Icon size={14} /> : initials(op.nome)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{op.nome}</p>
                    <ScoreBadge classificacao={op.classificacao} situacao={op.score_situacao} />
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {op.tarefas} tarefas · perf. {fmtPct(op.performance_pct ?? op.score_composto)} · efic. {fmtPct(op.eficiencia_pct)}
                    {op.score_metas_total ? ` · ${op.score_metas_contadas ?? 0}/${op.score_metas_total} metas` : ""}
                    {op.origem === "ESTIMADO" && <span className="ml-1.5 text-amber-400" title="Menos de 95% das execuções com início real">estimado</span>}
                    {op.amostra_suficiente === false && <span className="ml-1.5 text-muted-foreground" title="Menos de 8 h diretas no período">· amostra pequena</span>}
                    {op.tendencia && op.tendencia !== "SEM_HISTORICO" && (
                      <span className={cn("ml-1.5 font-medium", iconeTendencia(op.tendencia).color)}>
                        {iconeTendencia(op.tendencia).icon}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 w-[200px] shrink-0">
                  <span className={cn("text-xs tabular-nums whitespace-nowrap ml-auto font-semibold", op.score != null ? estiloClassificacao(op.classificacao).texto : "text-muted-foreground font-normal")}>
                    {op.score != null ? formatarScore(op.score) : textoSemScore(op.score_situacao)}
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-secondary/60 overflow-hidden">
                    {op.score != null && (
                      <div
                        className={cn("h-full rounded-full transition-all", estiloClassificacao(op.classificacao).barra)}
                        style={{ width: `${pct}%` }}
                      />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
