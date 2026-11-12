import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colDescricaoProduto, exportColDescricao } from "../components/reportColumns";
import {
  fetchValidadeLotePage, fetchValidadeLoteAll, VALIDADE_LOTE_PAGE_SIZE,
  type ValidadeLoteFilter, type ValidadeLoteRow, type ValidadeLoteResumo,
  type Criticidade, type OrdemValidade,
} from "./validadeLote.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateBR, fmtNumberBR, type ExportColumn } from "../utils/exporters";

const CRITICIDADE_LABEL: Record<Criticidade, string> = {
  VENCIDO: "Vencido", CRITICO: "Crítico", ATENCAO: "Atenção", OK: "OK",
};

const DIAS_CRITICO_PADRAO = "30";
const DIAS_ATENCAO_PADRAO = "60";

export function ValidadeLoteReportPage() {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<ValidadeLoteRow[]>([]);
  const [resumo, setResumo] = useState<ValidadeLoteResumo | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<ValidadeLoteFilter | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [diasCritico, setDiasCritico] = useState(DIAS_CRITICO_PADRAO);
  const [diasAtencao, setDiasAtencao] = useState(DIAS_ATENCAO_PADRAO);
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterSetorId, setFilterSetorId] = useState("");
  const [filterTipoEndereco, setFilterTipoEndereco] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState("");
  const [filterSubgrupoId, setFilterSubgrupoId] = useState("");
  const [filterCriticidade, setFilterCriticidade] = useState<"" | Criticidade>("");
  const [filterValidadeAte, setFilterValidadeAte] = useState("");
  const [ordem, setOrdem] = useState<OrdemValidade>("FEFO");

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [setores, setSetores] = useState<{ id: string; descricao: string }[]>([]);
  const [grupos, setGrupos] = useState<{ id: string; descricao: string }[]>([]);
  const [subgrupos, setSubgrupos] = useState<{ id: string; descricao: string }[]>([]);

  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]); setSetores([]); setGrupos([]); setSubgrupos([]);
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

    const armazemFiltro = filterArmazemId || armazemId;
    if (armazemFiltro) {
      (supabase as any).from("setor").select("id, descricao")
        .eq("tenant_id", tenantId).eq("armazem_id", armazemFiltro).eq("ativo", true).order("descricao")
        .then(({ data }: any) => setSetores(data || []));
    } else {
      setSetores([]);
    }
  }, [tenantId, empresaId, armazemId, filterArmazemId, empresaVersion]);

  // Reset relatório ao trocar empresa
  useEffect(() => {
    setData([]); setResumo(null); setAppliedFilters(null); setPage(0);
    setGenerated(false); setGeneratedAt("");
    setFilterArmazemId(""); setFilterSetorId("");
    setFilterGrupoId(""); setFilterSubgrupoId("");
  }, [empresaId, empresaVersion]);

  const loadPage = async (filters: ValidadeLoteFilter, pageIndex: number) => {
    setLoading(true);
    try {
      const result = await fetchValidadeLotePage(filters, pageIndex);
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
    const dCritico = Number(diasCritico);
    const dAtencao = Number(diasAtencao);
    if (diasCritico.trim() === "" || !Number.isInteger(dCritico) || dCritico < 0) {
      toast.error("Dias críticos deve ser um número inteiro maior ou igual a zero.");
      return;
    }
    if (diasAtencao.trim() === "" || !Number.isInteger(dAtencao) || dAtencao <= dCritico) {
      toast.error("Dias de atenção deve ser maior que os dias críticos.");
      return;
    }
    const filters: ValidadeLoteFilter = {
      tenant_id: tenantId,
      empresa_id: empresaId,
      armazem_id: filterArmazemId || undefined,
      setor_id: filterSetorId || undefined,
      tipo_endereco: filterTipoEndereco || undefined,
      sku: filterSku || undefined,
      marca: filterMarca || undefined,
      grupo_id: filterGrupoId || undefined,
      subgrupo_id: filterSubgrupoId || undefined,
      criticidade: filterCriticidade || undefined,
      validade_ate: filterValidadeAte || undefined,
      ordem,
      dias_critico: dCritico,
      dias_atencao: dAtencao,
    };
    const ok = await loadPage(filters, 0);
    if (ok) {
      setAppliedFilters(filters);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    }
  };

  const handleClear = () => {
    setDiasCritico(DIAS_CRITICO_PADRAO); setDiasAtencao(DIAS_ATENCAO_PADRAO);
    setFilterArmazemId(""); setFilterSetorId(""); setFilterTipoEndereco("");
    setFilterSku(""); setFilterMarca(""); setFilterGrupoId(""); setFilterSubgrupoId("");
    setFilterCriticidade(""); setFilterValidadeAte(""); setOrdem("FEFO");
  };

  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  const limiteCritico = appliedFilters?.dias_critico ?? Number(DIAS_CRITICO_PADRAO);
  const limiteAtencao = appliedFilters?.dias_atencao ?? Number(DIAS_ATENCAO_PADRAO);

  const criticidadeBadge = (c: Criticidade) => {
    const map: Record<Criticidade, string> = {
      VENCIDO: "bg-[hsl(var(--status-blocked))]/15 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30",
      CRITICO: "bg-[hsl(var(--status-blocked))]/10 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/20",
      ATENCAO: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
      OK: "bg-muted text-muted-foreground border-border",
    };
    return <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", map[c])}>{CRITICIDADE_LABEL[c]}</span>;
  };

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    colDescricaoProduto(),
    { key: "lote", label: "Lote", width: "100px" },
    { key: "data_fabricacao", label: "Fabricação", width: "100px", render: (v) => formatDate(v) },
    {
      key: "data_validade", label: "Validade", width: "100px",
      render: (v, row) => (
        <span className={cn(row.criticidade === "VENCIDO" && "text-[hsl(var(--status-blocked))] font-semibold")}>
          {formatDate(v)}
        </span>
      ),
    },
    {
      key: "dias_para_vencer", label: "Dias p/ Vencer", align: "right", width: "100px",
      render: (v, row) => (
        <span className={cn(
          row.criticidade === "VENCIDO" && "text-[hsl(var(--status-blocked))] font-bold",
          row.criticidade === "CRITICO" && "text-[hsl(var(--status-blocked))] font-semibold",
          row.criticidade === "ATENCAO" && "text-[hsl(var(--status-busy))]",
        )}>
          {v}
        </span>
      ),
    },
    { key: "saldo", label: "Saldo", align: "right", width: "90px", render: (v) => fmtNum(v) },
    {
      key: "saldo_bloqueado", label: "Bloqueado", align: "right", width: "90px",
      render: (v) => v > 0
        ? <span className="text-[hsl(var(--status-blocked))] font-semibold">{fmtNum(v)}</span>
        : <span className="text-muted-foreground">0</span>,
    },
    { key: "codigo_endereco", label: "Endereço", width: "120px" },
    { key: "tipo_endereco", label: "Tipo End.", width: "100px" },
    { key: "codigo_hu", label: "HU", width: "110px", render: (v) => v || <span className="text-muted-foreground">—</span> },
    { key: "criticidade", label: "Status", align: "center", width: "90px", render: (v) => criticidadeBadge(v) },
  ];

  const totalRegistros = resumo?.total_registros ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalRegistros / VALIDADE_LOTE_PAGE_SIZE));

  const activeFilters: Record<string, string> = {
    Ordem: appliedFilters?.ordem ?? ordem,
    "Crítico ≤": `${limiteCritico} dias`,
    "Atenção ≤": `${limiteAtencao} dias`,
  };
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterSetorId) activeFilters["Setor"] = setores.find((s) => s.id === filterSetorId)?.descricao || filterSetorId;
  if (filterTipoEndereco) activeFilters["Tipo"] = filterTipoEndereco;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterGrupoId) activeFilters["Grupo"] = grupos.find((g) => g.id === filterGrupoId)?.descricao || filterGrupoId;
  if (filterSubgrupoId) activeFilters["Subgrupo"] = subgrupos.find((s) => s.id === filterSubgrupoId)?.descricao || filterSubgrupoId;
  if (filterCriticidade) activeFilters["Criticidade"] = CRITICIDADE_LABEL[filterCriticidade];
  if (filterValidadeAte) activeFilters["Validade até"] = filterValidadeAte;
  if (generated && resumo) {
    activeFilters["Vencido"] = fmtNum(resumo.saldo_vencido);
    activeFilters[`Crítico ≤${limiteCritico}d`] = fmtNum(resumo.saldo_critico);
  }

  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    exportColDescricao(),
    { key: "lote", label: "Lote" },
    { key: "data_fabricacao", label: "Fabricação", format: (r) => fmtDateBR(r.data_fabricacao) },
    { key: "data_validade", label: "Validade", format: (r) => fmtDateBR(r.data_validade) },
    { key: "dias_para_vencer", label: "Dias p/ Vencer", align: "right", format: (r) => fmtNumberBR(r.dias_para_vencer) },
    { key: "saldo", label: "Saldo", align: "right", format: (r) => fmtNumberBR(r.saldo) },
    { key: "saldo_bloqueado", label: "Bloqueado", align: "right", format: (r) => fmtNumberBR(r.saldo_bloqueado) },
    { key: "codigo_endereco", label: "Endereço" },
    { key: "tipo_endereco", label: "Tipo End." },
    { key: "codigo_hu", label: "HU", format: (r) => r.codigo_hu || "—" },
    { key: "criticidade", label: "Status", format: (r) => CRITICIDADE_LABEL[r.criticidade as Criticidade] || r.criticidade },
  ];

  const canExport = generated && totalRegistros > 0 && !exporting;

  const loadAllForExport = async (): Promise<ValidadeLoteRow[] | null> => {
    if (!appliedFilters) return null;
    if (totalRegistros <= data.length) return data;
    setExporting(true);
    try {
      return await fetchValidadeLoteAll(appliedFilters, totalRegistros);
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
    if (rows) exportToExcel("validade_lote", exportColumns, rows);
  };
  const handlePdf = async () => {
    const rows = await loadAllForExport();
    if (rows) {
      exportToPdf("validade_lote", exportColumns, rows, {
        title: "Validade e Lotes",
        generatedAt, usuario: usuarioNome || "—",
        total: rows.length, filters: activeFilters,
      });
    }
  };
  const handlePrint = () => window.print();

  const resumoCards = resumo ? [
    { label: "Vencido", qtd: resumo.qtd_vencido, saldo: resumo.saldo_vencido, tone: "text-[hsl(var(--status-blocked))]" },
    { label: `Crítico ≤${limiteCritico}d`, qtd: resumo.qtd_critico, saldo: resumo.saldo_critico, tone: "text-[hsl(var(--status-blocked))]" },
    { label: `Atenção ≤${limiteAtencao}d`, qtd: resumo.qtd_atencao, saldo: resumo.saldo_atencao, tone: "text-[hsl(var(--status-busy))]" },
    { label: "OK", qtd: resumo.qtd_ok, saldo: null, tone: "text-foreground" },
  ] : [];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Validade & Lote (FEFO/FIFO)"
        subtitle="Saldos por lote ordenados por validade — destaque para itens críticos"
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
                <Label className="text-xs">Crítico até (dias)</Label>
                <Input type="number" min="0" className="h-8 text-xs" value={diasCritico} onChange={(e) => setDiasCritico(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Atenção até (dias)</Label>
                <Input type="number" min="1" className="h-8 text-xs" value={diasAtencao} onChange={(e) => setDiasAtencao(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId} onValueChange={setFilterArmazemId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Setor</Label>
                <Select value={filterSetorId} onValueChange={setFilterSetorId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo Endereço</Label>
                <Select value={filterTipoEndereco} onValueChange={setFilterTipoEndereco}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PICKING">Picking</SelectItem>
                    <SelectItem value="PULMAO">Pulmão</SelectItem>
                  </SelectContent>
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
                <Label className="text-xs">Criticidade</Label>
                <Select value={filterCriticidade} onValueChange={(v) => setFilterCriticidade(v as Criticidade)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VENCIDO">Vencido</SelectItem>
                    <SelectItem value="CRITICO">Crítico (≤{diasCritico || DIAS_CRITICO_PADRAO}d)</SelectItem>
                    <SelectItem value="ATENCAO">Atenção (≤{diasAtencao || DIAS_ATENCAO_PADRAO}d)</SelectItem>
                    <SelectItem value="OK">OK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                <Input className="h-8 text-xs" placeholder="Buscar marca..." value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Validade até</Label>
                <Input type="date" className="h-8 text-xs" value={filterValidadeAte} onChange={(e) => setFilterValidadeAte(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ordenação</Label>
                <Select value={ordem} onValueChange={(v) => setOrdem(v as OrdemValidade)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FEFO">FEFO (Validade ↑)</SelectItem>
                    <SelectItem value="FIFO">FIFO (Fabricação ↑)</SelectItem>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 print:hidden">
          {resumoCards.map((c) => (
            <div key={c.label} className="border border-border rounded-lg bg-card px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className={cn("text-sm font-bold tabular-nums", c.tone)}>
                {c.qtd.toLocaleString("pt-BR")} {c.qtd === 1 ? "posição" : "posições"}
              </div>
              {c.saldo !== null && (
                <div className="text-[10px] text-muted-foreground tabular-nums">Saldo {fmtNum(c.saldo)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {generated && <ReportTable columns={columns} data={data} loading={loading || exporting} />}

      {generated && totalRegistros > VALIDADE_LOTE_PAGE_SIZE && appliedFilters && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground print:hidden">
          <span>
            {(page * VALIDADE_LOTE_PAGE_SIZE + 1).toLocaleString("pt-BR")}–
            {Math.min((page + 1) * VALIDADE_LOTE_PAGE_SIZE, totalRegistros).toLocaleString("pt-BR")} de {totalRegistros.toLocaleString("pt-BR")}
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
