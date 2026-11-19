import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2, Minus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { supabase } from "@/integrations/supabase/client";
import { MetasEvolucaoTab } from "@/pages/coletor/metas/MetasEvolucaoTab";
import { MetasKpiCard } from "@/pages/coletor/metas/MetasKpiCard";
import { MetasListaTab } from "@/pages/coletor/metas/MetasListaTab";
import { MetasRankingTab } from "@/pages/coletor/metas/MetasRankingTab";
import { MetasResumoTab } from "@/pages/coletor/metas/MetasResumoTab";
import { MetasScoreRing } from "@/pages/coletor/metas/MetasScoreRing";
import { MetasStreakBadge } from "@/pages/coletor/metas/MetasStreakBadge";
import { abasDisponiveis, type Tab } from "@/pages/coletor/metas/metasAbas";
import { estiloFaixa, type FaixaLms } from "@/modules/lms/faixas";
import { estiloClassificacao, textoSemScore, type FichaScore } from "@/modules/lms/score/score.service";

const sb = supabase as any;

interface Props { onNavigate: (path: string) => void; }
type Periodo = "hoje" | "7d" | "30d";

interface MetasData {
  erro?: string;
  operador: { nome: string; habilidade: string | null; turno: string; faixa_performance: string; faixa_nome?: string; faixa_cor?: string };
  indicadores: { eficiencia_pct?: number | null; utilizacao_pct?: number | null; performance_pct?: number | null; origem?: "REAL" | "ESTIMADO"; score_medio: number; total_tarefas: number; taxa_ocupacao: number; produtividade_hora: number; tempo_produtivo: number; tempo_transito: number; tempo_ocioso: number; dias_trabalhados: number };
  ranking: { posicao: number; total_operadores: number; top: Array<{ iniciais: string; score: number; score_global?: number | null; posicao: number; sou_eu: boolean }> } | null;
  streak: { dias_consecutivos: number; melhor_streak: number; meta_score: number } | null;
  // Fase 10 · score global das metas do operador e a sequência de dias com score na meta
  metas?: FichaScore | null;
  streak_score?: { dias_consecutivos: number; melhor_streak: number; meta_score: number } | null;
  evolucao: Array<{ data: string; score: number; tarefas: number; taxa_ocupacao: number }>;
  detalhamento_tipo: Array<{ tipo: string; codigo: string; tarefas: number; quantidade_total: number; tempo_medio_seg: number; performance_pct: number | null }>;
  variacao_vs_anterior: number | null;
  faixas: { excelente: number; bom: number; atencao: number };
  faixas_lista?: FaixaLms[];
}

const PERIODO_LABELS: Record<Periodo, string> = { hoje: "Hoje", "7d": "7 dias", "30d": "30 dias" };
const TAB_LABELS: Record<Tab, string> = { metas: "Metas", resumo: "Resumo", ranking: "Ranking", evolucao: "Evolução" };

// Fase 7.5: nome e cor da faixa vêm do conjunto configurado no LMS
function faixaColor(faixa: string, cor?: string | null, nome?: string | null) {
  if (!faixa || faixa === "SEM_DADOS") {
    return { bg: "bg-[hsl(222,35%,18%)]/50", text: "text-[hsl(213,31%,55%)]", border: "border-[hsl(222,35%,22%)]", ring: "hsl(215 16% 47%)", label: "Sem dados" };
  }
  const e = estiloFaixa(faixa, cor, nome);
  return { bg: e.fundo, text: e.texto, border: e.borda, ring: e.hex, label: e.nome };
}

export function MetasPage({ onNavigate }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [tab, setTab] = useState<Tab>("metas");
  const [data, setData] = useState<MetasData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const carregar = useCallback(async () => {
    if (!tenantId || !usuarioId) {
      setData(null);
      setErrorMessage("Não foi possível identificar o operador desta sessão.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data: result, error } = await sb.rpc("fn_coletor_metas_operador", { p_tenant_id: tenantId, p_usuario_id: usuarioId, p_periodo: periodo });
      if (error) throw error;
      setData(result as MetasData | null);
    } catch (error) {
      console.error("Erro ao carregar metas:", error);
      setData(null);
      setErrorMessage("Não foi possível carregar seus resultados.");
    } finally {
      setLoading(false);
    }
  }, [tenantId, usuarioId, periodo]);

  useEffect(() => { carregar(); }, [carregar]);

  const ind = data?.indicadores;
  // Fase 6 (decisão 5): o operador vê só os próprios números; o banco só manda ranking para quem gere a equipe.
  const abas = abasDisponiveis(Boolean(data?.ranking));
  const variacao = data?.variacao_vs_anterior;
  // Fase 10: o anel e a classificação mostram o score global das metas (não mais a performance)
  const ficha = data?.metas ?? null;
  const scoreGlobal = ficha?.score ?? null;
  const faixa = (() => {
    if (scoreGlobal === null) return { ...faixaColor(""), label: textoSemScore(ficha?.situacao) };
    const e = estiloClassificacao(ficha?.classificacao);
    return { bg: e.fundo, text: e.texto, border: e.borda, ring: e.hex, label: e.nome };
  })();
  const streak = data?.streak_score ?? null;

  return (
    <ColetorLayout title="Metas & Resultados" onNavigate={onNavigate} showBack backPath="/coletor/home">
      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="animate-spin text-blue-400" />
          <p className="text-sm text-[hsl(213,31%,55%)]">Calculando seus resultados...</p>
        </div>
      ) : !data || data.erro || errorMessage ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(222,40%,12%)]">
            <BarChart3 size={26} className="text-[hsl(213,31%,55%)]" />
          </div>
          <p className="max-w-xs text-sm text-[hsl(213,31%,55%)]">{errorMessage || data?.erro || "Nenhum dado de performance encontrado."}</p>
          <Button variant="outline" onClick={carregar} className="border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-white">
            <RefreshCw size={16} /> Tentar novamente
          </Button>
        </div>
      ) : (
        <div className="space-y-3 pb-2">
          <div className="grid grid-cols-3 gap-1.5" aria-label="Período">
            {(Object.keys(PERIODO_LABELS) as Periodo[]).map((item) => (
              <Button key={item} type="button" onClick={() => setPeriodo(item)} className={`h-10 rounded-xl px-2 text-xs font-semibold active:scale-[0.97] ${periodo === item ? "bg-blue-600 text-white hover:bg-blue-600" : "border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-[hsl(213,31%,55%)] hover:bg-[hsl(222,40%,12%)]"}`}>
                {PERIODO_LABELS[item]}
              </Button>
            ))}
          </div>

          <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-3">
            <div className="flex items-center gap-3">
              <MetasScoreRing score={scoreGlobal} maxScore={Math.max(data.faixas.excelente, ficha?.teto_pct ?? 120)} faixa={faixa} />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="truncate text-sm font-bold text-white">{data.operador.nome}</p>
                  <p className="truncate text-[10px] text-[hsl(213,31%,55%)]">{[data.operador.turno, data.operador.habilidade].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold uppercase ${faixa.bg} ${faixa.text} ${faixa.border}`}>{faixa.label}</span>
                {variacao !== null && variacao !== undefined && (
                  <div className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${variacao > 0 ? "text-green-400" : variacao < 0 ? "text-red-400" : "text-[hsl(213,31%,55%)]"}`}>
                    {variacao > 0 ? <TrendingUp size={14} /> : variacao < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                    {variacao > 0 ? "+" : ""}{variacao.toFixed(1)} de performance vs anterior
                  </div>
                )}
              </div>
            </div>
            {streak && streak.dias_consecutivos > 0 && <div className="mt-3"><MetasStreakBadge diasConsecutivos={streak.dias_consecutivos} melhorStreak={streak.melhor_streak} /></div>}
          </section>

          <div className="grid grid-cols-2 gap-2">
            <MetasKpiCard label="Tarefas" value={String(ind.total_tarefas || 0)} subtitle="concluídas no período" icon="tasks" />
            <MetasKpiCard label="Utilização" value={`${(ind.taxa_ocupacao || 0).toFixed(0)}%`} subtitle="tempo em tarefa" icon="clock" />
            <MetasKpiCard label="Eficiência" value={ind.eficiencia_pct != null ? `${Number(ind.eficiencia_pct).toFixed(0)}%` : "—"} subtitle="horas-padrão ÷ tempo disponível" icon="speed" />
            {data.ranking ? (
              <MetasKpiCard label="Na equipe" value={data.ranking.posicao ? `${data.ranking.posicao}º` : "—"} subtitle={`entre ${data.ranking.total_operadores} · score`} icon="trophy" />
            ) : (
              <MetasKpiCard label="Performance" value={ind.performance_pct != null ? `${Number(ind.performance_pct).toFixed(0)}%` : "—"} subtitle="horas-padrão ÷ tempo em tarefa" icon="trophy" />
            )}
          </div>

          <div className={`grid ${abas.length === 4 ? "grid-cols-4" : "grid-cols-3"} gap-1 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] p-1`} role="tablist">
            {abas.map((item) => (
              <Button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-9 rounded-lg px-1 text-xs font-semibold ${tab === item ? "bg-[hsl(222,40%,18%)] text-white hover:bg-[hsl(222,40%,18%)]" : "bg-transparent text-[hsl(213,31%,55%)] hover:bg-transparent"}`}>
                {TAB_LABELS[item]}
              </Button>
            ))}
          </div>

          {tab === "metas" && <MetasListaTab ficha={ficha} />}
          {tab === "resumo" && <MetasResumoTab indicadores={ind} detalhamento={data.detalhamento_tipo || []} faixas={data.faixas} lista={data.faixas_lista} />}
          {tab === "ranking" && data.ranking && <MetasRankingTab ranking={data.ranking} faixas={data.faixas} lista={data.faixas_lista} />}
          {tab === "evolucao" && <MetasEvolucaoTab evolucao={data.evolucao || []} faixas={data.faixas} lista={data.faixas_lista} />}
        </div>
      )}
    </ColetorLayout>
  );
}
