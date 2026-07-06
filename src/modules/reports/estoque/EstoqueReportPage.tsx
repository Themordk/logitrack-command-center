import { useState, useEffect, useMemo } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { fetchEstoqueReport, type EstoqueFilter } from "./estoque.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeNaive, formatDate, nowDisplay } from "@/utils/dateTime";
import {
  exportToExcel,
  exportToPdf,
  fmtDateBR,
  fmtDateTimeBR,
  fmtNumberBR,
  type ExportColumn,
} from "../utils/exporters";

export function EstoqueReportPage() {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Filter states
  const [filterSku, setFilterSku] = useState("");
  const [filterTipoEndereco, setFilterTipoEndereco] = useState("");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterEan, setFilterEan] = useState("");
  const [filterTipoEstoqueId, setFilterTipoEstoqueId] = useState("");
  const [filterSetorId, setFilterSetorId] = useState("");
  const [filterCodigoEndereco, setFilterCodigoEndereco] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState("");
  const [filterSubgrupoId, setFilterSubgrupoId] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterMultiLocalizacao, setFilterMultiLocalizacao] = useState(false);
  const [filterApenasComSaldo, setFilterApenasComSaldo] = useState(true);

  // Options
  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [tiposEstoque, setTiposEstoque] = useState<{ id: string; descricao: string }[]>([]);
  const [setores, setSetores] = useState<{ id: string; descricao: string }[]>([]);
  const [grupos, setGrupos] = useState<{ id: string; descricao: string }[]>([]);
  const [subgrupos, setSubgrupos] = useState<{ id: string; descricao: string; grupo_id: string }[]>([]);
  const [marcas, setMarcas] = useState<string[]>([]);


  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]); setTiposEstoque([]); setSetores([]);
      setGrupos([]); setSubgrupos([]); setMarcas([]);
      return;
    }
    supabase.from("armazem").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }) => setArmazens(data || []));

    (supabase as any).from("tipo_estoque").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }: any) => setTiposEstoque(data || []));

    (supabase as any).from("grupo_produto").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }: any) => setGrupos(data || []));

    (supabase as any).from("subgrupo_produto").select("id, descricao, grupo_id")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }: any) => setSubgrupos(data || []));

    // Marcas distintas do tenant/empresa
    (supabase as any).from("produto").select("marca")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId)
      .not("marca", "is", null)
      .limit(1000)
      .then(({ data }: any) => {
        const set = new Set<string>();
        (data || []).forEach((p: any) => {
          const m = (p.marca || "").trim();
          if (m) set.add(m);
        });
        setMarcas(Array.from(set).sort((a, b) => a.localeCompare(b)));
      });

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
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
    setFilterArmazemId("");
    setFilterTipoEstoqueId("");
    setFilterSetorId("");
    setFilterGrupoId("");
    setFilterSubgrupoId("");
    setFilterMarca("");
    setFilterCodigoEndereco("");
    setFilterMultiLocalizacao(false);
    setFilterApenasComSaldo(true);
  }, [empresaId, empresaVersion]);

  // Subgrupo cascata: reset quando grupo muda
  useEffect(() => {
    if (filterGrupoId && filterSubgrupoId) {
      const sg = subgrupos.find((s) => s.id === filterSubgrupoId);
      if (!sg || sg.grupo_id !== filterGrupoId) setFilterSubgrupoId("");
    }
  }, [filterGrupoId, filterSubgrupoId, subgrupos]);

  const subgruposFiltrados = useMemo(
    () => (filterGrupoId ? subgrupos.filter((s) => s.grupo_id === filterGrupoId) : subgrupos),
    [filterGrupoId, subgrupos],
  );

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const codigoNum = filterCodigoEndereco.trim() ? Number(filterCodigoEndereco) : undefined;
      const filters: EstoqueFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: filterArmazemId || undefined,
        tipo_endereco: filterTipoEndereco || undefined,
        sku: filterSku || undefined,
        ean: filterEan || undefined,
        tipo_estoque_id: filterTipoEstoqueId || undefined,
        setor_id: filterSetorId || undefined,
        grupo_id: filterGrupoId || undefined,
        subgrupo_id: filterSubgrupoId || undefined,
        marca: filterMarca || undefined,
        codigo_endereco: Number.isFinite(codigoNum) ? codigoNum : undefined,
        apenas_multi_localizacao: filterMultiLocalizacao || undefined,
        apenas_com_saldo: filterApenasComSaldo,
      };
      const results = await fetchEstoqueReport(filters);
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
    setFilterSku("");
    setFilterTipoEndereco("");
    setFilterArmazemId("");
    setFilterEan("");
    setFilterTipoEstoqueId("");
    setFilterSetorId("");
    setFilterCodigoEndereco("");
    setFilterGrupoId("");
    setFilterSubgrupoId("");
    setFilterMarca("");
    setFilterMultiLocalizacao(false);
    setFilterApenasComSaldo(true);
  };

  const isExpired = (date: string) => {
    if (!date || date === "1900-01-01") return false;
    return new Date(date) < new Date();
  };

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    { key: "descricao", label: "Descrição", width: "200px" },
    { key: "marca", label: "Marca", width: "110px", render: (v) => v || "—" },
    { key: "lote", label: "Lote", width: "100px" },
    {
      key: "data_validade", label: "Validade", width: "100px",
      render: (v) => {
        if (!v || v === "1900-01-01") return "—";
        const expired = isExpired(v);
        return <span className={cn(expired && "text-[hsl(var(--status-blocked))] font-semibold")}>{formatDate(v)}</span>;
      },
    },
    {
      key: "codigo_endereco", label: "Cód. End.", align: "right", width: "80px",
      render: (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR")),
    },
    { key: "endereco_descricao", label: "Endereço", width: "140px", render: (v) => v || "—" },
    { key: "tipo_endereco", label: "Tipo Endereço", width: "110px" },
    {
      key: "quantidade_disponivel", label: "Disponível", align: "right", width: "90px",
      render: (v) => <span className={cn(v === 0 && "text-muted-foreground")}>{Number(v).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "quantidade_bloqueada", label: "Bloqueado", align: "right", width: "90px",
      render: (v) => <span className={cn(Number(v) > 0 && "text-[hsl(var(--status-busy))] font-semibold")}>{Number(v).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "quantidade_total", label: "Total", align: "right", width: "90px",
      render: (v) => <span className={cn(v === 0 && "text-muted-foreground")}>{Number(v).toLocaleString("pt-BR")}</span>,
    },
    {
      key: "atualizado_em", label: "Última Atualização", width: "150px",
      render: (v) => formatDateTimeNaive(v),
    },
  ];

  const activeFilters: Record<string, string> = {};
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find(a => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterTipoEndereco) activeFilters["Tipo"] = filterTipoEndereco;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterEan) activeFilters["EAN"] = filterEan;
  if (filterTipoEstoqueId) activeFilters["Tipo Estoque"] = tiposEstoque.find(t => t.id === filterTipoEstoqueId)?.descricao || filterTipoEstoqueId;
  if (filterSetorId) activeFilters["Setor"] = setores.find(s => s.id === filterSetorId)?.descricao || filterSetorId;
  if (filterCodigoEndereco) activeFilters["Cód. End."] = filterCodigoEndereco;
  if (filterGrupoId) activeFilters["Grupo"] = grupos.find(g => g.id === filterGrupoId)?.descricao || filterGrupoId;
  if (filterSubgrupoId) activeFilters["Subgrupo"] = subgrupos.find(s => s.id === filterSubgrupoId)?.descricao || filterSubgrupoId;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterMultiLocalizacao) activeFilters["Multi-localização"] = "Sim";
  if (filterApenasComSaldo) activeFilters["Saldo"] = "> 0";

  // Export columns (texto puro)
  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    { key: "descricao", label: "Descrição" },
    { key: "marca", label: "Marca" },
    { key: "lote", label: "Lote" },
    { key: "data_validade", label: "Validade", format: (r) => fmtDateBR(r.data_validade) },
    { key: "codigo_endereco", label: "Cód. Endereço", align: "right",
      format: (r) => (r.codigo_endereco == null ? "" : String(r.codigo_endereco)) },
    { key: "endereco_descricao", label: "Endereço" },
    { key: "tipo_endereco", label: "Tipo Endereço" },
    { key: "quantidade_disponivel", label: "Disponível", align: "right", format: (r) => fmtNumberBR(r.quantidade_disponivel) },
    { key: "quantidade_bloqueada", label: "Bloqueado", align: "right", format: (r) => fmtNumberBR(r.quantidade_bloqueada) },
    { key: "quantidade_total", label: "Total", align: "right", format: (r) => fmtNumberBR(r.quantidade_total) },
    { key: "atualizado_em", label: "Última Atualização", format: (r) => fmtDateTimeBR(r.atualizado_em) },
  ];

  const canExport = generated && data.length > 0;
  const handleExcel = () => exportToExcel("posicao_estoque", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("posicao_estoque", exportColumns, data, {
      title: "Posição de Estoque",
      generatedAt,
      usuario: usuarioNome || "—",
      total: data.length,
      filters: activeFilters,
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Posição de Estoque"
        subtitle="Relatório analítico de saldos por endereço"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
        filters={generated ? activeFilters : undefined}
        onExportExcel={canExport ? handleExcel : undefined}
        onExportPdf={canExport ? handlePdf : undefined}
        onPrint={canExport ? handlePrint : undefined}
        exportDisabled={!canExport}
      />

      {/* Filters panel */}
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId} onValueChange={setFilterArmazemId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    {armazens.map(a => (<SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>))}
                  </SelectContent>
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
                <Label className="text-xs">Tipo Estoque</Label>
                <Select value={filterTipoEstoqueId} onValueChange={setFilterTipoEstoqueId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    {tiposEstoque.map(t => (<SelectItem key={t.id} value={t.id}>{t.descricao}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Setor</Label>
                <Select value={filterSetorId} onValueChange={setFilterSetorId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    {setores.map(s => (<SelectItem key={s.id} value={s.id}>{s.descricao}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Código do Endereço</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  className="h-8 text-xs"
                  placeholder="Ex.: 1023"
                  value={filterCodigoEndereco}
                  onChange={e => setFilterCodigoEndereco(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Grupo</Label>
                <Select value={filterGrupoId} onValueChange={setFilterGrupoId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    {grupos.map(g => (<SelectItem key={g.id} value={g.id}>{g.descricao}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subgrupo</Label>
                <Select value={filterSubgrupoId} onValueChange={setFilterSubgrupoId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    {subgruposFiltrados.map(s => (<SelectItem key={s.id} value={s.id}>{s.descricao}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                {marcas.length > 0 ? (
                  <Select value={filterMarca} onValueChange={setFilterMarca}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      {marcas.map(m => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="h-8 text-xs" placeholder="Buscar marca..." value={filterMarca} onChange={e => setFilterMarca(e.target.value)} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={e => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">EAN</Label>
                <Input className="h-8 text-xs" placeholder="Buscar por EAN..." value={filterEan} onChange={e => setFilterEan(e.target.value)} />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 h-8 cursor-pointer select-none">
                  <Checkbox
                    checked={filterMultiLocalizacao}
                    onCheckedChange={(v) => setFilterMultiLocalizacao(v === true)}
                  />
                  <span className="text-xs">Apenas produtos com mais de uma localização</span>
                </label>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 h-8 cursor-pointer select-none">
                  <Checkbox
                    checked={filterApenasComSaldo}
                    onCheckedChange={(v) => setFilterApenasComSaldo(v === true)}
                  />
                  <span className="text-xs">Apenas posições com saldo</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={loading}>
                <Search size={14} />
                {loading ? "Gerando..." : "Gerar Relatório"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <X size={14} />
                Limpar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
