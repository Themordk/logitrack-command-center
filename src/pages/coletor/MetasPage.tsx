import { useCallback, useEffect, useState } from "react";
import { BarChart3, Loader2, Minus, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { supabase } from "@/integrations/supabase/client";
import { MetasEvolucaoTab } from "@/pages/coletor/metas/MetasEvolucaoTab";
import { MetasKpiCard } from "@/pages/coletor/metas/MetasKpiCard";
import { MetasRankingTab } from "@/pages/coletor/metas/MetasRankingTab";
import { MetasResumoTab } from "@/pages/coletor/metas/MetasResumoTab";
import { MetasScoreRing } from "@/pages/coletor/metas/MetasScoreRing";
import { MetasStreakBadge } from "@/pages/coletor/metas/MetasStreakBadge";

const sb = supabase as any;

interface Props { onNavigate: (path: string) => void; }
type Periodo = "hoje" | "7d" | "30d";
type Tab = "resumo" | "ranking" | "evolucao";

interface MetasData {
  erro?: string;
  operador: { nome: string; habilidade: string | null; turno: string; faixa_performance: string };
  indicadores: { score_medio: number; total_tarefas: number; taxa_ocupacao: number; produtividade_hora: number; tempo_produtivo: number; tempo_transito: number; tempo_ocioso: number; dias_trabalhados: number };
  ranking: { posicao: number; total_operadores: number; top: Array<{ iniciais: string; score: number; posicao: number; sou_eu: boolean }> } | null;
  streak: { dias_consecutivos: number; melhor_streak: number; meta_score: number } | null;
  evolucao: Array<{ data: string; score: number; tarefas: number; taxa_ocupacao: number }>;
  detalhamento_tipo: Array<{ tipo: string; codigo: string; tarefas: number; quantidade_total: number; tempo_medio_seg: number; performance_pct: number | null }>;
  variacao_vs_anterior: number | null;
  faixas: { excelente: number; bom: number; atencao: number };
}

const PERIODO_LABELS: Record<Periodo, string> = { hoje: "Hoje", "7d": "7 dias", "30d": "30 dias" };
const TAB_LABELS: Record<Tab, string> = { resumo: "Resumo", ranking: "Ranking", evolucao: "Evolução" };

function faixaColor(faixa: string) {
  switch (faixa) {
    case "EXCELENTE": return { bg: "bg-green-500/15", text: "text-green-400", border: "border-green-500/30", ring: "hsl(142 71% 45%)", label: "Excelente" };
    case "BOM": return { bg: "bg-blue-500/15", text: "text-blue-400", border: "border-blue-500/30", ring: "hsl(217 91% 60%)", label: "Bom" };
    case "ATENCAO": return { bg: "bg-yellow-500/15", text: "text-yellow-400", border: "border-yellow-500/30", ring: "hsl(48 96% 53%)", label: "Atenção" };
    case "CRITICO": return { bg: "bg-red-500/15", text: "text-red-400", border: "border-red-500/30", ring: "hsl(0 84% 60%)", label: "Crítico" };
    default: return { bg: "bg-[hsl(222,35%,18%)]/50", text: "text-[hsl(213,31%,55%)]", border: "border-[hsl(222,35%,22%)]", ring: "hsl(215 16% 47%)", label: "Sem dados" };
  }
}

export function MetasPage({ onNavigate }: Props) {
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const [tab, setTab] = useState<Tab>("resumo");
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
  const variacao = data?.variacao_vs_anterior;
  const faixa = faixaColor(data?.operador?.faixa_performance || "");

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
              <MetasScoreRing score={ind.score_medio || 0} maxScore={Math.max(data.faixas.excelente, 120)} faixa={faixa} />
              <div className="min-w-0 flex-1 space-y-2">
                <div>
                  <p className="truncate text-sm font-bold text-white">{data.operador.nome}</p>
                  <p className="truncate text-[10px] text-[hsl(213,31%,55%)]">{[data.operador.turno, data.operador.habilidade].filter(Boolean).join(" · ")}</p>
                </div>
                <span className={`inline-flex rounded-lg border px-2 py-1 text-[10px] font-bold uppercase ${faixa.bg} ${faixa.text} ${faixa.border}`}>{faixa.label}</span>
                {variacao !== null && variacao !== undefined && (
                  <div className={`flex items-center gap-1 text-xs font-semibold tabular-nums ${variacao > 0 ? "text-green-400" : variacao < 0 ? "text-red-400" : "text-[hsl(213,31%,55%)]"}`}>
                    {variacao > 0 ? <TrendingUp size={14} /> : variacao < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                    {variacao > 0 ? "+" : ""}{variacao.toFixed(1)} vs anterior
                  </div>
                )}
              </div>
            </div>
            {data.streak && data.streak.dias_consecutivos > 0 && <div className="mt-3"><MetasStreakBadge diasConsecutivos={data.streak.dias_consecutivos} melhorStreak={data.streak.melhor_streak} /></div>}
          </section>

          <div className="grid grid-cols-2 gap-2">
            <MetasKpiCard label="Tarefas" value={String(ind.total_tarefas || 0)} subtitle="concluídas no período" icon="tasks" />
            <MetasKpiCard label="Ocupação" value={`${(ind.taxa_ocupacao || 0).toFixed(0)}%`} subtitle="tempo em operação" icon="clock" />
            <MetasKpiCard label="Produtividade" value={(ind.produtividade_hora || 0).toFixed(1)} subtitle="unidades por hora" icon="speed" />
            <MetasKpiCard label="Na equipe" value={data.ranking?.posicao ? `${data.ranking.posicao}º` : "—"} subtitle={data.ranking ? `entre ${data.ranking.total_operadores}` : "sem ranking"} icon="trophy" />
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,10%)] p-1" role="tablist">
            {(Object.keys(TAB_LABELS) as Tab[]).map((item) => (
              <Button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`h-9 rounded-lg px-1 text-xs font-semibold ${tab === item ? "bg-[hsl(222,40%,18%)] text-white hover:bg-[hsl(222,40%,18%)]" : "bg-transparent text-[hsl(213,31%,55%)] hover:bg-transparent"}`}>
                {TAB_LABELS[item]}
              </Button>
            ))}
          </div>

          {tab === "resumo" && <MetasResumoTab indicadores={ind} detalhamento={data.detalhamento_tipo || []} faixas={data.faixas} />}
          {tab === "ranking" && <MetasRankingTab ranking={data.ranking} faixas={data.faixas} />}
          {tab === "evolucao" && <MetasEvolucaoTab evolucao={data.evolucao || []} faixas={data.faixas} />}
        </div>
      )}
    </ColetorLayout>
  );
}
