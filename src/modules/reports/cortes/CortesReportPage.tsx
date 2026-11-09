import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colDescricaoProduto, exportColDescricao } from "../components/reportColumns";
import { MultiSelectFilter } from "../components/MultiSelectFilter";
import {
  fetchCortesReport,
  fetchMotivosCorte,
  fetchUsuariosTenant,
  labelMetodoCorte,
  extrairMensagemErroCortes,
  type CortesFilter,
  type CorteRow,
  type MotivoCorteOption,
} from "./cortes.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Filter, Search, X, Scissors, PackageX, DollarSign, PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime, formatDate, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateTimeBR, fmtNumberBR, type ExportColumn } from "../utils/exporters";

/** Data local em yyyy-MM-dd (evita o deslocamento de fuso do toISOString). */
function fmtDataLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function CortesReportPage() {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<CorteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [motivos, setMotivos] = useState<MotivoCorteOption[]>([]);

  // Filters
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return fmtDataLocal(d);
  });
  const [dataFim, setDataFim] = useState(() => fmtDataLocal(new Date()));
  const [filterMotivos, setFilterMotivos] = useState<string[]>([]);
  const [filterSku, setFilterSku] = useState("");
  const [filterAutorizador, setFilterAutorizador] = useState("TODOS");
  const [filterTemSaldo, setFilterTemSaldo] = useState<"TODOS" | "SIM" | "NAO">("TODOS");
  const [usuarios, setUsuarios] = useState<{ id: string; login: string; nome: string | null }[]>([]);

  useEffect(() => {
    if (tenantId) fetchUsuariosTenant(tenantId).then(setUsuarios);
    else setUsuarios([]);
  }, [tenantId]);

  useEffect(() => {
    if (tenantId) {
      fetchMotivosCorte(tenantId).then(setMotivos);
    } else {
      setMotivos([]);
    }
  }, [tenantId]);

  // Reset relatório ao trocar empresa
  useEffect(() => {
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
    setFilterMotivos([]);
    setFilterTemSaldo("TODOS");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!empresaId) {
      toast.error("Selecione uma empresa para gerar o relatório.");
      return;
    }
    if (!dataInicio || !dataFim) {
      toast.error("Data início e fim são obrigatórias.");
      return;
    }
    setLoading(true);
    try {
      const motivoIds = motivos
        .filter((m) => filterMotivos.includes(m.descricao))
        .flatMap((m) => m.motivo_ids);
      const filters: CortesFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        motivo_ids: motivoIds.length ? motivoIds : undefined,
        sku: filterSku || undefined,
        usuario_autorizou_id: filterAutorizador === "TODOS" ? undefined : filterAutorizador,
        tem_saldo: filterTemSaldo === "TODOS" ? undefined : filterTemSaldo,
      };
      const results = await fetchCortesReport(filters);
      setData(results);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    } catch (err) {
      console.error(err);
      toast.error(extrairMensagemErroCortes(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterMotivos([]);
    setFilterSku("");
    setFilterAutorizador("TODOS");
    setFilterTemSaldo("TODOS");
  };

  // Summary
  const totalItens = data.length;
  const totalQtd = data.reduce((s, r) => s + r.qtde_cortada, 0);
  const totalCusto = data.reduce((s, r) => s + r.custo_total, 0);
  const comSaldo = data.filter((r) => r.tem_saldo === "SIM");
  const totalComSaldo = comSaldo.length;
  const custoComSaldo = comSaldo.reduce((s, r) => s + r.custo_total, 0);

  const columns: ReportColumn[] = [
    { key: "numero_onda", label: "Nº Onda", width: "100px" },
    { key: "sku", label: "SKU", width: "100px" },
    colDescricaoProduto(),
    {
      key: "qtde_cortada", label: "Qtd Cortada", align: "right", width: "100px",
      render: (v) => Number(v).toLocaleString("pt-BR"),
    },
    {
      key: "saldo_disponivel_no_corte", label: "Saldo Disp. no Corte", align: "right", width: "130px",
      render: (v) =>
        v === null || v === undefined ? (
          <span className="text-muted-foreground" title="Corte anterior ao registro de saldo (implantado em 09/11/2026)">—</span>
        ) : Number(v) > 0 ? (
          <span className="font-semibold text-emerald-400" title="Havia estoque disponível na empresa no momento do corte">{Number(v).toLocaleString("pt-BR")}</span>
        ) : (
          <span className="font-semibold text-destructive" title="Sem estoque disponível na empresa no momento do corte">0</span>
        ),
    },
    {
      key: "preco_custo", label: "Preço Custo", align: "right", width: "110px",
      render: (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
    },
    {
      key: "custo_total", label: "Custo Total", align: "right", width: "120px",
      render: (v) => (
        <span className="font-semibold text-destructive">
          {Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </span>
      ),
    },
    { key: "motivo", label: "Motivo", width: "180px", render: (v) => v ?? "—" },
    { key: "solicitante_login", label: "Solicitado por", width: "120px", render: (v) => v ?? "—" },
    { key: "autorizador_login", label: "Autorizado por", width: "120px", render: (v) => v ?? "—" },
    { key: "metodo", label: "Método", width: "150px", render: (v) => labelMetodoCorte(v) },
    {
      key: "autorizado_em", label: "Autorizado em", width: "150px",
      render: (v) => formatDateTime(v),
    },
  ];

  const activeFilters: Record<string, string> = {};
  activeFilters["Período"] = `${formatDate(dataInicio)} a ${formatDate(dataFim)}`;
  if (filterMotivos.length > 0) {
    activeFilters["Motivo"] =
      filterMotivos.length <= 3
        ? filterMotivos.join(", ")
        : `${filterMotivos.slice(0, 3).join(", ")} +${filterMotivos.length - 3}`;
  }
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterAutorizador !== "TODOS") {
    activeFilters["Autorizado por"] =
      usuarios.find((u) => u.id === filterAutorizador)?.login ?? filterAutorizador;
  }
  if (filterTemSaldo !== "TODOS") {
    activeFilters["Tinha saldo"] = filterTemSaldo === "SIM" ? "Sim" : "Não";
  }

  const fmtBRL = (v: any) => Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const exportColumns: ExportColumn[] = [
    { key: "numero_onda", label: "Nº Onda" },
    { key: "sku", label: "SKU" },
    exportColDescricao(),
    { key: "qtde_cortada", label: "Qtd Cortada", align: "right", format: (r) => fmtNumberBR(r.qtde_cortada) },
    {
      key: "saldo_disponivel_no_corte", label: "Saldo Disp. no Corte", align: "right",
      format: (r) => (r.saldo_disponivel_no_corte == null ? "—" : fmtNumberBR(r.saldo_disponivel_no_corte)),
    },
    { key: "tem_saldo", label: "Tinha Saldo", format: (r) => (r.tem_saldo === "SIM" ? "Sim" : r.tem_saldo === "NAO" ? "Não" : "Sem registro") },
    { key: "preco_custo", label: "Preço Custo", align: "right", format: (r) => fmtBRL(r.preco_custo) },
    { key: "custo_total", label: "Custo Total", align: "right", format: (r) => fmtBRL(r.custo_total) },
    { key: "motivo", label: "Motivo" },
    { key: "solicitante_login", label: "Solicitado por" },
    { key: "autorizador_login", label: "Autorizado por" },
    { key: "metodo", label: "Método", format: (r) => labelMetodoCorte(r.metodo) },
    { key: "autorizado_em", label: "Autorizado em", format: (r) => fmtDateTimeBR(r.autorizado_em) },
  ];

  const canExport = generated && data.length > 0;
  const handleExcel = () => exportToExcel("cortes", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("cortes", exportColumns, data, {
      title: "Cortes de Separação",
      generatedAt, usuario: usuarioNome || "—",
      total: data.length, filters: activeFilters,
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Cortes de Separação"
        subtitle="Relatório analítico de itens cortados na separação"
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
                <MultiSelectFilter
                  options={motivos.map((m) => ({
                    value: m.descricao,
                    label: m.descricao,
                    muted: !m.ativo,
                    suffix: m.ativo ? undefined : "(inativo)",
                  }))}
                  selected={filterMotivos}
                  onChange={setFilterMotivos}
                  placeholder="Todos"
                  searchPlaceholder="Buscar motivo..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Autorizado por</Label>
                <Select value={filterAutorizador} onValueChange={setFilterAutorizador}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.login}{u.nome ? ` — ${u.nome}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tinha saldo?</Label>
                <Select value={filterTemSaldo} onValueChange={(v) => setFilterTemSaldo(v as "TODOS" | "SIM" | "NAO")}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TODOS">Todos</SelectItem>
                    <SelectItem value="SIM">Sim</SelectItem>
                    <SelectItem value="NAO">Não</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Saldo disponível na empresa no momento do corte (sem avaria/quarentena)
                </p>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
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
          <Card
            className="border-border"
            title="Itens cortados mesmo havendo saldo disponível na empresa — indica falha operacional (endereço errado, picking sem abastecimento, divergência)"
          >
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <PackageCheck size={16} className="text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cortes com saldo</p>
                <p className="text-lg font-bold text-foreground">{totalComSaldo.toLocaleString("pt-BR")}</p>
                <p className="text-xs text-muted-foreground">
                  {custoComSaldo.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} em vendas perdidas com estoque
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
