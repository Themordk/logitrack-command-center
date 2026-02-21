import { useTenant } from "@/contexts/TenantContext";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Boxes, MapPin, Truck, AlertTriangle, TrendingUp,
  Activity, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

interface Stats {
  totalEnderecos: number;
  enderecosLivres: number;
  enderecosOcupados: number;
  enderecosBloqueados: number;
  totalHUs: number;
  ocupacaoPercent: number;
}

function KPICard({ title, value, subtitle, icon, color }: {
  title: string; value: string | number; subtitle?: string; icon: React.ReactNode; color: string;
}) {
  return (
    <div className="card-surface p-5 flex items-start gap-4 hover:border-primary/30 transition-colors">
      <div className={cn("flex items-center justify-center w-11 h-11 rounded-xl shrink-0", color)}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
        <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export function Dashboard({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { tenantId } = useTenant();
  const [stats, setStats] = useState<Stats>({ totalEnderecos: 0, enderecosLivres: 0, enderecosOcupados: 0, enderecosBloqueados: 0, totalHUs: 0, ocupacaoPercent: 0 });

  useEffect(() => {
    if (!tenantId) return;
    const load = async () => {
      const [endRes, huRes] = await Promise.all([
        (supabase as any).from("endereco").select("situacao", { count: "exact" }).eq("tenant_id", tenantId).eq("ativo", true),
        (supabase as any).from("hu").select("id", { count: "exact" }).eq("tenant_id", tenantId),
      ]);
      const enderecos = endRes.data || [];
      const total = endRes.count || 0;
      const livres = enderecos.filter((e: any) => e.situacao === "LIVRE").length;
      const ocupados = enderecos.filter((e: any) => e.situacao === "OCUPADO").length;
      const bloqueados = enderecos.filter((e: any) => e.situacao === "BLOQUEADO").length;
      setStats({
        totalEnderecos: total,
        enderecosLivres: livres,
        enderecosOcupados: ocupados,
        enderecosBloqueados: bloqueados,
        totalHUs: huRes.count || 0,
        ocupacaoPercent: total > 0 ? Math.round((ocupados / total) * 100) : 0,
      });
    };
    load();
  }, [tenantId]);

  const enderecoDonutData = [
    { name: "Livres", value: stats.enderecosLivres || 1, color: "#16A34A" },
    { name: "Ocupados", value: stats.enderecosOcupados, color: "#EAB308" },
    { name: "Bloqueados", value: stats.enderecosBloqueados, color: "#DC2626" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Torre de Controle</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Visão executiva em tempo real</p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Sistema Online
        </div>
      </div>

      {!tenantId && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-yellow-500/30 bg-yellow-500/8">
          <AlertTriangle size={16} className="text-yellow-400 shrink-0" />
          <span className="text-sm text-yellow-300">Configure o tenant e empresa para começar a usar o sistema.</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total de HUs" value={stats.totalHUs.toLocaleString()} icon={<Boxes size={20} className="text-blue-400" />} color="bg-blue-500/15" />
        <KPICard title="Endereços" value={stats.totalEnderecos.toLocaleString()} subtitle={`${stats.enderecosLivres} livres`} icon={<MapPin size={20} className="text-green-400" />} color="bg-green-500/15" />
        <KPICard title="Ocupação" value={`${stats.ocupacaoPercent}%`} icon={<Activity size={20} className="text-purple-400" />} color="bg-purple-500/15" />
        <KPICard title="Endereços Bloqueados" value={stats.enderecosBloqueados} icon={<AlertTriangle size={20} className="text-yellow-400" />} color="bg-yellow-500/15" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-surface p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Ocupação de Endereços</h3>
          <div className="relative flex items-center justify-center" style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={enderecoDonutData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value">
                  {enderecoDonutData.map((entry, idx) => <Cell key={idx} fill={entry.color} stroke="transparent" />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-foreground">{stats.ocupacaoPercent}%</span>
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

        <div className="card-surface p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Acesso Rápido</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Armazéns", path: "/armazem/armazens" },
              { label: "Endereços", path: "/armazem/enderecos" },
              { label: "Produtos", path: "/dados-mestres/produtos" },
              { label: "Parceiros", path: "/dados-mestres/parceiros" },
              { label: "HUs", path: "/atividades/hus" },
              { label: "Volumes", path: "/atividades/volumes" },
              { label: "Veículos", path: "/armazem/veiculos" },
              { label: "Empresas", path: "/config/empresas" },
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
