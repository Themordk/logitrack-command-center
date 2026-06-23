import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Activity, Trophy, Clock, Table as TableIcon, BarChart3, Loader2,
  FileSpreadsheet, FileText, ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList, Legend,
} from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fetchProdutividadeDiaria, fetchOperadores, fetchTurnos,
  type MetricaDiariaRow,
} from "./produtividade.service";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";

interface Props {
  onNavigate: (path: string) => void;
}

const GRID_STROKE = "hsl(222 35% 18%)";
const AXIS_FILL = "#8b8fa3";

function formatarTempo(seg: number): string {
  if (!seg || seg <= 0) return "—";
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  if (h === 0) return `${m}min`;
  return `${h}h ${m}min`;
}

function formatarNumero(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

function corTaxaOcupacao(taxa: number): string {
  if (taxa >= 85) return "text-green-400";
  if (taxa >= 70) return "text-yellow-400";
  return "text-red-400";
}

function corBarraOcupacao(taxa: number): string {
  if (taxa >= 85) return "#22c55e";
  if (taxa >= 70) return "#eab308";
  return "#ef4444";
}

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}
function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isValidISODate(s: string): boolean {
  if (!ISO_DATE_RE.test(s)) return false;
  const d = new Date(s + "T00:00:00");
  return !isNaN(d.getTime());
}
function safeFormatISO(value: string | null | undefined, pattern: string): string {
  if (!value || !ISO_DATE_RE.test(value)) return "—";
  try {
    const d = parseISO(value);
    if (isNaN(d.getTime())) return "—";
    return format(d, pattern, { locale: ptBR });
  } catch {
    return "—";
  }
}

type SortKey =
  | "data_referencia" | "usuario" | "turno" | "tarefas_concluidas"
  | "tarefas_canceladas" | "quantidade_total" | "tempo_produtivo"
  | "tempo_jornada" | "taxa_ocupacao" | "produtividade_hora"
  | "documentos_processados" | "skus_distintos";

const PAGE_SIZE = 20;

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

  const [rows, setRows] = useState<MetricaDiariaRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("data_referencia");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Carrega selects
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const [ops, tns] = await Promise.all([fetchOperadores(tenantId), fetchTurnos(tenantId)]);
      setOperadores(ops);
      setTurnos(tns);
    })();
  }, [tenantId, empresaVersion]);

  // Carrega armazéns da empresa
  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]); setArmazemId("");
      return;
    }
    (async () => {
      const { data } = await (supabase as any)
        .from("armazem")
        .select("id, descricao")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("descricao");
      setArmazens(data || []);
      setArmazemId(armazemTenant || "");
    })();
  }, [tenantId, empresaId, empresaVersion, armazemTenant]);

  const buscar = async (overrides?: { dataInicio?: string; dataFim?: string; usuarioId?: string }) => {
    if (!tenantId) return;
    const ini = overrides?.dataInicio ?? dataInicio;
    const fim = overrides?.dataFim ?? dataFim;
    const uid = overrides?.usuarioId ?? usuarioId;
    if (!ini || !fim) { toast.error("Informe o período."); return; }
    setLoading(true);
    try {
      const data = await fetchProdutividadeDiaria({
        tenantId,
        empresaId: empresaId || null,
        armazemId: armazemId || null,
        dataInicio: ini,
        dataFim: fim,
        usuarioId: uid || null,
        turnoId: turnoId || null,
      });
      setRows(data);
      setPage(1);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erro ao carregar produtividade.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // Auto-load inicial e quando empresa/armazém mudam
  useEffect(() => {
    if (tenantId) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, empresaVersion]);

  const aplicarPreset = (preset: "hoje" | "7" | "15" | "mes") => {
    let ini = dataInicio, fim = hoje();
    if (preset === "hoje") ini = hoje();
    else if (preset === "7") ini = diasAtras(7);
    else if (preset === "15") ini = diasAtras(15);
    else if (preset === "mes") ini = startOfMonth(new Date()).toISOString().slice(0, 10);
    setDataInicio(ini); setDataFim(fim);
    buscar({ dataInicio: ini, dataFim: fim });
  };

  // KPIs
  const kpis = useMemo(() => {
    if (!rows.length) {
      return {
        tarefas: 0, itens: 0, tempoProdutivo: 0, ocupacao: 0,
        produtividade: 0, cancelamentos: 0,
      };
    }
    const tarefas = rows.reduce((s, r) => s + Number(r.tarefas_concluidas || 0), 0);
    const itens = rows.reduce((s, r) => s + Number(r.quantidade_total || 0), 0);
    const tempoProdutivo = rows.reduce((s, r) => s + Number(r.tempo_produtivo || 0), 0);
    const ocupacao = rows.reduce((s, r) => s + Number(r.taxa_ocupacao || 0), 0) / rows.length;
    const produtividade = rows.reduce((s, r) => s + Number(r.produtividade_hora || 0), 0) / rows.length;
    const cancelamentos = rows.reduce((s, r) => s + Number(r.tarefas_canceladas || 0), 0);
    return { tarefas, itens, tempoProdutivo, ocupacao, produtividade, cancelamentos };
  }, [rows]);

  // Ranking (agregado por operador no período)
  const ranking = useMemo(() => {
    const map = new Map<string, {
      usuario_id: string; nome: string;
      ocupacao: number; tarefas: number; prodHora: number; count: number;
      tempoProd: number; tempoOcioso: number;
    }>();
    for (const r of rows) {
      const id = r.usuario_id;
      const cur = map.get(id) || {
        usuario_id: id, nome: r.usuario?.nome || "—",
        ocupacao: 0, tarefas: 0, prodHora: 0, count: 0, tempoProd: 0, tempoOcioso: 0,
      };
      cur.ocupacao += Number(r.taxa_ocupacao || 0);
      cur.tarefas += Number(r.tarefas_concluidas || 0);
      cur.prodHora += Number(r.produtividade_hora || 0);
      cur.tempoProd += Number(r.tempo_produtivo || 0);
      cur.tempoOcioso += Number(r.tempo_ocioso || 0);
      cur.count += 1;
      map.set(id, cur);
    }
    return Array.from(map.values())
      .map((x) => ({
        usuario_id: x.usuario_id,
        nome: x.nome,
        ocupacao: x.count ? +(x.ocupacao / x.count).toFixed(1) : 0,
        tarefas: x.tarefas,
        prodHora: x.count ? +(x.prodHora / x.count).toFixed(1) : 0,
        tempoProdHoras: +(x.tempoProd / 3600).toFixed(2),
        tempoOciosoHoras: +(x.tempoOcioso / 3600).toFixed(2),
      }))
      .sort((a, b) => b.ocupacao - a.ocupacao);
  }, [rows]);

  // Ordenação da tabela
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va = pickSort(a, sortKey);
      const vb = pickSort(b, sortKey);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
    setPage(1);
  };

  // Exports
  const exportarExcel = () => {
    const data = sortedRows.map((d) => ({
      "Data": d.data_referencia,
      "Operador": d.usuario?.nome || "—",
      "Turno": d.turno?.descricao || "—",
      "Tarefas Concluídas": d.tarefas_concluidas,
      "Canceladas": d.tarefas_canceladas,
      "Qtd. Processada": Number(d.quantidade_total),
      "Tempo Produtivo (min)": Math.round(d.tempo_produtivo / 60),
      "Tempo Jornada (min)": Math.round(d.tempo_jornada / 60),
      "Taxa Ocupação (%)": Number(d.taxa_ocupacao),
      "Produtividade/Hora": Number(d.produtividade_hora),
      "Documentos": d.documentos_processados,
      "SKUs Distintos": d.skus_distintos,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produtividade");
    XLSX.writeFile(wb, `produtividade_${hoje()}.xlsx`);
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Relatório de Produtividade Operacional", 14, 15);
    doc.setFontSize(10);
    const periodo = `${safeFormatISO(dataInicio, "dd/MM/yyyy")} a ${safeFormatISO(dataFim, "dd/MM/yyyy")}`;
    doc.text(`Período: ${periodo}`, 14, 22);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}`, 14, 28);
    autoTable(doc, {
      startY: 35,
      head: [["Data", "Operador", "Turno", "Tarefas", "Cancel.", "Qtd.", "Tempo Prod.", "Jornada", "Ocupação", "Prod./h", "Docs", "SKUs"]],
      body: sortedRows.map((d) => [
        safeFormatISO(d.data_referencia, "dd/MM/yyyy"),
        d.usuario?.nome || "—",
        d.turno?.descricao || "—",
        d.tarefas_concluidas,
        d.tarefas_canceladas,
        formatarNumero(Number(d.quantidade_total)),
        Math.round(d.tempo_produtivo / 60) + " min",
        Math.round(d.tempo_jornada / 60) + " min",
        Number(d.taxa_ocupacao).toFixed(1) + "%",
        Number(d.produtividade_hora).toFixed(1),
        d.documentos_processados,
        d.skus_distintos,
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [59, 130, 246] },
    });
    doc.save(`produtividade_${hoje()}.pdf`);
  };

  const periodoLabel = `${format(parseISO(dataInicio), "dd/MM/yyyy")} – ${format(parseISO(dataFim), "dd/MM/yyyy")}`;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Activity size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">Produtividade Operacional</h1>
            <p className="text-xs text-muted-foreground">Acompanhamento de desempenho dos operadores</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg border border-border bg-card p-3 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="Período início">
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Período fim">
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Operador">
            <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {operadores.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </Field>
          <Field label="Turno">
            <select value={turnoId} onChange={(e) => setTurnoId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {turnos.map((t) => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </Field>
          <div className="flex items-end gap-2">
            <button
              onClick={() => buscar()}
              disabled={loading}
              className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 flex items-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Filtrar
            </button>
            <button
              onClick={exportarExcel}
              disabled={!rows.length}
              title="Exportar Excel"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50"
            >
              <FileSpreadsheet size={15} className="text-green-400" />
            </button>
            <button
              onClick={exportarPDF}
              disabled={!rows.length}
              title="Exportar PDF"
              className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted/40 disabled:opacity-50"
            >
              <FileText size={15} className="text-red-400" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <PresetBtn onClick={() => aplicarPreset("hoje")}>Hoje</PresetBtn>
          <PresetBtn onClick={() => aplicarPreset("7")}>Últimos 7 dias</PresetBtn>
          <PresetBtn onClick={() => aplicarPreset("15")}>Últimos 15 dias</PresetBtn>
          <PresetBtn onClick={() => aplicarPreset("mes")}>Este mês</PresetBtn>
          <span className="ml-auto text-xs text-muted-foreground self-center">Período: <span className="text-foreground font-medium">{periodoLabel}</span></span>
        </div>
      </div>

      {/* KPIs */}
      {loading && !rows.length ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-muted rounded-lg h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Tarefas Concluídas" value={formatarNumero(kpis.tarefas)} />
          <Kpi label="Itens Processados" value={formatarNumero(Math.round(kpis.itens))} />
          <Kpi label="Tempo Produtivo" value={formatarTempo(kpis.tempoProdutivo)} />
          <Kpi label="Taxa de Ocupação" value={`${kpis.ocupacao.toFixed(1).replace(".", ",")}%`} colorClass={corTaxaOcupacao(kpis.ocupacao)} />
          <Kpi label="Produtividade / Hora" value={kpis.produtividade.toFixed(1).replace(".", ",")} />
          <Kpi label="Cancelamentos" value={formatarNumero(kpis.cancelamentos)} colorClass={kpis.cancelamentos > 0 ? "text-red-400" : undefined} />
        </div>
      )}

      {/* Gráficos */}
      {loading && !rows.length ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="animate-pulse bg-muted rounded-lg h-72" />
          <div className="animate-pulse bg-muted rounded-lg h-72" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Ranking */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={16} className="text-yellow-400" />
              <h3 className="text-sm font-semibold text-foreground">Ranking de Operadores</h3>
            </div>
            {ranking.length === 0 ? (
              <EmptyMini>Nenhum dado para o período</EmptyMini>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, ranking.length * 28 + 40)}>
                <BarChart
                  data={ranking}
                  layout="vertical"
                  margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: AXIS_FILL }} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="nome" width={120} tick={{ fontSize: 12, fill: "#e5e7eb" }} />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    contentStyle={{ background: "#1a1d27", border: "1px solid hsl(222 35% 18%)", borderRadius: 8, fontSize: 12 }}
                    formatter={(_v, _n, item: any) => null as any}
                    content={(p: any) => {
                      const it = p?.payload?.[0]?.payload;
                      if (!it) return null;
                      return (
                        <div className="rounded-md border border-border bg-card p-2 text-xs space-y-0.5">
                          <div className="font-semibold text-foreground">{it.nome}</div>
                          <div>Ocupação: <span className="font-mono" style={{ color: corBarraOcupacao(it.ocupacao) }}>{it.ocupacao}%</span></div>
                          <div>Tarefas: <span className="font-mono text-foreground">{it.tarefas}</span></div>
                          <div>Prod/hora: <span className="font-mono text-foreground">{it.prodHora}</span></div>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="ocupacao"
                    radius={[0, 4, 4, 0]}
                    onClick={(d: any) => d?.usuario_id && onNavigate(`/relatorios/produtividade/operador/${d.usuario_id}?inicio=${dataInicio}&fim=${dataFim}`)}
                    cursor="pointer"
                  >
                    {ranking.map((r) => <Cell key={r.usuario_id} fill={corBarraOcupacao(r.ocupacao)} />)}
                    <LabelList dataKey="ocupacao" position="right" formatter={(v: number) => `${v}%`} style={{ fill: "#e5e7eb", fontSize: 11 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Distribuição de Tempo */}
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Distribuição de Tempo</h3>
            </div>
            {ranking.length === 0 ? (
              <EmptyMini>Nenhum dado para o período</EmptyMini>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={ranking} margin={{ top: 4, right: 12, left: 4, bottom: 24 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                  <XAxis
                    dataKey="nome"
                    tick={{ fontSize: 11, fill: AXIS_FILL }}
                    tickFormatter={(v: string) => v.length > 12 ? v.slice(0, 12) + "…" : v}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                  />
                  <YAxis tick={{ fontSize: 11, fill: AXIS_FILL }} tickFormatter={(v) => `${v}h`} />
                  <Tooltip
                    contentStyle={{ background: "#1a1d27", border: "1px solid hsl(222 35% 18%)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => formatarTempo(Math.round(v * 3600))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="tempoProdHoras" name="Tempo Produtivo" stackId="tempo" fill="#3b82f6" />
                  <Bar dataKey="tempoOciosoHoras" name="Tempo Ocioso" stackId="tempo" fill="#6b7280" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}

      {/* Tabela */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <TableIcon size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Detalhamento por Dia</h3>
          <span className="text-xs text-muted-foreground ml-auto">{rows.length} registros</span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="animate-spin text-blue-400" />
            <span className="text-sm text-muted-foreground">Carregando dados...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <BarChart3 size={48} className="text-muted-foreground" />
            <div className="text-sm font-medium text-foreground">Nenhum dado de produtividade encontrado</div>
            <div className="text-xs text-muted-foreground">Ajuste o período ou os filtros para ver os resultados</div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs uppercase tracking-wider">
                    <Th k="data_referencia" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Data</Th>
                    <Th k="usuario" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Operador</Th>
                    <Th k="turno" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Turno</Th>
                    <Th k="tarefas_concluidas" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center">Tarefas</Th>
                    <Th k="tarefas_canceladas" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center">Canceladas</Th>
                    <Th k="quantidade_total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Qtd. Processada</Th>
                    <Th k="tempo_produtivo" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Tempo Produtivo</Th>
                    <Th k="tempo_jornada" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Tempo Jornada</Th>
                    <Th k="taxa_ocupacao" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center">Taxa Ocupação</Th>
                    <Th k="produtividade_hora" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Produt./Hora</Th>
                    <Th k="documentos_processados" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center">Documentos</Th>
                    <Th k="skus_distintos" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center">SKUs</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2.5 text-foreground">{format(parseISO(r.data_referencia), "dd/MM/yyyy")}</td>
                      <td className="px-3 py-2.5 text-foreground">{r.usuario?.nome || "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{r.turno?.descricao || "—"}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-foreground">{r.tarefas_concluidas}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${r.tarefas_canceladas > 0 ? "text-red-400" : "text-foreground"}`}>{r.tarefas_canceladas}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{formatarNumero(Number(r.quantidade_total))}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{formatarTempo(r.tempo_produtivo)}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{formatarTempo(r.tempo_jornada)}</td>
                      <td className={`px-3 py-2.5 text-center font-mono ${corTaxaOcupacao(Number(r.taxa_ocupacao))}`}>{Number(r.taxa_ocupacao).toFixed(1).replace(".", ",")}%</td>
                      <td className="px-3 py-2.5 text-right font-mono text-foreground">{Number(r.produtividade_hora).toFixed(1).replace(".", ",")}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-foreground">{r.documentos_processados}</td>
                      <td className="px-3 py-2.5 text-center font-mono text-foreground">{r.skus_distintos}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold bg-muted/30 text-foreground">
                    <td className="px-3 py-2.5" colSpan={3}>Totais / Médias</td>
                    <td className="px-3 py-2.5 text-center font-mono">{formatarNumero(kpis.tarefas)}</td>
                    <td className={`px-3 py-2.5 text-center font-mono ${kpis.cancelamentos > 0 ? "text-red-400" : ""}`}>{formatarNumero(kpis.cancelamentos)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatarNumero(Math.round(kpis.itens))}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{formatarTempo(kpis.tempoProdutivo)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">—</td>
                    <td className={`px-3 py-2.5 text-center font-mono ${corTaxaOcupacao(kpis.ocupacao)}`}>{kpis.ocupacao.toFixed(1).replace(".", ",")}%</td>
                    <td className="px-3 py-2.5 text-right font-mono">{kpis.produtividade.toFixed(1).replace(".", ",")}</td>
                    <td className="px-3 py-2.5" colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-border">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={(e) => { e.preventDefault(); setPage(Math.max(1, page - 1)); }}
                        className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink
                          isActive={page === i + 1}
                          onClick={(e) => { e.preventDefault(); setPage(i + 1); }}
                          className="cursor-pointer"
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={(e) => { e.preventDefault(); setPage(Math.min(totalPages, page + 1)); }}
                        className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ----- helpers -----
const inputCls = "h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground w-full";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function PresetBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="h-7 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      {children}
    </button>
  );
}

function Kpi({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono mt-1 ${colorClass || "text-foreground"}`}>{value}</div>
    </div>
  );
}

function EmptyMini({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center h-60 text-sm text-muted-foreground">{children}</div>
  );
}

function Th({
  k, sortKey, sortDir, onClick, children, align = "left",
}: {
  k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void; children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`px-3 py-2.5 font-medium text-${align}`}>
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 ${justify} w-full hover:text-foreground transition-colors`}>
        {children}
        <Icon size={11} className={active ? "text-primary" : "text-muted-foreground/60"} />
      </button>
    </th>
  );
}

function pickSort(r: MetricaDiariaRow, k: SortKey): string | number | null {
  switch (k) {
    case "usuario": return r.usuario?.nome || "";
    case "turno": return r.turno?.descricao || "";
    case "data_referencia": return r.data_referencia;
    default: return Number((r as any)[k] ?? 0);
  }
}
