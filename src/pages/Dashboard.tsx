import { useCallback, useEffect, useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import {
  Target, Gauge, Activity, ListTodo,
  PlayCircle, Users, Package, ShieldCheck, RefreshCw,
} from "lucide-react";
import { DashboardFilters, FiltersState } from "./dashboard/components/DashboardFilters";
import { KPICardPro, KPISeverity } from "./dashboard/components/KPICardPro";
import { RankingOperadores } from "./dashboard/components/RankingOperadores";
import { OcorrenciasChart } from "./dashboard/components/OcorrenciasChart";
import { TendenciaChart } from "./dashboard/components/TendenciaChart";
import {
  fetchKpis, fetchRankingOperadores, fetchOcorrencias, fetchTendencia,
  formatarTempoEspera, KpisResult, OperadorRanking, OcorrenciasResult, TendenciaItem,
  DashboardFilters as DF,
} from "./dashboard/dashboard.service";

const REFRESH_INTERVAL = 60_000;

export function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { tenantId, empresaId, empresaVersion, armazemId } = useTenant();
  const isMobile = useIsMobile();
  const today = format(new Date(), "yyyy-MM-dd");

  const [filters, setFilters] = useState<FiltersState>({
    armazemId: armazemId || null,
    dataIni: today,
    dataFim: today,
    turnoId: null,
  });

  const [kpis, setKpis] = useState<KpisResult | null>(null);
  const [trendTC, setTrendTC] = useState<any>(null);
  const [trendProd, setTrendProd] = useState<any>(null);
  const [ranking, setRanking] = useState<OperadorRanking[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciasResult | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  const dfArgs: DF | null = useMemo(
    () => (tenantId ? { tenantId, empresaId: empresaId || null, ...filters } : null),
    [tenantId, empresaId, filters],
  );

  const carregarDados = useCallback(async (showLoading = true) => {
    if (!dfArgs) return;
    if (showLoading) setLoading(true);
    try {
      const [kpiResult, rank, ocor, tend] = await Promise.all([
        fetchKpis(dfArgs),
        fetchRankingOperadores(dfArgs),
        fetchOcorrencias(dfArgs),
        fetchTendencia(dfArgs),
      ]);
      if (kpiResult) {
        setKpis(kpiResult.kpis);
        setTrendTC(kpiResult.trendTaxaConclusao);
        setTrendProd(kpiResult.trendProdutividade);
      }
      setRanking(rank);
      setOcorrencias(ocor);
      setTendencia(tend);
      setUltimaAtualizacao(new Date());
    } finally {
      setLoading(false);
    }
  }, [dfArgs]);

  useEffect(() => {
    carregarDados(true);
  }, [carregarDados, empresaVersion]);

  useEffect(() => {
    const id = setInterval(() => carregarDados(false), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [carregarDados]);

  const tc = kpis?.taxa_conclusao;
  const oc = kpis?.ocupacao;
  const pr = kpis?.produtividade;
  const bk = kpis?.backlog;
  const ac = kpis?.acuracia;

  const sevTC: KPISeverity = !tc ? "neutral" : tc.valor >= 95 ? "good" : tc.valor >= 80 ? "warn" : "bad";
  const sevOcup: KPISeverity = !oc ? "neutral" : oc.valor > 85 ? "bad" : oc.valor >= 70 ? "warn" : "good";
  const sevProd: KPISeverity = "neutral";
  const sevBack: KPISeverity = !bk ? "neutral" : bk.total > 50 ? "bad" : bk.total >= 20 ? "warn" : "good";
  const sevEA: KPISeverity = "neutral";
  const sevOp: KPISeverity = "neutral";
  const sevTP: KPISeverity = "neutral";
  const sevAC: KPISeverity = !ac ? "neutral" : ac.valor >= 98 ? "good" : ac.valor >= 95 ? "warn" : "bad";

  return (
    <div className="space-y-5 animate-fade-in">
      <div className={cn("flex gap-3", isMobile ? "flex-col items-start" : "items-center justify-between flex-wrap")}>
        <div>
          <h1 className={cn("font-bold text-foreground", isMobile ? "text-lg" : "text-xl")}>Torre de Controle</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão executiva em tempo real</p>
        </div>
        <div className="flex items-center gap-3">
          {ultimaAtualizacao && (
            <button
              onClick={() => carregarDados(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Clique para atualizar agora"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {format(ultimaAtualizacao, "HH:mm:ss")}
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Sistema Online
          </div>
        </div>
      </div>

      {tenantId && (
        <DashboardFilters tenantId={tenantId} empresaId={empresaId} defaultArmazemId={armazemId} value={filters} onChange={setFilters} />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICardPro
          title="Taxa de Conclusão"
          value={tc ? `${tc.valor}%` : "—"}
          subtitle={tc ? (tc.total > 0 ? `${tc.concluidas}/${tc.total} ondas concluídas` : "Nenhuma onda no período") : "Carregando..."}
          icon={<Target size={20} />}
          severity={sevTC}
          trend={trendTC}
          progress={tc ? tc.valor : undefined}
          tooltip="Percentual de ondas de carregamento finalizadas sobre o total emitido no período."
          onClick={() => onNavigate("/atividades/mov-saida")}
        />
        <KPICardPro
          title="Ocupação de Endereços"
          value={oc ? `${oc.valor}%` : "—"}
          subtitle={oc ? `${oc.ocupados} ocupados · ${oc.livres} livres · ${oc.bloqueados > 0 ? oc.bloqueados + " bloqueados · " : ""}${oc.total} total` : "Carregando..."}
          icon={<Gauge size={20} />}
          severity={sevOcup}
          trendGoodWhen="down"
          progress={oc ? oc.valor : undefined}
          onClick={() => onNavigate("/armazem/enderecos")}
        />
        <KPICardPro
          title="Produtividade"
          value={pr ? `${pr.valor}` : "—"}
          subtitle={pr ? (pr.tarefas > 0 ? `${pr.tarefas} tarefas em ${pr.horas}h` : "Sem atividade no período") : "Carregando..."}
          icon={<Activity size={20} />}
          severity={sevProd}
          trend={trendProd}
          unit="tarefas/hora"
          onClick={() => onNavigate("/relatorios/produtividade")}
        />
        <KPICardPro
          title="Fila de Espera"
          value={bk ? `${bk.total}` : "—"}
          subtitle={bk ? (bk.total > 0 ? `Espera média ${formatarTempoEspera(bk.tempo_medio_seg)}` : "Nenhuma tarefa pendente ✓") : "Carregando..."}
          icon={<ListTodo size={20} />}
          severity={sevBack}
          trendGoodWhen="down"
          unit="tarefas"
          onClick={() => onNavigate("/atividades/mov-saida")}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICardPro
          title="Em Andamento"
          value={kpis ? `${kpis.em_andamento}` : "—"}
          subtitle={kpis ? (kpis.em_andamento > 0 ? "tarefas sendo executadas agora" : "Nenhuma tarefa em execução") : "Carregando..."}
          icon={<PlayCircle size={20} />}
          severity={sevEA}
          onClick={() => onNavigate("/atividades/tarefas-ativas")}
        />
        <KPICardPro
          title="Operadores Ativos"
          value={kpis ? `${kpis.operadores_ativos}` : "—"}
          subtitle={kpis ? (kpis.operadores_ativos > 0 ? "conectados nos últimos 5 min" : "Nenhum operador online") : "Carregando..."}
          icon={<Users size={20} />}
          severity={sevOp}
          onClick={() => onNavigate("/atividades/operadores-ativos")}
        />
        <KPICardPro
          title="Unidades Movimentadas"
          value={kpis ? `${kpis.throughput}` : "—"}
          subtitle={kpis ? (kpis.throughput > 0 ? "unidades processadas no período" : "Sem movimentação no período") : "Carregando..."}
          icon={<Package size={20} />}
          severity={sevTP}
          unit="un"
          onClick={() => onNavigate("/relatorios/movimentacoes")}
        />
        <KPICardPro
          title="Acurácia Operacional"
          value={ac ? `${ac.valor}%` : "—"}
          subtitle={ac ? (ac.total > 0 ? `${ac.sem_ocorrencia}/${ac.total} tarefas sem ocorrência` : "Sem tarefas no período") : "Carregando..."}
          icon={<ShieldCheck size={20} />}
          severity={sevAC}
          progress={ac ? ac.valor : undefined}
          onClick={() => onNavigate("/atividades/ocorrencias")}
        />
      </div>

      <TendenciaChart data={tendencia} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingOperadores data={ranking} loading={loading} onNavigate={onNavigate} />
        <OcorrenciasChart data={ocorrencias} loading={loading} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
