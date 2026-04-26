import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { fetchValidadeLoteReport, type ValidadeLoteFilter, type ValidadeLoteRow } from "./validadeLote.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBrasiliaDate, nowBrasiliaDisplay } from "@/lib/dateUtils";

export function ValidadeLoteReportPage() {
  const { tenantId, empresaId, armazemId, empresaVersion } = useTenant();
  const [data, setData] = useState<ValidadeLoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterSetorId, setFilterSetorId] = useState("");
  const [filterTipoEndereco, setFilterTipoEndereco] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterMarca, setFilterMarca] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState("");
  const [filterSubgrupoId, setFilterSubgrupoId] = useState("");
  const [filterCriticidade, setFilterCriticidade] = useState<"" | "VENCIDO" | "CRITICO" | "ATENCAO" | "OK">("");
  const [filterValidadeAte, setFilterValidadeAte] = useState("");
  const [ordem, setOrdem] = useState<"FEFO" | "FIFO">("FEFO");

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [setores, setSetores] = useState<{ id: string; descricao: string }[]>([]);
  const [grupos, setGrupos] = useState<{ id: string; descricao: string }[]>([]);
  const [subgrupos, setSubgrupos] = useState<{ id: string; descricao: string }[]>([]);

  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]); setSetores([]); setGrupos([]); setSubgrupos([]);
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
    setFilterArmazemId(""); setFilterSetorId("");
    setFilterGrupoId(""); setFilterSubgrupoId("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const filters: ValidadeLoteFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: filterArmazemId || undefined,
        setor_id: filterSetorId || undefined,
        tipo_endereco: filterTipoEndereco || undefined,
        sku: filterSku || undefined,
        marca: filterMarca || undefined,
        grupo_id: filterGrupoId || undefined,
        subgrupo_id: filterSubgrupoId || undefined,
        criticidade: (filterCriticidade || undefined) as any,
        validade_ate: filterValidadeAte || undefined,
        ordem,
      };
      const results = await fetchValidadeLoteReport(filters);
      setData(results);
      setGeneratedAt(nowBrasiliaDisplay());
      setGenerated(true);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterArmazemId(""); setFilterSetorId(""); setFilterTipoEndereco("");
    setFilterSku(""); setFilterMarca(""); setFilterGrupoId(""); setFilterSubgrupoId("");
    setFilterCriticidade(""); setFilterValidadeAte(""); setOrdem("FEFO");
  };

  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });

  const criticidadeBadge = (c: ValidadeLoteRow["criticidade"]) => {
    const map: Record<string, string> = {
      VENCIDO: "bg-[hsl(var(--status-blocked))]/15 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30",
      CRITICO: "bg-[hsl(var(--status-blocked))]/10 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/20",
      ATENCAO: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
      OK: "bg-muted text-muted-foreground border-border",
    };
    const label: Record<string, string> = { VENCIDO: "Vencido", CRITICO: "Crítico", ATENCAO: "Atenção", OK: "OK" };
    return <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", map[c])}>{label[c]}</span>;
  };

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "100px" },
    { key: "descricao", label: "Descrição", width: "240px" },
    { key: "lote", label: "Lote", width: "100px" },
    { key: "data_fabricacao", label: "Fabricação", width: "100px", render: (v) => formatBrasiliaDate(v) },
    {
      key: "data_validade", label: "Validade", width: "100px",
      render: (v, row) => (
        <span className={cn(row.criticidade === "VENCIDO" && "text-[hsl(var(--status-blocked))] font-semibold")}>
          {formatBrasiliaDate(v)}
        </span>
      ),
    },
    {
      key: "dias_para_vencer", label: "Dias p/ Vencer", align: "right", width: "100px",
      render: (v, row) => (
        <span className={cn(
          row.criticidade === "VENCIDO" && "text-[hsl(var(--status-blocked))] font-bold",
          row.criticidade === "CRITICO" && "text-[hsl(var(--status-blocked))] font-semibold",
          row.criticidade === "ATENCAO" && "text-[hsl(var(--status-busy))]",
        )}>
          {v < 0 ? `${v}` : v}
        </span>
      ),
    },
    { key: "saldo", label: "Saldo", align: "right", width: "90px", render: (v) => fmtNum(v) },
    { key: "codigo_endereco", label: "Endereço", width: "120px" },
    { key: "tipo_endereco", label: "Tipo End.", width: "100px" },
    { key: "criticidade", label: "Status", align: "center", width: "90px", render: (v) => criticidadeBadge(v) },
  ];

  const totalVencido = data.filter((r) => r.criticidade === "VENCIDO").reduce((a, r) => a + r.saldo, 0);
  const totalCritico = data.filter((r) => r.criticidade === "CRITICO").reduce((a, r) => a + r.saldo, 0);

  const activeFilters: Record<string, string> = { Ordem: ordem };
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterSetorId) activeFilters["Setor"] = setores.find((s) => s.id === filterSetorId)?.descricao || filterSetorId;
  if (filterTipoEndereco) activeFilters["Tipo"] = filterTipoEndereco;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterMarca) activeFilters["Marca"] = filterMarca;
  if (filterGrupoId) activeFilters["Grupo"] = grupos.find((g) => g.id === filterGrupoId)?.descricao || filterGrupoId;
  if (filterSubgrupoId) activeFilters["Subgrupo"] = subgrupos.find((s) => s.id === filterSubgrupoId)?.descricao || filterSubgrupoId;
  if (filterCriticidade) activeFilters["Criticidade"] = filterCriticidade;
  if (filterValidadeAte) activeFilters["Validade até"] = filterValidadeAte;
  if (generated) {
    activeFilters["Vencido"] = `${fmtNum(totalVencido)}`;
    activeFilters["Crítico ≤30d"] = `${fmtNum(totalCritico)}`;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Validade & Lote (FEFO/FIFO)"
        subtitle="Saldos por lote ordenados por validade — destaque para itens críticos"
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
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId} onValueChange={setFilterArmazemId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Setor</Label>
                <Select value={filterSetorId} onValueChange={setFilterSetorId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.descricao}</SelectItem>)}</SelectContent>
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
                <Label className="text-xs">Criticidade</Label>
                <Select value={filterCriticidade} onValueChange={(v) => setFilterCriticidade(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VENCIDO">Vencido</SelectItem>
                    <SelectItem value="CRITICO">Crítico (≤30d)</SelectItem>
                    <SelectItem value="ATENCAO">Atenção (≤60d)</SelectItem>
                    <SelectItem value="OK">OK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar SKU..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                <Input className="h-8 text-xs" placeholder="Buscar marca..." value={filterMarca} onChange={(e) => setFilterMarca(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Validade até</Label>
                <Input type="date" className="h-8 text-xs" value={filterValidadeAte} onChange={(e) => setFilterValidadeAte(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Ordenação</Label>
                <Select value={ordem} onValueChange={(v) => setOrdem(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="FEFO">FEFO (Validade ↑)</SelectItem>
                    <SelectItem value="FIFO">FIFO (Fabricação ↑)</SelectItem>
                  </SelectContent>
                </Select>
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
