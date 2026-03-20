import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { Package, CheckCircle, XCircle, BoxIcon, MoreVertical, List } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface EmbalagemInfo {
  ean: string;
  fator: number;
  embalagem: string;
}

export function ConferenciaProdutoPage({ onNavigate }: Props) {
  const [tarefas, setTarefas] = useState<any[]>([]);
  const [tarefaIdx, setTarefaIdx] = useState(0);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [referencia, setReferencia] = useState("");
  const [eanScanned, setEanScanned] = useState("");
  const [embalagemInfo, setEmbalagemInfo] = useState<EmbalagemInfo | null>(null);
  const [eanConfirmado, setEanConfirmado] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [qtdConferida, setQtdConferida] = useState(0);
  const [resultDialog, setResultDialog] = useState<{ sucesso: boolean; mensagem: string } | null>(null);
  const [showEanErroDialog, setShowEanErroDialog] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const numeroOnda = sessionStorage.getItem("coletor_conferencia_numero_onda") || "";
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_conferencia_tarefas");
    const idx = Number(sessionStorage.getItem("coletor_conferencia_tarefa_idx") || "0");
    if (raw) {
      const parsed = JSON.parse(raw);
      setTarefas(parsed);
      setTarefaIdx(idx);
      if (parsed[idx]) {
        loadTarefa(parsed[idx]);
      }
    }
  }, []);

  const loadTarefa = (t: any) => {
    setQtdConferida(Number(t.conferido || t.separado || 0));
    setEanScanned("");
    setEmbalagemInfo(null);
    setEanConfirmado(false);
    setQuantidade("");

    if (t.produto_id) {
      setProdutoId(t.produto_id);
      fetchProdutoDetails(t.produto_id);
    } else if (t.sku) {
      fetchProdutoBySku(t.sku);
    }
  };

  const fetchProdutoDetails = async (pid: string) => {
    const { data } = await (supabase as any).from("produto").select("referencia").eq("id", pid).single();
    if (data) setReferencia(data.referencia || "");
  };

  const fetchProdutoBySku = async (sku: string) => {
    const { data } = await (supabase as any).from("produto").select("id, referencia").eq("sku", sku).single();
    if (data) {
      setProdutoId(data.id);
      setReferencia(data.referencia || "");
    }
  };

  const tarefa = tarefas[tarefaIdx] || null;
  const qtdRequerida = Number(tarefa?.quantidade_requerida || 0);
  const restante = qtdRequerida - qtdConferida;

  const handleEanScan = async (ean: string) => {
    if (!ean || !produtoId) return;
    setEanScanned(ean);

    const { data: emb } = await (supabase as any)
      .from("produto_embalagem")
      .select("ean, fator, embalagem")
      .eq("ean", ean)
      .single();

    if (!emb) {
      setShowEanErroDialog(true);
      setEmbalagemInfo(null);
      setEanConfirmado(false);
      return;
    }

    // Check if EAN belongs to current product
    const { data: embProd } = await (supabase as any)
      .from("produto_embalagem")
      .select("ean")
      .eq("ean", ean)
      .eq("produto_id", produtoId)
      .single();

    if (!embProd) {
      setShowEanErroDialog(true);
      setEmbalagemInfo(null);
      setEanConfirmado(false);
      return;
    }

    setEmbalagemInfo({ ean: emb.ean, fator: emb.fator, embalagem: emb.embalagem });
    setEanConfirmado(true);
  };

  const handleConfirmar = async () => {
    if (!tarefa || !quantidade || Number(quantidade) <= 0) {
      toast.error("Informe a quantidade.");
      return;
    }

    const fator = embalagemInfo?.fator || 1;
    const qtdFinal = Number(quantidade) * fator;

    setConfirming(true);
    try {
      const { data, error } = await supabase.rpc("conferencia_saida_confirmacao" as any, {
        p_tenant_id: tenantId,
        p_tarefa_id: tarefa.tarefa_id,
        p_quantidade: qtdFinal,
        p_usuario_id: usuarioId,
      });
      if (error) throw error;

      let result: any = data;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { /* keep */ }
      }

      if (result && typeof result === "object" && !Array.isArray(result) && result.sucesso === false) {
        setResultDialog({ sucesso: false, mensagem: result.mensagem || "Erro na conferência" });
        return;
      }

      // Refresh tarefa data
      const { data: tarefaAtualizada } = await (supabase as any)
        .from("tarefa")
        .select("quantidade_executada, quantidade_requerida, status")
        .eq("id", tarefa.tarefa_id)
        .single();

      if (tarefaAtualizada) {
        setQtdConferida(Number(tarefaAtualizada.quantidade_executada || 0));
        const newTarefas = [...tarefas];
        newTarefas[tarefaIdx] = { ...newTarefas[tarefaIdx], conferido: tarefaAtualizada.quantidade_executada, status: tarefaAtualizada.status };
        setTarefas(newTarefas);
        sessionStorage.setItem("coletor_conferencia_tarefas", JSON.stringify(newTarefas));
      }

      setQuantidade("");
      setEanScanned("");
      setEmbalagemInfo(null);
      setEanConfirmado(false);

      // Check if task is complete
      const newQtdConferida = Number(tarefaAtualizada?.quantidade_executada || qtdConferida + qtdFinal);
      if (newQtdConferida >= qtdRequerida) {
        // Move to next tarefa
        const nextIdx = tarefaIdx + 1;
        if (nextIdx < tarefas.length) {
          setTarefaIdx(nextIdx);
          sessionStorage.setItem("coletor_conferencia_tarefa_idx", String(nextIdx));
          loadTarefa(tarefas[nextIdx]);
          toast.success("Item conferido! Próximo item...");
        } else {
          setResultDialog({ sucesso: true, mensagem: "Conferência da onda finalizada com sucesso!" });
        }
      } else {
        toast.success("Quantidade registrada!");
      }
    } catch (err: any) {
      setResultDialog({ sucesso: false, mensagem: err.message });
    } finally {
      setConfirming(false);
    }
  };

  const handleDialogClose = () => {
    const wasSuccess = resultDialog?.sucesso;
    setResultDialog(null);
    if (wasSuccess && restante <= 0) {
      onNavigate("/coletor/conferencia/iniciar");
    }
  };

  if (!tarefa) {
    return (
      <ColetorLayout title={`Conferência #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/conferencia/iniciar">
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa carregada.</p>
        </div>
      </ColetorLayout>
    );
  }

  return (
    <ColetorLayout title={`Conferência #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/conferencia/iniciar">
      <div className="flex flex-col gap-3 flex-1">
        {/* Options button */}
        <div className="flex justify-end relative">
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="p-2 rounded-xl bg-[hsl(222,40%,14%)] border border-[hsl(222,35%,22%)] active:scale-[0.97]"
          >
            <MoreVertical size={18} className="text-[hsl(213,31%,75%)]" />
          </button>
          {showOptions && (
            <div className="absolute top-10 right-0 z-50 w-56 bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl shadow-xl overflow-hidden">
              <button
                onClick={() => { setShowOptions(false); onNavigate("/coletor/conferencia/itens"); }}
                className="flex items-center gap-2 w-full px-4 py-3 text-sm text-white hover:bg-[hsl(222,35%,16%)] transition-colors text-left"
              >
                <List size={16} className="text-[hsl(217,91%,60%)]" />
                Visualizar Itens
              </button>
            </div>
          )}
        </div>

        {/* Scan EAN */}
        <ScanField
          label="Scan EAN Produto"
          lastScanned={eanScanned}
          onScan={handleEanScan}
          placeholder="Escanear EAN"
        />

        {/* Produto details */}
        <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <Package size={16} className="text-[hsl(217,91%,60%)]" />
            <span className="text-xs font-bold text-[hsl(213,31%,75%)] uppercase">Produto</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-[hsl(213,31%,45%)]">SKU:</span> <span className="text-white font-bold">{tarefa.sku || "—"}</span></div>
            <div><span className="text-[hsl(213,31%,45%)]">Referência:</span> <span className="text-white font-bold">{referencia || "—"}</span></div>
            <div className="col-span-2"><span className="text-[hsl(213,31%,45%)]">Descrição:</span> <span className="text-white font-bold">{tarefa.produto || tarefa.descricao || "—"}</span></div>
          </div>
        </div>

        {/* Embalagem details */}
        <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <BoxIcon size={16} className="text-[hsl(45,93%,47%)]" />
            <span className="text-xs font-bold text-[hsl(213,31%,75%)] uppercase">Embalagem</span>
          </div>
          {embalagemInfo ? (
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><span className="text-[hsl(213,31%,45%)]">EAN:</span> <span className="text-white font-bold">{embalagemInfo.ean}</span></div>
              <div><span className="text-[hsl(213,31%,45%)]">Fator:</span> <span className="text-white font-bold">{embalagemInfo.fator}</span></div>
              <div><span className="text-[hsl(213,31%,45%)]">Emb:</span> <span className="text-white font-bold">{embalagemInfo.embalagem}</span></div>
            </div>
          ) : (
            <p className="text-xs text-[hsl(213,31%,45%)]">Escaneie um EAN para visualizar</p>
          )}
        </div>

        {/* Quantities */}
        <div className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <span className="text-[10px] text-[hsl(213,31%,45%)] uppercase block">Requerida</span>
              <span className="text-xl font-bold text-white">{qtdRequerida}</span>
            </div>
            <div>
              <span className="text-[10px] text-[hsl(213,31%,45%)] uppercase block">Conferida</span>
              <span className="text-xl font-bold text-[#22C55E]">{qtdConferida}</span>
            </div>
            <div>
              <span className="text-[10px] text-[hsl(213,31%,45%)] uppercase block">Restante</span>
              <span className="text-xl font-bold text-[hsl(45,93%,47%)]">{restante > 0 ? restante : 0}</span>
            </div>
          </div>
        </div>

        {/* Input quantidade */}
        <div>
          <label className="text-xs text-[hsl(213,31%,55%)] mb-1 block uppercase font-medium">Quantidade a conferir</label>
          <input
            type="number"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            className="w-full h-14 px-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] text-white text-xl font-bold text-center outline-none focus:border-[hsl(217,91%,50%)]"
            placeholder="0"
          />
        </div>

        {/* Confirm button */}
        <ActionButton
          onClick={handleConfirmar}
          disabled={!eanConfirmado || !quantidade || Number(quantidade) <= 0}
          loading={confirming}
          variant="success"
        >
          Confirmar Conferência
        </ActionButton>
      </div>

      {/* EAN Error Dialog */}
      {showEanErroDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-6 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <XCircle size={48} className="text-[#E02424]" />
              <h3 className="text-base font-bold text-white text-center">EAN Incorreto</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">
                O EAN informado não pertence ao produto da tarefa atual.
              </p>
            </div>
            <ActionButton onClick={() => { setShowEanErroDialog(false); setEanScanned(""); }}>
              Fechar
            </ActionButton>
          </div>
        </div>
      )}

      {/* Result Dialog */}
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
