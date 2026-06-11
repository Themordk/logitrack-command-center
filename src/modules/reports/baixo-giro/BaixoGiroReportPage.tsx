import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { fetchBaixoGiroReport, type BaixoGiroFilter, type BaixoGiroRow } from "./baixoGiro.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateBR, type ExportColumn } from "../utils/exporters";

export function BaixoGiroReportPage() {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<BaixoGiroRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [diasLimite, setDiasLimite] = useState("90");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState("");
  const [filterSubgrupoId, setFilterSubgrupoId] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterClassificacao, setFilterClassificacao] = useState<"" | "BAIXO_GIRO" | "OBSOLETO" | "SEM_MOVIMENTO">("");
  const [filterSaldoMinimo, setFilterSaldoMinimo] = useState("");

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
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const filters: BaixoGiroFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: filterArmazemId || undefined,
        dias_limite: Number(diasLimite) || 90,
        sku: filterSku || undefined,
        marca: filterMarca || undefined,
        grupo_id: filterGrupoId || undefined,
        subgrupo_id: filterSubgrupoId || undefined,
        classificacao: (filterClassificacao || undefined) as any,
        saldo_minimo: filterSaldoMinimo ? Number(filterSaldoMinimo) : undefined,
      };
      const results = await fetchBaixoGiroReport(filters);
      setData(results);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setDiasLimite("90");
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
    setFilterMarca(""); setFilterSku(""); setFilterClassificacao(""); setFilterSaldoMinimo("");
  };

  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fmtBRL = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const classBadge = (c: BaixoGiroRow["classificacao"]) => {
    const map: Record<string, string> = {
      BAIXO_GIRO: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
      OBSOLETO: "bg-[hsl(var(--status-blocked))]/15 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30",
      SEM_MOVIMENTO: "bg-[hsl(var(--status-blocked))]/25 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/40 font-bold",
    };
    const label: Record<string, string> = {
      BAIXO_GIRO: "Baixo Giro",
      OBSOLETO: "Obsoleto",
      SEM_MOVIMENTO: "Sem Mov.",
    };
    return <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", map[c])}>{label[c]}</span>;
  };

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    { key: "descricao", label: "Descrição", width: "240px" },
    { key: "marca", label: "Marca", width: "120px" },
    { key: "saldo", label: "Saldo", align: "right", width: "100px", render: (v) => fmtNum(v) },
    { key: "preco_custo", label: "Custo Unit.", align: "right", width: "110px", render: (v) => fmtBRL(v) },
    { key: "custo_total", label: "Custo Total", align: "right", width: "130px", render: (v) => <span className="font-semibold">{fmtBRL(v)}</span> },
    {
      key: "ultima_saida", label: "Última Saída", width: "110px",
      render: (v) => v ? formatDate(v) : <span className="text-[hsl(var(--status-blocked))] font-semibold">Nunca</span>,
    },
    {
      key: "dias_sem_movimento", label: "Dias s/ Mov.", align: "right", width: "100px",
      render: (v) => v === null
        ? <span className="text-[hsl(var(--status-blocked))] font-bold">∞</span>
        : <span className={cn(v >= 180 && "text-[hsl(var(--status-blocked))] font-semibold", v >= 90 && v < 180 && "text-[hsl(var(--status-busy))]")}>{v}</span>,
    },
    { key: "classificacao", label: "Classificação", align: "center", width: "110px", render: (v) => classBadge(v) },
  ];

  const totalSkus = data.length;
  const totalSaldo = data.reduce((a, r) => a + r.saldo, 0);
  const totalCusto = data.reduce((a, r) => a + r.custo_total, 0);

  const activeFilters: Record<string, string> = { "Dias mínimos": diasLimite };
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterGrupoId) activeFilters["Grupo"] = grupos.find((g) => g.id === filterGrupoId)?.descricao || filterGrupoId;
  if (filterSubgrupoId) activeFilters["Subgrupo"] = subgrupos.find((s) => s.id === filterSubgrupoId)?.descricao || filterSubgrupoId;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterClassificacao) activeFilters["Class."] = filterClassificacao;
  if (filterSaldoMinimo) activeFilters["Saldo mín."] = filterSaldoMinimo;
  if (generated) {
    activeFilters["SKUs parados"] = `${totalSkus}`;
    activeFilters["Saldo total"] = fmtNum(totalSaldo);
    activeFilters["Capital parado"] = fmtBRL(totalCusto);
  }

  const classLabel = (c: BaixoGiroRow["classificacao"]) =>
    ({ BAIXO_GIRO: "Baixo Giro", OBSOLETO: "Obsoleto", SEM_MOVIMENTO: "Sem Movimento" } as const)[c] || c;

  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    { key: "descricao", label: "Descrição" },
    { key: "marca", label: "Marca" },
    { key: "saldo", label: "Saldo", align: "right", format: (r) => fmtNum(r.saldo) },
    { key: "preco_custo", label: "Custo Unit.", align: "right", format: (r) => fmtBRL(r.preco_custo) },
    { key: "custo_total", label: "Custo Total", align: "right", format: (r) => fmtBRL(r.custo_total) },
    { key: "ultima_saida", label: "Última Saída", format: (r) => r.ultima_saida ? fmtDateBR(r.ultima_saida) : "Nunca" },
    { key: "dias_sem_movimento", label: "Dias s/ Mov.", align: "right", format: (r) => r.dias_sem_movimento == null ? "∞" : String(r.dias_sem_movimento) },
    { key: "classificacao", label: "Classificação", format: (r) => classLabel(r.classificacao) },
  ];

  const canExport = generated && data.length > 0;
  const handleExcel = () => exportToExcel("baixo_giro", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("baixo_giro", exportColumns, data, {
      title: "Produtos de Baixo Giro / Obsoletos",
      generatedAt, usuario: usuarioNome || "—",
      total: data.length, filters: activeFilters,
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Baixo Giro / Obsoletos"
        subtitle="Produtos com saldo cuja última saída supera o período definido"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
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
                <Label className="text-xs">Dias sem movimento</Label>
                <Input type="number" min="1" className="h-8 text-xs" value={diasLimite} onChange={(e) => setDiasLimite(e.target.value)} />
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
                <Select value={filterClassificacao} onValueChange={(v) => setFilterClassificacao(v as any)}>
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

      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
