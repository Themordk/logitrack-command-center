import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { InfoCard } from "@/components/coletor/InfoCard";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { toast } from "sonner";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";
import { formatDateTimeShort } from "@/utils/dateTime";

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
  const movimentoId = sessionStorage.getItem("coletor_movimento_id") || "";
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
  const [lastScanned, setLastScanned] = useState("");
  const [currentProduct, setCurrentProduct] = useState<ProdutoInfo | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState<ConferenciaItem | null>(null);

  // Lote/validade modal
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [lote, setLote] = useState("");
  const [fabricacao, setFabricacao] = useState("");
  const [validade, setValidade] = useState("");

  const refreshTarefas = useCallback(async () => {
    if (!movimentoId || !tenantId || !empresaId || !usuarioId) return;
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
  }, [movimentoId, tenantId, empresaId, usuarioId]);

  const loadConferencia = useCallback(async () => {
    if (!movimentoId) return;
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
      toast.error("Erro ao carregar itens.");
    } finally {
      setLoading(false);
    }
  }, [movimentoId]);

  useEffect(() => {
    if (movimentoId) {
      loadConferencia();
      refreshTarefas();
    }
  }, [movimentoId, loadConferencia, refreshTarefas]);

  const handleScan = async (code: string) => {
    setLastScanned(code);
    setCurrentProduct(null);
    setQuantidade("");

    if (!movimentoId || !tenantId) {
      showOverlayMsg("error", "Movimento não identificado");
      return;
    }

    try {
      const { data, error } = await (supabase as any).rpc("fn_conferencia_buscar_produto_por_barcode", {
        p_tenant_id: tenantId,
        p_movimento_entrada_id: movimentoId,
        p_codigo_barras: code,
      });

      if (error) throw error;

      const result = typeof data === "string" ? JSON.parse(data) : data;

      if (!result?.success) {
        showOverlayMsg("error", result?.message || "Produto não encontrado");
        return;
      }

      const prod = result.data;

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
    } catch (err: any) {
      console.error(err);
      showOverlayMsg("error", "Erro ao buscar produto");
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
    setSaving(true);

    try {
      const fator = currentProduct.fator || 1;
      const qtdFinal = Number(quantidade) * fator;

      const huId = sessionStorage.getItem("coletor_hu_id") || null;

      const { error } = await (supabase as any).rpc("finalizar_conferencia_entrada_item", {
        p_tarefa_id: currentProduct.tarefa_id,
        p_usuario: usuarioId,
        p_quantidade: qtdFinal,
        p_lote: lote || "",
        p_validade: validade || "1900-01-01",
        p_fabricacao: fabricacao || "1900-01-01",
        p_hu: huId,
      });

      if (error) throw error;

      showOverlayMsg("success", `✔ ${quantidade} un. confirmadas`);

      setCurrentProduct(null);
      setQuantidade("");
      setLote("");
      setFabricacao("");
      setValidade("");
      setShowLoteModal(false);

      setTimeout(() => { loadConferencia(); refreshTarefas(); }, 800);
    } catch (err: any) {
      toast.error(err.message || "Erro ao confirmar.");
      showOverlayMsg("error", "Erro ao confirmar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExecucao = (item: ConferenciaItem) => {
    if (item.tarefa_status === "CONCLUIDA") {
      toast.error("Não é possível remover. A conferência deste item já foi concluída.");
      return;
    }
    setCancelConfirm(item);
  };

  const confirmCancelExecucao = async () => {
    if (!cancelConfirm || !tenantId) return;
    setDeleting(cancelConfirm.tarefa_execucao_id);
    try {
      const { error } = await (supabase as any).rpc("fn_limpar_conferencia_entrada", {
        p_tarefa_execucao_id: cancelConfirm.tarefa_execucao_id,
        p_tarefa_id: cancelConfirm.tarefa_id,
        p_quantidade: cancelConfirm.quantidade_executada,
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      toast.success("Conferência cancelada.");
      setCancelConfirm(null);
      loadConferencia();
      refreshTarefas();
    } catch (err: any) {
      toast.error(err.message || "Erro ao cancelar.");
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

      {/* Scanner */}
      <ScanField label="Escanear EAN do produto" lastScanned={lastScanned} onScan={handleScan} />

      {/* Current product info */}
      {currentProduct && (
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
      {showLoteModal && currentProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-3 animate-in slide-in-from-bottom duration-200">
            <h3 className="text-lg font-bold text-white">
              {currentProduct.tipo_controle === "VALIDADE" ? "Informações de Validade" : "Informações do Lote"}
            </h3>

            <div className="rounded-lg bg-[hsl(222,40%,14%)] p-2 text-center">
              <span className="text-xs text-[hsl(213,31%,55%)] uppercase">Quantidade</span>
              <p className="text-2xl font-bold text-white">{quantidade}</p>
            </div>

            {(currentProduct.tipo_controle === "LOTE" || currentProduct.tipo_controle === "LOTE_SERIE") && (
              <div>
                <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Lote *</label>
                <input value={lote} onChange={(e) => setLote(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-lg text-white outline-none focus:border-[hsl(217,91%,50%)]" autoFocus />
              </div>
            )}

            {(currentProduct.tipo_controle === "VALIDADE" || currentProduct.tipo_controle === "LOTE" || currentProduct.tipo_controle === "LOTE_SERIE") && (
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
              </>
            )}

            <ActionButton
              onClick={doConfirm}
              loading={saving}
              variant="success"
              disabled={
                ((currentProduct.tipo_controle === "LOTE" || currentProduct.tipo_controle === "LOTE_SERIE") && !lote) ||
                ((currentProduct.tipo_controle === "VALIDADE" || currentProduct.tipo_controle === "LOTE" || currentProduct.tipo_controle === "LOTE_SERIE") && (!fabricacao || !validade))
              }
            >
              CONFIRMAR
            </ActionButton>
            <ActionButton onClick={() => setShowLoteModal(false)} variant="secondary">CANCELAR</ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}