import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import {
  fetchCicloPedidoReport,
  formatDuration,
  type CicloPedidoFilter,
  type CicloPedidoRow,
  type CicloPedidoKpis,
  type StatusSla,
  type PiorEtapa,
} from "./cicloPedido.service";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { Filter, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTimeShort, nowDisplay } from "@/utils/dateTime";

const STATUS_ONDA = ["CRIADA", "EM_SEPARACAO", "SEPARADA", "CONFERIDO", "CONCLUIDA", "CANCELADA"];
const PRIORIDADES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"];

export function CicloPedidoReportPage() {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [data, setData] = useState<CicloPedidoRow[]>([]);
  const [kpis, setKpis] = useState<CicloPedidoKpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  // Filtros
  const [filterArmazemId, setFilterArmazemId] = useState("");
  const [filterParceiroId, setFilterParceiroId] = useState("");
  const [filterStatusOnda, setFilterStatusOnda] = useState("");
  const [filterPrioridade, setFilterPrioridade] = useState("");
  const [filterDataInicio, setFilterDataInicio] = useState("");
  const [filterDataFim, setFilterDataFim] = useState("");
  const [filterStatusSla, setFilterStatusSla] = useState<"" | StatusSla>("");
  const [apenasConcluidos, setApenasConcluidos] = useState(false);
  const [slaHoras, setSlaHoras] = useState<string>("24");

  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [parceiros, setParceiros] = useState<{ id: string; razaosocial: string }[]>([]);

  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]); setParceiros([]);
      return;
    }
    supabase.from("armazem").select("id, descricao")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao")
      .then(({ data }) => setArmazens(data || []));
    (supabase as any).from("parceiro")
      .select("id, razaosocial")
      .eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true)
      .order("razaosocial").limit(500)
      .then(({ data }: any) => setParceiros(data || []));
  }, [tenantId, empresaId, empresaVersion]);

  // Reset relatório ao trocar empresa
  useEffect(() => {
    setData([]);
    setKpis(null);
    setGenerated(false);
    setGeneratedAt("");
    setFilterArmazemId(""); setFilterParceiroId("");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const filters: CicloPedidoFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: filterArmazemId || undefined,
        parceiro_id: filterParceiroId || undefined,
        status_onda: filterStatusOnda || undefined,
        prioridade: filterPrioridade || undefined,
        data_inicio: filterDataInicio || undefined,
        data_fim: filterDataFim || undefined,
        status_sla: (filterStatusSla || undefined) as any,
        apenas_concluidos: apenasConcluidos,
        sla_horas: Number(slaHoras) || 24,
      };
      const result = await fetchCicloPedidoReport(filters);
      setData(result.rows);
      setKpis(result.kpis);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFilterArmazemId(""); setFilterParceiroId("");
    setFilterStatusOnda(""); setFilterPrioridade("");
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

  const piorBadge = (p: PiorEtapa) => {
    if (p === "—") return <span className="text-muted-foreground">—</span>;
    return (
      <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold border bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/30">
        {p}
      </span>
    );
  };

  const durClass = (min: number | null, refMaxMin: number) => {
    if (min == null) return "text-muted-foreground";
    if (min > refMaxMin) return "text-[hsl(var(--status-blocked))] font-semibold";
    if (min > refMaxMin * 0.7) return "text-[hsl(var(--status-busy))]";
    return "text-foreground";
  };

  const columns: ReportColumn[] = [
    { key: "numero_onda", label: "Onda", width: "70px", align: "center", render: (v) => <span className="font-mono text-foreground">#{v ?? "—"}</span> },
    { key: "pedidos", label: "Pedido(s)", width: "120px", render: (v) => <span className="font-mono text-[10px]">{v}</span> },
    { key: "cliente", label: "Cliente", width: "200px", render: (v) => <span className="truncate block max-w-[200px]" title={v}>{v}</span> },
    { key: "status", label: "Status", width: "110px", render: (v) => <span className="text-[10px] uppercase">{v ?? "—"}</span> },
    { key: "prioridade", label: "Prio.", width: "70px", align: "center", render: (v) => <span className="text-[10px] uppercase">{v ?? "—"}</span> },
    { key: "t0_criacao", label: "Criação", width: "110px", render: (v) => <span className="text-[10px]">{formatDateTimeShort(v)}</span> },
    { key: "t2_inicio_sep", label: "Início Sep.", width: "110px", render: (v) => <span className="text-[10px]">{v ? formatDateTimeShort(v) : "—"}</span> },
    { key: "t3_fim_sep", label: "Fim Sep.", width: "110px", render: (v) => <span className="text-[10px]">{v ? formatDateTimeShort(v) : "—"}</span> },
    { key: "t4_fim_conf", label: "Fim Conf.", width: "110px", render: (v) => <span className="text-[10px]">{v ? formatDateTimeShort(v) : "—"}</span> },
    { key: "t5_expedicao", label: "Expedição", width: "110px", render: (v) => <span className="text-[10px]">{v ? formatDateTimeShort(v) : "—"}</span> },
    {
      key: "tempo_total_min", label: "Total", align: "right", width: "90px",
      render: (v, row) => <span className={cn("font-semibold", durClass(v, row.sla_horas * 60))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_fila_min", label: "Fila", align: "right", width: "80px",
      render: (v) => <span className={cn(durClass(v, 120))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_picking_min", label: "Picking", align: "right", width: "90px",
      render: (v) => <span className={cn(durClass(v, 240))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_conferencia_min", label: "Conferência", align: "right", width: "100px",
      render: (v) => <span className={cn(durClass(v, 180))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_pos_conf_min", label: "Pós-Conf.", align: "right", width: "90px",
      render: (v) => <span className={cn(durClass(v, 180))}>{formatDuration(v)}</span>,
    },
    {
      key: "tempo_ocioso_min", label: "Ocioso", align: "right", width: "90px",
      render: (v) => <span className={cn(durClass(v, 240))}>{formatDuration(v)}</span>,
    },
    { key: "pior_etapa", label: "Gargalo", align: "center", width: "120px", render: (v) => piorBadge(v) },
    {
      key: "perc_sla", label: "% SLA", align: "right", width: "80px",
      render: (v) => v == null
        ? <span className="text-muted-foreground">—</span>
        : <span className={cn("font-semibold", v > 100 ? "text-[hsl(var(--status-blocked))]" : v > 80 ? "text-[hsl(var(--status-busy))]" : "text-[hsl(var(--status-free))]")}>{v.toFixed(0)}%</span>,
    },
    { key: "status_sla", label: "SLA", align: "center", width: "120px", render: (v) => slaBadge(v) },
  ];

  const activeFilters: Record<string, string> = {};
  activeFilters["SLA alvo"] = `${slaHoras}h`;
  if (filterArmazemId) activeFilters["Armazém"] = armazens.find((a) => a.id === filterArmazemId)?.descricao || filterArmazemId;
  if (filterParceiroId) activeFilters["Cliente"] = parceiros.find((p) => p.id === filterParceiroId)?.razaosocial || filterParceiroId;
  if (filterStatusOnda) activeFilters["Status"] = filterStatusOnda;
  if (filterPrioridade) activeFilters["Prioridade"] = filterPrioridade;
  if (filterDataInicio) activeFilters["De"] = filterDataInicio;
  if (filterDataFim) activeFilters["Até"] = filterDataFim;
  if (filterStatusSla) activeFilters["SLA"] = filterStatusSla;

  if (generated && kpis) {
    activeFilters["Concluídas"] = `${kpis.concluidas}`;
    activeFilters["Em andamento"] = `${kpis.em_andamento}`;
    activeFilters["Dentro SLA"] = `${kpis.dentro_sla}`;
    activeFilters["Alerta"] = `${kpis.alerta_sla}`;
    activeFilters["Fora SLA"] = `${kpis.fora_sla}`;
    activeFilters["Médio Total"] = formatDuration(kpis.tempo_medio_total_min);
    activeFilters["Médio Fila"] = formatDuration(kpis.tempo_medio_fila_min);
    activeFilters["Médio Picking"] = formatDuration(kpis.tempo_medio_picking_min);
    activeFilters["Médio Conferência"] = formatDuration(kpis.tempo_medio_conferencia_min);
    activeFilters["Médio Pós-Conf."] = formatDuration(kpis.tempo_medio_pos_conf_min);
    activeFilters["Médio Ocioso"] = formatDuration(kpis.tempo_medio_ocioso_min);
    if (kpis.pior_etapa !== "—") activeFilters["Gargalo"] = kpis.pior_etapa;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Tempo de Ciclo de Pedido (Order Cycle Time)"
        subtitle="Tempo do pedido desde a criação até a expedição final"
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
                <Label className="text-xs">Cliente</Label>
                <Select value={filterParceiroId} onValueChange={setFilterParceiroId}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{parceiros.map((p) => <SelectItem key={p.id} value={p.id}>{p.razaosocial}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Status Onda</Label>
                <Select value={filterStatusOnda} onValueChange={setFilterStatusOnda}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                  <SelectContent>{STATUS_ONDA.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioridade</Label>
                <Select value={filterPrioridade} onValueChange={setFilterPrioridade}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
                  <SelectContent>{PRIORIDADES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
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
                  <span>Apenas concluídas</span>
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

      {generated && <ReportTable columns={columns} data={data} loading={loading} emptyMessage="Nenhum pedido encontrado para os filtros." />}
    </div>
  );
}
