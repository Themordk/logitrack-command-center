import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { toast } from "sonner";
import { Loader2, CheckCircle, AlertTriangle, Package } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface ResumoData {
  movimento_id: string;
  numero_movimento: number;
  status: string;
  parceiro: string;
  total_itens: number;
  total_quantidade_esperada: number;
  total_quantidade_conferida: number;
  total_quantidade_armazenada: number;
  possui_divergencia: boolean;
}

export function RecebimentoConferenciaPage({ onNavigate }: Props) {
  const movimentoId = sessionStorage.getItem("coletor_movimento_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id");
  const [resumo, setResumo] = useState<ResumoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  useEffect(() => {
    loadResumo();
  }, []);

  const loadResumo = async () => {
    if (!movimentoId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("vw_movimento_entrada_resumo")
        .select("*")
        .eq("movimento_id", movimentoId)
        .maybeSingle();
      if (error) throw error;
      setResumo(data);
    } catch (err: any) {
      console.error("Erro resumo:", err);
      toast.error("Erro ao carregar resumo.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizar = async () => {
    if (!movimentoId || !usuarioId) return;
    setFinalizing(true);
    try {
      const { error } = await (supabase as any)
        .from("movimento_entrada")
        .update({
          conferencia_finalizada_em: new Date().toISOString(),
          conferencia_finalizada_por: usuarioId,
          status: "CONFERIDO",
        })
        .eq("id", movimentoId);
      if (error) throw error;

      setOverlay("success");
      setOverlayMsg("Recebimento finalizado!");
      setTimeout(() => onNavigate("/coletor/recebimento/concluido"), 1200);
    } catch (err: any) {
      toast.error(err.message || "Erro ao finalizar.");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return (
    <ColetorLayout title="Resumo" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/execucao">
      <div className="flex-1 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
    </ColetorLayout>
  );

  if (!resumo) return (
    <ColetorLayout title="Resumo" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/execucao">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <AlertTriangle size={40} className="text-[#F59E0B]" />
        <span className="text-[hsl(213,31%,55%)]">Resumo não encontrado para este movimento.</span>
        <ActionButton onClick={() => onNavigate("/coletor/recebimento/execucao")} variant="secondary">
          VOLTAR À CONFERÊNCIA
        </ActionButton>
      </div>
    </ColetorLayout>
  );

  return (
    <ColetorLayout title="Resumo da Conferência" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/execucao">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <div className="space-y-4">
        {/* Movement header */}
        <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="font-mono text-xl font-bold text-white">Mov. #{resumo.numero_movimento}</span>
            <span className={`text-xs font-bold uppercase px-2 py-1 rounded-lg ${
              resumo.possui_divergencia ? "bg-[#F59E0B]/20 text-[#F59E0B]" : "bg-[#22C55E]/20 text-[#22C55E]"
            }`}>{resumo.possui_divergencia ? "DIVERGÊNCIA" : "OK"}</span>
          </div>
          <p className="text-sm text-[hsl(213,31%,60%)]">{resumo.parceiro}</p>
          <p className="text-xs text-[hsl(213,31%,45%)]">Status: {resumo.status?.replace(/_/g, " ")}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={<Package size={20} />} label="Itens" value={resumo.total_itens} color="#3b82f6" />
          <StatCard icon={<CheckCircle size={20} />} label="Esperado" value={resumo.total_quantidade_esperada} color="#22C55E" />
          <StatCard icon={resumo.possui_divergencia ? <AlertTriangle size={20} /> : <CheckCircle size={20} />} label="Conferido" value={resumo.total_quantidade_conferida} color={resumo.possui_divergencia ? "#F59E0B" : "#22C55E"} />
        </div>

        {resumo.possui_divergencia && (
          <div className="rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/30 p-3 flex items-start gap-2">
            <AlertTriangle size={20} className="text-[#F59E0B] shrink-0 mt-0.5" />
            <span className="text-sm text-[#F59E0B]">
              Existem divergências entre a quantidade esperada e conferida. Revise antes de finalizar.
            </span>
          </div>
        )}

        <ActionButton onClick={handleFinalizar} loading={finalizing} variant="success">
          FINALIZAR CONFERÊNCIA
        </ActionButton>
        <ActionButton onClick={() => onNavigate("/coletor/recebimento/execucao")} variant="secondary">
          VOLTAR À CONFERÊNCIA
        </ActionButton>
      </div>
    </ColetorLayout>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 flex flex-col items-center gap-1">
      <div style={{ color }}>{icon}</div>
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-[10px] text-[hsl(213,31%,50%)] uppercase font-semibold">{label}</span>
    </div>
  );
}
