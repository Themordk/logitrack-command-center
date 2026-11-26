import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { RefreshCw } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { Button } from "@/components/ui/button";
import { PageHeader, PageSection, KpiCard, fmtNumero } from "@/components/ds";
import { DashboardFilters, FiltersState } from "./dashboard/components/DashboardFilters";
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
import { TermoAjuda } from "@/modules/lms/glossario";
import { parseDataPura } from "@/utils/dateTime";

const REFRESH_INTERVAL = 60_000;

type Tendencia = { dir: "up" | "down" | "flat"; pct: number } | null | undefined;
type TomKpi = "warning" | "danger" | undefined;

/** Percentual pt-BR: inteiro sem casas, fracionado com uma ("97,5%"). */
const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : `${fmtNumero(v, Number.isInteger(Number(v)) ? 0 : 1)}%`;

/** Comparação com o período anterior, no formato do KpiCard. */
function deltaDe(t: Tendencia, bomQuando: "subir" | "cair" = "subir") {
  if (!t) return undefined;
  if (t.dir === "flat") return { valor: "estável", direcao: "igual" as const, bomQuando };
  return { valor: `${fmtNumero(t.pct, Number.isInteger(t.pct) ? 0 : 1)}%`, direcao: t.dir === "up" ? ("subiu" as const) : ("caiu" as const), bomQuando };
}

/**
 * Limites de alerta (os mesmos que a tela já usava). Fora do alerta o número fica neutro:
 * verde não é a cor do normal.
 */
const tomAcima = (v: number | undefined, atencao: number, critico: number): TomKpi =>
  v == null ? undefined : v > critico ? "danger" : v >= atencao ? "warning" : undefined;
const tomAbaixo = (v: number | undefined | null, atencao: number, critico: number): TomKpi =>
  v == null ? undefined : v < critico ? "danger" : v < atencao ? "warning" : undefined;

const HINT_PERIODO = "A seta compara com o período anterior de mesmo tamanho.";

function descreverPeriodo(f: FiltersState, hoje: string) {
  if (f.dataIni === hoje && f.dataFim === hoje) return "Hoje";
  const ini = parseDataPura(f.dataIni);
  const fim = parseDataPura(f.dataFim);
  if (!ini || !fim) return "Período selecionado";
  return f.dataIni === f.dataFim ? format(ini, "dd/MM/yyyy") : `${format(ini, "dd/MM/yyyy")} a ${format(fim, "dd/MM/yyyy")}`;
}

export function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { tenantId, empresaId, empresaVersion, armazemId } = useTenant();
  const today = format(new Date(), "yyyy-MM-dd");

  const [filters, setFilters] = useState<FiltersState>({
    armazemId: armazemId || null,
    dataIni: today,
    dataFim: today,
    turnoId: null,
  });

  const [kpis, setKpis] = useState<KpisResult | null>(null);
  const [trendTC, setTrendTC] = useState<Tendencia>(null);
  const [trendProd, setTrendProd] = useState<Tendencia>(null);
  const [trendCorte, setTrendCorte] = useState<Tendencia>(null);
  const [ranking, setRanking] = useState<OperadorRanking[]>([]);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciasResult | null>(null);
  const [tendencia, setTendencia] = useState<TendenciaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [falhou, setFalhou] = useState(false);
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
        setTrendCorte(kpiResult.trendTaxaCorte || null);
      }
      setFalhou(!kpiResult);
      setRanking(rank);
      setOcorrencias(ocor);
      setTendencia(tend);
      setUltimaAtualizacao(new Date());
    } catch {
      setFalhou(true);
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
  const lms = kpis?.lms;
  const carregandoKpis = loading && !kpis;

  const descricao = [
    descreverPeriodo(filters, today),
    ultimaAtualizacao ? `atualizado às ${format(ultimaAtualizacao, "HH:mm")}` : null,
  ].filter(Boolean).join(" · ");

  const faixasTexto = lms
    ? lms.faixas_distribuicao
      ? lms.faixas_distribuicao.map((f) => `${f.nome} ${f.quantidade}`).join(" · ") || "Sem operadores avaliados"
      : `Excelente ${lms.distribuicao_faixas.excelente} · Bom ${lms.distribuicao_faixas.bom} · Atenção ${lms.distribuicao_faixas.atencao} · Crítico ${lms.distribuicao_faixas.critico}`
    : undefined;

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          className="mb-4"
          title="Torre de Controle"
          description={descricao}
          actions={
            <>
              <span className="inline-flex items-center gap-1.5 text-caption text-muted-foreground" title="Os dados se atualizam sozinhos a cada minuto">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
                Ao vivo · a cada 1 min
              </span>
              <Button variant="outline" size="sm" onClick={() => carregarDados(true)} disabled={loading}>
                <RefreshCw className={loading ? "animate-spin" : undefined} aria-hidden="true" />
                Atualizar
              </Button>
            </>
          }
        />
        {tenantId && (
          <DashboardFilters tenantId={tenantId} empresaId={empresaId} defaultArmazemId={armazemId} value={filters} onChange={setFilters} />
        )}
        {falhou && !loading && (
          <div role="alert" className="mt-4 rounded-lg border border-danger/25 bg-danger/10 px-4 py-3 text-body-sm text-danger">
            Não foi possível carregar os indicadores. Confira a conexão e clique em Atualizar.
          </div>
        )}
      </div>

      <PageSection title="Produtividade e movimentação" description="Quanto a operação produziu no período">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Produtividade"
            value={pr ? fmtNumero(pr.valor, Number.isInteger(pr.valor) ? 0 : 1) : "—"}
            unit="tarefas/hora"
            delta={deltaDe(trendProd)}
            hint={HINT_PERIODO}
            context={pr && (pr.tarefas > 0 ? `${fmtNumero(pr.tarefas)} tarefas em ${fmtNumero(pr.horas, 1)} h de tempo direto` : "Sem atividade no período")}
            loading={carregandoKpis}
            onClick={() => onNavigate("/relatorios/produtividade")}
          />
          <KpiCard
            label="Unidades movimentadas"
            value={kpis ? fmtNumero(kpis.throughput) : "—"}
            unit="un"
            context={kpis && (kpis.throughput > 0 ? "Unidades processadas no período" : "Sem movimentação no período")}
            loading={carregandoKpis}
            onClick={() => onNavigate("/relatorios/movimentacoes")}
          />
          <KpiCard
            label="Tarefas em andamento"
            value={kpis ? fmtNumero(kpis.em_andamento) : "—"}
            context={kpis && (kpis.em_andamento > 0 ? "Sendo executadas agora" : "Nenhuma tarefa em execução")}
            loading={carregandoKpis}
            onClick={() => onNavigate("/atividades/tarefas-ativas")}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <TendenciaChart className="lg:col-span-2" data={tendencia} loading={loading} />
          <ComposicaoTipoChart data={kpis?.breakdown_tipo_tarefa || []} loading={loading} />
        </div>
      </PageSection>

      <PageSection title="Ocupação e capacidade" description="Espaço disponível no armazém e trabalho esperando operador">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <KpiCard
              label="Ocupação de endereços"
              value={fmtPct(oc?.valor)}
              tone={tomAcima(oc?.valor, 70, 85)}
              hint="Atenção a partir de 70%; crítico acima de 85%."
              context={
                oc &&
                `${fmtNumero(oc.ocupados)} ocupados · ${fmtNumero(oc.livres)} livres${oc.bloqueados > 0 ? ` · ${fmtNumero(oc.bloqueados)} bloqueados` : ""} · ${fmtNumero(oc.total)} no total`
              }
              loading={carregandoKpis}
              onClick={() => onNavigate("/armazem/enderecos")}
            />
            <KpiCard
              label="Fila de espera"
              value={bk ? fmtNumero(bk.total) : "—"}
              unit="tarefas"
              tone={tomAcima(bk?.total, 20, 50)}
              hint="Tarefas aguardando operador. Atenção a partir de 20; crítico acima de 50."
              context={bk && (bk.total > 0 ? `Espera média de ${formatarTempoEspera(bk.tempo_medio_seg)}` : "Nenhuma tarefa aguardando")}
              loading={carregandoKpis}
              onClick={() => onNavigate("/atividades/mov-saida")}
            />
          </div>
          <OcupacaoTipoEnderecoChart className="lg:col-span-2" data={kpis?.ocupacao_por_tipo_endereco || []} loading={loading} />
        </div>
      </PageSection>

      <PageSection title="Nível de serviço" description="Se os pedidos saem completos, corretos e no prazo">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Taxa de conclusão das ondas"
            value={fmtPct(tc?.valor)}
            tone={tomAbaixo(tc?.valor, 95, 80)}
            delta={deltaDe(trendTC)}
            hint={`Ondas de carregamento finalizadas sobre o total emitido no período. Atenção abaixo de 95%; crítico abaixo de 80%. ${HINT_PERIODO}`}
            context={tc && (tc.total > 0 ? `${fmtNumero(tc.concluidas)} de ${fmtNumero(tc.total)} ondas concluídas` : "Nenhuma onda no período")}
            loading={carregandoKpis}
            onClick={() => onNavigate("/atividades/mov-saida")}
          />
          <KpiCard
            label="Acurácia operacional"
            value={fmtPct(ac?.valor)}
            tone={tomAbaixo(ac?.valor, 98, 95)}
            hint="Tarefas concluídas sem ocorrência. Atenção abaixo de 98%; crítico abaixo de 95%."
            context={ac && (ac.total > 0 ? `${fmtNumero(ac.sem_ocorrencia)} de ${fmtNumero(ac.total)} tarefas sem ocorrência` : "Sem tarefas no período")}
            loading={carregandoKpis}
            onClick={() => onNavigate("/atividades/ocorrencias")}
          />
          <KpiCard
            label="Taxa de corte"
            value={fmtPct(corte?.taxa)}
            tone={corte ? (corte.taxa > 5 ? "danger" : corte.taxa > 2 ? "warning" : undefined) : undefined}
            delta={deltaDe(trendCorte, "cair")}
            hint={`Itens de separação não atendidos integralmente. Atenção acima de 2%; crítico acima de 5%. ${HINT_PERIODO}`}
            context={corte && (corte.itens_cortados > 0 ? `${fmtNumero(corte.itens_cortados)} de ${fmtNumero(corte.itens_total)} itens cortados` : "Nenhum corte no período")}
            loading={carregandoKpis}
            onClick={() => onNavigate("/relatorios/cortes")}
          />
          <KpiCard
            label="Operadores ativos"
            value={kpis ? fmtNumero(kpis.operadores_ativos) : "—"}
            context={kpis && (kpis.operadores_ativos > 0 ? "Conectados nos últimos 5 min" : "Nenhum operador conectado")}
            loading={carregandoKpis}
            onClick={() => onNavigate("/atividades/operadores-ativos")}
          />
        </div>
      </PageSection>

      <PageSection title="Anomalias e riscos" description="Divergências de estoque e ocorrências que pedem ação">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <KpiCard
            className="self-start"
            label="Inventários"
            value={inv ? fmtNumero(inv.total) : "—"}
            context={
              inv &&
              (inv.total > 0
                ? `${fmtNumero(inv.em_contagem)} em contagem · ${fmtNumero(inv.finalizados)} finalizados · acurácia ${fmtPct(inv.acuracia_media)}`
                : "Nenhum inventário no período")
            }
            loading={carregandoKpis}
            onClick={() => onNavigate("/atividades/inventario")}
          />
          <OcorrenciasChart className="lg:col-span-2" data={ocorrencias} loading={loading} onNavigate={onNavigate} />
        </div>
      </PageSection>

      {lms && lms.operadores_avaliados > 0 && (
        <PageSection
          title="Performance da equipe"
          description="Indicadores do LMS sobre o tempo trabalhado"
          meta={`${fmtNumero(lms.operadores_avaliados)} ${lms.operadores_avaliados === 1 ? "operador avaliado" : "operadores avaliados"}`}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              label="Utilização"
              help={<TermoAjuda termo="utilizacao" />}
              value={fmtPct(lms.utilizacao_pct ?? lms.taxa_ocupacao_media)}
              tone={tomAbaixo(lms.utilizacao_pct ?? 0, 85, 60)}
              context="Tempo direto ÷ tempo disponível"
              onClick={() => onNavigate("/relatorios/produtividade")}
            />
            <KpiCard
              label="Performance"
              help={<TermoAjuda termo="performance" />}
              value={fmtPct(lms.performance_pct)}
              tone={tomAbaixo(lms.performance_pct ?? 0, 90, 70)}
              context={lms.origem === "ESTIMADO" ? "Horas-padrão ÷ tempo direto · estimado" : "Horas-padrão ÷ tempo direto"}
              onClick={() => onNavigate("/relatorios/produtividade")}
            />
            <KpiCard
              label="Eficiência"
              help={<TermoAjuda termo="eficiencia" />}
              value={fmtPct(lms.eficiencia_pct)}
              tone={tomAbaixo(lms.eficiencia_pct ?? 0, 90, 70)}
              context="Horas-padrão ÷ tempo disponível"
              onClick={() => onNavigate("/relatorios/produtividade")}
            />
            <KpiCard
              label="Distribuição por faixa"
              value={fmtNumero(lms.operadores_avaliados)}
              unit="operadores"
              context={faixasTexto}
              onClick={() => onNavigate("/atividades/operadores-ativos")}
            />
          </div>
          <RankingOperadores data={ranking} loading={loading} onNavigate={onNavigate} />
        </PageSection>
      )}
    </div>
  );
}
