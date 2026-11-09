import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colDescricaoProduto, exportColDescricao } from "../components/reportColumns";
import {
  fetchCurvaAbcReport,
  mapCurvaAbcError,
  type CurvaAbcCriterio,
  type CurvaAbcFilter,
  type CurvaAbcItem,
  type CurvaAbcResumo,
} from "./curvaAbc.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, type ExportColumn } from "../utils/exporters";
import { toast } from "sonner";

const SENTINELA_TODOS = "__all__";

const CRITERIO_OPTIONS: { value: CurvaAbcCriterio; label: string }[] = [
  { value: "QUANTIDADE", label: "Quantidade (giro)" },
  { value: "VALOR", label: "Valor (R$ custo)" },
  { value: "ACESSOS", label: "Acessos (separações)" },
];

const CRITERIO_SUBTITULO: Record<CurvaAbcCriterio, string> = {
  QUANTIDADE: "quantidade de saída",
  VALOR: "valor de saída (custo)",
  ACESSOS: "acessos de separação",
};

const CRITERIO_ROTULO: Record<CurvaAbcCriterio, string> = {
  QUANTIDADE: "quantidade",
  VALOR: "valor",
  ACESSOS: "acessos",
};

function defaultDateRange() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}

export function CurvaAbcReportPage() {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const def = defaultDateRange();
  const [data, setData] = useState<CurvaAbcItem[]>([]);
  const [resumo, setResumo] = useState<CurvaAbcResumo | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [filtrosGerados, setFiltrosGerados] = useState<Record<string, string> | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  const [dataInicio, setDataInicio] = useState(def.inicio);
  const [dataFim, setDataFim] = useState(def.fim);
  const [criterio, setCriterio] = useState<CurvaAbcCriterio>("QUANTIDADE");
  const [limiteA, setLimiteA] = useState("80");
  const [limiteB, setLimiteB] = useState("95");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState("");
  const [filterSubgrupoId, setFilterSubgrupoId] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterClasse, setFilterClasse] = useState<"" | "A" | "B" | "C">("");

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
    setResumo(null);
    setGenerated(false);
    setGeneratedAt("");
    setFiltrosGerados(null);
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId || !empresaId) return;
    const a = Number(limiteA);
    const b = Number(limiteB);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b > 99 || a >= b) {
      toast.error("Os limites devem obedecer 0 < A < B < 100%.");
      return;
    }
    setLoading(true);
    try {
      const filters: CurvaAbcFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId,
        armazem_id: filterArmazemId || undefined,
        data_inicio: dataInicio,
        data_fim: dataFim,
        criterio,
        limite_a: a / 100,
        limite_b: b / 100,
        sku: filterSku || undefined,
        marca: filterMarca || undefined,
        grupo_id: filterGrupoId || undefined,
        subgrupo_id: filterSubgrupoId || undefined,
        classe: (filterClasse || undefined) as any,
      };
      const result = await fetchCurvaAbcReport(filters);
      setResumo(result.resumo);
      setData(result.itens);
      setFiltrosGerados(montarFiltrosAtivos());
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    } catch (err: any) {
      toast.error(mapCurvaAbcError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    const d = defaultDateRange();
    setDataInicio(d.inicio); setDataFim(d.fim);
    setCriterio("QUANTIDADE"); setLimiteA("80"); setLimiteB("95");
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
    setFilterMarca(""); setFilterSku(""); setFilterClasse("");
  };

  // Parâmetros exibidos: depois de gerar, refletem o resumo retornado pela RPC;
  // antes de gerar, refletem o estado atual dos campos.
  const criterioExib: CurvaAbcCriterio = resumo?.criterio ?? criterio;
  const limiteAExib = resumo ? Math.round(resumo.limite_a * 100) : limiteA;
  const limiteBExib = resumo ? Math.round(resumo.limite_b * 100) : limiteB;

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fmtBRL = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const fmtMetrica = (v: number) => (criterioExib === "VALOR" ? fmtBRL(v) : fmtNum(v));

  const classeCores: Record<"A" | "B" | "C", string> = {
    A: "bg-[hsl(var(--status-free))]/15 text-[hsl(var(--status-free))] border-[hsl(var(--status-free))]/30",
    B: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
    C: "bg-muted text-muted-foreground border-border",
  };

  const classeBadge = (c: "A" | "B" | "C") => (
    <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", classeCores[c])}>{c}</span>
  );

  const colunaCriterio: Record<CurvaAbcCriterio, string> = {
    QUANTIDADE: "qtd_saida",
    VALOR: "valor_saida",
    ACESSOS: "acessos",
  };
  const destaqueCriterio = (key: string) =>
    key === colunaCriterio[criterioExib] ? "font-bold text-primary" : undefined;

  const columns: ReportColumn[] = [
    { key: "posicao", label: "Pos.", align: "right", width: "60px" },
    { key: "sku", label: "SKU", width: "100px" },
    colDescricaoProduto(),
    { key: "marca", label: "Marca", width: "120px" },
    { key: "qtd_saida", label: "Qtd. Saída", align: "right", width: "100px", render: (v) => fmtNum(v), headerClassName: destaqueCriterio("qtd_saida") },
    { key: "acessos", label: "Acessos", align: "right", width: "80px", render: (v) => fmtNum(v), headerClassName: destaqueCriterio("acessos") },
    { key: "valor_saida", label: "Valor Saída (R$)", align: "right", width: "120px", render: (v) => fmtBRL(v), headerClassName: destaqueCriterio("valor_saida") },
    { key: "participacao", label: "% Particip.", align: "right", width: "90px", render: (v) => fmtPct(v) },
    { key: "acumulado", label: "% Acum.", align: "right", width: "90px", render: (v) => fmtPct(v) },
    {
      key: "saldo_atual", label: "Saldo Atual", align: "right", width: "100px",
      render: (v, row) => {
        const isCritical = Number(v) === 0 && (row.classe === "A" || row.classe === "B");
        return (
          <span className={cn(isCritical && "text-[hsl(var(--status-blocked))] font-bold", v === 0 && !isCritical && "text-muted-foreground")}>
            {fmtNum(v)}
          </span>
        );
      },
    },
    { key: "classe", label: "Classe", align: "center", width: "70px", render: (v) => classeBadge(v) },
  ];

  const montarFiltrosAtivos = (): Record<string, string> => {
    const f: Record<string, string> = {
      Período: `${dataInicio} → ${dataFim}`,
      Critério: CRITERIO_OPTIONS.find((c) => c.value === criterio)?.label || criterio,
      Limites: `A ${limiteA}% · B ${limiteB}%`,
    };
    if (filterArmazemId) f["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
    if (filterGrupoId) f["Grupo"] = grupos.find((g) => g.id === filterGrupoId)?.descricao || filterGrupoId;
    if (filterSubgrupoId) f["Subgrupo"] = subgrupos.find((s) => s.id === filterSubgrupoId)?.descricao || filterSubgrupoId;
    if (filterMarca) f["Marca"] = filterMarca;
    if (filterSku) f["SKU"] = filterSku;
    if (filterClasse) f["Classe"] = filterClasse;
    return f;
  };

  const exportColumns: ExportColumn[] = [
    { key: "posicao", label: "Pos.", align: "right", format: (r) => String(r.posicao) },
    { key: "sku", label: "SKU" },
    exportColDescricao(),
    { key: "marca", label: "Marca" },
    { key: "qtd_saida", label: "Qtd. Saída", align: "right", format: (r) => fmtNum(r.qtd_saida) },
    { key: "acessos", label: "Acessos", align: "right", format: (r) => fmtNum(r.acessos) },
    { key: "valor_saida", label: "Valor Saída (R$)", align: "right", format: (r) => fmtBRL(r.valor_saida) },
    { key: "participacao", label: "% Particip.", align: "right", format: (r) => fmtPct(r.participacao) },
    { key: "acumulado", label: "% Acum.", align: "right", format: (r) => fmtPct(r.acumulado) },
    { key: "saldo_atual", label: "Saldo Atual", align: "right", format: (r) => fmtNum(r.saldo_atual) },
    { key: "classe", label: "Classe" },
  ];

  const canExport = generated && data.length > 0;
  const handleExcel = () => exportToExcel("curva_abc", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("curva_abc", exportColumns, data, {
      title: "Curva ABC",
      generatedAt, usuario: usuarioNome || "—",
      total: data.length, filters: filtrosGerados ?? {},
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Curva ABC de Estoque"
        subtitle={`Classificação por ${CRITERIO_SUBTITULO[criterioExib]} no período — A ≤ ${limiteAExib}% · B ≤ ${limiteBExib}%`}
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
        filters={generated ? (filtrosGerados ?? undefined) : undefined}
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
                <Label className="text-xs">Data Início</Label>
                <Input type="date" className="h-8 text-xs" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Data Fim</Label>
                <Input type="date" className="h-8 text-xs" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Critério</Label>
                <Select value={criterio} onValueChange={(v) => setCriterio(v as CurvaAbcCriterio)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CRITERIO_OPTIONS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Limite A (%)</Label>
                <Input type="number" min={1} max={99} step={1} className="h-8 text-xs" value={limiteA} onChange={(e) => setLimiteA(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Limite B (%)</Label>
                <Input type="number" min={1} max={99} step={1} className="h-8 text-xs" value={limiteB} onChange={(e) => setLimiteB(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId || SENTINELA_TODOS} onValueChange={(v) => setFilterArmazemId(v === SENTINELA_TODOS ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENTINELA_TODOS}>Todos</SelectItem>
                    {armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Grupo</Label>
                <Select value={filterGrupoId || SENTINELA_TODOS} onValueChange={(v) => setFilterGrupoId(v === SENTINELA_TODOS ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENTINELA_TODOS}>Todos</SelectItem>
                    {grupos.map((g) => <SelectItem key={g.id} value={g.id}>{g.descricao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Subgrupo</Label>
                <Select value={filterSubgrupoId || SENTINELA_TODOS} onValueChange={(v) => setFilterSubgrupoId(v === SENTINELA_TODOS ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENTINELA_TODOS}>Todos</SelectItem>
                    {subgrupos.map((s) => <SelectItem key={s.id} value={s.id}>{s.descricao}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Classe</Label>
                <Select value={filterClasse || SENTINELA_TODOS} onValueChange={(v) => setFilterClasse(v === SENTINELA_TODOS ? "" : (v as any))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SENTINELA_TODOS}>Todas</SelectItem>
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
                    <SelectItem value="C">C</SelectItem>
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
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={loading || !tenantId || !empresaId}>
                <Search size={14} />{loading ? "Gerando..." : "Gerar Relatório"}
              </Button>
              <Button size="sm" variant="outline" onClick={handleClear}>
                <X size={14} />Limpar
              </Button>
            </div>
          </div>
        )}
      </div>

      {generated && resumo && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(["A", "B", "C"] as const).map((classe) => {
              const c = resumo.classes[classe];
              const pctSkus = resumo.total_skus > 0 ? c.skus / resumo.total_skus : 0;
              return (
                <div key={classe} className={cn("border rounded-lg p-3 space-y-1", classeCores[classe])}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Classe {classe}</span>
                    <span className="text-xs font-semibold">{fmtPct(c.participacao)} do {CRITERIO_ROTULO[criterioExib]}</span>
                  </div>
                  <div className="text-xs">
                    {fmtNum(c.skus)} SKU(s) · {fmtPct(pctSkus)} dos SKUs
                  </div>
                  <div className="text-xs font-medium">{fmtMetrica(c.metrica)}</div>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Saída líquida: {fmtNum(resumo.total_qtd_saida)} un · Estornado no período: {fmtNum(resumo.total_qtd_estornada)} un · {fmtNum(resumo.skus_100_estornados)} SKU(s) 100% estornados fora da curva
          </p>
          {criterioExib === "VALOR" && resumo.skus_sem_custo > 0 && (
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--status-busy))]">
              <AlertTriangle size={13} />
              {fmtNum(resumo.skus_sem_custo)} SKU(s) sem preço de custo foram considerados com valor zero.
            </div>
          )}
        </div>
      )}

      {generated && <ReportTable columns={columns} data={data} loading={loading} />}
    </div>
  );
}
