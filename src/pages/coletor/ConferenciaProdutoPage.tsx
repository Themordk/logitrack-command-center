import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { toast } from "sonner";
import { Package, CheckCircle, XCircle, BoxIcon, MoreVertical, List } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";
import { RegistrarOcorrenciaColetorButton } from "@/components/ocorrencia/RegistrarOcorrenciaColetorButton";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";

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
  const result = useResultDialog({ coletorMode: true });
  const [showOptions, setShowOptions] = useState(false);
  const [modoCheckout, setModoCheckout] = useState(false);
  const [modoCego, setModoCego] = useState(false);
  const [showVolumeDialog, setShowVolumeDialog] = useState(false);
  const [volumeQtd, setVolumeQtd] = useState("");
  const [volumeSaving, setVolumeSaving] = useState(false);
  const [geraVolumeEtapa, setGeraVolumeEtapa] = useState<string>("NENHUMA");
  const [overlay, setOverlay] = useState<{ type: OverlayType; message?: string; duration?: number } | null>(null);
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
            .select("tipo_saida_rel:tipo_saida(conferencia_checkout, conferencia_cega, gera_volume_etapa)")
            .eq("id", movimentoId)
            .single(),
          (supabase as any)
            .from("usuario")
            .select("permite_checkout")
            .eq("id", usuarioId)
            .single(),
        ]);
        const tipoSaidaData = movRes?.data?.tipo_saida_rel;
        const checkoutTipo = !!tipoSaidaData?.conferencia_checkout;
        const checkoutUsr = !!usrRes?.data?.permite_checkout;
        setModoCheckout(checkoutTipo && checkoutUsr);
        setModoCego(!!tipoSaidaData?.conferencia_cega);
        setGeraVolumeEtapa(tipoSaidaData?.gera_volume_etapa || "NENHUMA");
      } catch {
        setModoCheckout(false);
        setModoCego(false);
      }
    })();
  }, []);

  const loadTarefa = (t: any) => {
    setQtdConferida(Number(t.conferido ?? t.separado ?? 0));
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
    if (!ean) return;
    setEanScanned(ean);

    // 1) Lookup EAN once (ean + fator + embalagem + produto_id)
    const { data: emb } = await (supabase as any)
      .from("produto_embalagem")
      .select("ean, fator, embalagem, produto_id")
      .eq("ean", ean)
      .maybeSingle();

    if (!emb) {
      result.showWarning("EAN não cadastrado no sistema.", {
        instruction: "Verifique o EAN e escaneie novamente.",
        onClose: () => setEanScanned(""),
      });
      setEmbalagemInfo(null);
      setEanConfirmado(false);
      return;
    }

    // 2) Locate a pending task in this wave for the scanned product
    const matchIdx = tarefas.findIndex(
      (t) =>
        t.produto_id === emb.produto_id &&
        Number(t.conferido ?? t.separado ?? 0) < Number(t.quantidade_requerida || 0) &&
        (t.status || "").toUpperCase() !== "CONCLUIDA"
    );

    if (matchIdx < 0) {
      const existsInOnda = tarefas.some((t) => t.produto_id === emb.produto_id);
      if (existsInOnda) {
        toast.warning("Item já conferido");
        setEanScanned("");
        setEmbalagemInfo(null);
        setEanConfirmado(false);
        return;
      }
      result.showWarning("Este EAN não pertence a nenhum item desta conferência.", {
        instruction: "Confira o produto e tente novamente.",
        onClose: () => setEanScanned(""),
      });
      setEmbalagemInfo(null);
      setEanConfirmado(false);
      return;
    }

    // 3) Switch active task if needed (sync state for confirmacao that follows)
    const activeTarefa = tarefas[matchIdx];
    if (matchIdx !== tarefaIdx) {
      setTarefaIdx(matchIdx);
      sessionStorage.setItem("coletor_conferencia_tarefa_idx", String(matchIdx));
      loadTarefa(activeTarefa);
      // re-set the scanned EAN since loadTarefa clears it
      setEanScanned(ean);
    }

    // LMS: mark task as started on first EAN scan
    if (activeTarefa?.tarefa_id) {
      markTarefaIniciadaByTarefa(activeTarefa.tarefa_id, usuarioId);
    }

    setEmbalagemInfo({ ean: emb.ean, fator: emb.fator, embalagem: emb.embalagem });
    setEanConfirmado(true);

    if (modoCheckout) {
      const reqAtual = Number(activeTarefa?.quantidade_requerida || 0);
      const confAtual = Number(activeTarefa?.conferido ?? activeTarefa?.separado ?? 0);
      const restanteAtual = reqAtual - confAtual;
      if (restanteAtual <= 0) {
        toast.warning("Item já conferido");
        setEanScanned("");
        setEmbalagemInfo(null);
        setEanConfirmado(false);
        return;
      }
      const fator = Number(emb.fator || 1);
      const qtdIncremento = Math.min(fator, restanteAtual);
      // Ensure executarConfirmacao uses the active task even before state flush
      await executarConfirmacaoFor(activeTarefa, qtdIncremento, "checkout");
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
    await executarConfirmacaoFor(tarefa, qtdFinal, modo);
  };

  const executarConfirmacaoFor = async (
    targetTarefa: any,
    qtdFinal: number,
    modo: "manual" | "checkout"
  ) => {
    if (!targetTarefa) return;
    const tarefaId = targetTarefa.id || targetTarefa.tarefa_id;
    const targetIdx = tarefas.findIndex(
      (t) => (t.id || t.tarefa_id) === tarefaId
    );

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

      const prevConferido = Number(targetTarefa.conferido ?? targetTarefa.separado ?? 0);
      const prevRequerida = Number(targetTarefa.quantidade_requerida || 0);
      const execFromDb = tarefaAtualizada?.quantidade_executada;
      const reqFromDb = tarefaAtualizada?.quantidade_requerida;
      const newQtdConferida = Number(execFromDb ?? (prevConferido + qtdFinal));
      const newQtdRequerida = Number(reqFromDb ?? prevRequerida);
      const statusFromDb = tarefaAtualizada?.status
        ?? (newQtdConferida >= newQtdRequerida ? "CONCLUIDA" : targetTarefa.status);

      // Always update counters, even if refetch returned null
      setQtdConferida(newQtdConferida);
      const newTarefas = [...tarefas];
      if (targetIdx >= 0) {
        newTarefas[targetIdx] = {
          ...newTarefas[targetIdx],
          conferido: newQtdConferida,
          status: statusFromDb,
        };
      }
      setTarefas(newTarefas);
      sessionStorage.setItem("coletor_conferencia_tarefas", JSON.stringify(newTarefas));


      setQuantidade("");
      setEanScanned("");
      setEmbalagemInfo(null);
      setEanConfirmado(false);

      // Defer overlay to next frame so the counters paint BEFORE the full-screen overlay covers the UI
      const showOverlay = (payload: { type: OverlayType; message?: string; duration?: number }) => {
        requestAnimationFrame(() => requestAnimationFrame(() => setOverlay(payload)));
      };

      // Check if task is complete
      if (newQtdConferida >= newQtdRequerida) {
        // Find next incomplete task (scan entire list, since user can scan any)
        let nextIdx = -1;
        for (let i = 0; i < newTarefas.length; i++) {
          if (i === targetIdx) continue;
          const t = newTarefas[i];
          if (Number(t.conferido || 0) < Number(t.quantidade_requerida || 0) && t.status !== "CONCLUIDA") {
            nextIdx = i;
            break;
          }
        }


        if (nextIdx >= 0) {
          // Show success overlay (after paint), then move to next task
          pendingNextRef.current = { idx: nextIdx, tarefas: newTarefas };
          showOverlay({ type: "success", message: "Item conferido — próximo", duration: 600 });
        } else {
          // All tasks completed
          showOverlay({ type: "success", message: "Onda finalizada!", duration: 800 });
          setTimeout(() => {
            if (geraVolumeEtapa === "CONFERÊNCIA") {
              setShowVolumeDialog(true);
            } else {
              setResultDialog({
                sucesso: true,
                mensagem: `Conferência da Onda #${numeroOnda} finalizada com sucesso`,
                ondaConcluida: true,
              });
            }
          }, 850);
        }
      } else {
        showOverlay({
          type: "success",
          message: modo === "checkout" ? "Item conferido" : "Quantidade registrada",
          duration: 500,
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

  const handleSalvarVolumes = async () => {
    const qtd = Number(volumeQtd);
    if (!qtd || qtd <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    setVolumeSaving(true);
    try {
      const { data, error } = await supabase.rpc("gerar_volumes_expedicao" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: localStorage.getItem("core_empresa_id"),
        p_movimento_saida_id: movimentoId,
        p_quantidade_volumes: qtd,
        p_etapa_origem: "CONFERÊNCIA",
      });
      if (error) throw error;
      let result: any = data;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { /* keep */ }
      }
      if (result?.sucesso === false) {
        toast.error(result.mensagem || "Erro ao gerar volumes.");
        return;
      }
      toast.success(result?.mensagem || `${qtd} volume(s) gerado(s)!`);
      setShowVolumeDialog(false);
      onNavigate("/coletor/conferencia/iniciar");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar volumes.");
    } finally {
      setVolumeSaving(false);
    }
  };

  const handleDialogClose = () => {
    const wasOndaConcluida = resultDialog?.ondaConcluida;
    setResultDialog(null);
    if (wasOndaConcluida) {
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
    <ColetorLayout
      title={`Conferência #${numeroOnda}`}
      titleBadge={
        modoCheckout ? (
          <span className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wide">CHECKOUT</span>
        ) : modoCego ? (
          <span className="px-2 py-0.5 rounded-md bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wide">CEGA</span>
        ) : undefined
      }
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
          {modoCego ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-[hsl(213,31%,45%)] uppercase">Conferida</span>
              <span className="text-3xl font-bold text-[#22C55E]">{qtdConferida}</span>
              <span className="text-[10px] text-amber-400 mt-1 uppercase tracking-wider">Conferência cega ativa</span>
            </div>
          ) : (
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
          )}
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

            <RegistrarOcorrenciaColetorButton
              contexto={{
                etapa: "EXPEDICAO",
                produto_id: produtoId || undefined,
                produto_descricao: tarefa?.produto || tarefa?.descricao,
                tarefa_id: tarefa?.id || tarefa?.tarefa_id,
                documento_origem_id: movimentoId || undefined,
                tipo_documento_origem: "MOVIMENTO_SAIDA",
                quantidade_esperada: Number(tarefa?.quantidade_requerida || 0),
                quantidade_real: Number(qtdConferida || 0),
              }}
            />
          </>
        )}
      </div>

      {showVolumeDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center">
                <Package size={24} className="text-[hsl(217,91%,60%)]" />
              </div>
              <h3 className="text-base font-bold text-white text-center">Volumes de Expedição</h3>
              <p className="text-xs text-[hsl(213,31%,55%)] text-center">
                Conferência finalizada! Informe a quantidade de volumes gerados para esta onda.
              </p>
            </div>
            <div>
              <label className="text-xs text-[hsl(213,31%,55%)] mb-1 block uppercase font-medium">
                Quantidade de volumes
              </label>
              <input
                type="number"
                value={volumeQtd}
                onChange={(e) => setVolumeQtd(e.target.value)}
                className="w-full h-14 px-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] text-white text-2xl font-bold text-center outline-none focus:border-[hsl(217,91%,50%)]"
                placeholder="0"
                min="1"
                autoFocus
              />
            </div>
            <ActionButton
              onClick={handleSalvarVolumes}
              disabled={!volumeQtd || Number(volumeQtd) <= 0}
              loading={volumeSaving}
              variant="success"
            >
              Confirmar Volumes
            </ActionButton>
          </div>
        </div>
      )}

      {/* EAN Error Dialog */}
      {showEanErroDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col items-center gap-3">
              <XCircle size={48} className="text-[#E02424]" />
              <h3 className="text-base font-bold text-white text-center">EAN Incorreto</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">
                {eanErroMsg || "O EAN informado não pertence a esta conferência."}
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

      {/* Success/error overlay for visual feedback */}
      <StatusOverlay
        type={overlay?.type ?? null}
        message={overlay?.message}
        duration={overlay?.duration}
        onDone={handleOverlayDone}
      />
    </ColetorLayout>
  );
}