import { useState, useEffect, useMemo } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import {
  fetchOcupacaoData,
  getOcupacaoColor,
  getOcupacaoProgressColor,
  type OcupacaoData,
  type OcupacaoFilter,
  type SetorResumo,
} from "./ocupacao.service";
import {
  Warehouse,
  MapPin,
  Package,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  BarChart3,
  PieChart as PieChartIcon,
  Search,
} from "lucide-react";

export function OcupacaoReportPage() {
  const { tenantId, empresaId, empresaVersion } = useTenant();

  // Filter state
  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [setores, setSetores] = useState<{ id: string; descricao: string }[]>([]);
  const [selectedArmazem, setSelectedArmazem] = useState("");
  const [selectedSetor, setSelectedSetor] = useState("__all__");
  const [selectedTipo, setSelectedTipo] = useState("__all__");
  const [selectedStatus, setSelectedStatus] = useState("__all__");

  // Data
  const [data, setData] = useState<OcupacaoData | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedSetor, setExpandedSetor] = useState<string | null>(null);

  // Load armazens scoped by empresa
  useEffect(() => {
    if (!tenantId || !empresaId) {
      setArmazens([]);
      setSelectedArmazem("");
      return;
    }
    supabase
      .from("armazem")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("descricao")
      .then(({ data }) => {
        const list = data || [];
        setArmazens(list);
        setSelectedArmazem(list.length === 1 ? list[0].id : "");
      });
  }, [tenantId, empresaId, empresaVersion]);

  // Load setores when armazem changes
  useEffect(() => {
    if (!tenantId || !selectedArmazem) { setSetores([]); return; }
    supabase
      .from("setor")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("armazem_id", selectedArmazem)
      .eq("ativo", true)
      .order("descricao")
      .then(({ data }) => setSetores(data || []));
  }, [tenantId, selectedArmazem]);

  // Reset relatório e filtros ao trocar empresa
  useEffect(() => {
    setData(null);
    setExpandedSetor(null);
    setSelectedSetor("__all__");
    setSelectedTipo("__all__");
    setSelectedStatus("__all__");
  }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId || !empresaId || !selectedArmazem) {
      toast.error("Selecione o armazém para gerar o relatório.");
      return;
    }
    setLoading(true);
    setExpandedSetor(null);
    try {
      const filters: OcupacaoFilter = {
        tenant_id: tenantId,
        empresa_id: empresaId,
        armazem_id: selectedArmazem,
        setor_id: selectedSetor !== "__all__" ? selectedSetor : undefined,
        tipo_endereco: selectedTipo !== "__all__" ? selectedTipo : undefined,
        status_ocupacao: selectedStatus !== "__all__" ? selectedStatus : undefined,
      };
      const result = await fetchOcupacaoData(filters);
      setData(result);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao carregar dados de ocupação.");
    } finally {
      setLoading(false);
    }
  };

  // Drill-down enderecos for expanded setor
  const drillDownEnderecos = useMemo(() => {
    if (!data || !expandedSetor) return [];
    return data.enderecos
      .filter(e => e.setor_id === expandedSetor)
      .sort((a, b) => b.quantidade_total - a.quantidade_total);
  }, [data, expandedSetor]);

  // Chart config
  const barChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    data?.setores.forEach(s => {
      config[s.setor_id] = { label: s.setor_descricao, color: getOcupacaoProgressColor(s.percentual_ocupacao) };
    });
    return config;
  }, [data]);

  const pieChartConfig = {
    Ocupado: { label: "Ocupado", color: "hsl(0 84% 60%)" },
    Livre: { label: "Livre", color: "hsl(142 76% 36%)" },
    Bloqueado: { label: "Bloqueado", color: "hsl(45 93% 47%)" },
  };

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Relatório Inteligente de Ocupação</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão operacional da saúde de ocupação do armazém</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground">Armazém *</label>
              <Select value={selectedArmazem} onValueChange={setSelectedArmazem}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {armazens.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">Setor</label>
              <Select value={selectedSetor} onValueChange={setSelectedSetor}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  {setores.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.descricao}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Tipo de Endereço</label>
              <Select value={selectedTipo} onValueChange={setSelectedTipo}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="PICKING">Picking</SelectItem>
                  <SelectItem value="PULMAO">Pulmão</SelectItem>
                  <SelectItem value="DOCK">Dock</SelectItem>
                  <SelectItem value="AVARIA">Avaria</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos</SelectItem>
                  <SelectItem value="LIVRE">Livre</SelectItem>
                  <SelectItem value="PARCIAL">Parcial</SelectItem>
                  <SelectItem value="OCUPADO">Ocupado</SelectItem>
                  <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={handleGenerate} disabled={loading || !selectedArmazem} size="sm" className="h-9">
              <Search size={14} className="mr-1" />
              {loading ? "Carregando..." : "Gerar Relatório"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading skeleton */}
      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      )}

      {/* Content */}
      {data && !loading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KPICard
              title="Total Endereços"
              value={data.kpis.total_enderecos.toString()}
              icon={<MapPin size={16} />}
              color="text-primary"
            />
            <KPICard
              title="Ocupados"
              value={`${data.kpis.percentual_ocupados}%`}
              subtitle={`${data.kpis.enderecos_ocupados} end.`}
              icon={<Package size={16} />}
              color={getOcupacaoColor(data.kpis.percentual_ocupados)}
            />
            <KPICard
              title="Livres"
              value={`${data.kpis.percentual_livres}%`}
              subtitle={`${data.kpis.enderecos_livres} end.`}
              icon={<Warehouse size={16} />}
              color="text-[hsl(var(--status-free))]"
            />
            <KPICard
              title="Taxa Média Ocupação"
              value={`${data.kpis.taxa_media_ocupacao}%`}
              icon={<BarChart3 size={16} />}
              color={getOcupacaoColor(data.kpis.taxa_media_ocupacao)}
            />
            <KPICard
              title="Setor + Saturado"
              value={data.kpis.setor_mais_saturado}
              icon={<TrendingUp size={16} />}
              color="text-[hsl(var(--status-blocked))]"
              small
            />
            <KPICard
              title="Setor + Ocioso"
              value={data.kpis.setor_mais_ocioso}
              icon={<TrendingDown size={16} />}
              color="text-[hsl(var(--status-free))]"
              small
            />
          </div>

          {/* Sector Map */}
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MapPin size={14} className="text-primary" />
              Mapa de Ocupação por Setor
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {data.setores.map(setor => (
                <SetorCard
                  key={setor.setor_id}
                  setor={setor}
                  isExpanded={expandedSetor === setor.setor_id}
                  onClick={() => setExpandedSetor(expandedSetor === setor.setor_id ? null : setor.setor_id)}
                />
              ))}
              {data.setores.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhum setor encontrado.</p>
              )}
            </div>
          </div>

          {/* Drill-Down Table */}
          {expandedSetor && (
            <Card className="animate-fade-in">
              <CardHeader className="py-3 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Package size={14} className="text-primary" />
                  Detalhes — {data.setores.find(s => s.setor_id === expandedSetor)?.setor_descricao}
                  <Badge variant="secondary" className="ml-2 text-xs">{drillDownEnderecos.length} endereços</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-4">
                <div className="overflow-auto max-h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Endereço</TableHead>
                        <TableHead className="text-xs text-right">Qtd. Total</TableHead>
                        <TableHead className="text-xs text-right">SKUs</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Situação</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {drillDownEnderecos.slice(0, 50).map(end => (
                        <TableRow key={end.id}>
                          <TableCell className="text-xs font-mono">{end.descricao}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{end.quantidade_total.toLocaleString("pt-BR")}</TableCell>
                          <TableCell className="text-xs text-right">{end.skus_count}</TableCell>
                          <TableCell className="text-xs">{end.tipo_endereco}</TableCell>
                          <TableCell className="text-xs">{end.situacao}</TableCell>
                          <TableCell>
                            <StatusBadge status={end.status_ocupacao} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {drillDownEnderecos.length > 50 && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      Exibindo 50 de {drillDownEnderecos.length} endereços
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Bar Chart - Ocupação por Setor */}
            {data.setores.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 size={14} className="text-primary" />
                    Ocupação por Setor
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ChartContainer config={barChartConfig} className="h-[280px] w-full">
                    <BarChart data={data.setores.map(s => ({
                      name: s.setor_descricao.length > 12 ? s.setor_descricao.slice(0, 12) + "…" : s.setor_descricao,
                      ocupacao: s.percentual_ocupacao,
                      fill: getOcupacaoProgressColor(s.percentual_ocupacao),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 35% 18%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} domain={[0, 100]} unit="%" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="ocupacao" name="Ocupação %" radius={[4, 4, 0, 0]}>
                        {data.setores.map((s, i) => (
                          <Cell key={i} fill={getOcupacaoProgressColor(s.percentual_ocupacao)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {/* Pie Chart - Distribuição de Status */}
            {data.statusDistribution.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieChartIcon size={14} className="text-primary" />
                    Distribuição de Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ChartContainer config={pieChartConfig} className="h-[280px] w-full">
                    <PieChart>
                      <Pie
                        data={data.statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {data.statusDistribution.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Empty state */}
      {!data && !loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center mb-4">
            <Warehouse size={28} className="text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Selecione um armazém e clique em <strong>Gerar Relatório</strong> para visualizar a ocupação.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function KPICard({ title, value, subtitle, icon, color, small }: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  small?: boolean;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground font-medium">{title}</span>
          <span className={color}>{icon}</span>
        </div>
        <div className={`${small ? "text-sm" : "text-2xl"} font-bold ${color} leading-tight`}>{value}</div>
        {subtitle && <span className="text-xs text-muted-foreground mt-0.5 block">{subtitle}</span>}
      </CardContent>
    </Card>
  );
}

function SetorCard({ setor, isExpanded, onClick }: {
  setor: SetorResumo;
  isExpanded: boolean;
  onClick: () => void;
}) {
  const progressColor = getOcupacaoProgressColor(setor.percentual_ocupacao);

  return (
    <Card
      className={`cursor-pointer transition-all hover:border-primary/40 ${isExpanded ? "border-primary ring-1 ring-primary/20" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground truncate">{setor.setor_descricao}</span>
          {isExpanded ? <ChevronUp size={14} className="text-primary shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
        </div>

        <div className="mb-2">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-2xl font-bold" style={{ color: progressColor }}>{setor.percentual_ocupacao}%</span>
            <span className="text-xs text-muted-foreground">{setor.total_enderecos} end.</span>
          </div>
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${setor.percentual_ocupacao}%`, backgroundColor: progressColor }}
            />
          </div>
        </div>

        <div className="flex gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--status-blocked))]" />
            {setor.enderecos_ocupados} ocup.
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--status-free))]" />
            {setor.enderecos_livres} livres
          </span>
          {setor.enderecos_bloqueados > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--status-busy))]" />
              {setor.enderecos_bloqueados} bloq.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    LIVRE: "bg-[hsl(var(--status-free-bg))] text-[hsl(var(--status-free))] border-[hsl(var(--status-free))]/20",
    PARCIAL: "bg-[hsl(var(--status-busy-bg))] text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/20",
    OCUPADO: "bg-[hsl(var(--status-blocked-bg))] text-[hsl(var(--status-blocked))] border-[hsl(var(--status-blocked))]/20",
    BLOQUEADO: "bg-[hsl(var(--status-busy-bg))] text-[hsl(var(--status-busy))] border-[hsl(var(--status-busy))]/20",
  };

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${styles[status] || ""}`}>
      {status}
    </Badge>
  );
}
