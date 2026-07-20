import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { parseError } from "@/lib/errorMapper";


interface Props { onNavigate: (path: string) => void; }

interface OndaResumo {
  movimento_saida_id: string;
  numero_onda: number;
  pedidos: string;
  tipo_venda: string;
  prioridade: string;
  status: string;
}

export function ConferenciaIniciarPage({ onNavigate }: Props) {
  const [ondas, setOndas] = useState<OndaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const result = useResultDialog({ coletorMode: true });


  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => { loadOndas(); }, []);

  const loadOndas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("conferencia_buscar_ondas" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
      const parsed = Array.isArray(data) ? data : typeof data === "string" ? JSON.parse(data) : [];
      const prioridadeOrdem: Record<string, number> = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 };
      parsed.sort((a: any, b: any) => {
        const pa = prioridadeOrdem[(a.prioridade || "NORMAL").toUpperCase()] ?? 2;
        const pb = prioridadeOrdem[(b.prioridade || "NORMAL").toUpperCase()] ?? 2;
        if (pa !== pb) return pa - pb;
        return (a.numero_onda || 0) - (b.numero_onda || 0);
      });
      setOndas(parsed);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleIniciar = async () => {
    if (!selectedId) return;
    const onda = ondas.find((o) => o.movimento_saida_id === selectedId);
    if (!onda) return;

    setStarting(true);
    try {
      const { data, error } = await supabase.rpc("conferencia_buscar_tarefas" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_movimento_saida_id: selectedId,
        p_usuario_id: usuarioId,
      });
      if (error) throw error;

      let result: any = data;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { /* keep */ }
      }

      if (result && typeof result === "object" && !Array.isArray(result) && result.sucesso === false) {
        setResultDialog({ sucesso: false, mensagem: result.mensagem || "Erro ao buscar tarefas" });
        return;
      }

      const tarefas = Array.isArray(result) ? result : [];

      sessionStorage.setItem("coletor_conferencia_movimento_id", selectedId);
      sessionStorage.setItem("coletor_conferencia_numero_onda", String(onda.numero_onda));
      sessionStorage.setItem("coletor_conferencia_tarefas", JSON.stringify(tarefas));
      sessionStorage.setItem("coletor_conferencia_tarefa_idx", "0");

      if (tarefas.length === 0) {
        setResultDialog({ sucesso: false, mensagem: "Nenhuma tarefa pendente para esta onda." });
        return;
      }

      setResultDialog({ sucesso: true, mensagem: `Conferência da Onda #${onda.numero_onda} iniciada com ${tarefas.length} tarefa(s)!` });
    } catch (err: any) {
      setResultDialog({ sucesso: false, mensagem: err.message });
    } finally {
      setStarting(false);
    }
  };

  const handleDialogClose = () => {
    const wasSuccess = resultDialog?.sucesso;
    setResultDialog(null);
    if (wasSuccess) {
      onNavigate("/coletor/conferencia/produto");
    }
  };

  const getPrioridadeColor = (p: string) => {
    const upper = (p || "").toUpperCase();
    if (upper === "ALTA" || upper === "URGENTE") return "text-red-400 bg-red-500/15 border-red-500/30";
    if (upper === "MEDIA") return "text-yellow-400 bg-yellow-500/15 border-yellow-500/30";
    return "text-blue-400 bg-blue-500/15 border-blue-500/30";
  };

  return (
    <ColetorLayout title="Conferência" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <p className="text-xs text-[hsl(213,31%,55%)]">Selecione uma onda para iniciar a conferência</p>
          <RefreshListButton onRefresh={loadOndas} />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
          </div>
        ) : ondas.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma onda liberada para conferência.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
            {ondas.map((onda) => (
              <button
                key={onda.movimento_saida_id}
                onClick={() => setSelectedId(onda.movimento_saida_id === selectedId ? null : onda.movimento_saida_id)}
                className={`flex flex-col gap-1.5 p-4 rounded-2xl border transition-all text-left shrink-0 ${
                  selectedId === onda.movimento_saida_id
                    ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                    : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white font-mono">Onda #{onda.numero_onda}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getPrioridadeColor(onda.prioridade)}`}>
                      {onda.prioridade}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      {onda.status}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-[hsl(213,31%,55%)]">
                  Pedidos: <span className="font-bold text-[hsl(213,31%,91%)]">{onda.pedidos}</span>
                </div>
                <div className="text-xs text-[hsl(213,31%,45%)]">
                  Tipo: <span className="font-medium text-[hsl(213,31%,70%)]">{onda.tipo_venda}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="shrink-0 pt-1">
          <ActionButton onClick={handleIniciar} disabled={!selectedId} loading={starting}>
            Iniciar Conferência
          </ActionButton>
        </div>
      </div>

      {resultDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col items-center gap-3">
              {resultDialog.sucesso ? (
                <CheckCircle size={48} className="text-[#22C55E]" />
              ) : (
                <XCircle size={48} className="text-[#E02424]" />
              )}
              <h3 className="text-base font-bold text-white text-center">
                {resultDialog.sucesso ? "Sucesso" : "Erro"}
              </h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">{resultDialog.mensagem}</p>
            </div>
            <ActionButton onClick={handleDialogClose} variant={resultDialog.sucesso ? "success" : "primary"}>
              {resultDialog.sucesso ? "Continuar" : "Fechar"}
            </ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}