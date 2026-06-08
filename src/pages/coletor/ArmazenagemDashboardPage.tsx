import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { Loader2, Package, Layers, ArrowUp, CheckCircle, BarChart3 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface DashData {
  documentos_pendentes: number;
  produtos_pendentes: number;
  total_a_armazenar: number;
  total_armazenado: number;
  percentual_concluido: number;
}

export function ArmazenagemDashboardPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.rpc("rpc_coletor_armazenagem_dashboard" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
      });
      if (error) throw error;
      if (result && result.length > 0) {
        setData(result[0]);
      } else {
        setData({ documentos_pendentes: 0, produtos_pendentes: 0, total_a_armazenar: 0, total_armazenado: 0, percentual_concluido: 0 });
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const stats = [
    { icon: <Package size={20} />, label: "Movimentos Pendentes", value: data?.documentos_pendentes ?? 0, color: "hsl(217,91%,50%)" },
    { icon: <Layers size={20} />, label: "Produtos Pendentes", value: data?.produtos_pendentes ?? 0, color: "hsl(280,70%,55%)" },
    { icon: <ArrowUp size={20} />, label: "Total a Armazenar", value: data?.total_a_armazenar ?? 0, color: "hsl(45,93%,47%)" },
    { icon: <CheckCircle size={20} />, label: "Armazenadas", value: data?.total_armazenado ?? 0, color: "hsl(142,76%,36%)" },
  ];

  return (
    <ColetorLayout title="Armazenagem" onNavigate={onNavigate} showBack backPath="/coletor/home">
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
      ) : (
        <>
          <div className="flex justify-end">
            <RefreshListButton onRefresh={loadDashboard} successMessage="Dashboard atualizado" />
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 flex flex-col items-center gap-1">
                <div style={{ color: s.color }}>{s.icon}</div>
                <span className="text-2xl font-bold text-white">{s.value}</span>
                <span className="text-[11px] text-[hsl(213,31%,55%)] text-center leading-tight">{s.label}</span>
              </div>
            ))}
          </div>

          {/* Progress */}
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-[hsl(217,91%,60%)]" />
                <span className="text-sm font-semibold text-[hsl(213,31%,75%)]">Progresso</span>
              </div>
              <span className="text-2xl font-bold text-white">{data?.percentual_concluido ?? 0}%</span>
            </div>
            <div className="w-full h-3 rounded-full bg-[hsl(222,35%,18%)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[hsl(142,76%,36%)] transition-all duration-500"
                style={{ width: `${Math.min(data?.percentual_concluido ?? 0, 100)}%` }}
              />
            </div>
          </div>

          {/* Action */}
          <ActionButton onClick={() => onNavigate("/coletor/armazenagem/iniciar")} variant="primary">
            <Package size={20} /> INICIAR ARMAZENAGEM
          </ActionButton>
        </>
      )}
    </ColetorLayout>
  );
}
