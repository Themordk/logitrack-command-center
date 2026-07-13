import { useState, useEffect } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Loader2, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { RegistrarOcorrenciaColetorButton } from "@/components/ocorrencia/RegistrarOcorrenciaColetorButton";

interface Props { onNavigate: (path: string) => void; }

export function ConferenciaItensPage({ onNavigate }: Props) {
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [clearingId, setClearingId] = useState<string | null>(null);
  const { tenantId } = useTenant();
  const numeroOnda = sessionStorage.getItem("coletor_conferencia_numero_onda") || "";
  const movimentoId = sessionStorage.getItem("coletor_conferencia_movimento_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_conferencia_tarefas");
    if (raw) {
      setTarefas(JSON.parse(raw));
    }
  }, []);

  const getStatusColor = (status: string) => {
    const s = (status || "").toUpperCase();
    if (s === "CONCLUIDA" || s === "FINALIZADA") return "text-green-400 bg-green-500/10 border-green-500/30";
    if (s === "ATRIBUIDA" || s === "EM_EXECUCAO") return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
    if (s === "PENDENTE" || s === "CRIADA") return "text-red-400 bg-red-500/10 border-red-500/30";
    return "text-blue-400 bg-blue-500/10 border-blue-500/30";
  };

  const getConferidoColor = (conf: number, req: number) => {
    if (conf <= 0) return "text-[hsl(213,31%,55%)]";
    if (conf >= req) return "text-green-400";
    return "text-amber-400";
  };

  const handleLimpar = async (t: any) => {
    if (!tenantId || !movimentoId || !t.produto_id || !usuarioId) {
      toast.error("Dados de sessão incompletos.");
      return;
    }
    if (!window.confirm(`Limpar toda a conferência do produto ${t.sku || ""}?`)) return;

    setClearingId(t.tarefa_id || t.id);
    const { error } = await (supabase as any).rpc("separacao_conferencia_limpar_item", {
      p_tenant_id: tenantId,
      p_movimento_saida_id: movimentoId,
      p_produto_id: t.produto_id,
      p_usuario_id: usuarioId,
    });
    setClearingId(null);

    if (error) {
      toast.error(error.message || "Erro ao limpar conferência.");
      return;
    }

    const updated = tarefas.map((x) =>
      (x.tarefa_id || x.id) === (t.tarefa_id || t.id)
        ? { ...x, conferido: 0, status: "ATRIBUIDA" }
        : x,
    );
    setTarefas(updated);
    sessionStorage.setItem("coletor_conferencia_tarefas", JSON.stringify(updated));
    toast.success("Conferência do item limpa.");
  };

  return (
    <ColetorLayout title={`Itens - Onda #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/conferencia/produto">
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
        {tarefas.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum item encontrado.</p>
          </div>
        ) : (
          tarefas.map((t, idx) => {
            const conf = Number(t.conferido || 0);
            const req = Number(t.quantidade_requerida || 0);
            const itemId = t.tarefa_id || t.id || String(idx);
            const isClearing = clearingId === itemId;
            return (
              <div
                key={itemId}
                className="flex items-center gap-3 p-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] shrink-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white font-mono">{t.sku || "—"}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${getStatusColor(t.status)}`}>
                      {t.status || "PENDENTE"}
                    </span>
                  </div>
                  <p className="text-xs text-[hsl(213,31%,65%)] truncate mt-0.5">{t.produto || t.descricao || "—"}</p>
                </div>

                <div className="flex flex-col items-end shrink-0">
                  <span className="text-[9px] uppercase tracking-wide text-[hsl(213,31%,55%)]">Conferido</span>
                  <span className={`text-xs font-mono font-bold ${getConferidoColor(conf, req)}`}>
                    {conf} / {req}
                  </span>
                </div>

                {conf > 0 && (
                  <button
                    onClick={() => handleLimpar(t)}
                    disabled={isClearing}
                    className="shrink-0 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                    title="Limpar conferência"
                  >
                    {isClearing ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </ColetorLayout>
  );
}
