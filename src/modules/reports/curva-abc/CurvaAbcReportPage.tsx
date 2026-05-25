import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { fetchCurvaAbcReport, type CurvaAbcFilter, type CurvaAbcRow } from "./curvaAbc.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { nowDisplay } from "@/utils/dateTime";

function defaultDateRange() {
  const fim = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}

export function CurvaAbcReportPage() {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const def = defaultDateRange();
  const [data, setData] = useState<CurvaAbcRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [dataInicio, setDataInicio] = useState(def.inicio);
  const [dataFim, setDataFim] = useState(def.fim);
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
    setGenerated(false);
    setGeneratedAt("");
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const filters: CurvaAbcFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: filterArmazemId || undefined,
        data_inicio: dataInicio,
        data_fim: dataFim,
        sku: filterSku || undefined,
        marca: filterMarca || undefined,
        grupo_id: filterGrupoId || undefined,
        subgrupo_id: filterSubgrupoId || undefined,
        classe: (filterClasse || undefined) as any,
      };
      const results = await fetchCurvaAbcReport(filters);
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
    const d = defaultDateRange();
    setDataInicio(d.inicio); setDataFim(d.fim);
    setFilterArmazemId(""); setFilterGrupoId(""); setFilterSubgrupoId("");
    setFilterMarca(""); setFilterSku(""); setFilterClasse("");
  };

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  const classeBadge = (c: "A" | "B" | "C") => {
    const map = {
      A: "bg-[hsl(var(--status-free))]/15 text-[hsl(var(--status-free))] border-[hsl(var(--status-free))]/30",
      B: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
      C: "bg-muted text-muted-foreground border-border",
    };
    return (
      <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", map[c])}>{c}</span>
    );
  };

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    { key: "descricao", label: "Descrição", width: "240px" },
    { key: "marca", label: "Marca", width: "120px" },
    { key: "qtd_saida", label: "Qtd. Saída", align: "right", width: "100px", render: (v) => fmtNum(v) },
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

  const activeFilters: Record<string, string> = {
    Período: `${dataInicio} → ${dataFim}`,
  };
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterGrupoId) activeFilters["Grupo"] = grupos.find((g) => g.id === filterGrupoId)?.descricao || filterGrupoId;
  if (filterSubgrupoId) activeFilters["Subgrupo"] = subgrupos.find((s) => s.id === filterSubgrupoId)?.descricao || filterSubgrupoId;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterClasse) activeFilters["Classe"] = filterClasse;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Curva ABC de Estoque"
        subtitle="Classificação de produtos por giro (saídas) no período"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? data.length : undefined}
        filters={generated ? activeFilters : undefined}
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
                <Label className="text-xs">Classe</Label>
                <Select value={filterClasse} onValueChange={(v) => setFilterClasse(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">A — Alto Giro</SelectItem>
                    <SelectItem value="B">B — Médio Giro</SelectItem>
                    <SelectItem value="C">C — Baixo Giro</SelectItem>
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
