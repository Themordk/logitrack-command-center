import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { fetchCortesReport, fetchMotivosOcorrencia, type CortesFilter, type CorteRow } from "./cortes.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Filter, Search, X, Scissors, PackageX, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatDate, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateTimeBR, fmtNumberBR, type ExportColumn } from "../utils/exporters";

export function CortesReportPage() {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<CorteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [motivos, setMotivos] = useState<{ id: string; descricao: string }[]>([]);

  // Filters
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);
  const [filterMotivo, setFilterMotivo] = useState("");
  const [filterSku, setFilterSku] = useState("");

  useEffect(() => {
    if (tenantId) {
      fetchMotivosOcorrencia(tenantId, armazemId).then(setMotivos);
    } else {
      setMotivos([]);
    }
  }, [tenantId, armazemId, empresaId, empresaVersion]);

  // Reset relatório ao trocar empresa
  useEffect(() => {
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
    setFilterMotivo("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!dataInicio || !dataFim) {
      toast.error("Data início e fim são obrigatórias.");
      return;
    }
    setLoading(true);
    try {
      const filters: CortesFilter = {
        tenant_id: tenantId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        empresa_id: empresaId || undefined,
        motivo_ocorrencia_id: filterMotivo || undefined,
        sku: filterSku || undefined,
      };
      const results = await fetchCortesReport(filters);
      setData(results);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterMotivo("");
    setFilterSku("");
  };

  // Summary
  const totalItens = data.length;
  const totalQtd = data.reduce((s, r) => s + r.qtde_cortada, 0);
  const totalCusto = data.reduce((s, r) => s + r.custo_total_item, 0);

  const columns: ReportColumn[] = [
    { key: "numero_onda", label: "Nº Onda", width: "100px" },
    { key: "sku", label: "SKU", width: "100px" },
    { key: "descricao", label: "Descrição", width: "220px" },
    {
      key: "qtde_cortada", label: "Qtd Cortada", align: "right", width: "100px",
      render: (v) => Number(v).toLocaleString("pt-BR"),
    },
    {
      key: "preco_custo", label: "Preço Custo", align: "right", width: "110px",
      render: (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    },
    {
      key: "custo_total_item", label: "Custo Total", align: "right", width: "120px",
      render: (v) => (
        <span className="font-semibold text-destructive">
          {Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>
      ),
    },
    { key: "motivo", label: "Motivo", width: "180px" },
    { key: "usuario", label: "Autorizado por", width: "120px" },
    {
      key: "autorizado_em", label: "Autorizado em", width: "150px",
      render: (v) => formatDateTime(v),
    },
  ];

  const activeFilters: Record<string, string> = {};
  activeFilters["Período"] = `${formatDate(dataInicio)} a ${formatDate(dataFim)}`;
  if (filterMotivo) {
    const m = motivos.find((x) => x.id === filterMotivo);
    activeFilters["Motivo"] = m?.descricao ?? filterMotivo;
  }
  if (filterSku) activeFilters["SKU"] = filterSku;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Cortes de Separação"
        subtitle="Relatório analítico de itens cortados na separação"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
        filters={generated ? activeFilters : undefined}
      />

      {/* Filters */}
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Data Início *</Label>
                <Input type="date" className="h-8 text-xs" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Fim *</Label>
                <Input type="date" className="h-8 text-xs" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Motivo</Label>
                <Select value={filterMotivo} onValueChange={setFilterMotivo}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {motivos.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.descricao}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
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

      {/* Summary Cards */}
      {generated && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                <Scissors size={16} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total de Itens Cortados</p>
                <p className="text-lg font-bold text-foreground">{totalItens.toLocaleString("pt-BR")}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                <PackageX size={16} className="text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Quantidade Total Cortada</p>
                <p className="text-lg font-bold text-foreground">{totalQtd.toLocaleString("pt-BR")}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <DollarSign size={16} className="text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Custo Total dos Cortes</p>
                <p className="text-lg font-bold text-destructive">{totalCusto.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
