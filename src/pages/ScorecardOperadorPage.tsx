import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ArrowLeft, RefreshCw, BarChart3 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  fetchScorecardOperador,
  formatarTempoEspera,
  corFaixaPerformance,
  type ScorecardOperador,
} from "@/pages/dashboard/dashboard.service";

function faixaPorScore(score: number): string {
  if (score >= 95) return "EXCELENTE";
  if (score >= 80) return "BOM";
  if (score >= 60) return "ATENCAO";
  return "CRITICO";
}

function corPerformance(pct: number | null): string {
  if (pct === null || pct === undefined) return "bg-secondary/30 text-muted-foreground border-border/50";
  if (pct >= 110) return "bg-green-500/15 text-green-400 border-green-500/30";
  if (pct >= 90) return "bg-blue-500/15 text-blue-400 border-blue-500/30";
  if (pct >= 70) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-red-500/15 text-red-400 border-red-500/30";
}

function fmtData(d: string) {
  try {
    return format(new Date(`${d.slice(0, 10)}T12:00:00`), "dd/MM");
  } catch {
    return d;
  }
}

export function ScorecardOperadorPage({
  onNavigate,
  params,
}: {
  onNavigate: (p: string) => void;
  params?: { id?: string };
}) {
  const usuarioId = params?.id || "";
  const { tenantId, empresaVersion } = useTenant();
  const [dias, setDias] = useState("7");
  const [data, setData] = useState<ScorecardOperador | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!tenantId || !usuarioId) return;
    setLoading(true);
    const fim = new Date();
    const ini = new Date();
    ini.setDate(ini.getDate() - (Number(dias) - 1));
    const res = await fetchScorecardOperador(
      tenantId,
      usuarioId,
      format(ini, "yyyy-MM-dd"),
      format(fim, "yyyy-MM-dd"),
    );
    setData(res);
    setLoading(false);
  }, [tenantId, usuarioId, dias]);

  useEffect(() => { carregar(); }, [carregar, empresaVersion]);

  const op = data?.operador;
  const m = data?.metricas_periodo;
  const faixa = corFaixaPerformance(m?.faixa_performance || "");

  const evolucao = data?.evolucao_diaria || [];
  const maxScore = Math.max(1, ...evolucao.map((e) => e.score_dia || 0));

  const tempos = {
    produtivo: m?.tempo_produtivo_total || 0,
    transito: m?.tempo_transito_total || 0,
    ocioso: m?.tempo_ocioso_total || 0,
  };
  const totalTempo = tempos.produtivo + tempos.transito + tempos.ocioso;
  const pctT = (v: number) => (totalTempo > 0 ? (v / totalTempo) * 100 : 0);

  const comp = data?.comparativo_equipe;
  const range = comp ? Math.max(1, comp.score_equipe_max - comp.score_equipe_min) : 1;
  const posRel = comp && m ? ((m.score_medio - comp.score_equipe_min) / range) * 100 : 0;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <button
            onClick={() => onNavigate("/atividades/operadores-ativos")}
            className="p-1.5 mt-1 rounded-md hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Voltar"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">{op?.nome || "Scorecard do Operador"}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {[op?.armazem, op?.tipo_operacao, op?.habilidade, op?.turno].filter(Boolean).join(" · ") || "—"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {m && (
            <div className={cn("px-4 py-2 rounded-xl border text-center", faixa.bg, faixa.border)}>
              <div className={cn("text-2xl font-bold tabular-nums", faixa.text)}>{(m.score_medio || 0).toFixed(0)}%</div>
              <div className={cn("text-[11px]", faixa.text)}>{faixa.label}</div>
            </div>
          )}
          <Select value={dias} onValueChange={setDias}>
            <SelectTrigger className="w-[170px] h-9 bg-secondary/40 border-border/50"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="15">Últimos 15 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => carregar()}>
            <RefreshCw size={12} className={cn("mr-1.5", loading && "animate-spin")} />
            Atualizar
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-secondary/30 animate-pulse" />)}</div>
      ) : !data || !m ? (
        <div className="card-surface flex flex-col items-center justify-center py-16 text-muted-foreground">
          <BarChart3 size={40} className="mb-3 opacity-40" />
          <p className="text-sm">Nenhum dado de performance encontrado para este operador no período.</p>
        </div>
      ) : (
        <>
          {/* Resumo */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Mini label="Score Médio" value={`${(m.score_medio || 0).toFixed(0)}%`} />
            <Mini label="Taxa Ocupação Média" value={`${(m.taxa_ocupacao_media || 0).toFixed(0)}%`} />
            <Mini label="Produtividade Média" value={`${(m.produtividade_hora_media || 0).toFixed(1)} un/h`} />
            <Mini label="Total de Tarefas" value={String(m.total_tarefas || 0)} />
            <Mini label="Dias Trabalhados" value={String(m.dias_trabalhados || 0)} />
            <Mini
              label="Posição na Equipe"
              value={comp ? `${comp.posicao}º de ${comp.total_operadores}` : "—"}
            />
          </div>

          {/* Evolução diária */}
          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Evolução Diária do Score</h3>
            {evolucao.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Sem registros no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex items-end gap-2 min-w-max h-44">
                  {evolucao.map((e) => {
                    const f = corFaixaPerformance(faixaPorScore(e.score_dia || 0));
                    const h = Math.max(4, Math.round(((e.score_dia || 0) / maxScore) * 140));
                    return (
                      <div key={e.data} className="flex flex-col items-center justify-end gap-1 w-12">
                        <span className="text-[10px] text-muted-foreground tabular-nums">{(e.score_dia || 0).toFixed(0)}</span>
                        <div
                          className={cn("w-8 rounded-t-md border", f.bg, f.border)}
                          style={{ height: `${h}px` }}
                          title={`${fmtData(e.data)} · ${(e.score_dia || 0).toFixed(0)}% · ${e.tarefas_concluidas} tarefas`}
                        />
                        <span className="text-[10px] text-muted-foreground">{fmtData(e.data)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Detalhamento por tipo */}
          <div className="card-surface overflow-hidden">
            <div className="px-5 py-3 border-b border-border/50">
              <h3 className="text-sm font-semibold text-foreground">Detalhamento por Tipo de Tarefa</h3>
            </div>
            {data.detalhamento_tipo.length === 0 ? (
              <p className="text-sm text-muted-foreground py-10 text-center">Nenhuma tarefa concluída no período.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-xs text-muted-foreground uppercase tracking-wide">
                      <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                      <th className="text-left px-4 py-2.5 font-medium">Categoria</th>
                      <th className="text-right px-4 py-2.5 font-medium">Tarefas</th>
                      <th className="text-right px-4 py-2.5 font-medium">Qtd</th>
                      <th className="text-right px-4 py-2.5 font-medium">Tempo Médio</th>
                      <th className="text-right px-4 py-2.5 font-medium">Tempo Estimado</th>
                      <th className="text-right px-4 py-2.5 font-medium">Performance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.detalhamento_tipo.map((t) => (
                      <tr key={t.tipo_tarefa_codigo} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                        <td className="px-4 py-3 font-medium text-foreground">{t.tipo_tarefa_desc || t.tipo_tarefa_codigo}</td>
                        <td className="px-4 py-3 text-muted-foreground">{t.categoria || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{t.tarefas}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{t.quantidade_total}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatarTempoEspera(t.tempo_medio_seg || 0)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatarTempoEspera(t.tempo_estimado_seg || 0)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border", corPerformance(t.performance_pct))}>
                            {t.performance_pct !== null && t.performance_pct !== undefined ? `${t.performance_pct.toFixed(0)}%` : "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tempos do período */}
          <div className="card-surface p-5">
            <h3 className="text-sm font-semibold text-foreground mb-4">Tempos do Período</h3>
            <div className="w-full h-4 rounded-full overflow-hidden flex bg-secondary/50">
              <div className="bg-green-500/70 h-full" style={{ width: `${pctT(tempos.produtivo)}%` }} />
              <div className="bg-yellow-500/70 h-full" style={{ width: `${pctT(tempos.transito)}%` }} />
              <div className="bg-red-500/70 h-full" style={{ width: `${pctT(tempos.ocioso)}%` }} />
            </div>
            <div className="flex flex-wrap gap-5 mt-3 text-xs">
              <Legenda cor="bg-green-500/70" label="Produtivo" valor={formatarTempoEspera(tempos.produtivo)} pct={pctT(tempos.produtivo)} />
              <Legenda cor="bg-yellow-500/70" label="Trânsito" valor={formatarTempoEspera(tempos.transito)} pct={pctT(tempos.transito)} />
              <Legenda cor="bg-red-500/70" label="Ocioso" valor={formatarTempoEspera(tempos.ocioso)} pct={pctT(tempos.ocioso)} />
            </div>
          </div>

          {/* Comparativo com equipe */}
          {comp && (
            <div className="card-surface p-5">
              <h3 className="text-sm font-semibold text-foreground mb-4">Comparativo com a Equipe</h3>
              <div className="text-sm text-foreground mb-3">
                <span className="text-2xl font-bold tabular-nums">{comp.posicao}º</span>
                <span className="text-muted-foreground"> de {comp.total_operadores} operadores</span>
              </div>
              <div className="relative w-full h-2 rounded-full bg-secondary/60 mb-2">
                <div
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-primary border-2 border-background"
                  style={{ left: `${Math.min(100, Math.max(0, posRel))}%` }}
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <Mini label="Score do Operador" value={`${(m.score_medio || 0).toFixed(0)}%`} />
                <Mini label="Média da Equipe" value={`${(comp.score_equipe_media || 0).toFixed(0)}%`} />
                <Mini label="Maior da Equipe" value={`${(comp.score_equipe_max || 0).toFixed(0)}%`} />
                <Mini label="Menor da Equipe" value={`${(comp.score_equipe_min || 0).toFixed(0)}%`} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-surface p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold tabular-nums text-foreground mt-1">{value}</div>
    </div>
  );
}

function Legenda({ cor, label, valor, pct }: { cor: string; label: string; valor: string; pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-2.5 h-2.5 rounded-sm", cor)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground tabular-nums">{valor}</span>
      <span className="text-muted-foreground tabular-nums">({pct.toFixed(0)}%)</span>
    </div>
  );
}
