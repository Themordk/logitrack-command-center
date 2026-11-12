import { useState, useEffect, useMemo } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colDescricaoProduto, exportColDescricao } from "../components/reportColumns";
import {
  fetchEstoquePage,
  fetchEstoqueAll,
  ESTOQUE_PAGE_SIZE,
  ESTOQUE_DIAS_SEM_ATUALIZACAO,
  type EstoqueFilter,
  type EstoqueRow,
  type EstoqueResumo,
} from "./estoque.service";
import { ParceiroFilter } from "../components/ParceiroFilter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { parseLocalizacao } from "../utils/parseInteiroOpcional";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
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

function fmtCaixa(qtd: number, fator: number | null | undefined) {
  const n = Number(qtd) || 0;
  if (!fator || fator <= 1) return `${n.toLocaleString("pt-BR")} UN`;
  const cx = Math.floor(n / fator);
  const resto = n % fator;
  return resto > 0
    ? `${cx.toLocaleString("pt-BR")} CX + ${resto.toLocaleString("pt-BR")} UN`
    : `${cx.toLocaleString("pt-BR")} CX`;
}

function QtdComCaixa({ qtd, fator, modo, className }: { qtd: number; fator: number | null; modo: boolean; className?: string }) {
  const n = Number(qtd) || 0;
  if (!modo) return <span className={className}>{n.toLocaleString("pt-BR")}</span>;
  if (!fator || fator <= 1) {
    return <span className="text-muted-foreground">{n.toLocaleString("pt-BR")} UN</span>;
  }
  return <span className={className}>{fmtCaixa(n, fator)}</span>;
}

export function EstoqueReportPage() {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioNome } = useTenant();
  const [data, setData] = useState<EstoqueRow[]>([]);
  const [resumo, setResumo] = useState<EstoqueResumo | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<EstoqueFilter | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [visualizarCaixa, setVisualizarCaixa] = useState(false);

  // Filter states
  const [filterSku, setFilterSku] = useState("");
  const [filterTipoEndereco, setFilterTipoEndereco] = useState("");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterEan, setFilterEan] = useState("");
  const [filterTipoEstoqueId, setFilterTipoEstoqueId] = useState("");
  const [filterSetorId, setFilterSetorId] = useState("");
  const [filterCodigoEndereco, setFilterCodigoEndereco] = useState("");
  const [filterRua, setFilterRua] = useState("");
  const [filterPredio, setFilterPredio] = useState("");
  const [filterNivel, setFilterNivel] = useState("");
  const [filterApto, setFilterApto] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState("");
  const [filterSubgrupoId, setFilterSubgrupoId] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterParceiroId, setFilterParceiroId] = useState("");
  const [filterParceiroNome, setFilterParceiroNome] = useState("");
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
    (supabase as any).rpc("fn_produto_marcas_distintas", { p_tenant_id: tenantId, p_empresa_id: empresaId })
      .then(({ data }: any) => setMarcas((data || []).map((r: any) => r.marca)));

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
    setResumo(null);
    setAppliedFilters(null);
    setPage(0);
    setGenerated(false);
    setGeneratedAt("");
    setFilterArmazemId("");
    setFilterTipoEstoqueId("");
    setFilterSetorId("");
    setFilterGrupoId("");
    setFilterSubgrupoId("");
    setFilterMarca("");
    setFilterParceiroId(""); setFilterParceiroNome("");
    setFilterCodigoEndereco("");
    setFilterRua(""); setFilterPredio(""); setFilterNivel(""); setFilterApto("");
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

  const loadPage = async (filters: EstoqueFilter, pageIndex: number) => {
    setLoading(true);
    try {
      const result = await fetchEstoquePage(filters, pageIndex);
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
    const loc = parseLocalizacao(
      { rua: filterRua, predio: filterPredio, nivel: filterNivel, apto: filterApto },
      (m) => toast.error(m),
    );
    if (!loc) return;
    const codigoTxt = filterCodigoEndereco.trim();
    if (codigoTxt && !/^\d+$/.test(codigoTxt)) {
      toast.error("Código do endereço deve ser numérico.");
      return;
    }
    {
      const codigoNum = codigoTxt ? Number(codigoTxt) : undefined;
      const filters: EstoqueFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId,
        armazem_id: filterArmazemId || undefined,
        tipo_endereco: filterTipoEndereco || undefined,
        sku: filterSku || undefined,
        ean: filterEan || undefined,
        tipo_estoque_id: filterTipoEstoqueId || undefined,
        setor_id: filterSetorId || undefined,
        grupo_id: filterGrupoId || undefined,
        subgrupo_id: filterSubgrupoId || undefined,
        marca: filterMarca || undefined,
        parceiro_id: filterParceiroId || undefined,
        codigo_endereco: Number.isFinite(codigoNum) ? codigoNum : undefined,
        apenas_multi_localizacao: filterMultiLocalizacao || undefined,
        apenas_com_saldo: filterApenasComSaldo,
        ...loc,
      };
      const ok = await loadPage(filters, 0);
      if (ok) {
        setAppliedFilters(filters);
        setGeneratedAt(nowDisplay());
        setGenerated(true);
      }
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
    setFilterRua(""); setFilterPredio(""); setFilterNivel(""); setFilterApto("");
    setFilterGrupoId("");
    setFilterSubgrupoId("");
    setFilterMarca("");
    setFilterParceiroId(""); setFilterParceiroNome("");
    setFilterMultiLocalizacao(false);
    setFilterApenasComSaldo(true);
  };

  const fmtInt = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fmtBRL = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtPct = (v: number, base: number) => (base > 0 ? `${((v / base) * 100).toFixed(1).replace(".", ",")}%` : "0%");

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    colDescricaoProduto(),
    { key: "marca", label: "Marca", width: "110px", render: (v) => v || "—" },
    { key: "lote", label: "Lote", width: "100px" },
    {
      key: "data_validade", label: "Validade", width: "100px",
      render: (v, row) => {
        if (!v || v === "1900-01-01") return "—";
        // "vencido" vem da RPC (data no fuso America/Fortaleza)
        return <span className={cn(row.vencido && "text-[hsl(var(--status-blocked))] font-semibold")}>{formatDate(v)}</span>;
      },
    },
    {
      key: "codigo_endereco", label: "Cód. End.", align: "right", width: "80px",
      render: (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("pt-BR")),
    },
    { key: "endereco_descricao", label: "Endereço", width: "140px", render: (v) => v || "—" },
    { key: "tipo_endereco", label: "Tipo Endereço", width: "110px" },
    {
      key: "enderecos_do_sku", label: "End. do SKU", align: "center", width: "85px",
      render: (v) => (
        <span className={cn(v > 1 ? "font-semibold text-[hsl(var(--status-busy))]" : "text-muted-foreground")}
          title={v > 1 ? "SKU com saldo em mais de um endereço" : undefined}>
          {Number(v).toLocaleString("pt-BR")}
        </span>
      ),
    },
    {
      key: "quantidade_disponivel", label: "Disponível", align: "right", width: visualizarCaixa ? "130px" : "90px",
      render: (v, row) => <QtdComCaixa qtd={v} fator={row.fator_caixa} modo={visualizarCaixa} className={cn(Number(v) === 0 && "text-muted-foreground")} />,
    },
    {
      key: "quantidade_bloqueada", label: "Bloqueado", align: "right", width: visualizarCaixa ? "130px" : "90px",
      render: (v, row) => <QtdComCaixa qtd={v} fator={row.fator_caixa} modo={visualizarCaixa} className={cn(Number(v) > 0 && "text-[hsl(var(--status-busy))] font-semibold")} />,
    },
    {
      key: "quantidade_total", label: "Total", align: "right", width: visualizarCaixa ? "130px" : "90px",
      render: (v, row) => <QtdComCaixa qtd={v} fator={row.fator_caixa} modo={visualizarCaixa} className={cn(Number(v) === 0 && "text-muted-foreground")} />,
    },
    {
      key: "valor_total", label: "Valor (custo)", align: "right", width: "120px",
      render: (v, row) => row.preco_custo > 0
        ? fmtBRL(v)
        : <span className="text-muted-foreground" title="Produto sem preço de custo">—</span>,
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
  if (filterParceiroId) activeFilters["Parceiro"] = filterParceiroNome || filterParceiroId;
  if (filterRua.trim()) activeFilters["Rua"] = filterRua.trim();
  if (filterPredio.trim()) activeFilters["Prédio"] = filterPredio.trim();
  if (filterNivel.trim()) activeFilters["Nível"] = filterNivel.trim();
  if (filterApto.trim()) activeFilters["Apto"] = filterApto.trim();
  if (filterMultiLocalizacao) activeFilters["Multi-localização"] = "Sim";
  if (filterApenasComSaldo) activeFilters["Saldo"] = "> 0";
  if (generated && resumo) {
    activeFilters["SKUs"] = fmtInt(resumo.qtd_skus);
    activeFilters["Saldo total"] = fmtInt(resumo.saldo_total);
    activeFilters["Valor (custo)"] = fmtBRL(resumo.valor_estoque);
    if (resumo.pos_vencidas > 0) activeFilters["Vencidas"] = fmtInt(resumo.pos_vencidas);
  }

  // Export columns (texto puro)
  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    exportColDescricao(),
    { key: "marca", label: "Marca" },
    { key: "lote", label: "Lote" },
    { key: "data_validade", label: "Validade", format: (r) => fmtDateBR(r.data_validade) },
    { key: "codigo_endereco", label: "Cód. Endereço", align: "right",
      format: (r) => (r.codigo_endereco == null ? "" : String(r.codigo_endereco)) },
    { key: "endereco_descricao", label: "Endereço" },
    { key: "tipo_endereco", label: "Tipo Endereço" },
    { key: "enderecos_do_sku", label: "End. do SKU", align: "center", format: (r) => fmtNumberBR(r.enderecos_do_sku) },
    { key: "quantidade_disponivel", label: "Disponível", align: "right",
      format: (r) => (visualizarCaixa ? fmtCaixa(r.quantidade_disponivel, r.fator_caixa) : fmtNumberBR(r.quantidade_disponivel)) },
    { key: "quantidade_bloqueada", label: "Bloqueado", align: "right",
      format: (r) => (visualizarCaixa ? fmtCaixa(r.quantidade_bloqueada, r.fator_caixa) : fmtNumberBR(r.quantidade_bloqueada)) },
    { key: "quantidade_total", label: "Total", align: "right",
      format: (r) => (visualizarCaixa ? fmtCaixa(r.quantidade_total, r.fator_caixa) : fmtNumberBR(r.quantidade_total)) },
    { key: "preco_custo", label: "Custo Unit.", align: "right", format: (r) => (r.preco_custo > 0 ? fmtBRL(r.preco_custo) : "") },
    { key: "valor_total", label: "Valor (custo)", align: "right", format: (r) => (r.preco_custo > 0 ? fmtBRL(r.valor_total) : "") },
    { key: "atualizado_em", label: "Última Atualização", format: (r) => fmtDateTimeBR(r.atualizado_em) },
  ];

  const total = resumo?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / ESTOQUE_PAGE_SIZE));
  const canExport = generated && total > 0 && !exporting;

  const loadAllForExport = async (): Promise<EstoqueRow[] | null> => {
    if (!appliedFilters) return null;
    if (total <= data.length) return data;
    setExporting(true);
    try {
      return await fetchEstoqueAll(appliedFilters, total);
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
    if (rows) exportToExcel("posicao_estoque", exportColumns, rows);
  };
  const handlePdf = async () => {
    const rows = await loadAllForExport();
    if (rows) {
      exportToPdf("posicao_estoque", exportColumns, rows, {
        title: "Posição de Estoque",
        generatedAt,
        usuario: usuarioNome || "—",
        total: rows.length,
        filters: activeFilters,
      });
    }
  };

  const alerta = "text-[hsl(var(--status-blocked))]";
  const atencao = "text-[hsl(var(--status-busy))]";
  const resumoCards: { label: string; value: string; sub?: string; tone: string; hint?: string }[] = resumo ? [
    {
      label: "Posições",
      value: fmtInt(resumo.total),
      sub: `Picking ${fmtInt(resumo.pos_picking)} · Pulmão ${fmtInt(resumo.pos_pulmao)}`,
      tone: "text-foreground",
    },
    {
      label: "SKUs",
      value: fmtInt(resumo.qtd_skus),
      sub: `${fmtInt(resumo.qtd_skus_multi)} em 2+ endereços`,
      tone: "text-foreground",
      hint: "SKUs com saldo em mais de um endereço (fragmentação)",
    },
    {
      label: "Endereços ocupados",
      value: fmtInt(resumo.qtd_enderecos),
      sub: `${(resumo.qtd_enderecos > 0 ? resumo.total / resumo.qtd_enderecos : 0).toFixed(1).replace(".", ",")} posições/end.`,
      tone: "text-foreground",
    },
    {
      label: "Saldo total (un.)",
      value: fmtInt(resumo.saldo_total),
      sub: `Bloqueado ${fmtInt(resumo.saldo_bloqueado)} (${fmtPct(resumo.saldo_bloqueado, resumo.saldo_total)})`,
      tone: "text-foreground",
    },
    {
      label: "Valor em estoque (custo)",
      value: fmtBRL(resumo.valor_estoque),
      sub: resumo.qtd_skus_sem_custo > 0 ? `${fmtInt(resumo.qtd_skus_sem_custo)} SKUs sem custo` : "Todos os SKUs com custo",
      tone: "text-foreground",
      hint: "Saldo × preço de custo do cadastro. SKUs sem custo não entram no valor.",
    },
    {
      label: "Alertas",
      value: `${fmtInt(resumo.pos_vencidas)} vencidas`,
      sub: `${fmtInt(resumo.pos_sem_atualizacao)} sem movimento +${ESTOQUE_DIAS_SEM_ATUALIZACAO}d · ${fmtInt(resumo.pos_bloqueadas)} bloqueadas`,
      tone: resumo.pos_vencidas > 0 ? alerta : resumo.pos_sem_atualizacao > 0 ? atencao : "text-foreground",
      hint: "Posições com validade vencida, sem atualização há mais de 90 dias e com saldo bloqueado",
    },
  ] : [];
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Posição de Estoque"
        subtitle="Relatório analítico de saldos por endereço"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? total : undefined}
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
                  <Select value={filterMarca || "__all__"} onValueChange={(v) => setFilterMarca(v === "__all__" ? "" : v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Todas</SelectItem>
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
                <Input className="h-8 text-xs" placeholder="EAN exato..." value={filterEan} onChange={e => setFilterEan(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Parceiro / Fornecedor</Label>
                <ParceiroFilter
                  value={filterParceiroId || null}
                  label={filterParceiroNome}
                  onChange={(id, parceiro) => { setFilterParceiroId(id ?? ""); setFilterParceiroNome(parceiro?.razaosocial ?? ""); }}
                  tenantId={tenantId}
                  empresaId={empresaId}
                />
              </div>
              {([
                ["Rua", filterRua, setFilterRua, "Todas"],
                ["Prédio", filterPredio, setFilterPredio, "Todos"],
                ["Nível", filterNivel, setFilterNivel, "Todos"],
                ["Apto", filterApto, setFilterApto, "Todos"],
              ] as const).map(([label, val, set, ph]) => (
                <div key={label} className="space-y-1.5">
                  <Label className="text-xs" htmlFor={`estoque-filtro-${label}`}>{label}</Label>
                  <Input
                    id={`estoque-filtro-${label}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="h-8 text-xs"
                    placeholder={ph}
                    value={val}
                    onChange={e => set(e.target.value)}
                  />
                </div>
              ))}
              <div className="flex items-end lg:col-start-1">
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
              <div className="flex items-end">
                <label className="flex items-center gap-2 h-8 cursor-pointer select-none">
                  <Switch checked={visualizarCaixa} onCheckedChange={setVisualizarCaixa} />
                  <span className="text-xs">Visualizar em Caixa</span>
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

      {/* Table */}
      {generated && <ReportTable columns={columns} data={data} loading={loading || exporting} />}

      {generated && total > ESTOQUE_PAGE_SIZE && appliedFilters && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground print:hidden">
          <span>
            {(page * ESTOQUE_PAGE_SIZE + 1).toLocaleString("pt-BR")}–
            {Math.min((page + 1) * ESTOQUE_PAGE_SIZE, total).toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
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
