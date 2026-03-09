import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { InfoCard } from "@/components/coletor/InfoCard";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { toast } from "sonner";
import { nowBrasilia } from "@/lib/dateUtils";
import { Loader2, Trash2 } from "lucide-react";

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

export function RecebimentoExecucaoPage({ onNavigate }: Props) {
  const movimentoId = sessionStorage.getItem("coletor_movimento_id") || "";
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const [items, setItems] = useState<ConferenciaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastScanned, setLastScanned] = useState("");
  const [currentProduct, setCurrentProduct] = useState<ProdutoInfo | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Lote/validade modal
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [lote, setLote] = useState("");
  const [fabricacao, setFabricacao] = useState("");
  const [validade, setValidade] = useState("");

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
    if (movimentoId) loadConferencia();
  }, [movimentoId, loadConferencia]);

  const handleScan = async (code: string) => {
    setLastScanned(code);
    setCurrentProduct(null);
    setQuantidade("");

    if (!movimentoId || !tenantId) {
      showOverlayMsg("error", "Movimento não identificado");
      return;
    }

    try {
      // Step 1: Find produto_embalagem by EAN
      const { data: embData, error: embErr } = await (supabase as any)
        .from("produto_embalagem")
        .select("produto_id, ean, fator")
        .eq("ean", code)
        .limit(1);

      if (embErr) throw embErr;
      if (!embData || embData.length === 0) {
        showOverlayMsg("error", "EAN não encontrado");
        return;
      }

      const embalagem = embData[0];

      // Step 2: Get movimento_entrada_item ids for this movement
      const { data: meiData } = await (supabase as any)
        .from("movimento_entrada_item")
        .select("id")
        .eq("movimento_entrada_id", movimentoId)
        .eq("produto_id", embalagem.produto_id);

      if (!meiData || meiData.length === 0) {
        showOverlayMsg("error", "Produto não pertence a este recebimento");
        return;
      }

      // Step 3: Find tarefa for this item (via id_documento_origem = mei.id)
      const { data: tarefaData } = await (supabase as any)
        .from("tarefa")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("tipo_documento_origem", "MOVIMENTO_ENTRADA")
        .in("id_documento_origem", meiData.map((m: any) => m.id))
        .limit(1);

      if (!tarefaData || tarefaData.length === 0) {
        showOverlayMsg("error", "Tarefa não encontrada para este produto");
        return;
      }

      // Step 4: Get produto details
      const { data: prodData, error: prodErr } = await (supabase as any)
        .from("produto")
        .select("id, sku, descricao, referencia, lastro, camada, tipo_controle, peso_variavel")
        .eq("id", embalagem.produto_id)
        .single();

      if (prodErr) throw prodErr;

      setCurrentProduct({
        ean: embalagem.ean,
        fator: embalagem.fator,
        descricao: prodData.descricao,
        sku: prodData.sku,
        referencia: prodData.referencia,
        lastro: prodData.lastro,
        camada: prodData.camada,
        tipo_controle: prodData.tipo_controle,
        produto_id: prodData.id,
        tarefa_id: tarefaData[0].id,
        peso_variavel: prodData.peso_variavel,
      });
      showOverlayMsg("success", `Produto: ${prodData.sku}`);
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
      // UNIDADE, METROS - confirm directly
      doConfirm();
    }
  };

  const doConfirm = async () => {
    if (!currentProduct || !quantidade) return;
    if (!movimentoId || !tenantId || !usuarioId) return;
    setSaving(true);

    try {
      const now = nowBrasilia();

      // Insert tarefa_execucao with status CONCLUIDA
      const insertPayload: any = {
        tenant_id: tenantId,
        tarefa_id: currentProduct.tarefa_id,
        usuario_id: usuarioId,
        status: "CONCLUIDA",
        atribuido_em: now,
        iniciado_em: now,
        concluido_em: now,
        quantidade_executada: Number(quantidade),
      };
      if (lote) insertPayload.lote = lote;
      if (validade) insertPayload.validade = validade;
      if (fabricacao) insertPayload.fabricacao = fabricacao;

      const { data: execData, error: execErr } = await (supabase as any)
        .from("tarefa_execucao")
        .insert(insertPayload)
        .select("id")
        .single();

      if (execErr) throw execErr;

      // Log event in tarefa_evento_execucao
      await (supabase as any).from("tarefa_evento_execucao").insert({
        tenant_id: tenantId,
        execucao_tarefa_id: execData.id,
        tipo_evento: "CONFERENCIA",
        carga_util: {
          produto_id: currentProduct.produto_id,
          sku: currentProduct.sku,
          quantidade: Number(quantidade),
          lote,
          validade,
          fabricacao,
        },
      });

      showOverlayMsg("success", `✔ ${quantidade} un. confirmadas`);

      // Reset
      setCurrentProduct(null);
      setQuantidade("");
      setLote("");
      setFabricacao("");
      setValidade("");
      setShowLoteModal(false);

      setTimeout(loadConferencia, 800);
    } catch (err: any) {
      toast.error(err.message || "Erro ao confirmar.");
      showOverlayMsg("error", "Erro ao confirmar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExecucao = async (execId: string) => {
    if (!tenantId) return;
    setDeleting(execId);
    try {
      const { error } = await (supabase as any)
        .from("tarefa_execucao")
        .delete()
        .eq("id", execId)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      toast.success("Conferência removida.");
      loadConferencia();
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir.");
    } finally {
      setDeleting(null);
    }
  };

  // Date scroll helper - generate month options
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

      {/* Items list */}
      {!currentProduct && (
        <div className="space-y-1">
          <span className="text-sm font-semibold text-[hsl(213,31%,55%)] uppercase">Itens conferidos</span>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-[hsl(213,31%,45%)] text-center py-4">Nenhum item conferido ainda</p>
          ) : (
            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="p-2 rounded-lg bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,20%)] flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <span className="font-mono text-sm font-bold text-white">{item.sku}</span>
                      <span className="text-sm font-bold text-[#22C55E]">{item.quantidade_executada}</span>
                    </div>
                    <p className="text-xs text-[hsl(213,31%,55%)] truncate">{item.descricao}</p>
                    {item.lote && <span className="text-[10px] text-[hsl(213,31%,45%)]">Lote: {item.lote}</span>}
                  </div>
                  <button
                    onClick={() => handleDeleteExecucao(item.id)}
                    disabled={deleting === item.id}
                    className="shrink-0 w-9 h-9 rounded-lg bg-[#E02424]/15 flex items-center justify-center text-[#E02424] active:bg-[#E02424]/30 disabled:opacity-40"
                  >
                    {deleting === item.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer action */}
      {!currentProduct && items.length > 0 && (
        <ActionButton onClick={() => onNavigate("/coletor/recebimento/conferencia")} variant="primary">
          VER RESUMO / FINALIZAR
        </ActionButton>
      )}

      {/* Lote/Validade Modal */}
      {showLoteModal && currentProduct && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-3 animate-in slide-in-from-bottom duration-200">
            <h3 className="text-lg font-bold text-white">
              {currentProduct.tipo_controle === "VALIDADE" ? "Informações de Validade" : "Informações do Lote"}
            </h3>

            {/* Quantidade display */}
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
