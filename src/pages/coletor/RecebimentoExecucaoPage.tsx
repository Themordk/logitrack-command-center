import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { InfoCard } from "@/components/coletor/InfoCard";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { HUActiveBar } from "@/components/coletor/HUActiveBar";
import { toast } from "sonner";
import { Loader2, Trash2, AlertTriangle, Printer } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";
import { formatDateTimeShort } from "@/utils/dateTime";
import { useSolicitarImpressao } from "@/hooks/useSolicitarImpressao";
import { useOffline } from "@/contexts/OfflineContext";
import { useOfflineAction } from "@/hooks/useOfflineAction";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";
import { CancelamentoOverlay } from "@/components/coletor/CancelamentoOverlay";
import { useCancelamentoListener, documentoEntradaCancelado } from "@/hooks/useCancelamentoListener";
import { useFeedback } from "@/hooks/useFeedback";

interface Props { onNavigate: (path: string) => void; }

interface ProdutoInfo {
  ean: string;
  fator: number;
  descricao: string;
  sku: string;
  referencia: string;
  lastro: number | null;
  camada: number | null;
  tipo_controle: string;
  produto_id: string;
  tarefa_id: string;
  peso_variavel: boolean;
}

interface ConferenciaItem {
  tarefa_execucao_id: string;
  tarefa_id: string;
  tarefa_status: string;
  sku: string;
  descricao: string;
  operador: string;
  codigo_hu: string | null;
  quantidade_executada: number;
  concluido_em: string | null;
  lote: string;
  status: string;
}

interface TarefaPlanejada {
  id: string;
  ordem_tarefa: number;
  sku: string;
  descricao: string;
  fator_caixa: number;
  quantidade_requerida: number;
  conferido: number;
  status: string;
}

export function RecebimentoExecucaoPage({ onNavigate }: Props) {
  const { setFabVisivel, setContexto } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(true);
    return () => setFabVisivel(false);
  }, [setFabVisivel]);

  const movimentoId = sessionStorage.getItem("coletor_movimento_id") || "";
  const result = useResultDialog({ coletorMode: true });
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const [items, setItems] = useState<ConferenciaItem[]>([]);
  const [tarefas, setTarefas] = useState<TarefaPlanejada[]>(() => {
    try {
      const cached = sessionStorage.getItem("coletor_recebimento_tarefas");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const { solicitar } = useSolicitarImpressao();
  const { isOnline, cacheData, getCachedData } = useOffline();
  const { execute: executeOffline } = useOfflineAction();
  const barcodeCacheKey = `recebimento_barcode_cache_${movimentoId}`;
  const [lastScanned, setLastScanned] = useState("");
  const [currentProduct, setCurrentProduct] = useState<ProdutoInfo | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<ConferenciaItem | null>(null);
  const [documentoEntradaId, setDocumentoEntradaId] = useState<string | null>(null);
  const [docCanceladoInline, setDocCanceladoInline] = useState(false);
  const { cancelamento } = useCancelamentoListener(documentoEntradaId, tenantId);
  const { error: feedbackError } = useFeedback();

  // Resolve o documento de entrada vinculado ao movimento em conferência
  useEffect(() => {
    if (!movimentoId || !tenantId || !isOnline) return;
    let ativo = true;
    (async () => {
      try {
        const { data } = await (supabase as any)
          .from("movimento_entrada_documento")
          .select("documento_entrada_id")
          .eq("movimento_entrada_id", movimentoId)
          .eq("tenant_id", tenantId)
          .limit(1)
          .maybeSingle();
        if (ativo && data?.documento_entrada_id) setDocumentoEntradaId(data.documento_entrada_id);
      } catch {
        // ignora — verificação pré-ação cobre o fallback
      }
    })();
    return () => { ativo = false; };
  }, [movimentoId, tenantId, isOnline]);


  // Publica contexto para o FAB de ocorrência
  useEffect(() => {
    setContexto({
      etapa: "RECEBIMENTO",
      produto_id: currentProduct?.produto_id || undefined,
      produto_descricao: currentProduct?.descricao || undefined,
      documento_origem_id: movimentoId || undefined,
      tipo_documento_origem: movimentoId ? "MOVIMENTO_ENTRADA" : undefined,
    });
  }, [setContexto, currentProduct, movimentoId]);

  // Lote/validade modal
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [lote, setLote] = useState("");
  const [fabricacao, setFabricacao] = useState("");
  const [validade, setValidade] = useState("");

  const refreshTarefas = useCallback(async () => {
    if (!movimentoId || !tenantId || !empresaId || !usuarioId) return;
    if (!isOnline) return; // Offline: usa tarefas do sessionStorage
    try {
      const { data, error } = await (supabase as any).rpc(
        "entrada_conferencia_buscar_tarefas",
        {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_usuario_id: usuarioId,
          p_movimento_entrada_id: movimentoId,
        }
      );
      if (error) throw error;
      const parsed: TarefaPlanejada[] = Array.isArray(data)
        ? data
        : typeof data === "string"
        ? JSON.parse(data)
        : [];
      setTarefas(parsed);
      sessionStorage.setItem("coletor_recebimento_tarefas", JSON.stringify(parsed));
    } catch (err) {
      console.error("Erro ao atualizar tarefas:", err);
    }
  }, [movimentoId, tenantId, empresaId, usuarioId, isOnline]);

  const loadConferencia = useCallback(async () => {
    if (!movimentoId) return;
    if (!isOnline) {
      // Offline: mantém itens locais, sem chamada ao servidor
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("vw_movimento_entrada_conferencia_detalhe")
        .select("tarefa_execucao_id, tarefa_id, tarefa_status, sku, descricao, operador, codigo_hu, quantidade_executada, concluido_em, lote, status")
        .eq("movimento_id", movimentoId);

      if (error) throw error;

      const mapped: ConferenciaItem[] = (data || []).map((e: any) => ({
        tarefa_execucao_id: e.tarefa_execucao_id,
        tarefa_id: e.tarefa_id,
        tarefa_status: e.tarefa_status,
        sku: e.sku || "",
        descricao: e.descricao || "",
        operador: e.operador || "",
        codigo_hu: e.codigo_hu,
        quantidade_executada: Number(e.quantidade_executada || 0),
        concluido_em: e.concluido_em,
        lote: e.lote || "",
        status: e.status,
      }));

      setItems(mapped);
    } catch {
      result.showError(new Error("Erro ao carregar itens."), { context: "recebimento-execucao" });
    } finally {
      setLoading(false);
    }
  }, [movimentoId, isOnline]);

  useEffect(() => {
    if (movimentoId) {
      loadConferencia();
      refreshTarefas();
    }
  }, [movimentoId, loadConferencia, refreshTarefas]);

  const applyProdutoResult = (code: string, prod: any) => {
    // LMS: mark task as started on first scan
    if (prod.tarefa_id) {
      markTarefaIniciadaByTarefa(prod.tarefa_id, usuarioId);
    }

    setCurrentProduct({
      ean: code,
      fator: prod.Fator_embalagem || prod.fator_embalagem || 1,
      descricao: prod.descricao,
      sku: prod.sku,
      referencia: prod.referencia,
      lastro: prod.lastro,
      camada: prod.camada,
      tipo_controle: prod.tipo_controle,
      produto_id: prod.id,
      tarefa_id: prod.tarefa_id,
      peso_variavel: prod.peso_variavel,
    });
    showOverlayMsg("success", `Produto: ${prod.sku}`);
  };

  const handleScan = async (code: string) => {
    setLastScanned(code);
    setCurrentProduct(null);
    setQuantidade("");

    if (!movimentoId || !tenantId) {
      result.showWarning("Movimento não identificado");
      return;
    }

    // Verificação pré-ação (fallback caso o Realtime falhe)
    if (isOnline && documentoEntradaId) {
      const cancelado = await documentoEntradaCancelado(documentoEntradaId, tenantId);
      if (cancelado) {
        setDocCanceladoInline(true);
        feedbackError();
        toast.error("Este documento foi cancelado. Não é possível continuar a conferência.");
        return;
      }
    }



    if (!isOnline) {
      const cached = (await getCachedData<Record<string, any>>(barcodeCacheKey)) || {};
      const prod = cached[code];
      if (!prod) {
        result.showWarning("Produto não encontrado no cache offline", {
          instruction: "Escaneie este produto quando estiver conectado à rede.",
        });
        return;
      }
      applyProdutoResult(code, prod);
      return;
    }

    try {
      const { data, error } = await (supabase as any).rpc("fn_conferencia_buscar_produto_por_barcode", {
        p_tenant_id: tenantId,
        p_movimento_entrada_id: movimentoId,
        p_codigo_barras: code,
      });

      if (error) throw error;

      const rpcRes = typeof data === "string" ? JSON.parse(data) : data;

      if (!rpcRes?.success) {
        result.showWarning(rpcRes?.message || "Produto não encontrado");
        return;
      }

      const prod = rpcRes.data;

      // Guarda o item no cache offline do documento para permitir a busca sem rede
      const cached = (await getCachedData<Record<string, any>>(barcodeCacheKey)) || {};
      cached[code] = prod;
      await cacheData(barcodeCacheKey, cached, 480).catch(() => {});

      applyProdutoResult(code, prod);
    } catch (err: any) {
      console.error(err);
      result.showError(err, { context: "recebimento-execucao-produto" });
    }
  };

  const showOverlayMsg = (type: OverlayType, msg: string) => {
    setOverlay(type);
    setOverlayMsg(msg);
  };

  const handleConfirmQty = () => {
    if (!currentProduct) return;
    const ctrl = currentProduct.tipo_controle;
    if (ctrl === "LOTE" || ctrl === "VALIDADE" || ctrl === "LOTE_SERIE") {
      setShowLoteModal(true);
    } else {
      doConfirm();
    }
  };

  const doConfirm = async () => {
    if (!currentProduct || !quantidade) return;
    if (!movimentoId || !tenantId || !usuarioId) return;
    if (isOnline && documentoEntradaId) {
      const cancelado = await documentoEntradaCancelado(documentoEntradaId, tenantId);
      if (cancelado) {
        setDocCanceladoInline(true);
        feedbackError();
        toast.error("Este documento foi cancelado. Não é possível continuar a conferência.");
        return;
      }
    }
    setSaving(true);


    try {
      const fator = currentProduct.fator || 1;
      const qtdFinal = Number(quantidade) * fator;

      const huId = sessionStorage.getItem("coletor_hu_id") || null;

      const offlineResult = await executeOffline("finalizar_conferencia_entrada_item", {
        p_tarefa_id: currentProduct.tarefa_id,
        p_usuario: usuarioId,
        p_quantidade: qtdFinal,
        p_lote: lote || "",
        p_validade: validade || "1900-01-01",
        p_fabricacao: fabricacao || "1900-01-01",
        p_hu: huId,
      });

      if (!offlineResult.success) throw offlineResult.data;

      showOverlayMsg("success", `✔ ${quantidade} un. confirmadas`);

      const produtoConfirmado = currentProduct;
      const qtdConfirmada = quantidade;

      setCurrentProduct(null);
      setQuantidade("");
      setLote("");
      setFabricacao("");
      setValidade("");
      setShowLoteModal(false);

      if (offlineResult.offline) {
        toast.info("Ação salva. Será enviada quando a conexão retornar.");

        // Avança localmente sem consultar o servidor
        setItems((prev) => [
          {
            tarefa_execucao_id: `offline-${Date.now()}`,
            tarefa_id: produtoConfirmado.tarefa_id,
            tarefa_status: "EM_ANDAMENTO",
            sku: produtoConfirmado.sku,
            descricao: produtoConfirmado.descricao,
            operador: "",
            codigo_hu: huId,
            quantidade_executada: qtdFinal,
            concluido_em: new Date().toISOString(),
            lote: lote || "",
            status: "PENDENTE",
          },
          ...prev,
        ]);

        setTarefas((prev) => {
          const updated = prev.map((t) =>
            t.id === produtoConfirmado.tarefa_id
              ? { ...t, conferido: (t.conferido || 0) + qtdFinal }
              : t
          );
          sessionStorage.setItem("coletor_recebimento_tarefas", JSON.stringify(updated));
          return updated;
        });
        return;
      }

      setTimeout(() => { loadConferencia(); refreshTarefas(); }, 800);
    } catch (err: any) {
      result.showError(err, { context: "recebimento-confirmar" });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExecucao = (item: ConferenciaItem) => {
    if (item.tarefa_status === "CONCLUIDA") {
      result.showWarning("Não é possível remover", {
        details: "A conferência deste item já foi concluída.",
      });
      return;
    }
    setCancelConfirm(item);
  };

  const confirmCancelExecucao = async () => {
    if (!cancelConfirm || !tenantId) return;
    setDeleting(cancelConfirm.tarefa_execucao_id);
    try {
      const offlineResult = await executeOffline("fn_limpar_conferencia_entrada", {
        p_tarefa_execucao_id: cancelConfirm.tarefa_execucao_id,
        p_tarefa_id: cancelConfirm.tarefa_id,
        p_quantidade: cancelConfirm.quantidade_executada,
        p_tenant_id: tenantId,
      });
      if (!offlineResult.success) throw offlineResult.data;

      const cancelled = cancelConfirm;
      setCancelConfirm(null);

      if (offlineResult.offline) {
        toast.info("Ação salva. Será enviada quando a conexão retornar.");
        setItems((prev) => prev.filter((it) => it.tarefa_execucao_id !== cancelled.tarefa_execucao_id));
        setTarefas((prev) => {
          const updated = prev.map((t) =>
            t.id === cancelled.tarefa_id
              ? { ...t, conferido: Math.max(0, (t.conferido || 0) - cancelled.quantidade_executada) }
              : t
          );
          sessionStorage.setItem("coletor_recebimento_tarefas", JSON.stringify(updated));
          return updated;
        });
        return;
      }

      toast.info("Conferência cancelada.");
      loadConferencia();
      refreshTarefas();
    } catch (err: any) {
      result.showError(err, { context: "recebimento-cancelar" });
    } finally {
      setDeleting(null);
    }
  };

  const generateDateOptions = (type: "validade" | "fabricacao") => {
    const months: string[] = [];
    const now = new Date();
    const start = type === "fabricacao" ? -24 : 0;
    const end = type === "fabricacao" ? 1 : 60;
    for (let i = start; i < end; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push(d.toISOString().split("T")[0]);
    }
    return months;
  };

  return (
    <ColetorLayout title="Conferência" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/iniciar">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />
      <ResultDialog {...result.dialogProps} />

      {/* HU opcional */}
      <HUActiveBar onHUChange={() => {}} movimentoEntradaId={movimentoId || null} />

      {/* Scanner */}
      <ScanField label="Escanear EAN do produto" lastScanned={lastScanned} onScan={handleScan} />

      {/* Current product info */}
      {currentProduct && (
        <div className="relative">
          <InfoCard
            sku={currentProduct.sku}
            descricao={currentProduct.descricao}
            lastro={currentProduct.lastro ?? undefined}
            camada={currentProduct.camada ?? undefined}
            fatorCaixa={currentProduct.fator}
          >
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(213,31%,55%)]">
              <span>Ref: <b className="text-[hsl(213,31%,80%)]">{currentProduct.referencia}</b></span>
              <span>EAN: <b className="text-[hsl(213,31%,80%)]">{currentProduct.ean}</b></span>
              <span>Controle: <b className="text-[hsl(213,31%,80%)]">{currentProduct.tipo_controle}</b></span>
            </div>
          </InfoCard>
          <button
            onClick={() => {
              solicitar({
                tipoEtiqueta: "PRODUTO",
                dados: {
                  sku: currentProduct.sku,
                  descricao: currentProduct.descricao,
                  ean: currentProduct.ean || "",
                  referencia: currentProduct.referencia || "",
                },
                origem: "CONFERENCIA_ENTRADA",
                documentoOrigemId: movimentoId || undefined,
                tipoDocumentoOrigem: "movimento_entrada",
                prioridade: 3,
              });
            }}
            className="absolute top-2 right-2 w-9 h-9 rounded-lg bg-[hsl(217,91%,50%)]/10 border border-[hsl(217,91%,50%)]/30 flex items-center justify-center"
            title="Imprimir etiqueta"
          >
            <Printer size={16} className="text-[hsl(217,91%,60%)]" />
          </button>
        </div>
      )}

      {/* Quantity input */}
      {currentProduct && !showLoteModal && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-semibold text-[hsl(213,31%,65%)] mb-1 uppercase">Quantidade</label>
            <input
              type="number"
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              placeholder="0"
              className="w-full h-16 px-4 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-3xl font-bold text-white text-center outline-none focus:border-[hsl(217,91%,50%)] transition-colors"
              autoFocus
            />
          </div>
          <ActionButton onClick={handleConfirmQty} disabled={!quantidade || Number(quantidade) <= 0} loading={saving} variant="success">
            CONFIRMAR
          </ActionButton>
        </div>
      )}

      {/* Lista: Itens Conferidos (conferência cega) */}
      {!currentProduct && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex flex-col gap-1 flex-1 min-h-0">
            <span className="text-sm font-semibold text-[hsl(213,31%,55%)] uppercase shrink-0">Itens conferidos</span>
            {loading ? (
              <div className="flex justify-center py-4"><Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
            ) : items.length === 0 ? (
              <p className="text-sm text-[hsl(213,31%,45%)] text-center py-4">Nenhum item conferido ainda</p>
            ) : (
              <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
                {items.map((item) => (
                  <div key={item.tarefa_execucao_id} className="p-2 rounded-lg bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,20%)] flex items-center gap-2 shrink-0">
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-baseline gap-2">
                        <span className="font-mono text-sm font-bold text-white flex items-center gap-1">
                          {item.sku}
                          {item.status === "DIVERGENTE" && (
                            <span title="Item divergente">
                              <AlertTriangle size={14} className="text-[#F59E0B]" />
                            </span>
                          )}
                        </span>
                        <span className="text-sm font-bold text-[#22C55E]">{item.quantidade_executada}</span>
                      </div>
                      <p className="text-xs text-[hsl(213,31%,55%)] truncate">{item.descricao}</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        {item.operador && <span className="text-[10px] text-[hsl(213,31%,45%)]">Op: {item.operador}</span>}
                        {item.codigo_hu && <span className="text-[10px] text-[hsl(213,31%,45%)]">HU: {item.codigo_hu}</span>}
                        {item.lote && <span className="text-[10px] text-[hsl(213,31%,45%)]">Lote: {item.lote}</span>}
                        {item.concluido_em && <span className="text-[10px] text-[hsl(213,31%,45%)]">{formatDateTimeShort(item.concluido_em)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteExecucao(item)}
                      disabled={deleting === item.tarefa_execucao_id}
                      className="shrink-0 w-9 h-9 rounded-lg bg-[#E02424]/15 flex items-center justify-center text-[#E02424] active:bg-[#E02424]/30 disabled:opacity-40"
                    >
                      {deleting === item.tarefa_execucao_id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer action */}
      {!currentProduct && items.length > 0 && (
        <div className="shrink-0 pt-1">
          <ActionButton onClick={() => onNavigate("/coletor/recebimento/conferencia")} variant="primary">
            VER RESUMO / FINALIZAR
          </ActionButton>
        </div>
      )}

      {/* Cancel Confirm Dialog */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col items-center gap-3">
              <AlertTriangle size={48} className="text-[hsl(45,93%,47%)]" />
              <h3 className="text-base font-bold text-white text-center">Cancelar Conferência</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">
                Deseja cancelar a conferência de <b>{cancelConfirm.sku}</b> ({cancelConfirm.quantidade_executada} un.)?
              </p>
            </div>
            <ActionButton
              onClick={confirmCancelExecucao}
              loading={!!deleting}
              variant="primary"
            >
              CONFIRMAR CANCELAMENTO
            </ActionButton>
            <ActionButton onClick={() => setCancelConfirm(null)} variant="secondary">
              VOLTAR
            </ActionButton>
          </div>
        </div>
      )}

      {/* Lote/Validade Modal */}
      {showLoteModal && currentProduct && (() => {
        const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
        let dateError = "";
        if (fabricacao && validade) {
          if (validade < fabricacao) dateError = "Validade não pode ser anterior à fabricação.";
          else if (validade < hoje) dateError = "Produto vencido — validade anterior à data atual.";
        }
        const needsDates = currentProduct.tipo_controle === "VALIDADE" || currentProduct.tipo_controle === "LOTE" || currentProduct.tipo_controle === "LOTE_SERIE";
        const needsLote = currentProduct.tipo_controle === "LOTE" || currentProduct.tipo_controle === "LOTE_SERIE";
        return (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-3 animate-in slide-in-from-bottom duration-200">
            <h3 className="text-lg font-bold text-white">
              {currentProduct.tipo_controle === "VALIDADE" ? "Informações de Validade" : "Informações do Lote"}
            </h3>

            <div className="rounded-lg bg-[hsl(222,40%,14%)] p-2 text-center">
              <span className="text-xs text-[hsl(213,31%,55%)] uppercase">Quantidade</span>
              <p className="text-2xl font-bold text-white">{quantidade}</p>
            </div>

            {needsLote && (
              <div>
                <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Lote *</label>
                <input value={lote} onChange={(e) => setLote(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-lg text-white outline-none focus:border-[hsl(217,91%,50%)]" autoFocus />
              </div>
            )}

            {needsDates && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Fabricação *</label>
                  <input
                    type="date"
                    value={fabricacao}
                    onChange={(e) => setFabricacao(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Validade *</label>
                  <input
                    type="date"
                    value={validade}
                    onChange={(e) => setValidade(e.target.value)}
                    className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]"
                  />
                </div>
                {dateError && (
                  <div className="rounded-lg bg-[#E02424]/15 border border-[#E02424]/40 px-3 py-2 flex items-start gap-2">
                    <AlertTriangle size={16} className="text-[#E02424] shrink-0 mt-0.5" />
                    <span className="text-xs text-[#E02424] font-semibold">{dateError}</span>
                  </div>
                )}
              </>
            )}

            <ActionButton
              onClick={doConfirm}
              loading={saving}
              variant="success"
              disabled={
                (needsLote && !lote) ||
                (needsDates && (!fabricacao || !validade)) ||
                !!dateError
              }
            >
              CONFIRMAR
            </ActionButton>
            <ActionButton onClick={() => setShowLoteModal(false)} variant="secondary">CANCELAR</ActionButton>
          </div>
        </div>
        );
      })()}
    </ColetorLayout>
  );
}