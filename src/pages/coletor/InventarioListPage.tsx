import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Props { onNavigate: (path: string) => void; }

interface InventarioResumo {
  id: string;
  numero_inventario: number;
  tipo_inventario: string;
  origem: string;
  status: string;
}

export function InventarioListPage({ onNavigate }: Props) {
  const [inventarios, setInventarios] = useState<InventarioResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [resultDialog, setResultDialog] = useState<{ sucesso: boolean; mensagem: string } | null>(null);

  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => { loadInventarios(); }, []);

  const loadInventarios = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("v_inventario_iniciar")
        .select("*");
      if (error) throw error;
      setInventarios(data || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar inventários.");
    } finally {
      setLoading(false);
    }
  };

  const handleIniciar = async () => {
    if (selectedIdx === null || !tenantId || !empresaId || !usuarioId) return;
    const inv = inventarios[selectedIdx];
    if (!inv) return;
    const invId = inv.id || inv.inventario_id || "";

    setStarting(true);
    try {
      const { data, error } = await supabase.rpc("fn_inventario_buscar_tarefas" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_usuario_id: usuarioId,
        p_inventario_id: invId,
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

      sessionStorage.setItem("coletor_inventario_id", invId);
      sessionStorage.setItem("coletor_inventario_numero", String(inv.numero_inventario));
      sessionStorage.setItem("coletor_inventario_tarefas", JSON.stringify(tarefas));
      sessionStorage.setItem("coletor_inventario_tarefa_idx", "0");

      if (tarefas.length === 0) {
        setResultDialog({ sucesso: false, mensagem: "Nenhuma tarefa pendente para este inventário." });
        return;
      }

      setResultDialog({ sucesso: true, mensagem: `Inventário #${inv.numero_inventario} iniciado com ${tarefas.length} tarefa(s)!` });
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
      onNavigate("/coletor/inventario/endereco");
    }
  };

  const getStatusColor = (s: string) => {
    const upper = (s || "").toUpperCase();
    if (upper === "EM_EXECUCAO") return "text-blue-400 bg-blue-500/15 border-blue-500/30";
    if (upper === "CRIADO") return "text-gray-400 bg-gray-500/15 border-gray-500/30";
    return "text-yellow-400 bg-yellow-500/15 border-yellow-500/30";
  };

  return (
    <ColetorLayout title="Inventário" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <p className="text-xs text-[hsl(213,31%,55%)] shrink-0">Selecione um inventário para iniciar a contagem</p>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
          </div>
        ) : inventarios.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum inventário disponível.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
            {inventarios.map((inv, idx) => (
              <button
                key={inv.id || inv.inventario_id || idx}
                onClick={() => setSelectedIdx(idx)}
                className={`flex flex-col gap-1.5 p-4 rounded-2xl border transition-all text-left shrink-0 ${
                  selectedIdx === idx
                    ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                    : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white font-mono">Inventário #{inv.numero_inventario}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getStatusColor(inv.status)}`}>
                    {inv.status}
                  </span>
                </div>
                <div className="text-xs text-[hsl(213,31%,55%)]">
                  Tipo: <span className="font-bold text-[hsl(213,31%,91%)]">{inv.tipo_inventario}</span>
                </div>
                <div className="text-xs text-[hsl(213,31%,45%)]">
                  Origem: <span className="font-medium text-[hsl(213,31%,70%)]">{inv.origem}</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="shrink-0 pt-1">
          <ActionButton onClick={handleIniciar} disabled={selectedIdx === null} loading={starting}>
            Início de Contagem
          </ActionButton>
        </div>
      </div>

      {resultDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-6 space-y-4">
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
