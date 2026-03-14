import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { Scissors, Truck, ClipboardList, Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface MotivoOcorrencia {
  id: string;
  descricao: string;
}

export function SeparacaoOcorrenciasPage({ onNavigate }: Props) {
  const [tarefa, setTarefa] = useState<any>(null);
  const [temSaldoPulmao, setTemSaldoPulmao] = useState(false);
  const [checkingPulmao, setCheckingPulmao] = useState(true);
  const [showMotivoModal, setShowMotivoModal] = useState<string | null>(null); // action type
  const [motivos, setMotivos] = useState<MotivoOcorrencia[]>([]);
  const [selectedMotivo, setSelectedMotivo] = useState("");
  const [processing, setProcessing] = useState(false);

  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";
  const tenantId = localStorage.getItem("core_tenant_id");
  const armazemId = localStorage.getItem("core_armazem_id");
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
      // Check if product has stock in pulmão addresses (tipo_endereco = 'PULMAO')
      const { data, error } = await (supabase as any)
        .from("estoque_geral")
        .select("id, endereco_id")
        .eq("produto_id", produtoId)
        .gt("quantidade_disponivel", 0)
        .limit(100);
      if (error) throw error;

      if (data && data.length > 0) {
        // Check if any of these addresses are PULMAO type
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

  const openMotivoModal = (action: string) => {
    setShowMotivoModal(action);
    setSelectedMotivo("");
    loadMotivos();
  };

  const handleConfirmOcorrencia = async () => {
    if (!selectedMotivo || !tarefa || !showMotivoModal) return;
    setProcessing(true);
    try {
      // For now, we register the occurrence via a generic approach
      // The specific RPC can be called based on the action type
      const actionLabel = showMotivoModal === "cortar" ? "Corte de saldo" 
        : showMotivoModal === "abastecimento" ? "Solicitação de abastecimento"
        : "Solicitação de inventário";

      // Register the occurrence event
      const payload: any = {
        tarefa_id: tarefa.tarefa_id,
        tipo_evento: showMotivoModal === "cortar" ? "CORTE_SALDO" 
          : showMotivoModal === "abastecimento" ? "SOLICITAR_ABASTECIMENTO"
          : "SOLICITAR_INVENTARIO",
        carga_util: JSON.stringify({
          motivo_ocorrencia_id: selectedMotivo,
          produto_id: tarefa.produto_id,
          usuario_id: usuarioId,
        }),
        tenant_id: tenantId,
        execucao_tarefa_id: tarefa.tarefa_execucao_id || tarefa.tarefa_id,
      };

      const { error } = await (supabase as any)
        .from("tarefa_evento_execucao")
        .insert(payload);
      if (error) throw error;

      toast.success(`${actionLabel} registrada com sucesso!`);
      setShowMotivoModal(null);

      // If cortar saldo, advance to next
      if (showMotivoModal === "cortar") {
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
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (!tarefa) return null;

  return (
    <ColetorLayout title={`Ocorrências #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/produto">
      <div className="flex flex-col gap-3 flex-1">
        {/* Product context */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4">
          <p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Produto</p>
          <p className="text-sm font-bold text-white">{tarefa.sku} - {tarefa.descricao}</p>
        </div>

        {checkingPulmao ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Cortar saldo - only if NO pulmão stock */}
            <ActionButton
              onClick={() => openMotivoModal("cortar")}
              variant="danger"
              disabled={temSaldoPulmao}
            >
              <Scissors size={18} /> Cortar Saldo Não Separado
            </ActionButton>
            {temSaldoPulmao && (
              <p className="text-[10px] text-[hsl(213,31%,45%)] text-center -mt-2">
                Desabilitado: produto possui saldo no pulmão
              </p>
            )}

            {/* Solicitar abastecimento - only if HAS pulmão stock */}
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

            {/* Solicitar inventário - always enabled */}
            <ActionButton
              onClick={() => openMotivoModal("inventario")}
              variant="secondary"
            >
              <ClipboardList size={18} /> Solicitar Inventário
            </ActionButton>
          </div>
        )}
      </div>

      {/* Motivo modal */}
      {showMotivoModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
          <div className="w-full max-w-md bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-3xl p-6 space-y-4 animate-slide-up">
            <h3 className="text-base font-bold text-white">Motivo da Ocorrência</h3>
            <p className="text-xs text-[hsl(213,31%,55%)]">
              {showMotivoModal === "cortar" && "Selecione o motivo para cortar o saldo não separado"}
              {showMotivoModal === "abastecimento" && "Selecione o motivo para solicitar abastecimento"}
              {showMotivoModal === "inventario" && "Selecione o motivo para solicitar inventário"}
            </p>

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

            <div className="flex gap-2">
              <ActionButton onClick={() => setShowMotivoModal(null)} variant="secondary">
                Cancelar
              </ActionButton>
              <ActionButton onClick={handleConfirmOcorrencia} disabled={!selectedMotivo} loading={processing} variant="primary">
                Confirmar
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}
