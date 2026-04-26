import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { toast } from "sonner";
import { Loader2, Clock, TrendingUp, CheckCircle, ArrowLeft } from "lucide-react";
import {
  fetchTimelineOperador,
  formatSegundos,
  type TimelineEntry,
} from "./produtividade.service";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { formatBrasiliaDateTimeShort } from "@/lib/dateUtils";

interface Props {
  usuarioId: string;
  onNavigate: (path: string) => void;
  dataInicio?: string;
  dataFim?: string;
}

const TASK_COLORS: Record<string, string> = {
  CONFERENCIA: "hsl(217, 91%, 60%)",
  ARMAZENAGEM: "hsl(142, 71%, 45%)",
  SEPARACAO: "hsl(45, 93%, 47%)",
  TRANSFERENCIA: "hsl(280, 70%, 55%)",
  INVENTARIO: "hsl(190, 80%, 50%)",
  CONFERENCIA_SAIDA: "hsl(0, 84%, 60%)",
};

function getTaskColor(codigo: string): string {
  return TASK_COLORS[codigo?.toUpperCase()] || "hsl(217, 91%, 60%)";
}

export function ProdutividadeOperadorPage({ usuarioId, onNavigate, dataInicio, dataFim }: Props) {
  const { tenantId, empresaId } = useTenant();
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [operadorNome, setOperadorNome] = useState("");
  const [turnoInfo, setTurnoInfo] = useState<{ descricao: string; inicio: string; fim: string } | null>(null);

  const inicio = dataInicio || new Date().toISOString().split("T")[0];
  const fim = dataFim || new Date().toISOString().split("T")[0];

  useEffect(() => {
    loadData();
  }, [usuarioId, inicio, fim, tenantId, empresaId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch user info — escopado por tenant + empresa ativa para evitar vazamento
      let q = (supabase as any)
        .from("usuario")
        .select("nome, turno_id, turnos:turno_id(descricao, hora_inicio, hora_fim)")
        .eq("id", usuarioId);
      if (tenantId) q = q.eq("tenant_id", tenantId);
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data: user } = await q.maybeSingle();

      if (user) {
        setOperadorNome(user.nome);
        if (user.turnos) {
          setTurnoInfo({
            descricao: user.turnos.descricao,
            inicio: user.turnos.hora_inicio,
            fim: user.turnos.hora_fim,
          });
        }
      }

      const data = await fetchTimelineOperador(usuarioId, inicio, fim);
      setTimeline(data);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary
  const concluidas = timeline.filter((t) => t.status === "CONCLUIDA");
  const tempoProdutivo = concluidas.reduce((s, t) => s + (t.duracao_segundos || 0), 0);
  const qtdTotal = concluidas.reduce((s, t) => s + t.quantidade_executada, 0);
  const horasProdutivas = tempoProdutivo / 3600;
  const produtividadeHora = horasProdutivas > 0 ? Math.round(qtdTotal / horasProdutivas) : 0;

  // Gantt data - group by tipo_tarefa for bar chart
  const porTipo = new Map<string, { codigo: string; desc: string; tempo: number; count: number; qtd: number }>();
  for (const t of concluidas) {
    const key = t.tipo_tarefa_codigo;
    if (!porTipo.has(key)) porTipo.set(key, { codigo: key, desc: t.tipo_tarefa_descricao, tempo: 0, count: 0, qtd: 0 });
    const entry = porTipo.get(key)!;
    entry.tempo += t.duracao_segundos || 0;
    entry.count++;
    entry.qtd += t.quantidade_executada;
  }
  const porTipoData = Array.from(porTipo.values()).map((t) => ({
    ...t,
    tempoMedio: t.count > 0 ? Math.round(t.tempo / t.count) : 0,
  }));

  // Gantt timeline bars
  const ganttData = concluidas
    .filter((t) => t.iniciado_em && t.concluido_em)
    .map((t) => {
      const start = new Date(t.iniciado_em!);
      const end = new Date(t.concluido_em!);
      return {
        ...t,
        startMinutes: start.getHours() * 60 + start.getMinutes(),
        endMinutes: end.getHours() * 60 + end.getMinutes(),
        durationMinutes: (t.duracao_segundos || 0) / 60,
        color: getTaskColor(t.tipo_tarefa_codigo),
        label: `${t.tipo_tarefa_descricao} (${Math.round((t.duracao_segundos || 0) / 60)}min)`,
      };
    });

  // Turno range
  const turnoStartMin = turnoInfo ? parseTime(turnoInfo.inicio) : 6 * 60;
  const turnoEndMin = turnoInfo ? parseTime(turnoInfo.fim) : 22 * 60;
  const turnoRange = turnoEndMin > turnoStartMin ? turnoEndMin - turnoStartMin : (24 * 60 - turnoStartMin + turnoEndMin);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate("/relatorios/produtividade")}
          className="h-8 w-8 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <ReportHeader
          title={operadorNome || "Operador"}
          subtitle={`Timeline de Produtividade — ${inicio} a ${fim}`}
          generatedAt=""
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-primary mb-1">
                <CheckCircle size={16} />
                <span className="text-xs text-muted-foreground">Tarefas Concluídas</span>
              </div>
              <span className="text-2xl font-bold text-foreground">{concluidas.length}</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1" style={{ color: "hsl(142, 71%, 45%)" }}>
                <Clock size={16} />
                <span className="text-xs text-muted-foreground">Tempo Produtivo</span>
              </div>
              <span className="text-2xl font-bold text-foreground">{formatSegundos(tempoProdutivo)}</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1" style={{ color: "hsl(45, 93%, 47%)" }}>
                <TrendingUp size={16} />
                <span className="text-xs text-muted-foreground">Itens Movimentados</span>
              </div>
              <span className="text-2xl font-bold text-foreground">{qtdTotal}</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1" style={{ color: "hsl(280, 70%, 55%)" }}>
                <TrendingUp size={16} />
                <span className="text-xs text-muted-foreground">Produtividade</span>
              </div>
              <span className="text-2xl font-bold text-foreground">{produtividadeHora} itens/h</span>
            </div>
          </div>

          {/* Gantt Timeline */}
          {ganttData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">
                Timeline da Jornada
                {turnoInfo && <span className="text-muted-foreground font-normal"> — {turnoInfo.descricao} ({turnoInfo.inicio} - {turnoInfo.fim})</span>}
              </h3>
              <div className="relative h-16 bg-muted/30 rounded-lg overflow-hidden border border-border">
                {/* Time labels */}
                <div className="absolute top-0 left-0 right-0 flex justify-between px-1 text-[10px] text-muted-foreground">
                  <span>{formatMinutes(turnoStartMin)}</span>
                  <span>{formatMinutes(turnoStartMin + Math.floor(turnoRange / 4))}</span>
                  <span>{formatMinutes(turnoStartMin + Math.floor(turnoRange / 2))}</span>
                  <span>{formatMinutes(turnoStartMin + Math.floor((turnoRange * 3) / 4))}</span>
                  <span>{formatMinutes(turnoEndMin)}</span>
                </div>
                {/* Bars */}
                <div className="absolute top-4 bottom-1 left-0 right-0">
                  {ganttData.map((bar, idx) => {
                    let offsetMin = bar.startMinutes - turnoStartMin;
                    if (offsetMin < 0) offsetMin += 24 * 60;
                    const leftPct = (offsetMin / turnoRange) * 100;
                    const widthPct = Math.max((bar.durationMinutes / turnoRange) * 100, 0.5);
                    return (
                      <div
                        key={idx}
                        className="absolute h-full rounded-sm opacity-80 hover:opacity-100 transition-opacity cursor-default"
                        style={{
                          left: `${Math.min(leftPct, 100)}%`,
                          width: `${Math.min(widthPct, 100 - leftPct)}%`,
                          backgroundColor: bar.color,
                        }}
                        title={bar.label}
                      />
                    );
                  })}
                </div>
              </div>
              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-3">
                {Array.from(new Set(ganttData.map((g) => g.tipo_tarefa_codigo))).map((code) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getTaskColor(code) }} />
                    <span className="text-xs text-muted-foreground">{code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per tipo chart */}
          {porTipoData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Performance por Tipo de Tarefa</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={porTipoData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="codigo" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(value: number, name: string) => [
                      name === "count" ? value : `${Math.round(value)}s`,
                      name === "count" ? "Tarefas" : "Tempo Médio",
                    ]}
                  />
                  <Bar dataKey="tempoMedio" name="Tempo Médio (s)" radius={[4, 4, 0, 0]}>
                    {porTipoData.map((entry, i) => (
                      <Cell key={i} fill={getTaskColor(entry.codigo)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Detail table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Execuções Detalhadas ({timeline.length})</h3>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Qtd Exec.</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Duração</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Início</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Conclusão</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((t) => (
                    <tr key={t.execucao_id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTaskColor(t.tipo_tarefa_codigo) }} />
                          <span className="text-foreground">{t.tipo_tarefa_descricao}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          t.status === "CONCLUIDA" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                        }`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="p-3 text-right text-foreground">{t.quantidade_executada}</td>
                      <td className="p-3 text-right text-muted-foreground">
                        {t.duracao_segundos != null ? formatSegundos(t.duracao_segundos) : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatBrasiliaDateTimeShort(t.iniciado_em)}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatBrasiliaDateTimeShort(t.concluido_em)}
                      </td>
                    </tr>
                  ))}
                  {timeline.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted-foreground">
                        Nenhuma execução encontrada para este período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function parseTime(timeStr: string): number {
  const [h, m] = (timeStr || "08:00").split(":").map(Number);
  return h * 60 + (m || 0);
}

function formatMinutes(min: number): string {
  const h = Math.floor((min % (24 * 60)) / 60);
  const m = min % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}
