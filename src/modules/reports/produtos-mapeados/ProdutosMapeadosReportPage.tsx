import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import {
  fetchProdutosMapeados,
  type ProdutosMapeadosFilter,
  type ProdutosMapeadoRow,
} from "./produtosMapeados.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X, ArrowLeft } from "lucide-react";
import { nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtNumberBR, type ExportColumn } from "../utils/exporters";

export function ProdutosMapeadosReportPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<ProdutosMapeadoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [filterSku, setFilterSku] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterParceiroId, setFilterParceiroId] = useState("");

  const [marcas, setMarcas] = useState<string[]>([]);
  const [parceiros, setParceiros] = useState<{ id: string; razaosocial: string }[]>([]);

  useEffect(() => {
    if (!tenantId || !empresaId) {
      setMarcas([]);
      setParceiros([]);
      return;
    }
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

    (supabase as any).from("parceiro").select("id, razaosocial")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true)
      .order("razaosocial")
      .then(({ data }: any) => setParceiros(data || []));
  }, [tenantId, empresaId, empresaVersion]);

  // Reset ao trocar empresa
  useEffect(() => {
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
    setFilterSku("");
    setFilterMarca("");
    setFilterParceiroId("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const filters: ProdutosMapeadosFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: armazemId || undefined,
        sku: filterSku || undefined,
        marca: filterMarca || undefined,
        parceiro_id: filterParceiroId || undefined,
      };
      const results = await fetchProdutosMapeados(filters);
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
    setFilterMarca("");
    setFilterParceiroId("");
  };

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "110px", render: (v) => <span className="font-mono text-foreground">{v}</span> },
    { key: "referencia", label: "Referência", width: "120px", render: (v) => <span className="font-mono text-[10px]">{v || "—"}</span> },
    { key: "descricao", label: "Descrição", width: "280px", render: (v) => <span className="truncate block max-w-[280px]" title={v}>{v}</span> },
    { key: "marca", label: "Marca", width: "110px", render: (v) => v || "—" },
    { key: "parceiro_nome", label: "Parceiro", width: "180px", render: (v) => <span className="truncate block max-w-[180px]" title={v}>{v || "—"}</span> },
    { key: "endereco_descricao", label: "Endereço Picking", width: "160px" },
    { key: "est_minimo", label: "Est. Mínimo", width: "100px", align: "right", render: (v) => Number(v).toLocaleString("pt-BR") },
    { key: "est_maximo", label: "Est. Máximo", width: "100px", align: "right", render: (v) => Number(v).toLocaleString("pt-BR") },
    { key: "tipo_picking", label: "Tipo", width: "110px", render: (v) => v || "—" },
  ];

  const activeFilters: Record<string, string> = {};
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterParceiroId) activeFilters["Parceiro"] = parceiros.find((p) => p.id === filterParceiroId)?.razaosocial || filterParceiroId;

  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    { key: "referencia", label: "Referência" },
    { key: "descricao", label: "Descrição" },
    { key: "marca", label: "Marca" },
    { key: "parceiro_nome", label: "Parceiro" },
    { key: "endereco_descricao", label: "Endereço Picking" },
    { key: "est_minimo", label: "Est. Mínimo", align: "right", format: (r) => fmtNumberBR(r.est_minimo) },
    { key: "est_maximo", label: "Est. Máximo", align: "right", format: (r) => fmtNumberBR(r.est_maximo) },
    { key: "tipo_picking", label: "Tipo Picking" },
  ];

  const canExport = generated && data.length > 0;
  const handleExcel = () => exportToExcel("produtos_mapeados_picking", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("produtos_mapeados_picking", exportColumns, data, {
      title: "Produtos Mapeados em Picking",
      generatedAt,
      usuario: usuarioNome || "—",
      total: data.length,
      filters: activeFilters,
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Produtos Mapeados em Picking"
        subtitle="Produtos com endereço de picking cadastrado e ativo"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                {marcas.length > 0 ? (
                  <Select value={filterMarca} onValueChange={setFilterMarca}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      {marcas.map((m) => (<SelectItem key={m} value={m}>{m}</SelectItem>))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input className="h-8 text-xs" placeholder="Buscar marca..." value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parceiro / Fornecedor</Label>
                <Select value={filterParceiroId} onValueChange={setFilterParceiroId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    {parceiros.map((p) => (<SelectItem key={p.id} value={p.id}>{p.razaosocial}</SelectItem>))}
                  </SelectContent>
                </Select>
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

      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
