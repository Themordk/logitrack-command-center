import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import {
  fetchDocumentosCancelados,
  type DocumentoCanceladoRow,
} from "./documentos-cancelados.service";
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
  FileX,
  FileInput,
  FileOutput,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatDate, nowDisplay } from "@/utils/dateTime";
import {
  exportToExcel,
  exportToPdf,
  fmtDateTimeBR,
  fmtDateBR,
  fmtNumberBR,
  type ExportColumn,
} from "../utils/exporters";

const TODOS = "__TODOS__";

export function DocumentosCanceladosPage() {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<DocumentoCanceladoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [filterTipoDocumento, setFilterTipoDocumento] = useState("");

  useEffect(() => {
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
    setFilterTipoDocumento("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!dataInicio || !dataFim) {
      toast.error("Data início e fim são obrigatórias.");
      return;
    }
    setLoading(true);
    try {
      const results = await fetchDocumentosCancelados({
        tenant_id: tenantId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        empresa_id: empresaId || null,
        tipo_documento: filterTipoDocumento || undefined,
      });
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

  const handleClear = () => setFilterTipoDocumento("");

  const totalValor = data.reduce((s, r) => s + Number(r.valor_total || 0), 0);
  const totalEntrada = data.filter((r) => r.tipo_documento === "ENTRADA").length;
  const totalSaida = data.filter((r) => r.tipo_documento === "SAIDA").length;

  const badgeStatusCls = (status: number) =>
    status === 8
      ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
      : status === 9
        ? "bg-red-500/15 text-red-400 border border-red-500/30"
        : "bg-gray-500/15 text-gray-400 border border-gray-500/30";

  const columns: ReportColumn[] = [
    {
      key: "tipo_documento",
      label: "Tipo",
      width: "90px",
      render: (v) => (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-block ${
            v === "ENTRADA"
              ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
              : "bg-yellow-500/15 text-yellow-400 border border-yellow-500/30"
          }`}
        >
          {v === "ENTRADA" ? "Entrada" : "Saída"}
        </span>
      ),
    },
    {
      key: "numero_documento",
      label: "Nº Documento",
      width: "120px",
      render: (v) => <span className="font-mono">{v ?? "—"}</span>,
    },
    {
      key: "data_documento",
      label: "Data Documento",
      width: "130px",
      render: (v) => formatDate(v),
    },
    { key: "parceiro_nome", label: "Parceiro", width: "220px" },
    { key: "tipo_doc_descricao", label: "Tipo Doc.", width: "130px" },
    {
      key: "valor_total",
      label: "Valor Total",
      width: "120px",
      align: "right",
      render: (v) => (
        <span className="font-mono">
          {Number(v ?? 0).toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "qtd_itens",
      label: "Qtd. Itens",
      width: "80px",
      align: "right",
      render: (v) => (
        <span className="font-mono">
          {Number(v ?? 0).toLocaleString("pt-BR")}
        </span>
      ),
    },
    {
      key: "status_label",
      label: "Status",
      width: "160px",
      render: (v, row) => (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-block ${badgeStatusCls(Number(row.status))}`}
        >
          {v}
        </span>
      ),
    },
    {
      key: "cancelamento_solicitado_em",
      label: "Data Cancelamento",
      width: "150px",
      render: (v) => formatDateTime(v),
    },
    { key: "cancelamento_origem", label: "Origem", width: "110px" },
    {
      key: "cancelamento_motivo",
      label: "Motivo",
      width: "180px",
      render: (v) => v || "—",
    },
  ];

  const activeFilters: Record<string, string> = {};
  activeFilters["Período"] =
    `${formatDate(dataInicio)} a ${formatDate(dataFim)}`;
  if (filterTipoDocumento) {
    activeFilters["Tipo"] =
      filterTipoDocumento === "ENTRADA" ? "Entrada (NF)" : "Saída (Pedido)";
  }

  const exportColumns: ExportColumn[] = [
    { key: "tipo_documento", label: "Tipo" },
    { key: "numero_documento", label: "Nº Documento" },
    {
      key: "data_documento",
      label: "Data Documento",
      format: (r) => fmtDateBR(r.data_documento),
    },
    { key: "parceiro_nome", label: "Parceiro" },
    { key: "parceiro_cnpj", label: "CNPJ/CPF" },
    { key: "tipo_doc_descricao", label: "Tipo Doc." },
    {
      key: "valor_total",
      label: "Valor Total",
      align: "right",
      format: (r) => fmtNumberBR(r.valor_total),
    },
    {
      key: "qtd_itens",
      label: "Qtd. Itens",
      align: "right",
      format: (r) => fmtNumberBR(r.qtd_itens),
    },
    { key: "status_label", label: "Status" },
    {
      key: "cancelamento_solicitado_em",
      label: "Data Cancelamento",
      format: (r) => fmtDateTimeBR(r.cancelamento_solicitado_em),
    },
    { key: "cancelamento_origem", label: "Origem" },
    { key: "cancelamento_motivo", label: "Motivo" },
    { key: "codigo_erp", label: "Código ERP" },
  ];

  const canExport = generated && data.length > 0;
  const handleExcel = () =>
    exportToExcel("documentos_cancelados", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("documentos_cancelados", exportColumns, data, {
      title: "Documentos Cancelados",
      generatedAt,
      usuario: usuarioNome || "—",
      total: data.length,
      filters: activeFilters,
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Documentos Cancelados"
        subtitle="Rastreabilidade de documentos cancelados pelo ERP"
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
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                <Label className="text-xs">Tipo Documento</Label>
                <Select
                  value={filterTipoDocumento || TODOS}
                  onValueChange={(v) =>
                    setFilterTipoDocumento(v === TODOS ? "" : v)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    <SelectItem value="ENTRADA">Entrada (NF)</SelectItem>
                    <SelectItem value="SAIDA">Saída (Pedido)</SelectItem>
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
                <FileX size={16} className="text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Total de Documentos
                </p>
                <p className="text-lg font-bold text-foreground">
                  {data.length.toLocaleString("pt-BR")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center">
                <DollarSign size={16} className="text-destructive" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">
                  Valor Total Cancelado
                </p>
                <p className="text-lg font-bold text-destructive">
                  {totalValor.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <FileInput size={16} className="text-yellow-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Docs. Entrada</p>
                <p className="text-lg font-bold text-foreground">
                  {totalEntrada.toLocaleString("pt-BR")}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileOutput size={16} className="text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Docs. Saída</p>
                <p className="text-lg font-bold text-foreground">
                  {totalSaida.toLocaleString("pt-BR")}
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
          emptyMessage="Nenhum documento cancelado encontrado no período selecionado."
        />
      )}
    </div>
  );
}
