import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { fetchMovimentacoesReport, getTipoMovimentoLabel, getTipoMovimentoColor, type MovimentacoesFilter } from "./movimentacoes.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function MovimentacoesReportPage() {
  const { tenantId, empresaId } = useTenant();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Filters
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);
  const [filterSku, setFilterSku] = useState("");
  const [filterTipoMov, setFilterTipoMov] = useState("");

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!dataInicio || !dataFim) {
      toast.error("Data início e fim são obrigatórias.");
      return;
    }
    setLoading(true);
    try {
      const filters: MovimentacoesFilter = {
        tenant_id: tenantId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        empresa_id: empresaId || undefined,
        sku: filterSku || undefined,
        tipo_movimento: filterTipoMov ? Number(filterTipoMov) : undefined,
      };
      const results = await fetchMovimentacoesReport(filters);
      setData(results);
      setGeneratedAt(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
      setGenerated(true);
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterSku("");
    setFilterTipoMov("");
  };

  const columns: ReportColumn[] = [
    {
      key: "criado_em", label: "Data/Hora", width: "150px",
      render: (v) => v ? new Date(v).toLocaleString("pt-BR") : "—",
    },
    { key: "sku", label: "SKU", width: "100px" },
    { key: "descricao", label: "Descrição", width: "200px" },
    { key: "lote", label: "Lote", width: "100px" },
    { key: "hu_id", label: "HU", width: "100px", render: (v) => v && v !== "00000000-0000-0000-0000-000000000000" ? v.substring(0, 8) + "..." : "—" },
    { key: "origem", label: "Origem", width: "100px" },
    { key: "destino", label: "Destino", width: "100px" },
    {
      key: "tipo_movimento", label: "Tipo Movimento", width: "140px",
      render: (v) => (
        <span className={cn("font-medium", getTipoMovimentoColor(v))}>
          {getTipoMovimentoLabel(v)}
        </span>
      ),
    },
    {
      key: "quantidade", label: "Quantidade", align: "right", width: "100px",
      render: (v) => Number(v).toLocaleString("pt-BR"),
    },
    { key: "usuario", label: "Usuário", width: "120px" },
  ];

  const activeFilters: Record<string, string> = {};
  activeFilters["Período"] = `${new Date(dataInicio).toLocaleDateString("pt-BR")} a ${new Date(dataFim).toLocaleDateString("pt-BR")}`;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterTipoMov) activeFilters["Tipo"] = getTipoMovimentoLabel(Number(filterTipoMov));

  return (
    <div className="space-y-4">
      <ReportHeader
        title="Histórico de Movimentações"
        subtitle="Relatório analítico de movimentos de estoque"
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
                <Input type="date" className="h-8 text-xs" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Fim *</Label>
                <Input type="date" className="h-8 text-xs" value={dataFim} onChange={e => setDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={e => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo Movimento</Label>
                <Select value={filterTipoMov} onValueChange={setFilterTipoMov}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Entrada</SelectItem>
                    <SelectItem value="2">Saída</SelectItem>
                    <SelectItem value="3">Transferência</SelectItem>
                    <SelectItem value="4">Armazenagem</SelectItem>
                    <SelectItem value="5">Separação</SelectItem>
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
            </div>
          </div>
        )}
      </div>

      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
