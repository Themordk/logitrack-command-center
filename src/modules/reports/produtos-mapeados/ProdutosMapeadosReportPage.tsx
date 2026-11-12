import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colDescricaoProduto, colTextoLongo, exportColDescricao } from "../components/reportColumns";
import { ParceiroFilter } from "../components/ParceiroFilter";
import {
  fetchProdutosMapeadosPage,
  fetchProdutosMapeadosAll,
  PRODUTOS_MAPEADOS_PAGE_SIZE,
  type ProdutosMapeadosFilter,
  type ProdutosMapeadoRow,
  type ProdutosMapeadosResumo,
} from "./produtosMapeados.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateTimeBR, fmtNumberBR, type ExportColumn } from "../utils/exporters";

export function ProdutosMapeadosReportPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<ProdutosMapeadoRow[]>([]);
  const [resumo, setResumo] = useState<ProdutosMapeadosResumo | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<ProdutosMapeadosFilter | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [filterSku, setFilterSku] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterParceiroId, setFilterParceiroId] = useState("");
  const [filterParceiroNome, setFilterParceiroNome] = useState("");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterRua, setFilterRua] = useState("");
  const [filterPredio, setFilterPredio] = useState("");
  const [filterNivel, setFilterNivel] = useState("");
  const [filterApto, setFilterApto] = useState("");

  const [marcas, setMarcas] = useState<string[]>([]);

  useEffect(() => {
    if (!tenantId || !empresaId) {
      setMarcas([]);
      return;
    }
    (supabase as any).rpc("fn_produto_marcas_distintas", { p_tenant_id: tenantId, p_empresa_id: empresaId })
      .then(({ data }: any) => setMarcas((data || []).map((r: any) => r.marca)));
  }, [tenantId, empresaId, empresaVersion]);

  // Reset ao trocar empresa
  useEffect(() => {
    setData([]); setResumo(null); setAppliedFilters(null); setPage(0);
    setGenerated(false); setGeneratedAt("");
    setFilterSku(""); setFilterMarca("");
    setFilterParceiroId(""); setFilterParceiroNome("");
  }, [empresaId, empresaVersion]);

  const loadPage = async (filters: ProdutosMapeadosFilter, pageIndex: number) => {
    setLoading(true);
    try {
      const result = await fetchProdutosMapeadosPage(filters, pageIndex);
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
    if (filterDataInicio && filterDataFim && filterDataFim < filterDataInicio) {
      toast.error("A data final não pode ser anterior à data inicial.");
      return;
    }
    const filters: ProdutosMapeadosFilter = {
      tenant_id: tenantId,
      empresa_id: empresaId,
      armazem_id: armazemId || undefined,
      sku: filterSku || undefined,
      marca: filterMarca || undefined,
      parceiro_id: filterParceiroId || undefined,
      data_inicio: filterDataInicio || undefined,
      data_fim: filterDataFim || undefined,
      rua: filterRua ? Number(filterRua) : undefined,
      predio: filterPredio ? Number(filterPredio) : undefined,
      nivel: filterNivel ? Number(filterNivel) : undefined,
      apto: filterApto ? Number(filterApto) : undefined,
    };
    const ok = await loadPage(filters, 0);
    if (ok) {
      setAppliedFilters(filters);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    }
  };

  const handleClear = () => {
    setFilterSku(""); setFilterMarca("");
    setFilterParceiroId(""); setFilterParceiroNome("");
    setFilterDataInicio(""); setFilterDataFim("");
    setFilterRua(""); setFilterPredio(""); setFilterNivel(""); setFilterApto("");
  };

  const semAuditoria = <span className="text-muted-foreground">—</span>;
  const fmtInt = (v: number) => Number(v).toLocaleString("pt-BR");
  const pct = (v: number, base: number) => (base > 0 ? `${((v / base) * 100).toFixed(1).replace(".", ",")}%` : "0%");

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "110px", render: (v) => <span className="font-mono text-foreground">{v}</span> },
    { key: "referencia", label: "Referência", width: "120px", render: (v) => <span className="font-mono text-[10px]">{v || "—"}</span> },
    colDescricaoProduto(),
    { key: "marca", label: "Marca", width: "110px", render: (v) => v || "—" },
    colTextoLongo({ key: "parceiro_nome", label: "Parceiro", minWidth: 180, maxWidth: 260 }),
    { key: "endereco_descricao", label: "Endereço Picking", width: "150px", render: (v) => <span className="font-mono text-[10px]">{v || "—"}</span> },
    {
      key: "skus_no_endereco", label: "SKUs no End.", width: "90px", align: "center",
      render: (v) => (
        <span className={cn(v > 1 ? "font-semibold text-[hsl(var(--status-busy))]" : "text-muted-foreground")}
          title={v > 1 ? "Endereço compartilhado por mais de um SKU" : undefined}>
          {Number(v).toLocaleString("pt-BR")}
        </span>
      ),
    },
    { key: "est_minimo", label: "Est. Mínimo", width: "100px", align: "right", render: (v) => Number(v).toLocaleString("pt-BR") },
    { key: "est_maximo", label: "Est. Máximo", width: "100px", align: "right", render: (v) => Number(v).toLocaleString("pt-BR") },
    { key: "tipo_picking", label: "Tipo", width: "100px", render: (v) => v || "—" },
    { key: "mapeado_em", label: "Mapeado em", width: "120px", render: (v) => (v ? formatDateTime(v) : semAuditoria) },
    { key: "mapeado_por", label: "Mapeado por", width: "140px", render: (v) => (v ? <span className="truncate">{v}</span> : semAuditoria) },
  ];

  const total = resumo?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PRODUTOS_MAPEADOS_PAGE_SIZE));

  const endereco = [
    filterRua && `Rua ${filterRua}`,
    filterPredio && `Prédio ${filterPredio}`,
    filterNivel && `Nível ${filterNivel}`,
    filterApto && `Apto ${filterApto}`,
  ].filter(Boolean).join(" · ");

  const activeFilters: Record<string, string> = {};
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterParceiroId) activeFilters["Parceiro"] = filterParceiroNome || filterParceiroId;
  if (filterDataInicio || filterDataFim) {
    activeFilters["Mapeado"] = `${filterDataInicio ? formatDate(filterDataInicio) : "…"} a ${filterDataFim ? formatDate(filterDataFim) : "…"}`;
  }
  if (endereco) activeFilters["Endereço"] = endereco;
  if (generated && resumo) {
    activeFilters["SKUs"] = fmtInt(resumo.qtd_skus);
    activeFilters["Endereços"] = fmtInt(resumo.qtd_enderecos);
    activeFilters["End. compartilhados"] = fmtInt(resumo.qtd_enderecos_compartilhados);
    if (resumo.qtd_sem_autoria > 0) activeFilters["Sem autoria"] = fmtInt(resumo.qtd_sem_autoria);
  }

  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    { key: "referencia", label: "Referência" },
    exportColDescricao(),
    { key: "marca", label: "Marca" },
    { key: "parceiro_nome", label: "Parceiro" },
    { key: "endereco_descricao", label: "Endereço Picking" },
    { key: "skus_no_endereco", label: "SKUs no End.", align: "center", format: (r) => fmtNumberBR(r.skus_no_endereco) },
    { key: "est_minimo", label: "Est. Mínimo", align: "right", format: (r) => fmtNumberBR(r.est_minimo) },
    { key: "est_maximo", label: "Est. Máximo", align: "right", format: (r) => fmtNumberBR(r.est_maximo) },
    { key: "tipo_picking", label: "Tipo Picking" },
    { key: "mapeado_em", label: "Mapeado em", format: (r) => fmtDateTimeBR(r.mapeado_em) },
    { key: "mapeado_por", label: "Mapeado por", format: (r) => r.mapeado_por || "" },
  ];

  const canExport = generated && total > 0 && !exporting;

  const loadAllForExport = async (): Promise<ProdutosMapeadoRow[] | null> => {
    if (!appliedFilters) return null;
    if (total <= data.length) return data;
    setExporting(true);
    try {
      return await fetchProdutosMapeadosAll(appliedFilters, total);
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
    if (rows) exportToExcel("produtos_mapeados_picking", exportColumns, rows);
  };
  const handlePdf = async () => {
    const rows = await loadAllForExport();
    if (rows) {
      exportToPdf("produtos_mapeados_picking", exportColumns, rows, {
        title: "Produtos Mapeados em Picking",
        generatedAt,
        usuario: usuarioNome || "—",
        total: rows.length,
        filters: activeFilters,
      });
    }
  };
  const handlePrint = () => window.print();

  const resumoCards: { label: string; value: string; sub?: string; tone: string; hint?: string }[] = resumo ? [
    { label: "Mapeamentos", value: fmtInt(resumo.total), tone: "text-foreground" },
    { label: "SKUs", value: fmtInt(resumo.qtd_skus), tone: "text-foreground" },
    { label: "Endereços", value: fmtInt(resumo.qtd_enderecos), tone: "text-foreground" },
    {
      label: "End. compartilhados",
      value: fmtInt(resumo.qtd_enderecos_compartilhados),
      sub: `${fmtInt(resumo.qtd_mapeamentos_compartilhados)} mapeamentos · ${pct(resumo.qtd_enderecos_compartilhados, resumo.qtd_enderecos)} dos end.`,
      tone: resumo.qtd_enderecos_compartilhados > 0 ? "text-[hsl(var(--status-busy))]" : "text-foreground",
      hint: "Endereços de picking com mais de um SKU mapeado (considera todos os mapeamentos ativos do armazém)",
    },
    {
      label: "Por tipo",
      value: `${fmtInt(resumo.qtd_fracionado)} frac.`,
      sub: `Master ${fmtInt(resumo.qtd_master)} · PDV ${fmtInt(resumo.qtd_pdv)}`,
      tone: "text-foreground",
    },
    {
      label: "Sem autoria",
      value: fmtInt(resumo.qtd_sem_autoria),
      sub: `${pct(resumo.qtd_sem_autoria, resumo.total)} sem data/usuário`,
      tone: "text-muted-foreground",
      hint: "Mapeamentos anteriores ao registro de auditoria (sem data e usuário)",
    },
  ] : [];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Produtos Mapeados em Picking"
        subtitle="Produtos com endereço de picking cadastrado e ativo"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? total : undefined}
        filters={generated ? activeFilters : undefined}
        onExportExcel={canExport ? handleExcel : undefined}
        onExportPdf={canExport ? handlePdf : undefined}
        onPrint={canExport ? handlePrint : undefined}
        exportDisabled={!canExport}
      />

      <div className="border border-border rounded-lg bg-card overflow-hidden print:hidden">
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
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                {marcas.length > 0 ? (
                  <Select value={filterMarca || "__all__"} onValueChange={(v) => setFilterMarca(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
                      {marcas.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="h-8 text-xs" placeholder="Buscar marca..." value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)} />
                )}
              </div>
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Parceiro / Fornecedor</Label>
                <ParceiroFilter
                  value={filterParceiroId || null}
                  label={filterParceiroNome}
                  onChange={(id, parceiro) => { setFilterParceiroId(id ?? ""); setFilterParceiroNome(parceiro?.razaosocial ?? ""); }}
                  tenantId={tenantId}
                  empresaId={empresaId}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mapeado de</Label>
                <Input type="date" className="h-8 text-xs" value={filterDataInicio} max={filterDataFim || undefined}
                  onChange={(e) => setFilterDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mapeado até</Label>
                <Input type="date" className="h-8 text-xs" value={filterDataFim} min={filterDataInicio || undefined}
                  onChange={(e) => setFilterDataFim(e.target.value)} />
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
            </div>
            {(filterDataInicio || filterDataFim) && (
              <p className="text-[11px] text-muted-foreground">
                Mapeamentos anteriores ao registro de auditoria não têm data nem usuário e ficam fora quando há filtro de data.
              </p>
            )}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={loading}>
                <Search size={14} />
                {loading ? "Gerando..." : "Gerar Relatório"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <X size={14} />
                Limpar
              </Button>
              {onNavigate && (
                <Button size="sm" variant="outline" onClick={() => onNavigate("/")}>
                  <ArrowLeft size={14} />
                  Voltar
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {generated && resumo && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
          {resumoCards.map((c) => (
            <div key={c.label} className="border border-border rounded-lg bg-card px-3 py-2" title={c.hint}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className={cn("text-sm font-bold tabular-nums", c.tone)}>{c.value}</div>
              {c.sub && <div className="text-[10px] text-muted-foreground tabular-nums truncate">{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {generated && <ReportTable columns={columns} data={data} loading={loading || exporting} />}

      {generated && total > PRODUTOS_MAPEADOS_PAGE_SIZE && appliedFilters && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground print:hidden">
          <span>
            {(page * PRODUTOS_MAPEADOS_PAGE_SIZE + 1).toLocaleString("pt-BR")}–
            {Math.min((page + 1) * PRODUTOS_MAPEADOS_PAGE_SIZE, total).toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
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
