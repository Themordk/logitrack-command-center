import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colDescricaoProduto, exportColDescricao } from "../components/reportColumns";
import {
  fetchInventarioPage,
  fetchInventarioAll,
  fetchInventariosLookup,
  INVENTARIO_PAGE_SIZE,
  type InventarioFilter,
  type InventarioRow,
  type InventarioKpis,
  type StatusItem,
  type Severidade,
  type TipoExecucao,
} from "./inventario.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateTimeBR, fmtNumberBR, type ExportColumn } from "../utils/exporters";

const STATUS_LABEL: Record<StatusItem, string> = {
  CONFORME: "Conforme",
  SOBRA: "Sobra",
  FALTA: "Falta",
  PENDENTE: "Pendente",
};

const TIPO_EXECUCAO_LABEL: Record<TipoExecucao, string> = {
  AUDITORIA: "Auditoria",
  ATUALIZACAO: "Atualização",
};

const SEVERIDADE_LABEL: Record<Severidade, string> = {
  OK: "OK",
  PEQUENA: "Pequena",
  MEDIA: "Média",
  GRANDE: "Grande",
};

export function InventarioReportPage() {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<InventarioRow[]>([]);
  const [kpis, setKpis] = useState<InventarioKpis | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<InventarioFilter | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Filtros
  const [inventarioId, setInventarioId] = useState<string>("");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterRua, setFilterRua] = useState("");
  const [filterPredio, setFilterPredio] = useState("");
  const [filterNivel, setFilterNivel] = useState("");
  const [filterApto, setFilterApto] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | StatusItem>("");
  const [filterSeveridade, setFilterSeveridade] = useState<"" | Severidade>("");
  const [apenasDivergentes, setApenasDivergentes] = useState(false);
  const [filterTipoExecucao, setFilterTipoExecucao] = useState<"" | TipoExecucao>("");

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [inventarios, setInventarios] = useState<any[]>([]);

  // Lookups
  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]); setInventarios([]);
      return;
    }
    supabase.from("armazem").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }) => setArmazens(data || []));
    fetchInventariosLookup(tenantId, empresaId || undefined).then((rows) => {
      setInventarios(rows);
      // default: último finalizado
      const lastFinal = rows.find((r: any) => r.status === "FINALIZADO" || r.status === "CONCLUIDO");
      if (lastFinal) setInventarioId(lastFinal.id);
      else if (rows[0]) setInventarioId(rows[0].id);
    });
  }, [tenantId, empresaId, empresaVersion]);

  // Reset relatório ao trocar empresa
  useEffect(() => {
    setData([]); setKpis(null); setAppliedFilters(null); setPage(0);
    setGenerated(false); setGeneratedAt("");
    setFilterArmazemId("");
  }, [empresaId, empresaVersion]);

  const loadPage = async (filters: InventarioFilter, pageIndex: number) => {
    setLoading(true);
    try {
      const result = await fetchInventarioPage(filters, pageIndex);
      setData(result.rows);
      setKpis(result.kpis);
      setPage(pageIndex);
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao gerar relatório.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!empresaId) {
      toast.error("Selecione uma empresa para gerar o relatório.");
      return;
    }
    if (filterDataInicio && filterDataFim && filterDataFim < filterDataInicio) {
      toast.error("A data final da contagem não pode ser anterior à data inicial.");
      return;
    }
    const filters: InventarioFilter = {
      tenant_id: tenantId,
      empresa_id: empresaId,
      inventario_id: inventarioId || undefined,
      armazem_id: filterArmazemId || undefined,
      data_contagem_inicio: filterDataInicio || undefined,
      data_contagem_fim: filterDataFim || undefined,
      sku: filterSku || undefined,
      rua: filterRua ? Number(filterRua) : undefined,
      predio: filterPredio ? Number(filterPredio) : undefined,
      nivel: filterNivel ? Number(filterNivel) : undefined,
      apto: filterApto ? Number(filterApto) : undefined,
      status: filterStatus || undefined,
      severidade: filterSeveridade || undefined,
      apenas_divergentes: apenasDivergentes,
      tipo_execucao: filterTipoExecucao || undefined,
    };
    const ok = await loadPage(filters, 0);
    if (ok) {
      setAppliedFilters(filters);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    }
  };

  const handleClear = () => {
    setFilterArmazemId(""); setFilterSku("");
    setFilterDataInicio(""); setFilterDataFim("");
    setFilterRua(""); setFilterPredio(""); setFilterNivel(""); setFilterApto("");
    setFilterStatus(""); setFilterSeveridade(""); setApenasDivergentes(false);
    setFilterTipoExecucao("");
  };

  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fmtPct = (v: number) => `${Number(v).toFixed(2)}%`;
  const fmtBRL = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusBadge = (s: StatusItem) => {
    const map: Record<StatusItem, string> = {
      CONFORME: "bg-[hsl(var(--status-free))]/15 text-[hsl(var(--status-free))] border-[hsl(var(--status-free))]/30",
      SOBRA: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
      FALTA: "bg-[hsl(var(--status-blocked))]/15 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30",
      PENDENTE: "bg-muted text-muted-foreground border-border",
    };
    return <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", map[s])}>{STATUS_LABEL[s]}</span>;
  };

  const accClass = (v: number) => {
    if (v >= 98) return "text-[hsl(var(--status-free))]";
    if (v >= 95) return "text-[hsl(var(--status-busy))]";
    return "text-[hsl(var(--status-blocked))]";
  };

  const diffClass = (v: number) => {
    if (v === 0) return "text-[hsl(var(--status-free))]";
    if (v > 0) return "text-[hsl(var(--status-busy))]";
    return "text-[hsl(var(--status-blocked))]";
  };

  const columns: ReportColumn[] = [
    { key: "numero_inventario", label: "Inventário", width: "90px", render: (v) => <span className="font-mono text-foreground">#{v}</span> },
    { key: "sku", label: "SKU", width: "110px", render: (v) => <span className="font-mono font-semibold">{v}</span> },
    colDescricaoProduto(),
    { key: "endereco", label: "Endereço", width: "150px", render: (v) => <span className="font-mono text-[10px]">{v}</span> },
    {
      key: "data_contagem", label: "Data Contagem", width: "120px",
      render: (v) => v ? formatDateTime(v) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "tipo_execucao", label: "Tipo", align: "center", width: "95px",
      render: (v) => (
        <span className={cn(
          "inline-block px-2 py-0.5 rounded text-[10px] font-semibold border",
          v === "AUDITORIA"
            ? "bg-primary/10 text-primary border-primary/30"
            : "bg-muted text-muted-foreground border-border",
        )}>
          {TIPO_EXECUCAO_LABEL[v as TipoExecucao] || v}
        </span>
      ),
    },
    {
      key: "usuario_contagem", label: "Contado por", width: "140px",
      render: (v) => v ? <span className="truncate">{v}</span> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "numero_contagens", label: "Contagens", align: "center", width: "80px",
      render: (v, row) => row.status_calc === "PENDENTE" ? <span className="text-muted-foreground">—</span> : `${v}ª`,
    },
    { key: "qtd_sistemica", label: "Qtd. Sist.", align: "right", width: "90px", render: (v) => fmtNum(v) },
    {
      key: "qtd_contada", label: "Qtd. Cont.", align: "right", width: "90px",
      render: (v, row) => row.status_calc === "PENDENTE" ? <span className="text-muted-foreground">—</span> : fmtNum(v),
    },
    {
      key: "diferenca", label: "Diferença", align: "right", width: "90px",
      render: (v, row) => row.status_calc === "PENDENTE"
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-semibold", diffClass(v))}>{v > 0 ? "+" : ""}{fmtNum(v)}</span>,
    },
    {
      key: "diferenca_pct", label: "Dif. %", align: "right", width: "80px",
      render: (v, row) => row.status_calc === "PENDENTE"
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-semibold", diffClass(row.diferenca))}>{v > 0 ? "+" : ""}{fmtPct(v)}</span>,
    },
    {
      key: "impacto_financeiro", label: "Impacto R$", align: "right", width: "110px",
      render: (v, row) => row.status_calc === "PENDENTE"
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn(v > 0 && "text-[hsl(var(--status-blocked))] font-semibold")}>{fmtBRL(v)}</span>,
    },
    {
      key: "acuracidade_item", label: "Acur. %", align: "right", width: "80px",
      render: (v, row) => row.status_calc === "PENDENTE"
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-bold", accClass(v))}>{fmtPct(v)}</span>,
    },
    { key: "status_calc", label: "Status", align: "center", width: "100px", render: (v) => statusBadge(v) },
  ];

  // Highlight rows: GRANDE recebe tinta de fundo vermelha
  const enrichedData = data.map((r) => ({
    ...r,
    _rowClass: r.severidade === "GRANDE" ? "bg-[hsl(var(--status-blocked))]/5" : undefined,
  }));

  const totalItens = kpis?.total_itens ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / INVENTARIO_PAGE_SIZE));

  // KPIs no header
  const activeFilters: Record<string, string> = {};
  if (inventarioId) {
    const inv = inventarios.find((i) => i.id === inventarioId);
    if (inv) activeFilters["Inventário"] = `#${inv.numero_inventario}`;
  } else {
    activeFilters["Inventário"] = "Todos";
  }
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterDataInicio || filterDataFim) {
    activeFilters["Contagem"] = `${filterDataInicio ? formatDate(filterDataInicio) : "…"} a ${filterDataFim ? formatDate(filterDataFim) : "…"}`;
  }
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterStatus) activeFilters["Status"] = STATUS_LABEL[filterStatus];
  if (filterSeveridade) activeFilters["Severidade"] = SEVERIDADE_LABEL[filterSeveridade];
  if (filterTipoExecucao) activeFilters["Tipo"] = TIPO_EXECUCAO_LABEL[filterTipoExecucao];
  if (apenasDivergentes) activeFilters["Apenas divergentes"] = "Sim";

  if (generated && kpis) {
    const contados = kpis.itens_conformes + kpis.itens_divergentes > 0;
    activeFilters["Acur. Qtd"] = contados ? fmtPct(kpis.acuracidade_ponderada_qtd) : "—";
    activeFilters["Acur. Item"] = contados ? fmtPct(kpis.acuracidade_por_item) : "—";
    activeFilters["Acur. R$"] = contados ? fmtPct(kpis.acuracidade_ponderada_valor) : "—";
    activeFilters["Conformes"] = `${kpis.itens_conformes}`;
    activeFilters["Divergentes"] = `${kpis.itens_divergentes}`;
    if (kpis.itens_pendentes > 0) activeFilters["Pendentes"] = `${kpis.itens_pendentes}`;
    activeFilters["Sobra"] = fmtNum(kpis.total_sobra);
    activeFilters["Falta"] = fmtNum(kpis.total_falta);
    activeFilters["Impacto R$"] = fmtBRL(kpis.impacto_total);
  }

  const exportColumns: ExportColumn[] = [
    { key: "numero_inventario", label: "Inventário", format: (r) => `#${r.numero_inventario}` },
    { key: "sku", label: "SKU" },
    exportColDescricao(),
    { key: "endereco", label: "Endereço" },
    { key: "data_contagem", label: "Data Contagem", format: (r) => fmtDateTimeBR(r.data_contagem) },
    { key: "tipo_execucao", label: "Tipo", format: (r) => TIPO_EXECUCAO_LABEL[r.tipo_execucao as TipoExecucao] || r.tipo_execucao },
    { key: "usuario_contagem", label: "Contado por", format: (r) => r.usuario_contagem || "" },
    { key: "numero_contagens", label: "Contagens", align: "center", format: (r) => r.status_calc === "PENDENTE" ? "" : `${r.numero_contagens}ª` },
    { key: "qtd_sistemica", label: "Qtd. Sist.", align: "right", format: (r) => fmtNumberBR(r.qtd_sistemica) },
    { key: "qtd_contada", label: "Qtd. Cont.", align: "right", format: (r) => r.status_calc === "PENDENTE" ? "" : fmtNumberBR(r.qtd_contada) },
    { key: "diferenca", label: "Diferença", align: "right", format: (r) => r.status_calc === "PENDENTE" ? "" : `${r.diferenca > 0 ? "+" : ""}${fmtNumberBR(r.diferenca)}` },
    { key: "diferenca_pct", label: "Dif. %", align: "right", format: (r) => r.status_calc === "PENDENTE" ? "" : `${r.diferenca_pct > 0 ? "+" : ""}${fmtPct(r.diferenca_pct)}` },
    { key: "impacto_financeiro", label: "Impacto R$", align: "right", format: (r) => r.status_calc === "PENDENTE" ? "" : fmtBRL(r.impacto_financeiro) },
    { key: "acuracidade_item", label: "Acur. %", align: "right", format: (r) => r.status_calc === "PENDENTE" ? "" : fmtPct(r.acuracidade_item) },
    { key: "status_calc", label: "Status", format: (r) => STATUS_LABEL[r.status_calc as StatusItem] || r.status_calc },
    { key: "severidade", label: "Severidade", format: (r) => SEVERIDADE_LABEL[r.severidade as Severidade] || r.severidade },
  ];

  const canExport = generated && totalItens > 0 && !exporting;

  const loadAllForExport = async (): Promise<InventarioRow[] | null> => {
    if (!appliedFilters) return null;
    if (totalItens <= data.length) return data;
    setExporting(true);
    try {
      return await fetchInventarioAll(appliedFilters, totalItens);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao carregar dados para exportação.");
      return null;
    } finally {
      setExporting(false);
    }
  };

  const handleExcel = async () => {
    const rows = await loadAllForExport();
    if (rows) exportToExcel("inventario", exportColumns, rows);
  };
  const handlePdf = async () => {
    const rows = await loadAllForExport();
    if (rows) {
      exportToPdf("inventario", exportColumns, rows, {
        title: "Inventário – Apuração",
        generatedAt, usuario: usuarioNome || "—",
        total: rows.length, filters: activeFilters,
      });
    }
  };
  const handlePrint = () => window.print();

  // Sem itens contados não há acuracidade a medir: "—" neutro, não 0% em vermelho.
  const temContados = !!kpis && kpis.itens_conformes + kpis.itens_divergentes > 0;
  const acurCard = (label: string, v: number) => temContados
    ? { label, value: fmtPct(v), tone: accClass(v) }
    : { label, value: "—", tone: "text-muted-foreground" };
  const kpiCards = kpis ? [
    acurCard("Acur. Quantidade", kpis.acuracidade_ponderada_qtd),
    acurCard("Acur. por Item", kpis.acuracidade_por_item),
    acurCard("Acur. Valor", kpis.acuracidade_ponderada_valor),
    { label: "Divergentes", value: `${kpis.itens_divergentes.toLocaleString("pt-BR")} de ${(kpis.itens_conformes + kpis.itens_divergentes).toLocaleString("pt-BR")}`, tone: "text-foreground" },
    { label: "Pendentes", value: kpis.itens_pendentes.toLocaleString("pt-BR"), tone: "text-muted-foreground" },
    { label: "Impacto R$", value: fmtBRL(kpis.impacto_total), tone: kpis.impacto_total > 0 ? "text-[hsl(var(--status-blocked))]" : "text-foreground" },
  ] : [];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Acuracidade de Inventário"
        subtitle="Comparativo entre estoque sistêmico e contagem física"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? totalItens : undefined}
        filters={generated ? activeFilters : undefined}
        onExportExcel={canExport ? handleExcel : undefined}
        onExportPdf={canExport ? handlePdf : undefined}
        onPrint={canExport ? handlePrint : undefined}
        exportDisabled={!canExport}
      />

      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors"
        >
          <span className="flex items-center gap-2"><Filter size={14} /> Filtros</span>
          <span className="text-muted-foreground">{showFilters ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showFilters && (
          <div className="border-t border-border p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Inventário</Label>
                <Select value={inventarioId || "__all__"} onValueChange={(v) => setInventarioId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {inventarios.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        #{i.numero_inventario} {i.descricao ? `· ${i.descricao}` : ""} ({i.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contagem de</Label>
                <Input type="date" className="h-8 text-xs" value={filterDataInicio} max={filterDataFim || undefined}
                  onChange={(e) => setFilterDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Contagem até</Label>
                <Input type="date" className="h-8 text-xs" value={filterDataFim} min={filterDataInicio || undefined}
                  onChange={(e) => setFilterDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId} onValueChange={setFilterArmazemId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as StatusItem)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONFORME">Conforme</SelectItem>
                    <SelectItem value="SOBRA">Sobra</SelectItem>
                    <SelectItem value="FALTA">Falta</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Severidade</Label>
                <Select value={filterSeveridade} onValueChange={(v) => setFilterSeveridade(v as Severidade)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OK">OK</SelectItem>
                    <SelectItem value="PEQUENA">Pequena (≤5%)</SelectItem>
                    <SelectItem value="MEDIA">Média (≤20%)</SelectItem>
                    <SelectItem value="GRANDE">Grande (&gt;20%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rua</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterRua} onChange={(e) => setFilterRua(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prédio</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterPredio} onChange={(e) => setFilterPredio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nível</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterNivel} onChange={(e) => setFilterNivel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Apto</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterApto} onChange={(e) => setFilterApto(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de execução</Label>
                <Select value={filterTipoExecucao || "__all__"}
                  onValueChange={(v) => setFilterTipoExecucao(v === "__all__" ? "" : (v as TipoExecucao))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    <SelectItem value="AUDITORIA">Auditoria</SelectItem>
                    <SelectItem value="ATUALIZACAO">Atualização</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex items-end">
                <label className="flex items-center gap-2 text-xs cursor-pointer h-8">
                  <input
                    type="checkbox"
                    checked={apenasDivergentes}
                    onChange={(e) => setApenasDivergentes(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Apenas divergentes</span>
                </label>
              </div>
            </div>
            {(filterDataInicio || filterDataFim) && (
              <p className="text-[11px] text-muted-foreground">
                Com filtro de data, itens ainda não contados (pendentes) não entram no relatório.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={loading}>
                <Search size={14} />{loading ? "Gerando..." : "Gerar Relatório"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <X size={14} />Limpar
              </Button>
            </div>
          </div>
        )}
      </div>

      {generated && kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
          {kpiCards.map((c) => (
            <div key={c.label} className="border border-border rounded-lg bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className={cn("text-sm font-bold tabular-nums", c.tone)}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {generated && <ReportTable columns={columns} data={enrichedData} loading={loading || exporting} />}

      {generated && totalItens > INVENTARIO_PAGE_SIZE && appliedFilters && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground print:hidden">
          <span>
            {(page * INVENTARIO_PAGE_SIZE + 1).toLocaleString("pt-BR")}–
            {Math.min((page + 1) * INVENTARIO_PAGE_SIZE, totalItens).toLocaleString("pt-BR")} de {totalItens.toLocaleString("pt-BR")}
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={loading || page === 0}
            onClick={() => loadPage(appliedFilters, page - 1)}>
            <ChevronLeft size={14} />
          </Button>
          <span>Página {page + 1} de {totalPaginas}</span>
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={loading || page + 1 >= totalPaginas}
            onClick={() => loadPage(appliedFilters, page + 1)}>
            <ChevronRight size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
