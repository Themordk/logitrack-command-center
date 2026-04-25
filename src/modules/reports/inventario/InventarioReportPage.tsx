import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import {
  fetchInventarioReport,
  fetchInventariosLookup,
  type InventarioFilter,
  type InventarioRow,
  type InventarioKpis,
  type StatusItem,
  type Severidade,
} from "./inventario.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { nowBrasiliaDisplay } from "@/lib/dateUtils";

export function InventarioReportPage() {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [data, setData] = useState<InventarioRow[]>([]);
  const [kpis, setKpis] = useState<InventarioKpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Filtros
  const [inventarioId, setInventarioId] = useState<string>("");
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [filterRua, setFilterRua] = useState("");
  const [filterPredio, setFilterPredio] = useState("");
  const [filterNivel, setFilterNivel] = useState("");
  const [filterApto, setFilterApto] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | StatusItem>("");
  const [filterSeveridade, setFilterSeveridade] = useState<"" | Severidade>("");
  const [apenasDivergentes, setApenasDivergentes] = useState(false);

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [inventarios, setInventarios] = useState<any[]>([]);

  // Lookups
  useEffect(() => {
    if (!tenantId) return;
    supabase.from("armazem").select("id, descricao").eq("tenant_id", tenantId).eq("ativo", true)
      .then(({ data }) => setArmazens(data || []));
    fetchInventariosLookup(tenantId, empresaId || undefined).then((rows) => {
      setInventarios(rows);
      // default: último finalizado
      const lastFinal = rows.find((r: any) => r.status === "FINALIZADO" || r.status === "CONCLUIDO");
      if (lastFinal) setInventarioId(lastFinal.id);
      else if (rows[0]) setInventarioId(rows[0].id);
    });
  }, [tenantId, empresaId]);

  // Reset relatório ao trocar empresa
  useEffect(() => {
    setData([]);
    setKpis(null);
    setGenerated(false);
    setGeneratedAt("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const filters: InventarioFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        inventario_id: inventarioId || undefined,
        armazem_id: filterArmazemId || undefined,
        sku: filterSku || undefined,
        rua: filterRua ? Number(filterRua) : undefined,
        predio: filterPredio ? Number(filterPredio) : undefined,
        nivel: filterNivel ? Number(filterNivel) : undefined,
        apto: filterApto ? Number(filterApto) : undefined,
        status: (filterStatus || undefined) as any,
        severidade: (filterSeveridade || undefined) as any,
        apenas_divergentes: apenasDivergentes,
        incluir_pendentes: true,
      };
      const result = await fetchInventarioReport(filters);
      setData(result.rows);
      setKpis(result.kpis);
      setGeneratedAt(nowBrasiliaDisplay());
      setGenerated(true);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterArmazemId(""); setFilterSku("");
    setFilterRua(""); setFilterPredio(""); setFilterNivel(""); setFilterApto("");
    setFilterStatus(""); setFilterSeveridade(""); setApenasDivergentes(false);
  };

  const fmtNum = (v: number) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const fmtPct = (v: number) => `${Number(v).toFixed(2)}%`;
  const fmtBRL = (v: number) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const statusBadge = (s: StatusItem) => {
    const map: Record<StatusItem, string> = {
      CONFORME: "bg-[hsl(var(--status-free))]/15 text-[hsl(var(--status-free))] border-[hsl(var(--status-free))]/30",
      SOBRA: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30",
      FALTA: "bg-[hsl(var(--status-blocked))]/15 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30",
      PENDENTE: "bg-muted text-muted-foreground border-border",
    };
    const label: Record<StatusItem, string> = {
      CONFORME: "Conforme",
      SOBRA: "Sobra",
      FALTA: "Falta",
      PENDENTE: "Pendente",
    };
    return <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", map[s])}>{label[s]}</span>;
  };

  const accClass = (v: number) => {
    if (v >= 98) return "text-[hsl(var(--status-free))]";
    if (v >= 95) return "text-[hsl(var(--status-busy))]";
    return "text-[hsl(var(--status-blocked))]";
  };

  const diffClass = (v: number) => {
    if (v === 0) return "text-[hsl(var(--status-free))]";
    if (v > 0) return "text-[hsl(var(--status-busy))]";
    return "text-[hsl(var(--status-blocked))]";
  };

  const columns: ReportColumn[] = [
    { key: "numero_inventario", label: "Inventário", width: "90px", render: (v) => <span className="font-mono text-foreground">#{v}</span> },
    { key: "sku", label: "SKU", width: "110px", render: (v) => <span className="font-mono font-semibold">{v}</span> },
    { key: "descricao", label: "Descrição", width: "220px", render: (v) => <span className="truncate block max-w-[220px]" title={v}>{v}</span> },
    { key: "endereco", label: "Endereço", width: "150px", render: (v) => <span className="font-mono text-[10px]">{v}</span> },
    { key: "lote", label: "Lote", width: "70px", align: "center" },
    { key: "qtd_sistemica", label: "Qtd. Sist.", align: "right", width: "90px", render: (v) => fmtNum(v) },
    { key: "qtd_contada", label: "Qtd. Cont.", align: "right", width: "90px", render: (v) => fmtNum(v) },
    {
      key: "diferenca", label: "Diferença", align: "right", width: "90px",
      render: (v) => <span className={cn("font-semibold", diffClass(v))}>{v > 0 ? "+" : ""}{fmtNum(v)}</span>,
    },
    {
      key: "diferenca_pct", label: "Dif. %", align: "right", width: "80px",
      render: (v, row) => row.status_calc === "PENDENTE"
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-semibold", diffClass(row.diferenca))}>{v > 0 ? "+" : ""}{fmtPct(v)}</span>,
    },
    {
      key: "impacto_financeiro", label: "Impacto R$", align: "right", width: "110px",
      render: (v) => <span className={cn(v > 0 && "text-[hsl(var(--status-blocked))] font-semibold")}>{fmtBRL(v)}</span>,
    },
    {
      key: "acuracidade_item", label: "Acur. %", align: "right", width: "80px",
      render: (v, row) => row.status_calc === "PENDENTE"
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-bold", accClass(v))}>{fmtPct(v)}</span>,
    },
    { key: "status_calc", label: "Status", align: "center", width: "100px", render: (v) => statusBadge(v) },
  ];

  // Highlight rows: GRANDE recebe tinta de fundo vermelha
  const enrichedData = data.map((r) => ({
    ...r,
    _rowClass: r.severidade === "GRANDE" ? "bg-[hsl(var(--status-blocked))]/5" : undefined,
  }));

  // KPIs no header
  const activeFilters: Record<string, string> = {};
  if (inventarioId) {
    const inv = inventarios.find((i) => i.id === inventarioId);
    if (inv) activeFilters["Inventário"] = `#${inv.numero_inventario}`;
  } else {
    activeFilters["Inventário"] = "Todos";
  }
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterSku) activeFilters["SKU"] = filterSku;
  if (filterStatus) activeFilters["Status"] = filterStatus;
  if (filterSeveridade) activeFilters["Severidade"] = filterSeveridade;
  if (apenasDivergentes) activeFilters["Apenas divergentes"] = "Sim";

  if (generated && kpis) {
    activeFilters["Acur. Qtd"] = fmtPct(kpis.acuracidade_ponderada_qtd);
    activeFilters["Acur. Item"] = fmtPct(kpis.acuracidade_por_item);
    activeFilters["Acur. R$"] = fmtPct(kpis.acuracidade_ponderada_valor);
    activeFilters["Conformes"] = `${kpis.itens_conformes}`;
    activeFilters["Divergentes"] = `${kpis.itens_divergentes}`;
    if (kpis.itens_pendentes > 0) activeFilters["Pendentes"] = `${kpis.itens_pendentes}`;
    activeFilters["Sobra"] = fmtNum(kpis.total_sobra);
    activeFilters["Falta"] = fmtNum(kpis.total_falta);
    activeFilters["Impacto R$"] = fmtBRL(kpis.impacto_total);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Acuracidade de Inventário"
        subtitle="Comparativo entre estoque sistêmico e contagem física"
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
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Inventário</Label>
                <Select value={inventarioId || "__all__"} onValueChange={(v) => setInventarioId(v === "__all__" ? "" : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">Todos</SelectItem>
                    {inventarios.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        #{i.numero_inventario} {i.descricao ? `· ${i.descricao}` : ""} ({i.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Armazém</Label>
                <Select value={filterArmazemId} onValueChange={setFilterArmazemId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SKU</Label>
                <Input className="h-8 text-xs" placeholder="Buscar..." value={filterSku} onChange={(e) => setFilterSku(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CONFORME">Conforme</SelectItem>
                    <SelectItem value="SOBRA">Sobra</SelectItem>
                    <SelectItem value="FALTA">Falta</SelectItem>
                    <SelectItem value="PENDENTE">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Severidade</Label>
                <Select value={filterSeveridade} onValueChange={(v) => setFilterSeveridade(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OK">OK</SelectItem>
                    <SelectItem value="PEQUENA">Pequena (≤5%)</SelectItem>
                    <SelectItem value="MEDIA">Média (≤20%)</SelectItem>
                    <SelectItem value="GRANDE">Grande (&gt;20%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Rua</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterRua} onChange={(e) => setFilterRua(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prédio</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterPredio} onChange={(e) => setFilterPredio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nível</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterNivel} onChange={(e) => setFilterNivel(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Apto</Label>
                <Input className="h-8 text-xs" type="number" min="0" value={filterApto} onChange={(e) => setFilterApto(e.target.value)} />
              </div>
              <div className="space-y-1.5 flex items-end">
                <label className="flex items-center gap-2 text-xs cursor-pointer h-8">
                  <input
                    type="checkbox"
                    checked={apenasDivergentes}
                    onChange={(e) => setApenasDivergentes(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Apenas divergentes</span>
                </label>
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

      {generated && <ReportTable columns={columns} data={enrichedData} loading={loading} />}
    </div>
  );
}
