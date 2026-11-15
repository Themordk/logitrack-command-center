import { useState, useEffect, useMemo, useRef } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";
import {
  fetchOcupacaoResumo,
  fetchOcupacaoPage,
  fetchOcupacaoAll,
  getOcupacaoColor,
  getOcupacaoProgressColor,
  OCUPACAO_PAGE_SIZE,
  STATUS_CORES,
  type EnderecoOcupacao,
  type OcupacaoFilter,
  type OcupacaoListaFilter,
  type OcupacaoResumo,
  type SetorResumo,
  type StatusOcupacao,
} from "./ocupacao.service";
import { exportToExcel, fmtDateTimeBR, fmtNumberBR, type ExportColumn } from "../utils/exporters";
import {
  Warehouse,
  MapPin,
  Package,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  PieChart as PieChartIcon,
  Search,
  FileSpreadsheet,
  X,
} from "lucide-react";

const TODOS = "__all__";

const SITUACAO_LABEL: Record<string, string> = {
  LIVRE: "Livre",
  OCUPADO: "Ocupado",
  BLOQUEADO: "Bloqueado",
  BLOQUEADO_INVENTARIO: "Bloq. inventário",
};

const fmtPerc = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);

export function OcupacaoReportPage() {
  const { tenantId, empresaId, empresaVersion } = useTenant();

  // Filtros
  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [setores, setSetores] = useState<{ id: string; descricao: string }[]>([]);
  const [selectedArmazem, setSelectedArmazem] = useState("");
  const [selectedSetor, setSelectedSetor] = useState(TODOS);
  const [selectedTipo, setSelectedTipo] = useState(TODOS);
  const [selectedStatus, setSelectedStatus] = useState(TODOS);
  const [apenasDivergentes, setApenasDivergentes] = useState(false);

  // Dados
  const [resumo, setResumo] = useState<OcupacaoResumo | null>(null);
  const [baseFilters, setBaseFilters] = useState<OcupacaoFilter | null>(null);
  const [listaFilters, setListaFilters] = useState<OcupacaoListaFilter | null>(null);
  const [rows, setRows] = useState<EnderecoOcupacao[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingLista, setLoadingLista] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [expandedSetor, setExpandedSetor] = useState<string | null>(null);
  const reqId = useRef(0);

  // Armazéns da empresa
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

  // Setores do armazém
  useEffect(() => {
    setSelectedSetor(TODOS);
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

  // Reset ao trocar empresa
  useEffect(() => {
    setResumo(null);
    setRows([]);
    setTotal(0);
    setBaseFilters(null);
    setListaFilters(null);
    setExpandedSetor(null);
    setSelectedTipo(TODOS);
    setSelectedStatus(TODOS);
    setApenasDivergentes(false);
  }, [empresaId, empresaVersion]);

  const carregarLista = async (f: OcupacaoListaFilter, p: number) => {
    const id = ++reqId.current;
    setLoadingLista(true);
    try {
      const res = await fetchOcupacaoPage(f, p);
      if (id !== reqId.current) return;
      setRows(res.rows);
      setTotal(res.total);
      setPage(p);
      setListaFilters(f);
    } catch (err: any) {
      if (id === reqId.current) toast.error(err?.message || "Erro ao carregar endereços.");
    } finally {
      if (id === reqId.current) setLoadingLista(false);
    }
  };

  const montarLista = (base: OcupacaoFilter, setorDrill: string | null): OcupacaoListaFilter => ({
    ...base,
    setor_id: setorDrill ?? base.setor_id,
    status_ocupacao: selectedStatus !== TODOS ? (selectedStatus as StatusOcupacao) : undefined,
    apenas_divergentes: apenasDivergentes,
  });

  const handleGenerate = async () => {
    if (!tenantId || !selectedArmazem) {
      toast.error("Selecione o armazém para gerar o relatório.");
      return;
    }
    const base: OcupacaoFilter = {
      tenant_id: tenantId,
      armazem_id: selectedArmazem,
      setor_id: selectedSetor !== TODOS ? selectedSetor : undefined,
      tipo_endereco: selectedTipo !== TODOS ? selectedTipo : undefined,
    };
    setLoading(true);
    setExpandedSetor(null);
    try {
      const [res] = await Promise.all([fetchOcupacaoResumo(base), carregarLista(montarLista(base, null), 0)]);
      setResumo(res);
      setBaseFilters(base);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao carregar dados de ocupação.");
    } finally {
      setLoading(false);
    }
  };

  const toggleSetor = (setor: SetorResumo) => {
    if (!baseFilters || !listaFilters) return;
    const key = setor.setor_id ?? "__sem__";
    const abrir = expandedSetor !== key;
    setExpandedSetor(abrir ? key : null);
    carregarLista({ ...listaFilters, setor_id: abrir ? setor.setor_id ?? undefined : baseFilters.setor_id }, 0);
  };

  const totalPaginas = Math.max(1, Math.ceil(total / OCUPACAO_PAGE_SIZE));
  const setorAberto = resumo?.setores.find((s) => (s.setor_id ?? "__sem__") === expandedSetor);

  const exportColumns: ExportColumn[] = [
    { key: "descricao", label: "Endereço" },
    { key: "setor_descricao", label: "Setor" },
    { key: "tipo_endereco", label: "Tipo" },
    { key: "situacao", label: "Situação (cadastro)", format: (r) => SITUACAO_LABEL[r.situacao] ?? r.situacao },
    { key: "status_ocupacao", label: "Status" },
    { key: "quantidade_total", label: "Saldo", format: (r) => fmtNumberBR(r.quantidade_total) },
    { key: "skus_count", label: "SKUs" },
    { key: "capacidade", label: "Capacidade (un)", format: (r) => (r.capacidade === null ? "" : fmtNumberBR(r.capacidade)) },
    { key: "percentual_ocupacao", label: "% Capacidade", format: (r) => (r.percentual_ocupacao === null ? "" : `${r.percentual_ocupacao}%`) },
    { key: "divergente", label: "Divergência", format: (r) => (r.divergente ? textoDivergencia(r) : "") },
    { key: "ultima_atualizacao", label: "Última Atualização", format: (r) => fmtDateTimeBR(r.ultima_atualizacao) },
  ];

  const handleExcel = async () => {
    if (!listaFilters || total === 0) return;
    setExporting(true);
    try {
      const todas = await fetchOcupacaoAll(listaFilters, total);
      exportToExcel("ocupacao_enderecos", exportColumns, todas);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao exportar.");
    } finally {
      setExporting(false);
    }
  };

  const barChartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    resumo?.setores.forEach((s) => {
      config[s.setor_id ?? "__sem__"] = { label: s.setor_descricao, color: getOcupacaoProgressColor(s.percentual_ocupacao) };
    });
    return config;
  }, [resumo]);

  const pieChartConfig = {
    Ocupado: { label: "Ocupado", color: STATUS_CORES.Ocupado },
    Parcial: { label: "Parcial", color: STATUS_CORES.Parcial },
    Livre: { label: "Livre", color: STATUS_CORES.Livre },
    Bloqueado: { label: "Bloqueado", color: STATUS_CORES.Bloqueado },
  };

  const k = resumo?.kpis;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Relatório Inteligente de Ocupação</h1>
        <p className="text-sm text-muted-foreground mt-1">Visão operacional da saúde de ocupação do armazém</p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground">Armazém *</label>
              <Select value={selectedArmazem} onValueChange={setSelectedArmazem}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {armazens.map((a) => (
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
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {setores.map((s) => (
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
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  <SelectItem value="PICKING">Picking</SelectItem>
                  <SelectItem value="PULMAO">Pulmão</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1 min-w-[140px]">
              <label className="text-xs font-medium text-muted-foreground">Status (lista)</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  <SelectItem value="LIVRE">Livre</SelectItem>
                  <SelectItem value="PARCIAL">Parcial</SelectItem>
                  <SelectItem value="OCUPADO">Ocupado</SelectItem>
                  <SelectItem value="BLOQUEADO">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 h-9 text-xs text-muted-foreground cursor-pointer">
              <Switch checked={apenasDivergentes} onCheckedChange={setApenasDivergentes} aria-label="Só divergências" />
              Só divergências
            </label>

            <Button onClick={handleGenerate} disabled={loading || !selectedArmazem} size="sm" className="h-9">
              <Search size={14} className="mr-1" />
              {loading ? "Carregando..." : "Gerar Relatório"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      )}

      {resumo && k && !loading && (
        <>
          {/* Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
            <StatCard
              label="Endereços ativos"
              value={fmtNumberBR(k.total_enderecos)}
              sub={`${resumo.setores.length} ${resumo.setores.length === 1 ? "setor" : "setores"}`}
            />
            <StatCard
              label="Ocupados"
              value={`${k.percentual_ocupados}%`}
              valueClass={getOcupacaoColor(k.percentual_ocupados)}
              sub={`${fmtNumberBR(k.enderecos_ocupados)} end.${k.enderecos_parciais > 0 ? ` · ${fmtNumberBR(k.enderecos_parciais)} parciais` : ""}`}
            />
            <StatCard
              label="Livres"
              value={`${k.percentual_livres}%`}
              valueClass="text-[hsl(var(--status-free))]"
              sub={`${fmtNumberBR(k.enderecos_livres)} end. sem saldo`}
            />
            <StatCard
              label="Bloqueados"
              value={fmtNumberBR(k.enderecos_bloqueados)}
              sub={k.bloqueados_com_saldo > 0 ? `${fmtNumberBR(k.bloqueados_com_saldo)} com saldo` : `${k.percentual_bloqueados}% dos endereços`}
            />
            <StatCard
              label="Ocupação da capacidade"
              value={fmtPerc(k.ocupacao_capacidade)}
              sub={
                k.enderecos_com_capacidade > 0
                  ? `${fmtNumberBR(k.enderecos_com_capacidade)} end. com capacidade${k.acima_capacidade > 0 ? ` · ${fmtNumberBR(k.acima_capacidade)} acima` : ""}`
                  : "sem capacidade cadastrada"
              }
            />
            <StatCard
              label="Divergências"
              value={fmtNumberBR(k.divergencias)}
              valueClass={k.divergencias > 0 ? "text-[hsl(var(--status-busy))]" : undefined}
              sub={
                k.divergencias > 0
                  ? `${fmtNumberBR(k.livre_com_saldo)} livre c/ saldo · ${fmtNumberBR(k.ocupado_sem_saldo)} ocup. s/ saldo`
                  : "situação = estoque"
              }
            />
          </div>

          {/* Mapa por setor */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin size={14} className="text-primary" />
                Mapa de Ocupação por Setor
              </h2>
              {(k.setor_mais_saturado || k.setor_mais_ocioso) && (
                <span className="text-xs text-muted-foreground">
                  {k.setor_mais_saturado && <>Mais saturado: <strong className="text-foreground">{k.setor_mais_saturado}</strong></>}
                  {k.setor_mais_ocioso && <> · Mais ocioso: <strong className="text-foreground">{k.setor_mais_ocioso}</strong></>}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {resumo.setores.map((setor) => (
                <SetorCard
                  key={setor.setor_id ?? "__sem__"}
                  setor={setor}
                  isExpanded={expandedSetor === (setor.setor_id ?? "__sem__")}
                  onClick={() => toggleSetor(setor)}
                />
              ))}
              {resumo.setores.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full text-center py-8">Nenhum endereço ativo encontrado.</p>
              )}
            </div>
          </div>

          {/* Lista de endereços */}
          <Card className="animate-fade-in">
            <CardHeader className="py-3 px-5">
              <CardTitle className="text-sm font-semibold flex flex-wrap items-center gap-2">
                <Package size={14} className="text-primary" />
                Endereços — {setorAberto ? setorAberto.setor_descricao : "todos os setores"}
                <Badge variant="secondary" className="text-xs">{fmtNumberBR(total)} endereços</Badge>
                {listaFilters?.status_ocupacao && <Badge variant="outline" className="text-xs">{listaFilters.status_ocupacao}</Badge>}
                {listaFilters?.apenas_divergentes && <Badge variant="outline" className="text-xs">Só divergências</Badge>}
                {setorAberto && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => toggleSetor(setorAberto)}>
                    <X size={12} className="mr-1" /> Limpar setor
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 ml-auto text-xs"
                  onClick={handleExcel}
                  disabled={exporting || total === 0}
                >
                  <FileSpreadsheet size={12} className="mr-1" />
                  {exporting ? "Exportando..." : "Excel"}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className={`overflow-auto max-h-[480px] ${loadingLista ? "opacity-60" : ""}`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Endereço</TableHead>
                      <TableHead className="text-xs">Setor</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Situação (cadastro)</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs text-right">Saldo</TableHead>
                      <TableHead className="text-xs text-right">SKUs</TableHead>
                      <TableHead className="text-xs text-right">Capacidade</TableHead>
                      <TableHead className="text-xs text-right">% Cap.</TableHead>
                      <TableHead className="text-xs">Última atualização</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((end) => (
                      <TableRow key={end.id}>
                        <TableCell className="text-xs font-mono whitespace-nowrap">
                          <span className="inline-flex items-center gap-1">
                            {end.divergente && (
                              <span title={textoDivergencia(end)} aria-label={textoDivergencia(end)}>
                                <AlertTriangle size={12} className="text-[hsl(var(--status-busy))]" />
                              </span>
                            )}
                            {end.descricao}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">{end.setor_descricao}</TableCell>
                        <TableCell className="text-xs">{end.tipo_endereco}</TableCell>
                        <TableCell className={`text-xs ${end.divergente ? "text-[hsl(var(--status-busy))] font-medium" : ""}`}>
                          {SITUACAO_LABEL[end.situacao] ?? end.situacao}
                        </TableCell>
                        <TableCell><StatusBadge status={end.status_ocupacao} /></TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtNumberBR(end.quantidade_total)}</TableCell>
                        <TableCell className="text-xs text-right">{end.skus_count}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{end.capacidade === null ? "—" : fmtNumberBR(end.capacidade)}</TableCell>
                        <TableCell className="text-xs text-right font-mono">{fmtPerc(end.percentual_ocupacao)}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDateTimeBR(end.ultima_atualizacao) || "—"}</TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-xs text-muted-foreground py-6">
                          Nenhum endereço para os filtros.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {total > OCUPACAO_PAGE_SIZE && listaFilters && (
                <div className="flex items-center justify-end gap-2 mt-3 text-xs text-muted-foreground">
                  <span>Página {page + 1} de {totalPaginas}</span>
                  <Button
                    variant="outline" size="icon" className="h-7 w-7" aria-label="Página anterior"
                    disabled={page === 0 || loadingLista}
                    onClick={() => carregarLista(listaFilters, page - 1)}
                  >
                    <ChevronLeft size={14} />
                  </Button>
                  <Button
                    variant="outline" size="icon" className="h-7 w-7" aria-label="Próxima página"
                    disabled={page + 1 >= totalPaginas || loadingLista}
                    onClick={() => carregarLista(listaFilters, page + 1)}
                  >
                    <ChevronRight size={14} />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {resumo.setores.length > 0 && (
              <Card>
                <CardHeader className="py-3 px-5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 size={14} className="text-primary" />
                    Endereços ocupados por Setor
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  <ChartContainer config={barChartConfig} className="h-[280px] w-full">
                    <BarChart data={resumo.setores.map((s) => ({
                      name: s.setor_descricao.length > 12 ? s.setor_descricao.slice(0, 12) + "…" : s.setor_descricao,
                      ocupacao: s.percentual_ocupacao,
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 35% 18%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(215 20% 55%)" }} domain={[0, 100]} unit="%" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="ocupacao" name="Ocupados %" radius={[4, 4, 0, 0]}>
                        {resumo.setores.map((s, i) => (
                          <Cell key={i} fill={getOcupacaoProgressColor(s.percentual_ocupacao)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            )}

            {resumo.statusDistribution.length > 0 && (
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
                        data={resumo.statusDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {resumo.statusDistribution.map((entry, i) => (
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

      {!resumo && !loading && (
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

// ── Sub-componentes ──────────────────────────────────────────────

function textoDivergencia(e: Pick<EnderecoOcupacao, "situacao" | "quantidade_total">): string {
  if (e.situacao === "LIVRE" && e.quantidade_total > 0) return "Cadastro LIVRE, mas o endereço tem saldo";
  if (e.situacao === "OCUPADO" && e.quantidade_total === 0) return "Cadastro OCUPADO, mas o endereço está sem saldo";
  return "Situação do cadastro diverge do estoque";
}

function StatCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="border border-border rounded-lg bg-card px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${valueClass ?? "text-foreground"}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
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
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      className={`cursor-pointer transition-all hover:border-primary/40 ${isExpanded ? "border-primary ring-1 ring-primary/20" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
    >
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-foreground truncate">{setor.setor_descricao}</span>
          {isExpanded ? <ChevronUp size={14} className="text-primary shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
        </div>

        <div className="mb-2">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-2xl font-bold" style={{ color: progressColor }}>{setor.percentual_ocupacao}%</span>
            <span className="text-xs text-muted-foreground">{fmtNumberBR(setor.total_enderecos)} end.</span>
          </div>
          <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${setor.percentual_ocupacao}%`, backgroundColor: progressColor }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--status-blocked))]" />
            {fmtNumberBR(setor.enderecos_ocupados)} ocup.
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[hsl(var(--status-free))]" />
            {fmtNumberBR(setor.enderecos_livres)} livres
          </span>
          {setor.enderecos_bloqueados > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[hsl(var(--status-busy))]" />
              {fmtNumberBR(setor.enderecos_bloqueados)} bloq.
            </span>
          )}
          {setor.ocupacao_capacidade !== null && <span>Cap. {fmtPerc(setor.ocupacao_capacidade)}</span>}
          {setor.divergencias > 0 && (
            <span className="flex items-center gap-1 text-[hsl(var(--status-busy))]">
              <AlertTriangle size={11} /> {fmtNumberBR(setor.divergencias)} diverg.
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
    BLOQUEADO: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0.5 ${styles[status] || ""}`}>
      {status}
    </Badge>
  );
}
