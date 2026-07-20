import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { AlertTriangle, Truck, Loader2 } from "lucide-react";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { parseError } from "@/lib/errorMapper";


interface Props { onNavigate: (path: string) => void; }

interface MotivoOcorrencia {
  id: string;
  descricao: string;
}

export function SeparacaoOcorrenciasPage({ onNavigate }: Props) {
  const [tarefa, setTarefa] = useState<any>(null);
  const [temSaldoPulmao, setTemSaldoPulmao] = useState(false);
  const [checkingPulmao, setCheckingPulmao] = useState(true);
  const [showMotivoModal, setShowMotivoModal] = useState<"cortar" | "abastecimento" | null>(null);
  const [motivos, setMotivos] = useState<MotivoOcorrencia[]>([]);
  const [selectedMotivo, setSelectedMotivo] = useState("");
  const [observacao, setObservacao] = useState("");
  const [processing, setProcessing] = useState(false);
  const [resultDialog, setResultDialog] = useState<{ sucesso: boolean; mensagem: string } | null>(null);

  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_separacao_tarefa_atual");
    if (raw) {
      const t = JSON.parse(raw);
      setTarefa(t);
      checkPulmaoStock(t.produto_id);
    }
  }, []);

  const checkPulmaoStock = async (produtoId: string) => {
    setCheckingPulmao(true);
    try {
      const { data, error } = await (supabase as any)
        .from("estoque_geral")
        .select("id, endereco_id")
        .eq("produto_id", produtoId)
        .gt("quantidade_disponivel", 0)
        .limit(100);
      if (error) throw error;

      if (data && data.length > 0) {
        const endIds = data.map((d: any) => d.endereco_id).filter(Boolean);
        if (endIds.length > 0) {
          const { data: enderecos } = await (supabase as any)
            .from("endereco")
            .select("id, tipo_endereco")
            .in("id", endIds)
            .eq("tipo_endereco", "PULMAO");
          setTemSaldoPulmao((enderecos?.length || 0) > 0);
        } else {
          setTemSaldoPulmao(false);
        }
      } else {
        setTemSaldoPulmao(false);
      }
    } catch {
      setTemSaldoPulmao(false);
    } finally {
      setCheckingPulmao(false);
    }
  };

  const loadMotivos = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from("motivo_ocorrencia")
        .select("id, descricao")
        .eq("etapa_ocorrencia", "SEPARACAO")
        .eq("ativo", true);
      if (error) throw error;
      setMotivos(data || []);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openMotivoModal = (action: "cortar" | "abastecimento") => {
    setShowMotivoModal(action);
    setSelectedMotivo("");
    setObservacao("");
    loadMotivos();
  };

  const handleConfirm = async () => {
    if (!selectedMotivo || !tarefa || !showMotivoModal) return;
    setProcessing(true);
    try {
      if (showMotivoModal === "cortar") {
        const { data, error } = await supabase.rpc("cortar_item_separacao" as any, {
          p_tenant_id: tenantId,
          p_tarefa_id: tarefa.tarefa_id,
          p_usuario: usuarioId,
          p_motivo_ocorrencia: selectedMotivo,
          p_observacao: observacao || null,
        });
        if (error) throw error;

        let result: any = data;
        if (typeof data === "string") {
          try { result = JSON.parse(data); } catch { /* keep */ }
        }

        if (result && typeof result === "object" && !Array.isArray(result) && result.sucesso === false) {
          setResultDialog({ sucesso: false, mensagem: result.mensagem || "Erro ao cortar saldo" });
          setShowMotivoModal(null);
          return;
        }

        setResultDialog({ sucesso: true, mensagem: "Ocorrência registrada e saldo cortado com sucesso!" });
        setShowMotivoModal(null);
      } else {
        // Abastecimento
        const payload: any = {
          tarefa_id: tarefa.tarefa_id,
          tipo_evento: "SOLICITAR_ABASTECIMENTO",
          carga_util: JSON.stringify({
            motivo_ocorrencia_id: selectedMotivo,
            produto_id: tarefa.produto_id,
            usuario_id: usuarioId,
            observacao: observacao || null,
          }),
          tenant_id: tenantId,
          execucao_tarefa_id: tarefa.tarefa_execucao_id || tarefa.tarefa_id,
        };
        const { error } = await (supabase as any)
          .from("tarefa_evento_execucao")
          .insert(payload);
        if (error) throw error;

        setResultDialog({ sucesso: true, mensagem: "Solicitação de abastecimento registrada com sucesso!" });
        setShowMotivoModal(null);
      }
    } catch (err: any) {
      setResultDialog({ sucesso: false, mensagem: err.message });
      setShowMotivoModal(null);
    } finally {
      setProcessing(false);
    }
  };

  const handleDialogClose = () => {
    const wasSuccess = resultDialog?.sucesso;
    setResultDialog(null);

    if (wasSuccess) {
      const tarefas = JSON.parse(sessionStorage.getItem("coletor_separacao_tarefas") || "[]");
      const idx = Number(sessionStorage.getItem("coletor_separacao_tarefa_idx") || "0");
      const nextIdx = idx + 1;
      if (nextIdx >= tarefas.length) {
        toast.success("Separação concluída para esta onda!");
        onNavigate("/coletor/separacao/iniciar");
      } else {
        sessionStorage.setItem("coletor_separacao_tarefa_idx", String(nextIdx));
        onNavigate("/coletor/separacao/endereco");
      }
    }
  };

  if (!tarefa) return null;

  return (
    <ColetorLayout title={`Ocorrências #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/produto">
      <div className="flex flex-col gap-3 flex-1">
        {/* Product context */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4">
          <p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Produto</p>
          <p className="text-sm font-bold text-white">{tarefa.sku} - {tarefa.produto}</p>
        </div>

        {checkingPulmao ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <ActionButton
              onClick={() => openMotivoModal("cortar")}
              variant="danger"
            >
              <AlertTriangle size={18} /> Registrar Ocorrência e Cortar Saldo
            </ActionButton>

            <ActionButton
              onClick={() => openMotivoModal("abastecimento")}
              variant="warning"
              disabled={!temSaldoPulmao}
            >
              <Truck size={18} /> Solicitar Abastecimento
            </ActionButton>
            {!temSaldoPulmao && (
              <p className="text-[10px] text-[hsl(213,31%,45%)] text-center -mt-2">
                Desabilitado: produto não possui saldo no pulmão
              </p>
            )}
          </div>
        )}
      </div>

      {/* Motivo modal */}
      {showMotivoModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
          <div className="w-full max-w-md bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-3xl p-6 space-y-4 animate-slide-up max-h-[92vh] overflow-y-auto">
            <h3 className="text-base font-bold text-white">
              {showMotivoModal === "cortar" ? "Registrar Ocorrência e Cortar Saldo" : "Solicitar Abastecimento"}
            </h3>
            <p className="text-xs text-[hsl(213,31%,55%)]">
              Selecione o motivo da ocorrência
            </p>

            {showMotivoModal === "cortar" && temSaldoPulmao && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-[#F59E0B]/10 border border-[#F59E0B]/40">
                <AlertTriangle size={16} className="text-[#F59E0B] mt-0.5 shrink-0" />
                <p className="text-[11px] text-[#FCD34D] leading-relaxed">
                  Este produto ainda possui saldo em endereço de pulmão. Confirme antes de cortar.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2 max-h-48 overflow-auto">
              {motivos.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedMotivo(m.id)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    selectedMotivo === m.id
                      ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                      : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                  }`}
                >
                  <span className="text-sm text-white">{m.descricao}</span>
                </button>
              ))}
              {motivos.length === 0 && (
                <p className="text-xs text-[hsl(213,31%,45%)] text-center py-4">Nenhum motivo cadastrado para SEPARAÇÃO.</p>
              )}
            </div>

            <div>
              <label className="text-[10px] uppercase text-[hsl(213,31%,45%)] block mb-1">Observação (opcional)</label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                className="w-full bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 text-sm text-white placeholder:text-[hsl(213,31%,35%)] focus:outline-none focus:border-[hsl(217,91%,50%)]"
                placeholder="Descreva detalhes da ocorrência..."
              />
            </div>

            <div className="flex gap-2">
              <ActionButton onClick={() => setShowMotivoModal(null)} variant="secondary">
                Cancelar
              </ActionButton>
              <ActionButton onClick={handleConfirm} disabled={!selectedMotivo} loading={processing} variant="primary">
                Confirmar
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Result Dialog */}
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
