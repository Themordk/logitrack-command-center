import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { toast } from "sonner";
import { Package, CheckCircle, XCircle, BoxIcon, MoreVertical, List } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";

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
  const [resultDialog, setResultDialog] = useState<{ sucesso: boolean; mensagem: string; ondaConcluida?: boolean } | null>(null);
  const [showEanErroDialog, setShowEanErroDialog] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [modoCheckout, setModoCheckout] = useState(false);
  const [overlay, setOverlay] = useState<{ type: OverlayType; message?: string } | null>(null);
  const pendingNextRef = useRef<{ idx: number; tarefas: any[] } | null>(null);
  const quantidadeRef = useRef<HTMLInputElement>(null);

  const numeroOnda = sessionStorage.getItem("coletor_conferencia_numero_onda") || "";
  const movimentoId = sessionStorage.getItem("coletor_conferencia_movimento_id");
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
    // Detecta modo Checkout uma única vez ao abrir a conferência
    (async () => {
      if (!movimentoId || !usuarioId) return;
      try {
        const [movRes, usrRes] = await Promise.all([
          (supabase as any)
            .from("movimento_saida")
            .select("tipo_saida_rel:tipo_saida(conferencia_checkout)")
            .eq("id", movimentoId)
            .single(),
          (supabase as any)
            .from("usuario")
            .select("permite_checkout")
            .eq("id", usuarioId)
            .single(),
        ]);
        const checkoutTipo = !!movRes?.data?.tipo_saida_rel?.conferencia_checkout;
        const checkoutUsr = !!usrRes?.data?.permite_checkout;
        setModoCheckout(checkoutTipo && checkoutUsr);
      } catch {
        setModoCheckout(false);
      }
    })();
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
    // LMS: mark task as started on first EAN scan
    if (tarefa?.tarefa_id) {
      markTarefaIniciadaByTarefa(tarefa.tarefa_id, usuarioId);
    }

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

    if (modoCheckout) {
      // Use latest tarefa state to avoid stale closure values on rapid scans
      const currentTarefa = tarefas[tarefaIdx] || tarefa;
      const reqAtual = Number(currentTarefa?.quantidade_requerida || qtdRequerida);
      const confAtual = Number(currentTarefa?.conferido ?? qtdConferida);
      const restanteAtual = reqAtual - confAtual;
      if (restanteAtual <= 0) {
        toast.warning("Item já conferido");
        setEanScanned("");
        setEmbalagemInfo(null);
        setEanConfirmado(false);
        return;
      }
      await executarConfirmacao(restanteAtual, "checkout");
      return;
    }

    // Focus quantity field after successful scan (modo manual)
    setTimeout(() => {
      quantidadeRef.current?.focus();
    }, 100);
  };

  const handleConfirmar = async () => {
    if (!tarefa || !quantidade || Number(quantidade) <= 0) {
      toast.error("Informe a quantidade.");
      return;
    }
    const fator = embalagemInfo?.fator || 1;
    const qtdFinal = Number(quantidade) * fator;
    await executarConfirmacao(qtdFinal, "manual");
  };

  const executarConfirmacao = async (qtdFinal: number, modo: "manual" | "checkout") => {
    if (!tarefa) return;
    const tarefaId = tarefa.id || tarefa.tarefa_id;

    setConfirming(true);
    try {
      const { data, error } = await supabase.rpc("conferencia_saida_confirmacao" as any, {
        p_tenant_id: tenantId,
        p_tarefa_id: tarefaId,
        p_quantidade: qtdFinal,
        p_usuario_id: usuarioId,
        p_modo_conferencia: modo,
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

      // Refresh tarefa data (best-effort; may return null under RLS/timing)
      const { data: tarefaAtualizada } = await (supabase as any)
        .from("tarefa")
        .select("quantidade_executada, quantidade_requerida, status")
        .eq("id", tarefaId)
        .single();

      const execFromDb = tarefaAtualizada?.quantidade_executada;
      const reqFromDb = tarefaAtualizada?.quantidade_requerida;
      const newQtdConferida = Number(execFromDb ?? (qtdConferida + qtdFinal));
      const newQtdRequerida = Number(reqFromDb ?? qtdRequerida);
      const statusFromDb = tarefaAtualizada?.status
        ?? (newQtdConferida >= newQtdRequerida ? "CONCLUIDA" : tarefa.status);

      // Always update counters, even if refetch returned null
      setQtdConferida(newQtdConferida);
      const newTarefas = [...tarefas];
      newTarefas[tarefaIdx] = {
        ...newTarefas[tarefaIdx],
        conferido: newQtdConferida,
        status: statusFromDb,
      };
      setTarefas(newTarefas);
      sessionStorage.setItem("coletor_conferencia_tarefas", JSON.stringify(newTarefas));

      setQuantidade("");
      setEanScanned("");
      setEmbalagemInfo(null);
      setEanConfirmado(false);

      // Check if task is complete
      if (newQtdConferida >= newQtdRequerida) {
        // Find next incomplete task
        let nextIdx = -1;
        for (let i = tarefaIdx + 1; i < newTarefas.length; i++) {
          const t = newTarefas[i];
          if (Number(t.conferido || 0) < Number(t.quantidade_requerida || 0) && t.status !== "CONCLUIDA") {
            nextIdx = i;
            break;
          }
        }

        if (nextIdx >= 0) {
          // Show success overlay, then move to next task
          pendingNextRef.current = { idx: nextIdx, tarefas: newTarefas };
          setOverlay({ type: "success", message: "Item conferido — próximo" });
        } else {
          // All tasks completed - show modal; navigation only on close
          setOverlay({ type: "success", message: "Onda finalizada!" });
          setTimeout(() => {
            setResultDialog({
              sucesso: true,
              mensagem: `Conferência da Onda #${numeroOnda} finalizada com sucesso`,
              ondaConcluida: true,
            });
          }, 850);
        }
      } else {
        setOverlay({
          type: "success",
          message: modo === "checkout" ? "Item conferido" : "Quantidade registrada",
        });
      }
    } catch (err: any) {
      setOverlay({ type: "error", message: "Erro" });
      setResultDialog({ sucesso: false, mensagem: err.message });
    } finally {
      setConfirming(false);
    }
  };

  const handleOverlayDone = () => {
    setOverlay(null);
    const pending = pendingNextRef.current;
    if (pending) {
      pendingNextRef.current = null;
      setTarefaIdx(pending.idx);
      sessionStorage.setItem("coletor_conferencia_tarefa_idx", String(pending.idx));
      loadTarefa(pending.tarefas[pending.idx]);
    }
  };

  const handleDialogClose = () => {
    setResultDialog(null);
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
    <ColetorLayout
      title={`Conferência #${numeroOnda}`}
      titleBadge={modoCheckout ? (
        <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wide">CHECKOUT</span>
      ) : undefined}
      onNavigate={onNavigate}
      showBack
      backPath="/coletor/conferencia/iniciar"
    >
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

        {!modoCheckout && (
          <>
            {/* Input quantidade */}
            <div>
              <label className="text-xs text-[hsl(213,31%,55%)] mb-1 block uppercase font-medium">Quantidade a conferir</label>
              <input
                ref={quantidadeRef}
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
          </>
        )}
      </div>

      {/* EAN Error Dialog */}
      {showEanErroDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
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
              Fechar
            </ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}