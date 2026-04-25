import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import {
  fetchRecebimentoReport,
  formatDuration,
  type RecebimentoFilter,
  type RecebimentoRow,
  type RecebimentoKpis,
  type StatusSla,
} from "./recebimento.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBrasiliaDateTimeShort, nowBrasiliaDisplay } from "@/lib/dateUtils";

export function RecebimentoReportPage() {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [data, setData] = useState<RecebimentoRow[]>([]);
  const [kpis, setKpis] = useState<RecebimentoKpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Filtros
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterParceiroId, setFilterParceiroId] = useState("");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterStatusSla, setFilterStatusSla] = useState<"" | StatusSla>("");
  const [apenasConcluidos, setApenasConcluidos] = useState(false);
  const [slaHoras, setSlaHoras] = useState<string>("24");

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [parceiros, setParceiros] = useState<{ id: string; razaosocial: string }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from("armazem").select("id, descricao").eq("tenant_id", tenantId).eq("ativo", true)
      .then(({ data }) => setArmazens(data || []));
    (supabase as any).from("parceiro")
      .select("id, razaosocial, tipo_parceiro")
      .eq("tenant_id", tenantId).eq("ativo", true)
      .order("razaosocial").limit(500)
      .then(({ data }: any) => setParceiros(data || []));
  }, [tenantId]);

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
      const filters: RecebimentoFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: filterArmazemId || undefined,
        parceiro_id: filterParceiroId || undefined,
        data_inicio: filterDataInicio || undefined,
        data_fim: filterDataFim || undefined,
        status_sla: (filterStatusSla || undefined) as any,
        apenas_concluidos: apenasConcluidos,
        sla_horas: Number(slaHoras) || 24,
      };
      const result = await fetchRecebimentoReport(filters);
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
    setFilterArmazemId(""); setFilterParceiroId("");
    setFilterDataInicio(""); setFilterDataFim("");
    setFilterStatusSla(""); setApenasConcluidos(false);
    setSlaHoras("24");
  };

  const slaBadge = (s: StatusSla) => {
    const map: Record<StatusSla, { cls: string; label: string }> = {
      DENTRO: { cls: "bg-[hsl(var(--status-free))]/15 text-[hsl(var(--status-free))] border-[hsl(var(--status-free))]/30", label: "Dentro SLA" },
      ALERTA: { cls: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30", label: "Alerta" },
      FORA: { cls: "bg-[hsl(var(--status-blocked))]/15 text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/30", label: "Fora SLA" },
      EM_ANDAMENTO: { cls: "bg-muted text-muted-foreground border-border", label: "Em andamento" },
    };
    const m = map[s];
    return <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-bold border", m.cls)}>{m.label}</span>;
  };

  const durClass = (min: number | null, refMaxMin: number) => {
    if (min == null) return "text-muted-foreground";
    if (min > refMaxMin) return "text-[hsl(var(--status-blocked))] font-semibold";
    if (min > refMaxMin * 0.7) return "text-[hsl(var(--status-busy))]";
    return "text-foreground";
  };

  const columns: ReportColumn[] = [
    { key: "numero_movimento", label: "Mov.", width: "70px", align: "center", render: (v) => <span className="font-mono text-foreground">#{v ?? "—"}</span> },
    { key: "documento", label: "NF", width: "110px", render: (v) => <span className="font-mono text-[10px]">{v}</span> },
    { key: "fornecedor", label: "Fornecedor", width: "200px", render: (v) => <span className="truncate block max-w-[200px]" title={v}>{v}</span> },
    { key: "t0_dock", label: "Dock (T0)", width: "110px", render: (v) => <span className="text-[10px]">{formatBrasiliaDateTimeShort(v)}</span> },
    { key: "t5_stock", label: "Stock (T5)", width: "110px", render: (v) => <span className="text-[10px]">{v ? formatBrasiliaDateTimeShort(v) : "—"}</span> },
    {
      key: "tempo_total_min", label: "Total", align: "right", width: "90px",
      render: (v, row) => <span className={cn("font-semibold", durClass(v, row.sla_horas * 60))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_liberacao_min", label: "Liberação", align: "right", width: "90px",
      render: (v) => <span className={cn(durClass(v, 120))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_conferencia_min", label: "Conferência", align: "right", width: "100px",
      render: (v) => <span className={cn(durClass(v, 240))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_armazenagem_min", label: "Armazenagem", align: "right", width: "110px",
      render: (v) => <span className={cn(durClass(v, 360))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_ocioso_min", label: "Ocioso", align: "right", width: "90px",
      render: (v) => <span className={cn(durClass(v, 240))}>{formatDuration(v)}</span>,
    },
    {
      key: "perc_sla", label: "% SLA", align: "right", width: "80px",
      render: (v) => v == null
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-semibold", v > 100 ? "text-[hsl(var(--status-blocked))]" : v > 80 ? "text-[hsl(var(--status-busy))]" : "text-[hsl(var(--status-free))]")}>{v.toFixed(0)}%</span>,
    },
    { key: "status_sla", label: "Status", align: "center", width: "120px", render: (v) => slaBadge(v) },
  ];

  // KPIs no header
  const activeFilters: Record<string, string> = {};
  activeFilters["SLA alvo"] = `${slaHoras}h`;
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterParceiroId) activeFilters["Fornecedor"] = parceiros.find((p) => p.id === filterParceiroId)?.razaosocial || filterParceiroId;
  if (filterDataInicio) activeFilters["De"] = filterDataInicio;
  if (filterDataFim) activeFilters["Até"] = filterDataFim;
  if (filterStatusSla) activeFilters["Status"] = filterStatusSla;

  if (generated && kpis) {
    activeFilters["Concluídos"] = `${kpis.concluidos}`;
    activeFilters["Em andamento"] = `${kpis.em_andamento}`;
    activeFilters["Dentro SLA"] = `${kpis.dentro_sla}`;
    activeFilters["Alerta"] = `${kpis.alerta_sla}`;
    activeFilters["Fora SLA"] = `${kpis.fora_sla}`;
    activeFilters["Médio Total"] = formatDuration(kpis.tempo_medio_total_min);
    activeFilters["Médio Liberação"] = formatDuration(kpis.tempo_medio_liberacao_min);
    activeFilters["Médio Conferência"] = formatDuration(kpis.tempo_medio_conferencia_min);
    activeFilters["Médio Armazenagem"] = formatDuration(kpis.tempo_medio_armazenagem_min);
    activeFilters["Médio Ocioso"] = formatDuration(kpis.tempo_medio_ocioso_min);
    if (kpis.pior_etapa !== "—") activeFilters["Gargalo"] = kpis.pior_etapa;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Recebimento (Dock-to-Stock)"
        subtitle="Tempo do veículo na doca até produto disponível em estoque"
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
              <div className="space-y-1.5 lg:col-span-2">
                <Label className="text-xs">Fornecedor</Label>
                <Select value={filterParceiroId} onValueChange={setFilterParceiroId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{parceiros.map((p) => <SelectItem key={p.id} value={p.id}>{p.razaosocial}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">De</Label>
                <Input type="date" className="h-8 text-xs" value={filterDataInicio} onChange={(e) => setFilterDataInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Até</Label>
                <Input type="date" className="h-8 text-xs" value={filterDataFim} onChange={(e) => setFilterDataFim(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">SLA (horas)</Label>
                <Input type="number" min="1" className="h-8 text-xs" value={slaHoras} onChange={(e) => setSlaHoras(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status SLA</Label>
                <Select value={filterStatusSla} onValueChange={(v) => setFilterStatusSla(v as any)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DENTRO">Dentro SLA</SelectItem>
                    <SelectItem value="ALERTA">Alerta</SelectItem>
                    <SelectItem value="FORA">Fora SLA</SelectItem>
                    <SelectItem value="EM_ANDAMENTO">Em andamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex items-end">
                <label className="flex items-center gap-2 text-xs cursor-pointer h-8">
                  <input
                    type="checkbox"
                    checked={apenasConcluidos}
                    onChange={(e) => setApenasConcluidos(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span>Apenas concluídos</span>
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

      {generated && <ReportTable columns={columns} data={data} loading={loading} emptyMessage="Nenhum recebimento encontrado para os filtros." />}
    </div>
  );
}
