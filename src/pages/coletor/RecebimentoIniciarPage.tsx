import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Props { onNavigate: (path: string) => void; }

interface MovimentoResumo {
  id: string;
  numero_movimento: number;
  status: string;
  parceiro: string;
  box: string;
}

export function RecebimentoIniciarPage({ onNavigate }: Props) {
  const [movimentos, setMovimentos] = useState<MovimentoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = localStorage.getItem("core_armazem_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    loadMovimentos();
  }, []);

  const loadMovimentos = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("v_recebimento_iniciar")
        .select("*");
      if (error) throw error;
      setMovimentos(data || []);
    } catch (err: any) {
      toast.error("Erro ao carregar movimentos.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmStart = async () => {
    if (!selectedId || !tenantId || !usuarioId) return;
    setConfirming(true);
    try {
      // Find tarefa for this movement
      const { data: tarefas, error: tErr } = await (supabase as any)
        .from("tarefa")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id_documento_origem", selectedId)
        .eq("tipo_documento_origem", "MOVIMENTO_ENTRADA")
        .eq("status", "CRIADA")
        .limit(1);

      if (tErr) throw tErr;

      if (tarefas && tarefas.length > 0) {
        // Create tarefa_execucao
        const { error: execErr } = await (supabase as any).from("tarefa_execucao").insert({
          tenant_id: tenantId,
          tarefa_id: tarefas[0].id,
          usuario_id: usuarioId,
          status: "ATRIBUIDA",
          atribuido_em: new Date().toISOString(),
        });
        if (execErr) throw execErr;
      }

      toast.success("Conferência iniciada!");
      onNavigate(`/coletor/recebimento/execucao?movimento_id=${selectedId}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao iniciar conferência.");
    } finally {
      setConfirming(false);
    }
  };

  const statusColor = (s: string) => {
    if (s === "LIBERADO") return "text-[#22C55E]";
    if (s === "EM_CONFERENCIA") return "text-[hsl(217,91%,60%)]";
    if (s === "DIVERGENCIA") return "text-[#F59E0B]";
    return "text-[hsl(213,31%,55%)]";
  };

  return (
    <ColetorLayout title="Selecionar Movimento" onNavigate={onNavigate} showBack backPath="/coletor/recebimento">
      {loading ? (
        <div className="flex-1 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
      ) : movimentos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <span className="text-lg text-[hsl(213,31%,55%)]">Nenhum movimento disponível</span>
        </div>
      ) : (
        <>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {movimentos.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  selectedId === m.id
                    ? "bg-[hsl(217,91%,50%)]/15 border-[hsl(217,91%,50%)]"
                    : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono font-bold text-lg text-white">#{m.numero_movimento}</span>
                  <span className={`text-xs font-bold uppercase ${statusColor(m.status)}`}>{m.status?.replace(/_/g, " ")}</span>
                </div>
                <p className="text-sm text-[hsl(213,31%,70%)] truncate">{m.parceiro || "—"}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-[hsl(213,31%,50%)]">
                  <span>Box: {m.box || "—"}</span>
                </div>
              </button>
            ))}
          </div>

          {/* Confirm modal inline */}
          {selectedId && (
            <div className="pt-2 space-y-2">
              <ActionButton onClick={handleConfirmStart} loading={confirming} variant="success">
                INICIAR CONFERÊNCIA
              </ActionButton>
              <ActionButton onClick={() => setSelectedId(null)} variant="secondary">
                CANCELAR
              </ActionButton>
            </div>
          )}
        </>
      )}
    </ColetorLayout>
  );
}
