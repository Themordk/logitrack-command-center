import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { format } from "date-fns";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Target, Activity, Gauge, ListTodo, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardFilters, FiltersState } from "./dashboard/components/DashboardFilters";
import { KPICardPro, KPISeverity } from "./dashboard/components/KPICardPro";
import { RankingOperadores } from "./dashboard/components/RankingOperadores";
import { OcorrenciasChart } from "./dashboard/components/OcorrenciasChart";
import {
  fetchOtif, fetchOcupacao, fetchProdutividade, fetchBacklog,
  fetchTopOperadores, fetchOcorrencias, DashboardFilters as DF,
} from "./dashboard/dashboard.service";

export function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { tenantId, armazemId } = useTenant();
  const today = format(new Date(), "yyyy-MM-dd");

  const [filters, setFilters] = useState<FiltersState>({
    armazemId: armazemId || null,
    dataIni: today,
    dataFim: today,
    turnoId: null,
  });

  const [otif, setOtif] = useState<any>(null);
  const [ocup, setOcup] = useState<any>(null);
  const [prod, setProd] = useState<any>(null);
  const [back, setBack] = useState<any>(null);
  const [oper, setOper] = useState<any[]>([]);
  const [ocor, setOcor] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const dfArgs: DF | null = useMemo(() => tenantId ? { tenantId, ...filters } : null, [tenantId, filters]);

  useEffect(() => {
    if (!dfArgs) return;
    setLoading(true);
    Promise.all([
      fetchOtif(dfArgs), fetchOcupacao(dfArgs), fetchProdutividade(dfArgs),
      fetchBacklog(dfArgs), fetchTopOperadores(dfArgs), fetchOcorrencias(dfArgs),
    ]).then(([a, b, c, d, e, f]) => {
      setOtif(a); setOcup(b); setProd(c); setBack(d); setOper(e); setOcor(f);
    }).finally(() => setLoading(false));
    // future: const id = setInterval(reload, 60000); return () => clearInterval(id);
  }, [dfArgs]);

  const otifSev: KPISeverity = !otif ? "neutral" : otif.value >= 95 ? "good" : otif.value >= 90 ? "warn" : "bad";
  const ocupSev: KPISeverity = !ocup ? "neutral" : ocup.value > 85 ? "bad" : ocup.value >= 70 ? "warn" : "good";
  const backSev: KPISeverity = !back ? "neutral" : back.value > 50 ? "bad" : back.value >= 20 ? "warn" : "good";

  const donut = ocup ? [
    { name: "Livres", value: ocup.livres || 0.0001, color: "hsl(142 70% 45%)" },
    { name: "Ocupados", value: ocup.ocupados, color: "hsl(45 90% 55%)" },
    { name: "Bloqueados", value: ocup.bloqueados, color: "hsl(0 72% 55%)" },
  ] : [];

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Torre de Controle</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão executiva em tempo real</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Sistema Online
        </div>
      </div>

      {/* Filtros */}
      {tenantId && (
        <DashboardFilters tenantId={tenantId} defaultArmazemId={armazemId} value={filters} onChange={setFilters} />
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICardPro
          title="OTIF"
          value={otif ? `${otif.value}%` : "—"}
          subtitle={otif ? `${otif.concluidas}/${otif.total} pedidos concluídos` : "Sem dados"}
          icon={<Target size={20} />}
          severity={otifSev}
          trend={otif?.trend}
          tooltip="Aproximação baseada em status (CONCLUIDA) sobre total emitido no período."
          onClick={() => onNavigate("/atividades/movimento-saida")}
        />
        <KPICardPro
          title="Taxa de Ocupação"
          value={ocup ? `${ocup.value}%` : "—"}
          subtitle={ocup ? `${ocup.ocupados} ocupados · ${ocup.livres} livres · ${ocup.total} total` : "Sem dados"}
          icon={<Gauge size={20} />}
          severity={ocupSev}
          trendGoodWhen="down"
          onClick={() => onNavigate("/armazem/enderecos")}
        />
        <KPICardPro
          title="Produtividade"
          value={prod ? `${prod.value}` : "—"}
          subtitle={prod ? `${prod.tarefas} tarefas em ${prod.horas}h · tarefas/hora` : "Sem dados"}
          icon={<Activity size={20} />}
          severity="neutral"
          trend={prod?.trend}
        />
        <KPICardPro
          title="Backlog Operacional"
          value={back ? back.value : "—"}
          subtitle={back ? `Espera média ${back.tempoMedioMin} min` : "Sem dados"}
          icon={<ListTodo size={20} />}
          severity={backSev}
          trendGoodWhen="down"
          onClick={() => onNavigate("/atividades/movimento-saida")}
        />
      </div>

      {/* Ranking + Ocorrências */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RankingOperadores data={oper} loading={loading} />
        <OcorrenciasChart data={ocor} loading={loading} />
      </div>

      {/* Ocupação compacta + acesso rápido */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Ocupação de Endereços</h3>
          <div className="relative flex items-center justify-center" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {donut.map((e, i) => <Cell key={i} fill={e.color} stroke="transparent" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-foreground">{ocup ? `${ocup.value}%` : "—"}</span>
              <span className="text-xs text-muted-foreground">Ocupado</span>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {donut.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                {item.name}
              </div>
            ))}
          </div>
        </div>

        <div className="card-surface p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Acesso Rápido</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Endereços", path: "/armazem/enderecos" },
              { label: "Movimento Entrada", path: "/atividades/movimento-entrada" },
              { label: "Movimento Saída", path: "/atividades/movimento-saida" },
              { label: "Inventário", path: "/atividades/inventario" },
            ].map((link) => (
              <button
                key={link.path}
                onClick={() => onNavigate(link.path)}
                className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {link.label}
                <ArrowRight size={12} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
