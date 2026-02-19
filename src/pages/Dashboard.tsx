import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { dashboardStats, mockMovimentacoes } from "@/data/mockData";
import {
  Boxes,
  MapPin,
  Truck,
  AlertTriangle,
  TrendingUp,
  Activity,
  CheckCircle2,
  Clock,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const enderecoDonutData = [
  { name: "Livres", value: dashboardStats.enderecos.livres, color: "#16A34A" },
  { name: "Ocupados", value: dashboardStats.enderecos.ocupados, color: "#EAB308" },
  { name: "Bloqueados", value: dashboardStats.enderecos.bloqueados, color: "#DC2626" },
];

const volumesBarData = [
  { name: "Abertos", value: dashboardStats.volumesExpedicao.abertos, fill: "#3B82F6" },
  { name: "Fechados", value: dashboardStats.volumesExpedicao.fechados, fill: "#EAB308" },
  { name: "Conferidos", value: dashboardStats.volumesExpedicao.conferidos, fill: "#8B5CF6" },
  { name: "Expedidos", value: dashboardStats.volumesExpedicao.expedidos, fill: "#16A34A" },
];

const husBarData = [
  { name: "Disp.", value: dashboardStats.husDisponiveis, fill: "#16A34A" },
  { name: "Res.", value: dashboardStats.husReservadas, fill: "#EAB308" },
  { name: "Bloq.", value: dashboardStats.husBloqueadas, fill: "#DC2626" },
  { name: "Mov.", value: dashboardStats.husEmMovimento, fill: "#3B82F6" },
  { name: "Desc.", value: dashboardStats.husDescartadas, fill: "#64748B" },
];

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  trend?: string;
}

function KPICard({ title, value, subtitle, icon, color, trend }: KPICardProps) {
  return (
    <div className="card-surface p-5 flex items-start gap-4 hover:border-primary/30 transition-colors">
      <div className={cn("flex items-center justify-center w-11 h-11 rounded-xl shrink-0", color)}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {trend && (
          <div className="flex items-center gap-1 mt-1.5">
            <TrendingUp size={11} className="text-green-400" />
            <span className="text-xs text-green-400">{trend}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-elevated text-xs">
        <p className="text-muted-foreground mb-1">{label}</p>
        <p className="font-semibold text-foreground">{payload[0].value}</p>
      </div>
    );
  }
  return null;
};

const MovimentacaoIcon = ({ tipo }: { tipo: string }) => {
  const icons: Record<string, { icon: React.ReactNode; cls: string }> = {
    Recebimento: { icon: <Truck size={12} />, cls: "bg-blue-500/15 text-blue-400" },
    Movimentação: { icon: <Activity size={12} />, cls: "bg-yellow-500/15 text-yellow-400" },
    Separação: { icon: <Boxes size={12} />, cls: "bg-purple-500/15 text-purple-400" },
    Expedição: { icon: <CheckCircle2 size={12} />, cls: "bg-green-500/15 text-green-400" },
  };
  const item = icons[tipo] || { icon: <Activity size={12} />, cls: "bg-muted text-muted-foreground" };
  return (
    <div className={cn("flex items-center justify-center w-7 h-7 rounded-full shrink-0", item.cls)}>
      {item.icon}
    </div>
  );
};

export function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Torre de Controle</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão executiva em tempo real · ARM-001 Central SP</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-dot" />
            Sistema Online
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {dashboardStats.alertasAtivos > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-yellow-500/30 bg-yellow-500/8">
          <AlertTriangle size={16} className="text-yellow-400 shrink-0" />
          <span className="text-sm text-yellow-300">
            <strong>{dashboardStats.alertasAtivos} alertas operacionais</strong> ativos – verifique as HUs bloqueadas e endereços críticos
          </span>
          <button className="ml-auto text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1 shrink-0">
            Ver alertas <ArrowRight size={12} />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Total de HUs"
          value={dashboardStats.totalHUs.toLocaleString()}
          subtitle={`${dashboardStats.husDisponiveis} disponíveis`}
          icon={<Boxes size={20} className="text-blue-400" />}
          color="bg-blue-500/15"
          trend="+12 hoje"
        />
        <KPICard
          title="Endereços Livres"
          value={dashboardStats.enderecos.livres.toLocaleString()}
          subtitle={`${dashboardStats.ocupacaoPercentual}% de ocupação`}
          icon={<MapPin size={20} className="text-green-400" />}
          color="bg-green-500/15"
        />
        <KPICard
          title="Movimentações Hoje"
          value={dashboardStats.movimentacoesHoje}
          subtitle="em 8h de operação"
          icon={<Activity size={20} className="text-purple-400" />}
          color="bg-purple-500/15"
          trend="+18% vs ontem"
        />
        <KPICard
          title="Volumes Expedidos"
          value={dashboardStats.volumesExpedicao.expedidos}
          subtitle={`${dashboardStats.volumesExpedicao.abertos} aguardando`}
          icon={<Truck size={20} className="text-yellow-400" />}
          color="bg-yellow-500/15"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Donut – Ocupação */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Ocupação de Endereços</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Total: {dashboardStats.enderecos.total.toLocaleString()}</p>
            </div>
            <button
              onClick={() => onNavigate("/armazem/enderecos")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Ver tudo <ArrowRight size={11} />
            </button>
          </div>
          <div className="relative flex items-center justify-center" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={enderecoDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {enderecoDonutData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="bg-card border border-border rounded px-2 py-1 text-xs shadow-elevated">
                        <span className="text-foreground font-semibold">{payload[0].name}: {payload[0].value}</span>
                      </div>
                    ) : null
                  }
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-foreground">{dashboardStats.ocupacaoPercentual}%</span>
              <span className="text-xs text-muted-foreground">Ocupado</span>
            </div>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {enderecoDonutData.map((item) => (
              <div key={item.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                {item.name}
              </div>
            ))}
          </div>
        </div>

        {/* Bar – HUs por Status */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">HUs por Disponibilidade</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Total: {dashboardStats.totalHUs}</p>
            </div>
            <button
              onClick={() => onNavigate("/atividades/hus")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Ver tudo <ArrowRight size={11} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={husBarData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--secondary))" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {husBarData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Bar – Volumes Expedição */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Volumes de Expedição</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Por status</p>
            </div>
            <button
              onClick={() => onNavigate("/atividades/volumes")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Ver tudo <ArrowRight size={11} />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={volumesBarData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--secondary))" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {volumesBarData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Timeline movimentações */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Últimas Movimentações</h3>
            <button
              onClick={() => onNavigate("/atividades/movimentos")}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              Ver todas <ArrowRight size={11} />
            </button>
          </div>
          <div className="space-y-3">
            {mockMovimentacoes.map((mov) => (
              <div key={mov.id} className="flex items-start gap-3 group">
                <MovimentacaoIcon tipo={mov.tipo} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-foreground font-mono">{mov.hu}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{mov.tipo}</span>
                    <span className={cn(
                      "ml-auto text-xs px-1.5 py-0.5 rounded",
                      mov.status === "concluido" ? "badge-free" : "badge-moving"
                    )}>
                      {mov.status === "concluido" ? "Concluído" : "Em Andamento"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                    <span className="truncate">{mov.origem}</span>
                    <ArrowRight size={10} />
                    <span className="truncate">{mov.destino}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                    <Clock size={10} />
                    {mov.dataHora} · {mov.usuario}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* HU Status summary */}
        <div className="card-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">Status da Operação</h3>
            <span className="text-xs text-muted-foreground">Atualizado agora</span>
          </div>
          <div className="space-y-3">
            {[
              { label: "HUs Disponíveis", value: dashboardStats.husDisponiveis, total: dashboardStats.totalHUs, color: "bg-green-500" },
              { label: "HUs Reservadas", value: dashboardStats.husReservadas, total: dashboardStats.totalHUs, color: "bg-yellow-500" },
              { label: "HUs Bloqueadas", value: dashboardStats.husBloqueadas, total: dashboardStats.totalHUs, color: "bg-red-500" },
              { label: "HUs Em Movimento", value: dashboardStats.husEmMovimento, total: dashboardStats.totalHUs, color: "bg-blue-500" },
              { label: "HUs Descartadas", value: dashboardStats.husDescartadas, total: dashboardStats.totalHUs, color: "bg-slate-500" },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{item.label}</span>
                  <span className="font-semibold text-foreground">{item.value}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", item.color)}
                    style={{ width: `${(item.value / item.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 gap-2">
            {[
              { label: "Endereços", path: "/armazem/enderecos" },
              { label: "HUs", path: "/atividades/hus" },
              { label: "Volumes", path: "/atividades/volumes" },
              { label: "Rastreabilidade", path: "/rastreabilidade" },
            ].map((link) => (
              <button
                key={link.path}
                onClick={() => onNavigate(link.path)}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary text-xs text-muted-foreground hover:text-foreground transition-colors"
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
