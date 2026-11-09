import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colDescricaoProduto, exportColDescricao } from "../components/reportColumns";
import {
  fetchBaixoGiroPage, fetchBaixoGiroAll, BAIXO_GIRO_PAGE_SIZE,
  type BaixoGiroFilter, type BaixoGiroRow, type BaixoGiroResumo,
  type BaixoGiroClassificacao, type BaixoGiroOrdenacao,
} from "./baixoGiro.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateBR, type ExportColumn } from "../utils/exporters";

const CLASS_LABEL: Record<BaixoGiroClassificacao, string> = {
  BAIXO_GIRO: "Baixo Giro",
  OBSOLETO: "Obsoleto",
  SEM_MOVIMENTO: "Sem Movimento",
};

const ORDENACAO_LABEL: Record<BaixoGiroOrdenacao, string> = {
  DIAS_DESC: "Mais dias parado",
  CUSTO_DESC: "Maior custo total",
  SALDO_DESC: "Maior saldo",
  SKU_ASC: "SKU (A–Z)",
};

export function BaixoGiroReportPage() {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<BaixoGiroRow[]>([]);
  const [resumo, setResumo] = useState<BaixoGiroResumo | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<BaixoGiroFilter | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [diasBaixoGiro, setDiasBaixoGiro] = useState("90");
  const [diasObsoleto, setDiasObsoleto] = useState("180");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState("");
  const [filterSubgrupoId, setFilterSubgrupoId] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterClassificacao, setFilterClassificacao] = useState<"" | BaixoGiroClassificacao>("");
  const [filterSaldoMinimo, setFilterSaldoMinimo] = useState("");
  const [ordenacao, setOrdenacao] = useState<BaixoGiroOrdenacao>("DIAS_DESC");

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [grupos, setGrupos] = useState<{ id: string; descricao: string }[]>([]);
  const [subgrupos, setSubgrupos] = useState<{ id: string; descricao: string }[]>([]);

  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]); setGrupos([]); setSubgrupos([]);
      return;
    }
    supabase.from("armazem").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }) => setArmazens(data || []));
    (supabase as any).from("grupo_produto").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }: any) => setGrupos(data || []));
    (supabase as any).from("subgrupo_produto").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).order("descricao")
      .then(({ data }: any) => setSubgrupos(data || []));
  }, [tenantId, empresaId, empresaVersion]);

  // Reset relatório ao trocar empresa
  useEffect(() => {
    setData([]); setResumo(null); setAppliedFilters(null); setPage(0);
    setGenerated(false); setGeneratedAt("");
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
  }, [empresaId, empresaVersion]);

  const loadPage = async (filters: BaixoGiroFilter, pageIndex: number) => {
    setLoading(true);
    try {
      const result = await fetchBaixoGiroPage(filters, pageIndex);
      setData(result.rows);
      setResumo(result.resumo);
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
    const dBaixo = Number(diasBaixoGiro);
    const dObs = Number(diasObsoleto);
    if (!Number.isInteger(dBaixo) || dBaixo < 1) {
      toast.error("Dias de baixo giro deve ser um número inteiro maior que zero.");
      return;
    }
    if (!Number.isInteger(dObs) || dObs <= dBaixo) {
      toast.error("Dias de obsoleto deve ser maior que os dias de baixo giro.");
      return;
    }
    const filters: BaixoGiroFilter = {
      tenant_id: tenantId,
      empresa_id: empresaId,
      armazem_id: filterArmazemId || undefined,
      dias_baixo_giro: dBaixo,
      dias_obsoleto: dObs,
      sku: filterSku || undefined,
      marca: filterMarca || undefined,
      grupo_id: filterGrupoId || undefined,
      subgrupo_id: filterSubgrupoId || undefined,
      classificacao: filterClassificacao || undefined,
      saldo_minimo: filterSaldoMinimo ? Number(filterSaldoMinimo) : undefined,
      ordenacao,
    };
    const ok = await loadPage(filters, 0);
    if (ok) {
      setAppliedFilters(filters);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    }
  };

  const handleClear = () => {
    setDiasBaixoGiro("90"); setDiasObsoleto("180");
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
    setFilterMarca(""); setFilterSku(""); setFilterClassificacao(""); setFilterSaldoMinimo("");
    setOrdenacao("DIAS_DESC");
  };

  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fmtBRL = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const classBadge = (c: BaixoGiroClassificacao) => {
    const map: Record<BaixoGiroClassificacao, string> = {
      BAIXO_GIRO: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
      OBSOLETO: "bg-[hsl(var(--status-blocked))]/15 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30",
      SEM_MOVIMENTO: "bg-[hsl(var(--status-blocked))]/25 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/40 font-bold",
    };
    const label: Record<BaixoGiroClassificacao, string> = { BAIXO_GIRO: "Baixo Giro", OBSOLETO: "Obsoleto", SEM_MOVIMENTO: "Sem Mov." };
    return <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", map[c])}>{label[c]}</span>;
  };

  const limiteObs = appliedFilters?.dias_obsoleto ?? 180;
  const limiteBaixo = appliedFilters?.dias_baixo_giro ?? 90;

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    colDescricaoProduto(),
    { key: "marca", label: "Marca", width: "120px" },
    { key: "saldo", label: "Saldo", align: "right", width: "100px", render: (v) => fmtNum(v) },
    { key: "preco_custo", label: "Custo Unit.", align: "right", width: "110px", render: (v) => fmtBRL(v) },
    { key: "custo_total", label: "Custo Total", align: "right", width: "130px", render: (v) => <span className="font-semibold">{fmtBRL(v)}</span> },
    {
      key: "ultima_saida", label: "Última Saída", width: "110px",
      render: (v) => v ? formatDate(v) : <span className="text-[hsl(var(--status-blocked))] font-semibold">Nunca</span>,
    },
    {
      key: "entrada_mais_antiga", label: "Entrada + Antiga", width: "120px",
      render: (v) => v ? formatDate(v) : "—",
    },
    {
      key: "dias_parado", label: "Dias Parado", align: "right", width: "100px",
      render: (v) => v === null
        ? "—"
        : <span className={cn(v >= limiteObs && "text-[hsl(var(--status-blocked))] font-semibold", v >= limiteBaixo && v < limiteObs && "text-[hsl(var(--status-busy))]")}>{v}</span>,
    },
    { key: "classificacao", label: "Classificação", align: "center", width: "110px", render: (v) => classBadge(v) },
  ];

  const totalRegistros = resumo?.total_registros ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / BAIXO_GIRO_PAGE_SIZE));

  const activeFilters: Record<string, string> = {
    "Baixo giro ≥": `${appliedFilters?.dias_baixo_giro ?? diasBaixoGiro} dias`,
    "Obsoleto ≥": `${appliedFilters?.dias_obsoleto ?? diasObsoleto} dias`,
  };
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterGrupoId) activeFilters["Grupo"] = grupos.find((g) => g.id === filterGrupoId)?.descricao || filterGrupoId;
  if (filterSubgrupoId) activeFilters["Subgrupo"] = subgrupos.find((s) => s.id === filterSubgrupoId)?.descricao || filterSubgrupoId;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterClassificacao) activeFilters["Class."] = CLASS_LABEL[filterClassificacao];
  if (filterSaldoMinimo) activeFilters["Saldo mín."] = filterSaldoMinimo;
  if (generated && resumo) {
    activeFilters["SKUs parados"] = `${resumo.total_registros}`;
    activeFilters["Saldo total"] = fmtNum(resumo.total_saldo);
    activeFilters["Capital parado"] = fmtBRL(resumo.total_custo);
  }

  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    exportColDescricao(),
    { key: "marca", label: "Marca" },
    { key: "grupo_descricao", label: "Grupo", format: (r) => r.grupo_descricao || "" },
    { key: "saldo", label: "Saldo", align: "right", format: (r) => fmtNum(r.saldo) },
    { key: "preco_custo", label: "Custo Unit.", align: "right", format: (r) => fmtBRL(r.preco_custo) },
    { key: "custo_total", label: "Custo Total", align: "right", format: (r) => fmtBRL(r.custo_total) },
    { key: "ultima_saida", label: "Última Saída", format: (r) => r.ultima_saida ? fmtDateBR(r.ultima_saida) : "Nunca" },
    { key: "entrada_mais_antiga", label: "Entrada + Antiga", format: (r) => r.entrada_mais_antiga ? fmtDateBR(r.entrada_mais_antiga) : "—" },
    { key: "dias_parado", label: "Dias Parado", align: "right", format: (r) => r.dias_parado == null ? "—" : String(r.dias_parado) },
    { key: "classificacao", label: "Classificação", format: (r) => CLASS_LABEL[r.classificacao as BaixoGiroClassificacao] || r.classificacao },
  ];

  const canExport = generated && totalRegistros > 0 && !exporting;

  const loadAllForExport = async (): Promise<BaixoGiroRow[] | null> => {
    if (!appliedFilters) return null;
    if (totalRegistros <= data.length) return data;
    setExporting(true);
    try {
      return await fetchBaixoGiroAll(appliedFilters, totalRegistros);
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
    if (rows) exportToExcel("baixo_giro", exportColumns, rows);
  };
  const handlePdf = async () => {
    const rows = await loadAllForExport();
    if (rows) {
      exportToPdf("baixo_giro", exportColumns, rows, {
        title: "Produtos de Baixo Giro / Obsoletos",
        generatedAt, usuario: usuarioNome || "—",
        total: rows.length, filters: activeFilters,
      });
    }
  };
  const handlePrint = () => window.print();

  const resumoCards = resumo ? [
    { label: "Baixo Giro", value: resumo.qtd_baixo_giro.toLocaleString("pt-BR"), tone: "text-[hsl(var(--status-busy))]" },
    { label: "Obsoleto", value: resumo.qtd_obsoleto.toLocaleString("pt-BR"), tone: "text-[hsl(var(--status-blocked))]" },
    { label: "Sem Movimento", value: resumo.qtd_sem_movimento.toLocaleString("pt-BR"), tone: "text-[hsl(var(--status-blocked))]" },
    { label: "Capital parado", value: fmtBRL(resumo.total_custo), tone: "text-foreground" },
    { label: "SKUs sem custo", value: resumo.qtd_sem_custo.toLocaleString("pt-BR"), tone: "text-muted-foreground" },
  ] : [];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Baixo Giro / Obsoletos"
        subtitle="Produtos com saldo sem saída (Saída/Separação) há mais dias que o limite definido"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? totalRegistros : undefined}
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
              <div className="space-y-1.5">
                <Label className="text-xs">Baixo giro a partir de (dias)</Label>
                <Input type="number" min="1" className="h-8 text-xs" value={diasBaixoGiro} onChange={(e) => setDiasBaixoGiro(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Obsoleto a partir de (dias)</Label>
                <Input type="number" min="2" className="h-8 text-xs" value={diasObsoleto} onChange={(e) => setDiasObsoleto(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId} onValueChange={setFilterArmazemId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Grupo</Label>
                <Select value={filterGrupoId} onValueChange={setFilterGrupoId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subgrupo</Label>
                <Select value={filterSubgrupoId} onValueChange={setFilterSubgrupoId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{subgrupos.map((s) => <SelectItem key={s.id} value={s.id}>{s.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Classificação</Label>
                <Select value={filterClassificacao} onValueChange={(v) => setFilterClassificacao(v as BaixoGiroClassificacao)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXO_GIRO">Baixo Giro</SelectItem>
                    <SelectItem value="OBSOLETO">Obsoleto</SelectItem>
                    <SelectItem value="SEM_MOVIMENTO">Sem Movimento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                <Input className="h-8 text-xs" placeholder="Buscar marca..." value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Saldo mínimo</Label>
                <Input type="number" min="0" className="h-8 text-xs" placeholder="0" value={filterSaldoMinimo} onChange={(e) => setFilterSaldoMinimo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ordenar por</Label>
                <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as BaixoGiroOrdenacao)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ORDENACAO_LABEL) as BaixoGiroOrdenacao[]).map((k) => (
                      <SelectItem key={k} value={k}>{ORDENACAO_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
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

      {generated && resumo && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 print:hidden">
          {resumoCards.map((c) => (
            <div key={c.label} className="border border-border rounded-lg bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className={cn("text-sm font-bold tabular-nums", c.tone)}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {generated && <ReportTable columns={columns} data={data} loading={loading || exporting} />}

      {generated && totalRegistros > BAIXO_GIRO_PAGE_SIZE && appliedFilters && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground print:hidden">
          <span>
            {(page * BAIXO_GIRO_PAGE_SIZE + 1).toLocaleString("pt-BR")}–
            {Math.min((page + 1) * BAIXO_GIRO_PAGE_SIZE, totalRegistros).toLocaleString("pt-BR")} de {totalRegistros.toLocaleString("pt-BR")}
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
