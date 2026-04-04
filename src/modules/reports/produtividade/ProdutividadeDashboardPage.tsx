import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReportHeader } from "../components/ReportHeader";
import { toast } from "sonner";
import { Loader2, Users, Clock, TrendingUp, CheckCircle, Activity, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  fetchProdutividadeGeral,
  formatSegundos,
  getCorOcupacao,
  type ProdutividadeFilters,
  type OperadorResumo,
  type ProdutividadePorTipo,
} from "./produtividade.service";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";

interface Props {
  onNavigate: (path: string) => void;
}

const PIE_COLORS = [
  "hsl(217, 91%, 60%)",
  "hsl(142, 71%, 45%)",
  "hsl(45, 93%, 47%)",
  "hsl(280, 70%, 55%)",
  "hsl(0, 84%, 60%)",
  "hsl(190, 80%, 50%)",
];

export function ProdutividadeDashboardPage({ onNavigate }: Props) {
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [armazemId, setArmazemId] = useState("");
  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [dataInicio, setDataInicio] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split("T")[0];
  });
  const [dataFim, setDataFim] = useState(() => new Date().toISOString().split("T")[0]);

  const [kpis, setKpis] = useState<any>(null);
  const [operadores, setOperadores] = useState<OperadorResumo[]>([]);
  const [porTipo, setPorTipo] = useState<ProdutividadePorTipo[]>([]);

  // Load armazens on mount
  useState(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("armazem")
        .select("id, descricao")
        .eq("ativo", true)
        .order("descricao");
      if (data) setArmazens(data);
    })();
  });

  const handleGerar = async () => {
    if (!dataInicio || !dataFim) {
      toast.error("Informe o período.");
      return;
    }
    setLoading(true);
    try {
      const filters: ProdutividadeFilters = {
        armazemId: armazemId || undefined,
        dataInicio,
        dataFim,
      };
      const result = await fetchProdutividadeGeral(filters);
      setKpis(result.kpis);
      setOperadores(result.operadores);
      setPorTipo(result.porTipo);
      setGenerated(true);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <ReportHeader
        title="Produtividade Operacional"
        subtitle="Análise de performance dos colaboradores baseada em execução de tarefas"
        generatedAt=""
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Armazém</label>
          <select
            value={armazemId}
            onChange={(e) => setArmazemId(e.target.value)}
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground min-w-[180px]"
          >
            <option value="">Todos</option>
            {armazens.map((a) => (
              <option key={a.id} value={a.id}>{a.descricao}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Data Início</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground">Data Fim</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
            className="h-9 px-3 rounded-lg border border-border bg-card text-sm text-foreground"
          />
        </div>
        <button
          onClick={handleGerar}
          disabled={loading}
          className="h-9 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : null}
          Gerar
        </button>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      )}

      {generated && !loading && kpis && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard icon={<Users size={16} />} label="Colaboradores" value={String(kpis.totalOperadores)} color="hsl(217, 91%, 60%)" />
            <KpiCard icon={<CheckCircle size={16} />} label="Tarefas Concluídas" value={String(kpis.totalTarefas)} color="hsl(142, 71%, 45%)" />
            <KpiCard icon={<Clock size={16} />} label="Tempo Produtivo" value={formatSegundos(kpis.tempoProdutivoTotal)} color="hsl(45, 93%, 47%)" />
            <KpiCard icon={<TrendingUp size={16} />} label="Itens Movimentados" value={String(kpis.qtdTotalGeral)} color="hsl(280, 70%, 55%)" />
            <KpiCard icon={<Activity size={16} />} label="Taxa Ocupação Média" value={`${kpis.taxaMediaOcupacao}%`} color={getCorOcupacao(kpis.taxaMediaOcupacao)} />
            <KpiCard icon={<Target size={16} />} label="Produtividade Média" value={`${kpis.produtividadeMedia} itens/h`} color="hsl(190, 80%, 50%)" />
          </div>

          {/* Ranking */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Ranking de Colaboradores</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">#</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Colaborador</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Turno</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Tarefas</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Itens</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Itens/h</th>
                    <th className="p-3 font-medium text-muted-foreground min-w-[120px]">Ocupação</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Tempo Produtivo</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {operadores.map((op, idx) => (
                    <tr key={op.usuario_id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="p-3 text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="p-3 font-medium text-foreground">{op.usuario_nome}</td>
                      <td className="p-3 text-muted-foreground">{op.turno_descricao || "—"}</td>
                      <td className="p-3 text-right text-foreground">{op.tarefas_concluidas}</td>
                      <td className="p-3 text-right text-foreground">{op.quantidade_total}</td>
                      <td className="p-3 text-right font-semibold" style={{ color: getCorOcupacao(Math.min(op.produtividade_hora, 100)) }}>
                        {op.produtividade_hora}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(op.taxa_ocupacao, 100)} className="h-2 flex-1" />
                          <span className="text-xs font-mono w-10 text-right" style={{ color: getCorOcupacao(op.taxa_ocupacao) }}>
                            {op.taxa_ocupacao}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3 text-right text-muted-foreground">{formatSegundos(op.tempo_produtivo_segundos)}</td>
                      <td className="p-3">
                        <button
                          onClick={() => onNavigate(`/relatorios/produtividade/operador/${op.usuario_id}?inicio=${dataInicio}&fim=${dataFim}`)}
                          className="text-xs text-primary hover:underline"
                        >
                          Detalhe
                        </button>
                      </td>
                    </tr>
                  ))}
                  {operadores.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-muted-foreground">
                        Nenhum dado encontrado para o período selecionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Charts */}
          {porTipo.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Bar Chart - Produtividade por Tipo */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Tempo Médio por Tipo de Tarefa</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={porTipo}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="tipo_tarefa_codigo" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} label={{ value: "segundos", angle: -90, position: "insideLeft", fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: number) => [`${Math.round(value)}s`, ""]}
                    />
                    <Bar dataKey="tempo_medio_segundos" name="Real" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tempo_estimado_segundos" name="Estimado" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} opacity={0.4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie Chart - Distribuição por Tipo */}
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Distribuição de Tarefas por Tipo</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={porTipo}
                      dataKey="tarefas_concluidas"
                      nameKey="tipo_tarefa_descricao"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      labelLine
                      fontSize={11}
                    >
                      {porTipo.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col gap-2">
      <div className="flex items-center gap-2" style={{ color }}>
        {icon}
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <span className="text-xl font-bold text-foreground">{value}</span>
    </div>
  );
}
