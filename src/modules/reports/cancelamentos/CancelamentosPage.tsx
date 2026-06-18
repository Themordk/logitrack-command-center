import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import {
  fetchCancelamentos,
  fetchTiposTarefa,
  fetchUsuariosAtivos,
  type CancelamentoRow,
  type CancelamentosFilter,
} from "./cancelamentos.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Filter,
  Search,
  X,
  Ban,
  PackageX,
  Layers,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatDate, nowDisplay } from "@/utils/dateTime";
import {
  exportToExcel,
  exportToPdf,
  fmtDateTimeBR,
  fmtNumberBR,
  type ExportColumn,
} from "../utils/exporters";

export function CancelamentosPage() {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioNome } =
    useTenant();
  const [data, setData] = useState<CancelamentoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [tiposTarefa, setTiposTarefa] = useState<
    { id: string; codigo: string; descricao: string }[]
  >([]);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([]);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [filterTipoTarefa, setFilterTipoTarefa] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterUsuario, setFilterUsuario] = useState("");

  useEffect(() => {
    if (!tenantId) {
      setTiposTarefa([]);
      setUsuarios([]);
      return;
    }
    fetchTiposTarefa(tenantId).then(setTiposTarefa);
    fetchUsuariosAtivos(tenantId).then(setUsuarios);
  }, [tenantId, empresaVersion]);

  useEffect(() => {
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
    setFilterTipoTarefa("");
    setFilterUsuario("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!dataInicio || !dataFim) {
      toast.error("Data início e fim são obrigatórias.");
      return;
    }
    setLoading(true);
    try {
      const filters: CancelamentosFilter = {
        tenant_id: tenantId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        empresa_id: empresaId || undefined,
        armazem_id: armazemId || undefined,
        tipo_tarefa_id: filterTipoTarefa || undefined,
        sku: filterSku || undefined,
        usuario_corte_id: filterUsuario || undefined,
      };
      const results = await fetchCancelamentos(filters);
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
    setFilterTipoTarefa("");
    setFilterSku("");
    setFilterUsuario("");
  };

  // KPIs
  const totalRegistros = data.length;
  const totalQtdCancelada = data.reduce((s, r) => s + r.qtd_cancelada, 0);
  const tiposAfetados = new Set(data.map((r) => r.tipo_tarefa)).size;
  const periodoTexto = (() => {
    if (!data.length) return "—";
    const datas = data
      .map((r) => r.concluido_em)
      .filter(Boolean)
      .map((d) => new Date(d as string).getTime());
    if (!datas.length) return "—";
    const min = new Date(Math.min(...datas));
    const max = new Date(Math.max(...datas));
    return `${formatDate(min.toISOString())} → ${formatDate(max.toISOString())}`;
  })();

  const columns: ReportColumn[] = [
    {
      key: "concluido_em",
      label: "Data Cancelamento",
      width: "150px",
      render: (v) => formatDateTime(v),
    },
    { key: "tipo_tarefa", label: "Tipo Tarefa", width: "120px" },
    { key: "sku", label: "SKU", width: "110px" },
    { key: "descricao", label: "Produto", width: "260px" },
    {
      key: "qtd_requerida",
      label: "Qtd. Requerida",
      align: "right",
      width: "110px",
      render: (v) => (
        <span className="font-mono">{Number(v).toLocaleString("pt-BR")}</span>
      ),
    },
    {
      key: "qtd_cancelada",
      label: "Qtd. Cancelada",
      align: "right",
      width: "110px",
      render: (v) => (
        <span
          className={`font-mono ${Number(v) > 0 ? "text-destructive font-semibold" : ""}`}
        >
          {Number(v).toLocaleString("pt-BR")}
        </span>
      ),
    },
    { key: "operador", label: "Operador", width: "140px" },
    { key: "cancelado_por", label: "Cancelado por", width: "140px" },
    { key: "motivo", label: "Motivo", width: "160px" },
    { key: "endereco_origem", label: "End. Origem", width: "110px" },
  ];

  const activeFilters: Record<string, string> = {};
  activeFilters["Período"] = `${formatDate(dataInicio)} a ${formatDate(dataFim)}`;
  if (filterTipoTarefa) {
    const t = tiposTarefa.find((x) => x.id === filterTipoTarefa);
    activeFilters["Tipo"] = t?.descricao ?? filterTipoTarefa;
  }
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterUsuario) {
    const u = usuarios.find((x) => x.id === filterUsuario);
    activeFilters["Cancelado por"] = u?.nome ?? filterUsuario;
  }

  const exportColumns: ExportColumn[] = [
    {
      key: "concluido_em",
      label: "Data Cancelamento",
      format: (r) => fmtDateTimeBR(r.concluido_em),
    },
    { key: "tipo_tarefa", label: "Tipo Tarefa" },
    { key: "sku", label: "SKU" },
    { key: "descricao", label: "Produto" },
    {
      key: "qtd_requerida",
      label: "Qtd. Requerida",
      align: "right",
      format: (r) => fmtNumberBR(r.qtd_requerida),
    },
    {
      key: "qtd_cancelada",
      label: "Qtd. Cancelada",
      align: "right",
      format: (r) => fmtNumberBR(r.qtd_cancelada),
    },
    { key: "operador", label: "Operador" },
    { key: "cancelado_por", label: "Cancelado por" },
    { key: "motivo", label: "Motivo" },
    { key: "endereco_origem", label: "End. Origem" },
  ];

  const canExport = generated && data.length > 0;
  const handleExcel = () =>
    exportToExcel("cancelamentos_tarefas", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("cancelamentos_tarefas", exportColumns, data, {
      title: "Cancelamentos de Tarefas",
      generatedAt,
      usuario: usuarioNome || "—",
      total: data.length,
      filters: activeFilters,
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Cancelamentos de Tarefas"
        subtitle="Rastreabilidade de execuções canceladas"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
        filters={generated ? activeFilters : undefined}
        onExportExcel={canExport ? handleExcel : undefined}
        onExportPdf={canExport ? handlePdf : undefined}
        onPrint={canExport ? handlePrint : undefined}
        exportDisabled={!canExport}
      />

      {/* Filters */}
      <div className="border border-border rounded-lg bg-card overflow-hidden">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Filter size={14} /> Filtros
          </span>
          <span className="text-muted-foreground">
            {showFilters ? "Ocultar" : "Mostrar"}
          </span>
        </button>
        {showFilters && (
          <div className="border-t border-border p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Data Início *</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={dataInicio}
                  onChange={(e) => setDataInicio(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Fim *</Label>
                <Input
                  type="date"
                  className="h-8 text-xs"
                  value={dataFim}
                  onChange={(e) => setDataFim(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Tarefa</Label>
                <Select
                  value={filterTipoTarefa}
                  onValueChange={setFilterTipoTarefa}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {tiposTarefa.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.descricao}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input
                  className="h-8 text-xs"
                  placeholder="Buscar SKU..."
                  value={filterSku}
                  onChange={(e) => setFilterSku(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Cancelado por</Label>
                <Select value={filterUsuario} onValueChange={setFilterUsuario}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.nome}
                      </SelectItem>
                    ))}
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

      {/* KPIs */}
      {generated && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <Ban size={16} className="text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Total de Cancelamentos
                </p>
                <p className="text-lg font-bold text-foreground">
                  {totalRegistros.toLocaleString("pt-BR")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <PackageX size={16} className="text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Qtd. Total Cancelada
                </p>
                <p className="text-lg font-bold text-destructive">
                  {totalQtdCancelada.toLocaleString("pt-BR")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <Layers size={16} className="text-yellow-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Tipos de Tarefa Afetados
                </p>
                <p className="text-lg font-bold text-foreground">
                  {tiposAfetados.toLocaleString("pt-BR")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Calendar size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Período</p>
                <p className="text-sm font-bold text-foreground">
                  {periodoTexto}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {generated && (
        <ReportTable
          columns={columns}
          data={data}
          loading={loading}
          emptyMessage="Nenhum cancelamento encontrado no período selecionado."
        />
      )}
    </div>
  );
}
