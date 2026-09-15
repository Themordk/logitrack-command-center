import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/contexts/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { format } from "date-fns";
import {
  Target, Gauge, Activity, ListTodo,
  PlayCircle, Users, Package, ShieldCheck, RefreshCw, BarChart3,
  ChevronDown, Scissors, ClipboardList, Layers, MapPin, AlertTriangle,
} from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { DashboardFilters, FiltersState } from "./dashboard/components/DashboardFilters";
import { KPICardPro, KPISeverity } from "./dashboard/components/KPICardPro";
import { RankingOperadores } from "./dashboard/components/RankingOperadores";
import { OcorrenciasChart } from "./dashboard/components/OcorrenciasChart";
import { TendenciaChart } from "./dashboard/components/TendenciaChart";
import { OcupacaoTipoEnderecoChart } from "./dashboard/components/OcupacaoTipoEnderecoChart";
import { ComposicaoTipoChart } from "./dashboard/components/ComposicaoTipoChart";
import {
  fetchKpis, fetchRankingOperadores, fetchOcorrencias, fetchTendencia,
  formatarTempoEspera, KpisResult, OperadorRanking, OcorrenciasResult, TendenciaItem,
  DashboardFilters as DF,
} from "./dashboard/dashboard.service";

const REFRESH_INTERVAL = 60_000;

function SectionHeader({
  title,
  icon,
  sectionKey,
  isOpen,
  onToggle,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  sectionKey: string;
  isOpen: boolean;
  onToggle: (key: string) => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(sectionKey)}
      className="flex items-center gap-2 w-full group py-1"
    >
      {icon}
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {badge}
      <ChevronDown
        size={16}
        className={cn(
          "ml-auto text-muted-foreground transition-transform group-hover:text-foreground",
          isOpen ? "rotate-180" : "rotate-0",
        )}
      />
    </button>
  );
}

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
  const [trendCorte, setTrendCorte] = useState<any>(null);
  const [ranking, setRanking] = useState<OperadorRanking[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciasResult | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    produtividade: true,
    ocupacao: true,
    servico: true,
    anomalias: true,
    lms: true,
  });

  const toggleSection = (key: string) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

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
        setTrendCorte(kpiResult.trendTaxaCorte || null);
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
  const corte = kpis?.taxa_corte;
  const inv = kpis?.inventario;

  const sevTC: KPISeverity = !tc ? "neutral" : tc.valor >= 95 ? "good" : tc.valor >= 80 ? "warn" : "bad";
  const sevOcup: KPISeverity = !oc ? "neutral" : oc.valor > 85 ? "bad" : oc.valor >= 70 ? "warn" : "good";
  const sevProd: KPISeverity = "neutral";
  const sevBack: KPISeverity = !bk ? "neutral" : bk.total > 50 ? "bad" : bk.total >= 20 ? "warn" : "good";
  const sevEA: KPISeverity = "neutral";
  const sevOp: KPISeverity = "neutral";
  const sevTP: KPISeverity = "neutral";
  const sevAC: KPISeverity = !ac ? "neutral" : ac.valor >= 98 ? "good" : ac.valor >= 95 ? "warn" : "bad";
  const sevCorte: KPISeverity = !corte ? "neutral" : corte.taxa <= 2 ? "good" : corte.taxa <= 5 ? "warn" : "bad";
  const sevInv: KPISeverity = !inv ? "neutral" : inv.em_contagem > 0 ? "warn" : "good";

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Header ── */}
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

      {/* ── Filtros ── */}
      {tenantId && (
        <DashboardFilters tenantId={tenantId} empresaId={empresaId} defaultArmazemId={armazemId} value={filters} onChange={setFilters} />
      )}

      {/* ── 1. Produtividade & Movimentação ── */}
      <Collapsible open={openSections.produtividade} onOpenChange={() => toggleSection("produtividade")}>
        <SectionHeader
          title="Produtividade & Movimentação"
          icon={<Activity size={16} className="text-primary" />}
          sectionKey="produtividade"
          isOpen={openSections.produtividade}
          onToggle={toggleSection}
        />
        <CollapsibleContent className="collapsible-content space-y-4 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              title="Unidades Movimentadas"
              value={kpis ? `${kpis.throughput}` : "—"}
              subtitle={kpis ? (kpis.throughput > 0 ? "unidades processadas no período" : "Sem movimentação no período") : "Carregando..."}
              icon={<Package size={20} />}
              severity={sevTP}
              unit="un"
              onClick={() => onNavigate("/relatorios/movimentacoes")}
            />
            <KPICardPro
              title="Em Andamento"
              value={kpis ? `${kpis.em_andamento}` : "—"}
              subtitle={kpis ? (kpis.em_andamento > 0 ? "tarefas sendo executadas agora" : "Nenhuma tarefa em execução") : "Carregando..."}
              icon={<PlayCircle size={20} />}
              severity={sevEA}
              onClick={() => onNavigate("/atividades/tarefas-ativas")}
            />
          </div>

          <ComposicaoTipoChart data={kpis?.breakdown_tipo_tarefa || []} loading={loading} />
          <TendenciaChart data={tendencia} loading={loading} />
        </CollapsibleContent>
      </Collapsible>

      {/* ── 2. Ocupação & Capacidade ── */}
      <Collapsible open={openSections.ocupacao} onOpenChange={() => toggleSection("ocupacao")}>
        <SectionHeader
          title="Ocupação & Capacidade"
          icon={<MapPin size={16} className="text-primary" />}
          sectionKey="ocupacao"
          isOpen={openSections.ocupacao}
          onToggle={toggleSection}
        />
        <CollapsibleContent className="collapsible-content space-y-4 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <OcupacaoTipoEnderecoChart data={kpis?.ocupacao_por_tipo_endereco || []} loading={loading} />
        </CollapsibleContent>
      </Collapsible>

      {/* ── 3. Nível de Serviço & SLA ── */}
      <Collapsible open={openSections.servico} onOpenChange={() => toggleSection("servico")}>
        <SectionHeader
          title="Nível de Serviço & SLA"
          icon={<ShieldCheck size={16} className="text-primary" />}
          sectionKey="servico"
          isOpen={openSections.servico}
          onToggle={toggleSection}
        />
        <CollapsibleContent className="collapsible-content space-y-4 pt-3">
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
              title="Acurácia Operacional"
              value={ac ? `${ac.valor}%` : "—"}
              subtitle={ac ? (ac.total > 0 ? `${ac.sem_ocorrencia}/${ac.total} tarefas sem ocorrência` : "Sem tarefas no período") : "Carregando..."}
              icon={<ShieldCheck size={20} />}
              severity={sevAC}
              progress={ac ? ac.valor : undefined}
              onClick={() => onNavigate("/atividades/ocorrencias")}
            />
            <KPICardPro
              title="Taxa de Corte"
              value={corte ? `${corte.taxa}%` : "—"}
              subtitle={corte ? (corte.itens_cortados > 0 ? `${corte.itens_cortados}/${corte.itens_total} itens cortados` : "Nenhum corte no período ✓") : "Carregando..."}
              icon={<Scissors size={20} />}
              severity={sevCorte}
              trend={trendCorte}
              trendGoodWhen="down"
              progress={corte ? corte.taxa : undefined}
              tooltip="Percentual de itens de separação que foram cortados (não atendidos integralmente)."
              onClick={() => onNavigate("/relatorios/cortes")}
            />
            <KPICardPro
              title="Operadores Ativos"
              value={kpis ? `${kpis.operadores_ativos}` : "—"}
              subtitle={kpis ? (kpis.operadores_ativos > 0 ? "conectados nos últimos 5 min" : "Nenhum operador online") : "Carregando..."}
              icon={<Users size={20} />}
              severity={sevOp}
              onClick={() => onNavigate("/atividades/operadores-ativos")}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ── 4. Gestão de Anomalias & Riscos ── */}
      <Collapsible open={openSections.anomalias} onOpenChange={() => toggleSection("anomalias")}>
        <SectionHeader
          title="Gestão de Anomalias & Riscos"
          icon={<AlertTriangle size={16} className="text-primary" />}
          sectionKey="anomalias"
          isOpen={openSections.anomalias}
          onToggle={toggleSection}
        />
        <CollapsibleContent className="collapsible-content space-y-4 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <KPICardPro
              title="Inventários"
              value={inv ? `${inv.total}` : "—"}
              subtitle={inv ? (inv.total > 0 ? `${inv.em_contagem} em contagem · ${inv.finalizados} finalizados · Acurácia ${inv.acuracia_media}%` : "Nenhum inventário no período") : "Carregando..."}
              icon={<ClipboardList size={20} />}
              severity={sevInv}
              onClick={() => onNavigate("/atividades/inventario")}
            />
          </div>

          <OcorrenciasChart data={ocorrencias} loading={loading} onNavigate={onNavigate} />
        </CollapsibleContent>
      </Collapsible>

      {/* ── 5. Performance LMS ── */}
      {kpis?.lms && kpis.lms.operadores_avaliados > 0 && (
        <Collapsible open={openSections.lms} onOpenChange={() => toggleSection("lms")}>
          <SectionHeader
            title="Performance LMS"
            icon={<BarChart3 size={16} className="text-primary" />}
            sectionKey="lms"
            isOpen={openSections.lms}
            onToggle={toggleSection}
            badge={
              <span className="px-2 py-0.5 rounded-full bg-secondary text-[11px] text-muted-foreground">
                {kpis.lms.operadores_avaliados} avaliados
              </span>
            }
          />
          <CollapsibleContent className="collapsible-content space-y-4 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICardPro
                title="Score Médio da Equipe"
                value={`${kpis.lms.score_medio_equipe}%`}
                subtitle={`${kpis.lms.operadores_avaliados} operadores avaliados`}
                icon={<Target size={20} />}
                severity={kpis.lms.score_medio_equipe >= 90 ? "good" : kpis.lms.score_medio_equipe >= 70 ? "warn" : "bad"}
                progress={kpis.lms.score_medio_equipe}
                onClick={() => onNavigate("/atividades/operadores-ativos")}
              />
              <KPICardPro
                title="Taxa de Ocupação Média"
                value={`${kpis.lms.taxa_ocupacao_media}%`}
                subtitle="Tempo produtivo sobre tempo logado"
                icon={<Gauge size={20} />}
                severity={kpis.lms.taxa_ocupacao_media >= 70 ? "good" : kpis.lms.taxa_ocupacao_media >= 40 ? "warn" : "bad"}
                progress={kpis.lms.taxa_ocupacao_media}
                onClick={() => onNavigate("/atividades/operadores-ativos")}
              />
              <KPICardPro
                title="Produtividade Média"
                value={`${kpis.lms.produtividade_hora_media}`}
                subtitle="Tarefas por hora trabalhada"
                icon={<Layers size={20} />}
                severity="neutral"
                unit="tarefas/h"
                onClick={() => onNavigate("/relatorios/produtividade")}
              />
              <KPICardPro
                title="Distribuição de Faixas"
                value={`${kpis.lms.operadores_avaliados}`}
                subtitle={`${kpis.lms.distribuicao_faixas.excelente}★ ${kpis.lms.distribuicao_faixas.bom}✓ ${kpis.lms.distribuicao_faixas.atencao}⚠ ${kpis.lms.distribuicao_faixas.critico}✗`}
                icon={<Users size={20} />}
                severity="neutral"
                unit="operadores"
                onClick={() => onNavigate("/atividades/operadores-ativos")}
              />
            </div>

            <RankingOperadores data={ranking} loading={loading} onNavigate={onNavigate} />
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}
