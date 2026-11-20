import { dataLocalISO } from "@/lib/dateUtils";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { toast } from "sonner";
import { Loader2, Clock, TrendingUp, CheckCircle, ArrowLeft } from "lucide-react";
import {
  fetchExecucoesOperador,
  fetchLmsMetricas,
  formatSegundos,
  formatarLocalCurto,
  minutosDoDiaLocal,
  type ExecucaoOperador,
  type LmsLinha,
  type LmsTipoLinha,
} from "./produtividade.service";
import { formatarPct, formatarTempo, tipoDominante } from "./produtividadeCalculo";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, type ExportColumn } from "../utils/exporters";
import { parseError } from "@/lib/errorMapper";
import { ScoreOperadorCard } from "@/modules/lms/score/ScoreOperadorCard";

interface Props {
  usuarioId: string;
  onNavigate: (path: string) => void;
  dataInicio?: string;
  dataFim?: string;
}

const DEFAULT_TASK_COLORS: Record<string, string> = {
  "ENTR-CONF": "hsl(217, 91%, 60%)",
  "ENTR-ARMZ": "hsl(142, 71%, 45%)",
  SEP: "hsl(45, 93%, 47%)",
  "SEP-AUT": "hsl(40, 90%, 50%)",
  "SEP-CONF": "hsl(0, 84%, 60%)",
  ABAST: "hsl(280, 70%, 55%)",
  TRANF: "hsl(190, 80%, 50%)",
  "INV-ATU": "hsl(160, 60%, 45%)",
  "INV-AUDIT": "hsl(170, 55%, 50%)",
  "PED-CAN": "hsl(0, 0%, 50%)",
};

function getTaskColor(corInterface: string | null | undefined, codigo: string): string {
  if (corInterface) return corInterface;
  return DEFAULT_TASK_COLORS[(codigo || "").toUpperCase()] || "hsl(217, 91%, 60%)";
}

export function ProdutividadeOperadorPage({ usuarioId, onNavigate, dataInicio, dataFim }: Props) {
  const { tenantId, empresaId, usuarioNome } = useTenant();
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<ExecucaoOperador[]>([]);
  const [operadorNome, setOperadorNome] = useState("");
  const [turnoInfo, setTurnoInfo] = useState<{ descricao: string; inicio: string; fim: string } | null>(null);
  const [generatedAt, setGeneratedAt] = useState("");
  // Fase 4: números do período vêm da fonte única (rpc_lms_metricas), iguais ao relatório e ao Scorecard
  const [resumo, setResumo] = useState<LmsLinha | null>(null);
  const [tipos, setTipos] = useState<LmsTipoLinha[]>([]);

  const inicio = dataInicio || dataLocalISO();
  const fim = dataFim || dataLocalISO();

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

      const filtros = {
        tenantId: tenantId as string, empresaId: empresaId || null, armazemId: null,
        dataInicio: inicio, dataFim: fim, usuarioId, turnoId: null,
      };
      const [data, op, tp] = await Promise.all([
        tenantId ? fetchExecucoesOperador(tenantId, usuarioId, inicio, fim) : Promise.resolve({ linhas: [], fuso: null }),
        tenantId ? fetchLmsMetricas<LmsLinha>(filtros, "OPERADOR") : Promise.resolve({ linhas: [], total: null }),
        tenantId ? fetchLmsMetricas<LmsTipoLinha>(filtros, "TIPO") : Promise.resolve({ linhas: [], total: null }),
      ]);
      setTimeline(data.linhas);
      setResumo(op.linhas.find((l) => l.usuario_id === usuarioId) ?? null);
      setTipos(tp.linhas);
      setGeneratedAt(nowDisplay());
    } catch (err: any) {
      toast.error((() => { const p = parseError(err, "produtividade-operador-page"); return (!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao carregar dados." : p.title; })());
    } finally {
      setLoading(false);
    }
  };

  // Calculate summary
  // Fase 10.15: a lista já vem só com execuções concluídas que entram na conta
  const concluidas = timeline;
  const somaEfetiva = timeline.reduce((a, t) => a + t.duracao_efetiva_seg, 0);
  const dominante = tipoDominante(tipos);

  // Tempo médio por tipo: tempo direto consolidado ÷ tarefas (mesma regra da fonte única)
  const corPorCodigo = new Map(concluidas.map((t) => [t.tipo_tarefa_codigo, t.cor_interface ?? null]));
  const porTipoData = tipos.filter((t) => t.tarefas > 0).map((t) => ({
    codigo: t.codigo, desc: t.descricao, corInterface: corPorCodigo.get(t.codigo) ?? null,
    tempo: t.tempo_direto, count: t.tarefas, qtd: t.quantidade,
    tempoMedio: t.tarefas > 0 ? Math.round(t.tempo_direto / t.tarefas) : 0,
  }));

  // Gantt timeline bars
  // Barras na hora local do armazém (não do navegador), com a duração que entra na conta
  const ganttData = concluidas
    .filter((t) => t.duracao_bruta_seg > 0)
    .map((t) => ({
      ...t,
      startMinutes: minutosDoDiaLocal(t.inicio_local),
      endMinutes: minutosDoDiaLocal(t.fim_local),
      durationMinutes: t.duracao_bruta_seg / 60,
      color: getTaskColor(t.cor_interface, t.tipo_tarefa_codigo),
      label: `${t.tipo_tarefa_descricao} (${formatSegundos(t.duracao_efetiva_seg)})`,
    }));

  // Turno range
  const turnoStartMin = turnoInfo ? parseTime(turnoInfo.inicio) : 6 * 60;
  const turnoEndMin = turnoInfo ? parseTime(turnoInfo.fim) : 22 * 60;
  const turnoRange = turnoEndMin > turnoStartMin ? turnoEndMin - turnoStartMin : (24 * 60 - turnoStartMin + turnoEndMin);

  const exportColumns: ExportColumn[] = [
    { key: "tipo_tarefa_descricao", label: "Tipo" },
    { key: "quantidade", label: "Qtd Exec.", align: "right" },
    { key: "duracao_efetiva_seg", label: "Tempo na conta", align: "right", format: (r) => formatSegundos(r.duracao_efetiva_seg) },
    { key: "tempo_padrao_seg", label: "Tempo padrão", align: "right", format: (r) => formatSegundos(r.tempo_padrao_seg) },
    { key: "inicio_real", label: "Início", format: (r) => `${formatarLocalCurto(r.inicio_local)}${r.inicio_real ? "" : " (estimado)"}` },
    { key: "fim_local", label: "Conclusão", format: (r) => formatarLocalCurto(r.fim_local) },
  ];
  const exportFilters: Record<string, string> = {
    Operador: operadorNome || "—",
    Período: `${inicio} a ${fim}`,
    ...(turnoInfo ? { Turno: `${turnoInfo.descricao} (${turnoInfo.inicio}–${turnoInfo.fim})` } : {}),
  };
  const canExport = !loading && timeline.length > 0;
  const handleExcel = () => exportToExcel("produtividade_operador", exportColumns, timeline);
  const handlePdf = () =>
    exportToPdf("produtividade_operador", exportColumns, timeline, {
      title: `Produtividade — ${operadorNome || "Operador"}`,
      generatedAt, usuario: usuarioNome || "—",
      total: timeline.length, filters: exportFilters,
    });
  const handlePrint = () => window.print();

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
          generatedAt={generatedAt || "—"}
          total={!loading ? timeline.length : undefined}
          onExportExcel={canExport ? handleExcel : undefined}
          onExportPdf={canExport ? handlePdf : undefined}
          onPrint={canExport ? handlePrint : undefined}
          exportDisabled={!canExport}
        />
      </div>


      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={32} className="animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* KPIs (fonte única) */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <OpKpi icon={<CheckCircle size={16} />} label="Tarefas Concluídas" value={String(resumo?.tarefas ?? 0)} />
            <OpKpi icon={<Clock size={16} />} label="Tempo Direto" value={formatarTempo(resumo?.tempo_direto)}
              sub={resumo ? `de ${formatarTempo(resumo.tempo_disponivel)} disponível` : undefined} />
            <OpKpi icon={<TrendingUp size={16} />} label="Utilização" value={formatarPct(resumo?.utilizacao_pct)} />
            <OpKpi icon={<TrendingUp size={16} />} label="Performance" value={formatarPct(resumo?.performance_pct)} />
            <OpKpi icon={<TrendingUp size={16} />} label="Eficiência" value={formatarPct(resumo?.eficiencia_pct)}
              sub={resumo?.origem === "ESTIMADO" ? "estimado" : resumo ? "real" : undefined} />
            <OpKpi icon={<TrendingUp size={16} />} label={dominante ? `UPH · ${dominante.codigo}` : "UPH"}
              value={dominante?.uph != null ? dominante.uph.toFixed(1).replace(".", ",") : "—"}
              sub={dominante ? "un/h direta" : undefined} />
          </div>

          {/* Fase 10: score global das metas, com o detalhe por meta */}
          <ScoreOperadorCard tenantId={tenantId} usuarioId={usuarioId} dataIni={inicio} dataFim={fim} />

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
                {Array.from(new Map(ganttData.map((g) => [g.tipo_tarefa_codigo, g])).entries()).map(([code, sample]) => (
                  <div key={code} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: getTaskColor(sample.cor_interface, code) }} />
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
                      <Cell key={i} fill={getTaskColor(entry.corInterface, entry.codigo)} />
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
              <p className="text-xs text-muted-foreground mt-0.5">
                "Tempo na conta" é o tempo direto de cada execução: sem pausas e sem contar duas vezes o tempo em que
                duas tarefas correram juntas. A soma ({formatSegundos(somaEfetiva)}) é o Tempo Direto do cartão.
                Horários na hora local do armazém.
              </p>
            </div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Categoria</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Qtd Exec.</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Tempo na conta</th>
                    <th className="text-right p-3 font-medium text-muted-foreground">Tempo padrão</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Início</th>
                    <th className="text-left p-3 font-medium text-muted-foreground">Conclusão</th>
                  </tr>
                </thead>
                <tbody>
                  {timeline.map((t) => (
                    <tr key={t.execucao_id} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getTaskColor(t.cor_interface, t.tipo_tarefa_codigo) }} />
                          <span className="text-foreground">{t.tipo_tarefa_descricao}</span>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{t.tipo_tarefa_categoria || "—"}</td>
                      <td className="p-3 text-right text-foreground">{t.quantidade}</td>
                      <td className="p-3 text-right text-foreground" title={
                        [t.pausa_seg > 0 ? `pausa ${formatSegundos(t.pausa_seg)}` : "",
                         t.sobreposicao_seg > 0 ? `${formatSegundos(t.sobreposicao_seg)} junto com outra tarefa` : ""].filter(Boolean).join(" · ") || undefined
                      }>
                        {formatSegundos(t.duracao_efetiva_seg)}
                      </td>
                      <td className="p-3 text-right text-muted-foreground">{formatSegundos(t.tempo_padrao_seg)}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatarLocalCurto(t.inicio_local)}
                        {!t.inicio_real && <span className="ml-1 text-[10px]" title="Sem leitura de início: estimado pelo fim da tarefa anterior">(estimado)</span>}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatarLocalCurto(t.fim_local)}
                      </td>
                    </tr>
                  ))}
                  {timeline.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
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

function OpKpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-primary mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}
