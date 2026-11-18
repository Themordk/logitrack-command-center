import { dataLocalISO } from "@/lib/dateUtils";
import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Activity, Trophy, Clock, Table as TableIcon, BarChart3, Loader2, FileSpreadsheet, FileText,
  ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, Info, ShieldCheck, User,
} from "lucide-react";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList, Legend, ReferenceLine,
} from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fetchLmsMetricas, fetchFaixasArmazem, fetchOperadores, fetchTurnos, fetchQualidadeDado,
  type LmsLinha, type LmsTotal, type LmsTipoLinha, type ProdutividadeFilters, type QualidadeDado,
} from "./produtividade.service";
import {
  FAIXAS_PADRAO, COR_FAIXA, CLASSE_FAIXA, ROTULO_FAIXA, LIMITE_AUDITAR_SET, faixaDe, dominioEixo,
  janelaPaginas, qualidadePct, tipoDominante, composicaoHoras, formatarPct, formatarTempo, type FaixasArmazem,
} from "./produtividadeCalculo";
import { QualidadeDadoPanel } from "./QualidadeDadoPanel";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";

interface Props {
  onNavigate: (path: string) => void;
}

const GRID_STROKE = "hsl(222 35% 18%)";
const AXIS_FILL = "#8b8fa3";
const COR_DIRETO = "#3b82f6";
const COR_INDIRETO = "#a855f7";
const COR_OCIOSO = "#6b7280";
const PAGE_SIZE = 20;

const hoje = () => dataLocalISO();
function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return dataLocalISO(d);
}
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function dataBR(value: string | null | undefined): string {
  if (!value || !ISO_DATE_RE.test(value)) return "—";
  try { return format(parseISO(value), "dd/MM/yyyy", { locale: ptBR }); } catch { return "—"; }
}
const numero = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n || 0));

type SortKey =
  | "data" | "nome" | "tarefas" | "canceladas" | "quantidade" | "tempo_disponivel" | "tempo_direto"
  | "tempo_indireto" | "tempo_ocioso" | "utilizacao_pct" | "performance_pct" | "eficiencia_pct";
type MetricaRanking = "eficiencia_pct" | "performance_pct";

export function ProdutividadeDashboardPage({ onNavigate }: Props) {
  const { tenantId, empresaId, empresaVersion, armazemId: armazemTenant } = useTenant();

  const [dataInicio, setDataInicio] = useState<string>(diasAtras(7));
  const [dataFim, setDataFim] = useState<string>(hoje());
  const [armazemId, setArmazemId] = useState<string>("");
  const [usuarioId, setUsuarioId] = useState<string>("");
  const [turnoId, setTurnoId] = useState<string>("");

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [operadores, setOperadores] = useState<{ id: string; nome: string }[]>([]);
  const [turnos, setTurnos] = useState<{ id: string; descricao: string; armazem_id: string | null }[]>([]);

  const [linhasDia, setLinhasDia] = useState<LmsLinha[]>([]);
  const [porOperador, setPorOperador] = useState<LmsLinha[]>([]);
  const [porTipo, setPorTipo] = useState<LmsTipoLinha[]>([]);
  const [total, setTotal] = useState<LmsTotal | null>(null);
  const [faixas, setFaixas] = useState<FaixasArmazem>(FAIXAS_PADRAO);
  const [qualidade, setQualidade] = useState<QualidadeDado | null>(null);
  const [loading, setLoading] = useState(false);
  const [carregado, setCarregado] = useState(false);

  const [metricaRanking, setMetricaRanking] = useState<MetricaRanking>("eficiencia_pct");
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [ops, tns] = await Promise.all([fetchOperadores(tenantId), fetchTurnos(tenantId)]);
      setOperadores(ops);
      setTurnos(tns);
    })();
  }, [tenantId, empresaVersion]);

  useEffect(() => {
    if (!tenantId || !empresaId) { setArmazens([]); setArmazemId(""); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("armazem").select("id, descricao")
        .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao");
      setArmazens(data || []);
      setArmazemId(armazemTenant || "");
    })();
  }, [tenantId, empresaId, empresaVersion, armazemTenant]);

  const buscar = async (over?: Partial<Pick<ProdutividadeFilters, "dataInicio" | "dataFim">>) => {
    if (!tenantId) return;
    const f: ProdutividadeFilters = {
      tenantId,
      empresaId: empresaId || null,
      armazemId: armazemId || null,
      dataInicio: over?.dataInicio ?? dataInicio,
      dataFim: over?.dataFim ?? dataFim,
      usuarioId: usuarioId || null,
      turnoId: turnoId || null,
    };
    if (!f.dataInicio || !f.dataFim) { toast.error("Informe o período."); return; }
    if (f.dataFim < f.dataInicio) { toast.error("A data final é anterior à inicial."); return; }
    setLoading(true);
    try {
      const [dia, op, tipo, fx, q] = await Promise.all([
        fetchLmsMetricas<LmsLinha>(f, "OPERADOR_DIA"),
        fetchLmsMetricas<LmsLinha>(f, "OPERADOR"),
        fetchLmsMetricas<LmsTipoLinha>(f, "TIPO"),
        fetchFaixasArmazem(tenantId, f.armazemId),
        fetchQualidadeDado(f).catch(() => null),
      ]);
      setLinhasDia(dia.linhas);
      setPorOperador(op.linhas.filter((l) => l.tempo_disponivel > 0 || l.tempo_direto > 0));
      setTotal(op.total);
      setPorTipo(tipo.linhas);
      setFaixas(fx);
      setQualidade(q);
      setPage(1);
      setCarregado(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar produtividade.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, empresaVersion]);

  const aplicarPreset = (preset: "hoje" | "7" | "15" | "mes") => {
    const fim = hoje();
    const ini = preset === "hoje" ? fim : preset === "7" ? diasAtras(7) : preset === "15" ? diasAtras(15)
      : dataLocalISO(startOfMonth(new Date()));
    setDataInicio(ini); setDataFim(fim);
    buscar({ dataInicio: ini, dataFim: fim });
  };

  // ── derivados (só apresentação; números ponderados vêm da RPC) ──
  const dominante = useMemo(() => tipoDominante(porTipo), [porTipo]);
  const ocorrencias = useMemo(() => porOperador.reduce((s, l) => s + (l.ocorrencias || 0), 0), [porOperador]);
  const qualidadeKpi = qualidadePct(total?.tarefas || 0, ocorrencias);
  const tiposAuditar = useMemo(() => porTipo.filter((t) => (t.performance_pct ?? 0) > LIMITE_AUDITAR_SET), [porTipo]);

  const ranking = useMemo(() => [...porOperador]
    .filter((l) => l.tempo_direto > 0)
    .sort((a, b) => (b[metricaRanking] ?? -1) - (a[metricaRanking] ?? -1))
    .map((l) => ({
      usuario_id: l.usuario_id, nome: l.nome || "—",
      valor: l[metricaRanking] ?? 0,
      eficiencia: l.eficiencia_pct, performance: l.performance_pct, utilizacao: l.utilizacao_pct,
      tarefas: l.tarefas, amostra: l.amostra_suficiente, origem: l.origem,
    })), [porOperador, metricaRanking]);
  const dominioRanking = useMemo(() => dominioEixo(ranking.map((r) => r.valor), faixas.bom), [ranking, faixas]);

  const composicao = useMemo(() => [...porOperador]
    .sort((a, b) => b.tempo_disponivel - a.tempo_disponivel)
    .map((l) => ({ nome: l.nome || "—", usuario_id: l.usuario_id, utilizacao: l.utilizacao_pct, ...composicaoHoras(l) })),
  [porOperador]);

  const linhasOrdenadas = useMemo(() => {
    const arr = [...linhasDia];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = (a as any)[sortKey]; const vb = (b as any)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
    return arr;
  }, [linhasDia, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(linhasOrdenadas.length / PAGE_SIZE));
  const pageRows = linhasOrdenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "nome" || k === "data" ? "asc" : "desc"); }
    setPage(1);
  };

  const abrirDia = (l: LmsLinha) => l.usuario_id && l.data &&
    onNavigate(`/relatorios/produtividade/tarefas/${l.usuario_id}?inicio=${l.data}&fim=${l.data}`);
  const abrirOperador = (uid: string | null) => uid &&
    onNavigate(`/relatorios/produtividade/operador/${uid}?inicio=${dataInicio}&fim=${dataFim}`);

  // ── exportação ──
  const linhasExport = () => linhasOrdenadas.map((d) => ({
    "Data": dataBR(d.data), "Operador": d.nome || "—",
    "Tarefas": d.tarefas, "Canceladas": d.canceladas, "Quantidade": Number(d.quantidade),
    "Disponível (min)": Math.round(d.tempo_disponivel / 60), "Direto (min)": Math.round(d.tempo_direto / 60),
    "Indireto (min)": Math.round(d.tempo_indireto / 60), "Ocioso (min)": Math.round(d.tempo_ocioso / 60),
    "Utilização (%)": d.utilizacao_pct, "Performance (%)": d.performance_pct, "Eficiência (%)": d.eficiencia_pct,
    "Origem": d.origem === "REAL" ? "Real" : "Estimado",
  }));
  const exportarExcel = () => {
    const ws = XLSX.utils.json_to_sheet(linhasExport());
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtividade");
    XLSX.writeFile(wb, `produtividade_${hoje()}.xlsx`);
  };
  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text("Produtividade Operacional", 14, 15);
    doc.setFontSize(10);
    doc.text(`Período: ${dataBR(dataInicio)} a ${dataBR(dataFim)} · Gerado em ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 22);
    if (total) doc.text(`Utilização ${formatarPct(total.utilizacao_pct)} · Performance ${formatarPct(total.performance_pct)} · Eficiência ${formatarPct(total.eficiencia_pct)} · ${total.origem === "REAL" ? "Real" : "Estimado"}`, 14, 28);
    const linhas = linhasExport();
    autoTable(doc, {
      startY: 34,
      head: [Object.keys(linhas[0] || { Data: "" })],
      body: linhas.map((l) => Object.values(l).map((v) => (v == null ? "—" : String(v)))),
      styles: { fontSize: 7 }, headStyles: { fillColor: [59, 130, 246] },
    });
    doc.save(`produtividade_${hoje()}.pdf`);
  };

  const estimado = total?.origem === "ESTIMADO";
  const semDados = carregado && !loading && linhasDia.length === 0;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
          <Activity size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Produtividade Operacional</h1>
          <p className="text-xs text-muted-foreground">Quanto do tempo disponível virou trabalho, e em que ritmo frente ao tempo padrão</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Field label="Período início" htmlFor="prod-ini">
            <input id="prod-ini" type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Período fim" htmlFor="prod-fim">
            <input id="prod-fim" type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Armazém" htmlFor="prod-arm">
            <select id="prod-arm" value={armazemId} onChange={(e) => setArmazemId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {armazens.map((a) => <option key={a.id} value={a.id}>{a.descricao}</option>)}
            </select>
          </Field>
          <Field label="Operador" htmlFor="prod-op">
            <select id="prod-op" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {operadores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </Field>
          <Field label="Turno" htmlFor="prod-turno">
            <select id="prod-turno" value={turnoId} onChange={(e) => setTurnoId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {turnos.filter((t) => !armazemId || !t.armazem_id || t.armazem_id === armazemId)
                .map((t) => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button onClick={() => buscar()} disabled={loading}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2">
              {loading && <Loader2 size={14} className="animate-spin" />}Filtrar
            </button>
            <IconBtn onClick={exportarExcel} disabled={!linhasDia.length} label="Exportar Excel"><FileSpreadsheet size={15} className="text-green-400" /></IconBtn>
            <IconBtn onClick={exportarPDF} disabled={!linhasDia.length} label="Exportar PDF"><FileText size={15} className="text-red-400" /></IconBtn>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <PresetBtn onClick={() => aplicarPreset("hoje")}>Hoje</PresetBtn>
          <PresetBtn onClick={() => aplicarPreset("7")}>Últimos 7 dias</PresetBtn>
          <PresetBtn onClick={() => aplicarPreset("15")}>Últimos 15 dias</PresetBtn>
          <PresetBtn onClick={() => aplicarPreset("mes")}>Este mês</PresetBtn>
          <span className="ml-auto text-xs text-muted-foreground">
            Período: <span className="text-foreground font-medium">{dataBR(dataInicio)} – {dataBR(dataFim)}</span>
          </span>
        </div>
      </div>

      {/* Avisos de leitura */}
      {carregado && total && (estimado || tiposAuditar.length > 0) && (
        <div className="space-y-2">
          {estimado && (
            <Aviso cor="amber" icone={<Info size={14} />}>
              <b>Números estimados.</b> Só {formatarPct(total.pct_inicio_real)} das execuções do período têm início real
              registrado no coletor (meta: 95%). Até lá, parte do tempo direto vem do intervalo entre bipes.
            </Aviso>
          )}
          {tiposAuditar.length > 0 && (
            <Aviso cor="red" icone={<AlertTriangle size={14} />}>
              <b>Tempo padrão a revisar.</b> Performance acima de {LIMITE_AUDITAR_SET}% em{" "}
              {tiposAuditar.map((t) => `${t.codigo} (${formatarPct(t.performance_pct, 0)})`).join(", ")}.
              Isso costuma indicar SET subestimado no cadastro do tipo de tarefa, não ritmo excepcional.
            </Aviso>
          )}
        </div>
      )}

      {/* KPIs */}
      {loading && !carregado ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-lg h-24" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Utilização" value={formatarPct(total?.utilizacao_pct)}
            dica="Tempo direto ÷ tempo disponível" sub={total ? `${formatarTempo(total.tempo_direto)} de ${formatarTempo(total.tempo_disponivel)}` : undefined} />
          <Kpi label="Performance" value={formatarPct(total?.performance_pct)} colorClass={CLASSE_FAIXA[faixaDe(total?.performance_pct, faixas)]}
            dica="Horas-padrão ganhas ÷ tempo direto" sub={ROTULO_FAIXA[faixaDe(total?.performance_pct, faixas)]} />
          <Kpi label="Eficiência" value={formatarPct(total?.eficiencia_pct)} colorClass={CLASSE_FAIXA[faixaDe(total?.eficiencia_pct, faixas)]}
            dica="Horas-padrão ganhas ÷ tempo disponível" sub={`Meta ${faixas.bom}%`} />
          <Kpi label="Tarefas" value={numero(total?.tarefas || 0)}
            sub={total?.canceladas ? `${numero(total.canceladas)} canceladas` : "Nenhuma cancelada"} />
          <Kpi label={dominante ? `UPH · ${dominante.codigo}` : "UPH"}
            value={dominante?.uph != null ? dominante.uph.toFixed(1).replace(".", ",") : "—"}
            dica="Quantidade ÷ hora direta do tipo com mais tempo no período (unidades diferentes não se somam)"
            sub={dominante ? `${dominante.unidade_medida || "un"}/h direta` : undefined} />
          <Kpi label="Qualidade" value={formatarPct(qualidadeKpi)} dica="Tarefas concluídas sem ocorrência registrada"
            sub={total?.cortes ? `${numero(total.cortes)} cortes` : "Sem cortes"} />
        </div>
      )}

      {/* Gráficos */}
      {!semDados && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={16} className="text-yellow-400" />
              <h3 className="text-sm font-semibold text-foreground">Ranking por {metricaRanking === "eficiencia_pct" ? "eficiência" : "performance"}</h3>
              <div className="ml-auto inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Métrica do ranking">
                {(["eficiencia_pct", "performance_pct"] as MetricaRanking[]).map((m) => (
                  <button key={m} onClick={() => setMetricaRanking(m)} aria-pressed={metricaRanking === m}
                    className={`h-7 px-2.5 rounded text-xs ${metricaRanking === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {m === "eficiencia_pct" ? "Eficiência" : "Performance"}
                  </button>
                ))}
              </div>
            </div>
            {ranking.length === 0 ? <EmptyMini>Nenhum operador com tempo direto no período</EmptyMini> : (
              <ResponsiveContainer width="100%" height={Math.max(240, ranking.length * 30 + 50)}>
                <BarChart data={ranking} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={dominioRanking} tick={{ fontSize: 11, fill: AXIS_FILL }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12, fill: "#e5e7eb" }} />
                  <ReferenceLine x={faixas.bom} stroke="#e5e7eb" strokeDasharray="4 3"
                    label={{ value: `Meta ${faixas.bom}%`, position: "top", fill: AXIS_FILL, fontSize: 10 }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p: any) => {
                    const it = p?.payload?.[0]?.payload;
                    if (!it) return null;
                    return (
                      <div className="rounded-md border border-border bg-card p-2 text-xs space-y-0.5">
                        <div className="font-semibold text-foreground">{it.nome}</div>
                        <div>Eficiência: <span className="font-mono">{formatarPct(it.eficiencia)}</span></div>
                        <div>Performance: <span className="font-mono">{formatarPct(it.performance)}</span></div>
                        <div>Utilização: <span className="font-mono">{formatarPct(it.utilizacao)}</span></div>
                        <div>Tarefas: <span className="font-mono">{it.tarefas}</span></div>
                        {!it.amostra && <div className="text-amber-400">Amostra pequena (menos de 8 h diretas)</div>}
                        {it.origem === "ESTIMADO" && <div className="text-amber-400">Estimado</div>}
                      </div>
                    );
                  }} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]} cursor="pointer"
                    onClick={(d: any) => abrirOperador(d?.usuario_id)}>
                    {ranking.map((r) => (
                      <Cell key={r.usuario_id ?? r.nome} fill={COR_FAIXA[faixaDe(r.valor, faixas)]} fillOpacity={r.amostra ? 1 : 0.5} />
                    ))}
                    <LabelList dataKey="valor" position="right" formatter={(v: number) => formatarPct(v)} style={{ fill: "#e5e7eb", fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <LegendaFaixas faixas={faixas} />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Composição do tempo disponível</h3>
              <span className="ml-auto text-[11px] text-muted-foreground">horas · direto + indireto + ocioso = disponível</span>
            </div>
            {composicao.length === 0 ? <EmptyMini>Nenhum tempo disponível no período</EmptyMini> : (
              <ResponsiveContainer width="100%" height={Math.max(240, composicao.length * 30 + 60)}>
                <BarChart data={composicao} layout="vertical" margin={{ top: 4, right: 44, left: 8, bottom: 4 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_FILL }} tickFormatter={(v) => `${v}h`} />
                  <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 12, fill: "#e5e7eb" }} />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={(p: any) => {
                    const it = p?.payload?.[0]?.payload;
                    if (!it) return null;
                    return (
                      <div className="rounded-md border border-border bg-card p-2 text-xs space-y-0.5">
                        <div className="font-semibold text-foreground">{it.nome}</div>
                        <div>Disponível: <span className="font-mono">{formatarTempo(it.disponivel * 3600)}</span></div>
                        <div style={{ color: COR_DIRETO }}>Direto: <span className="font-mono">{formatarTempo(it.direto * 3600)}</span></div>
                        <div style={{ color: COR_INDIRETO }}>Indireto: <span className="font-mono">{formatarTempo(it.indireto * 3600)}</span></div>
                        <div className="text-muted-foreground">Ocioso: <span className="font-mono">{formatarTempo(it.ocioso * 3600)}</span></div>
                        <div>Utilização: <span className="font-mono">{formatarPct(it.utilizacao)}</span></div>
                      </div>
                    );
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="direto" name="Direto" stackId="t" fill={COR_DIRETO} />
                  <Bar dataKey="indireto" name="Indireto" stackId="t" fill={COR_INDIRETO} />
                  <Bar dataKey="ocioso" name="Ocioso" stackId="t" fill={COR_OCIOSO} radius={[0, 4, 4, 0]}>
                    <LabelList dataKey="utilizacao" position="right" formatter={(v: number) => formatarPct(v, 0)} style={{ fill: "#e5e7eb", fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Tabela operador × dia */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <TableIcon size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Operador por dia</h3>
          <span className="text-xs text-muted-foreground ml-auto">{linhasDia.length} registros · clique na linha para ver as tarefas do dia</span>
        </div>
        {loading && !carregado ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="animate-spin text-blue-400" />
            <span className="text-sm text-muted-foreground">Carregando dados...</span>
          </div>
        ) : linhasDia.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <BarChart3 size={48} className="text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">Nenhum dado de produtividade no período</div>
            <div className="text-xs text-muted-foreground">Ajuste o período ou os filtros. A consolidação roda a cada 15 minutos.</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <Th k="data" s={sortKey} d={sortDir} on={toggleSort}>Data</Th>
                    <Th k="nome" s={sortKey} d={sortDir} on={toggleSort}>Operador</Th>
                    <Th k="tarefas" s={sortKey} d={sortDir} on={toggleSort} align="center">Tarefas</Th>
                    <Th k="canceladas" s={sortKey} d={sortDir} on={toggleSort} align="center">Cancel.</Th>
                    <Th k="quantidade" s={sortKey} d={sortDir} on={toggleSort} align="right">Qtd.</Th>
                    <Th k="tempo_disponivel" s={sortKey} d={sortDir} on={toggleSort} align="right" title="Tempo logado no coletor dentro do turno, menos o intervalo">Disponível</Th>
                    <Th k="tempo_direto" s={sortKey} d={sortDir} on={toggleSort} align="right">Direto</Th>
                    <Th k="tempo_indireto" s={sortKey} d={sortDir} on={toggleSort} align="right">Indireto</Th>
                    <Th k="tempo_ocioso" s={sortKey} d={sortDir} on={toggleSort} align="right">Ocioso</Th>
                    <Th k="utilizacao_pct" s={sortKey} d={sortDir} on={toggleSort} align="center">Utilização</Th>
                    <Th k="performance_pct" s={sortKey} d={sortDir} on={toggleSort} align="center">Performance</Th>
                    <Th k="eficiencia_pct" s={sortKey} d={sortDir} on={toggleSort} align="center">Eficiência</Th>
                    <th className="px-3 py-2.5 font-medium text-center">Origem</th>
                    <th className="px-2 py-2.5" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.chave} className="border-b border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => abrirDia(r)} title="Ver as tarefas deste operador neste dia">
                      <td className="px-3 py-2.5 text-foreground whitespace-nowrap">{dataBR(r.data)}</td>
                      <td className="px-3 py-2.5 text-foreground">{r.nome || "—"}</td>
                      <td className="px-3 py-2.5 text-center font-mono">{r.tarefas}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${r.canceladas > 0 ? "text-red-400" : ""}`}>{r.canceladas}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{numero(r.quantidade)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatarTempo(r.tempo_disponivel)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatarTempo(r.tempo_direto)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatarTempo(r.tempo_indireto)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatarTempo(r.tempo_ocioso)}</td>
                      <td className="px-3 py-2.5 text-center font-mono">{formatarPct(r.utilizacao_pct)}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${CLASSE_FAIXA[faixaDe(r.performance_pct, faixas)]}`}>{formatarPct(r.performance_pct)}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${CLASSE_FAIXA[faixaDe(r.eficiencia_pct, faixas)]}`}>{formatarPct(r.eficiencia_pct)}</td>
                      <td className="px-3 py-2.5 text-center"><OrigemBadge origem={r.origem} pct={r.pct_inicio_real} /></td>
                      <td className="px-2 py-2.5 text-right">
                        <button aria-label={`Ver período de ${r.nome}`} title="Ver o período deste operador"
                          onClick={(e) => { e.stopPropagation(); abrirOperador(r.usuario_id); }}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted/60 text-muted-foreground hover:text-foreground">
                          <User size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {total && (
                  <tfoot>
                    <tr className="font-bold bg-muted/30 text-foreground">
                      <td className="px-3 py-2.5" colSpan={2} title="Totais somados; percentuais ponderados pelo tempo (não é média dos dias)">Total do período</td>
                      <td className="px-3 py-2.5 text-center font-mono">{numero(total.tarefas)}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${total.canceladas > 0 ? "text-red-400" : ""}`}>{numero(total.canceladas)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{numero(total.quantidade)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatarTempo(total.tempo_disponivel)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatarTempo(total.tempo_direto)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatarTempo(total.tempo_indireto)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{formatarTempo(total.tempo_ocioso)}</td>
                      <td className="px-3 py-2.5 text-center font-mono">{formatarPct(total.utilizacao_pct)}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${CLASSE_FAIXA[faixaDe(total.performance_pct, faixas)]}`}>{formatarPct(total.performance_pct)}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${CLASSE_FAIXA[faixaDe(total.eficiencia_pct, faixas)]}`}>{formatarPct(total.eficiencia_pct)}</td>
                      <td className="px-3 py-2.5 text-center"><OrigemBadge origem={total.origem} pct={total.pct_inicio_real} /></td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-border flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
                <Pagination className="justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious onClick={(e) => { e.preventDefault(); setPage(Math.max(1, page - 1)); }}
                        className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                    {janelaPaginas(page, totalPages).map((n) => (
                      <PaginationItem key={n}>
                        <PaginationLink isActive={page === n} onClick={(e) => { e.preventDefault(); setPage(n); }} className="cursor-pointer">{n}</PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext onClick={(e) => { e.preventDefault(); setPage(Math.min(totalPages, page + 1)); }}
                        className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>

      {/* Qualidade do dado (Fase 4.3) */}
      {qualidade && (
        <div className="rounded-lg border border-border bg-card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <ShieldCheck size={16} className="text-primary" />
            <h3 className="text-sm font-semibold text-foreground">Qualidade do dado</h3>
            <span className="text-xs text-muted-foreground ml-auto">o quanto dá para confiar nos tempos acima</span>
          </div>
          <QualidadeDadoPanel dados={qualidade} />
        </div>
      )}
    </div>
  );
}

// ----- componentes locais -----
const inputCls = "h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground w-full";

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function PresetBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
      {children}
    </button>
  );
}

function IconBtn({ children, onClick, disabled, label }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; label: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={label} aria-label={label}
      className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50">
      {children}
    </button>
  );
}

function Kpi({ label, value, colorClass, sub, dica }: { label: string; value: string; colorClass?: string; sub?: string; dica?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4" title={dica}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        {label}{dica && <Info size={11} className="text-muted-foreground/60" aria-hidden />}
      </div>
      <div className={`text-2xl font-bold font-mono mt-1 ${colorClass || "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</div>}
    </div>
  );
}

function Aviso({ cor, icone, children }: { cor: "amber" | "red"; icone: React.ReactNode; children: React.ReactNode }) {
  const cls = cor === "amber" ? "border-amber-500/40 bg-amber-500/10 text-amber-200" : "border-red-500/40 bg-red-500/10 text-red-200";
  return <div role="status" className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${cls}`}><span className="mt-0.5">{icone}</span><div>{children}</div></div>;
}

function OrigemBadge({ origem, pct }: { origem: "REAL" | "ESTIMADO"; pct: number | null }) {
  const real = origem === "REAL";
  return (
    <span title={`Execuções com início real: ${formatarPct(pct)}`}
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${real ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"}`}>
      {real ? "Real" : "Estimado"}
    </span>
  );
}

function LegendaFaixas({ faixas }: { faixas: FaixasArmazem }) {
  const itens: Array<[keyof typeof COR_FAIXA, string]> = [
    ["CRITICO", `< ${faixas.atencao}%`], ["ATENCAO", `${faixas.atencao}–${faixas.bom}%`],
    ["BOM", `${faixas.bom}–${faixas.excelente}%`], ["EXCELENTE", `≥ ${faixas.excelente}%`],
  ];
  return (
    <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted-foreground">
      {itens.map(([f, t]) => (
        <span key={f} className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COR_FAIXA[f] }} />{ROTULO_FAIXA[f]} {t}
        </span>
      ))}
      <span>· barra clara = amostra pequena</span>
    </div>
  );
}

function EmptyMini({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-60 text-sm text-muted-foreground">{children}</div>;
}

function Th({ k, s, d, on, children, align = "left", title }: {
  k: SortKey; s: SortKey; d: "asc" | "desc"; on: (k: SortKey) => void; children: React.ReactNode;
  align?: "left" | "right" | "center"; title?: string;
}) {
  const active = s === k;
  const Icon = active ? (d === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`px-3 py-2.5 font-medium text-${align}`} title={title}
      aria-sort={active ? (d === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={() => on(k)} className={`inline-flex items-center gap-1 ${justify} w-full hover:text-foreground transition-colors`}>
        {children}
        <Icon size={11} className={active ? "text-primary" : "text-muted-foreground/60"} />
      </button>
    </th>
  );
}
