import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { InfoCard } from "@/components/coletor/InfoCard";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface ConferenciaItem {
  sku: string;
  descricao: string;
  quantidade_executada: number;
  hu: string;
  lote: string;
  serie: string;
  fabricacao: string;
  validade: string;
  status: string;
}

interface ProdutoInfo {
  id: string;
  sku: string;
  descricao: string;
  tipo_controle: string;
  lastro: number | null;
  camada: number | null;
  fator_caixa: number | null;
}

export function RecebimentoExecucaoPage({ onNavigate }: Props) {
  const params = new URLSearchParams(window.location.search.replace(/.*\?/, ""));
  // Extract movimento_id from the path-based state
  const [movimentoId] = useState(() => {
    const stored = sessionStorage.getItem("coletor_movimento_id");
    return stored || "";
  });
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

  // Lote/serie modal
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [lote, setLote] = useState("");
  const [serie, setSerie] = useState("");
  const [fabricacao, setFabricacao] = useState("");
  const [validade, setValidade] = useState("");

  useEffect(() => {
    // Get movimentoId from navigation state
    const pathParts = window.location.pathname.split("movimento_id=");
    const searchParams = window.location.href.split("movimento_id=")[1];
    if (searchParams) sessionStorage.setItem("coletor_movimento_id", searchParams);
    loadConferencia();
  }, []);

  const loadConferencia = async () => {
    const mid = sessionStorage.getItem("coletor_movimento_id");
    if (!mid) return;
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("vw_movimento_entrada_conferencia_detalhe")
        .select("*")
        .eq("movimento_id", mid);
      if (error) throw error;
      setItems(data || []);
    } catch {
      toast.error("Erro ao carregar itens.");
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (code: string) => {
    setLastScanned(code);
    setCurrentProduct(null);
    setQuantidade("");

    try {
      // Look up product by SKU or EAN
      const { data: produto, error } = await (supabase as any)
        .from("produto")
        .select("id, sku, descricao, tipo_controle, lastro, camada, fator_caixa")
        .eq("tenant_id", tenantId)
        .or(`sku.eq.${code}`)
        .single();

      if (error || !produto) {
        // Try EAN in produto_embalagem
        const { data: emb } = await (supabase as any)
          .from("produto_embalagem")
          .select("produto_id, produto:produto_id(id, sku, descricao, tipo_controle, lastro, camada, fator_caixa)")
          .eq("tenant_id", tenantId)
          .eq("ean", code)
          .single();

        if (emb?.produto) {
          setCurrentProduct(emb.produto as ProdutoInfo);
          showOverlay("success", `Produto: ${(emb.produto as ProdutoInfo).sku}`);
        } else {
          showOverlay("error", "Produto não encontrado");
        }
        return;
      }

      setCurrentProduct(produto);
      showOverlay("success", `Produto: ${produto.sku}`);
    } catch {
      showOverlay("error", "Erro ao buscar produto");
    }
  };

  const showOverlay = (type: OverlayType, msg: string) => {
    setOverlay(type);
    setOverlayMsg(msg);
  };

  const handleConfirmQty = () => {
    if (!currentProduct) return;
    const ctrl = currentProduct.tipo_controle;
    if (ctrl === "LOTE" || ctrl === "LOTE_SERIE" || ctrl === "SERIE") {
      setShowLoteModal(true);
    } else {
      doConfirm();
    }
  };

  const doConfirm = async () => {
    if (!currentProduct || !quantidade) return;
    const mid = sessionStorage.getItem("coletor_movimento_id");
    if (!mid || !tenantId || !usuarioId) return;
    setSaving(true);

    try {
      // Find the tarefa_execucao for this movement/product
      const { data: tarefas } = await (supabase as any)
        .from("tarefa")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("id_documento_origem", mid)
        .eq("tipo_documento_origem", "MOVIMENTO_ENTRADA")
        .eq("produto_id", currentProduct.id)
        .limit(1);

      if (!tarefas || tarefas.length === 0) {
        toast.error("Tarefa não encontrada para este produto.");
        setSaving(false);
        return;
      }

      const tarefaId = tarefas[0].id;

      // Find or create tarefa_execucao
      const { data: execExisting } = await (supabase as any)
        .from("tarefa_execucao")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("tarefa_id", tarefaId)
        .eq("usuario_id", usuarioId)
        .eq("status", "ATRIBUIDA")
        .limit(1);

      let execId: string;
      if (execExisting && execExisting.length > 0) {
        execId = execExisting[0].id;
      } else {
        const { data: newExec, error: insertErr } = await (supabase as any)
          .from("tarefa_execucao")
          .insert({
            tenant_id: tenantId,
            tarefa_id: tarefaId,
            usuario_id: usuarioId,
            status: "ATRIBUIDA",
            atribuido_em: new Date().toISOString(),
          })
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        execId = newExec.id;
      }

      // Update tarefa_execucao with qty and lote data
      const updatePayload: any = {
        quantidade_executada: Number(quantidade),
        status: "CONCLUIDA",
        concluido_em: new Date().toISOString(),
        iniciado_em: new Date().toISOString(),
      };
      if (lote) updatePayload.lote = lote;
      if (serie) updatePayload.serie = serie;
      if (validade) updatePayload.validade = validade;
      if (fabricacao) updatePayload.fabricacao = fabricacao;

      const { error: updErr } = await (supabase as any)
        .from("tarefa_execucao")
        .update(updatePayload)
        .eq("id", execId);
      if (updErr) throw updErr;

      // Log event
      await (supabase as any).from("tarefa_evento_execucao").insert({
        tenant_id: tenantId,
        execucao_tarefa_id: execId,
        tipo_evento: "CONFERENCIA",
        carga_util: { produto_id: currentProduct.id, sku: currentProduct.sku, quantidade: Number(quantidade), lote, serie },
      });

      showOverlay("success", `✔ ${quantidade} un. confirmadas`);

      // Reset
      setCurrentProduct(null);
      setQuantidade("");
      setLote("");
      setSerie("");
      setFabricacao("");
      setValidade("");
      setShowLoteModal(false);

      // Reload items
      setTimeout(loadConferencia, 1000);
    } catch (err: any) {
      toast.error(err.message || "Erro ao confirmar.");
      showOverlay("error", "Erro ao confirmar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ColetorLayout title="Conferência" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/iniciar">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      {/* Scanner */}
      <ScanField label="Escanear produto" lastScanned={lastScanned} onScan={handleScan} />

      {/* Current product info */}
      {currentProduct && (
        <InfoCard
          sku={currentProduct.sku}
          descricao={currentProduct.descricao}
          lastro={currentProduct.lastro ?? undefined}
          camada={currentProduct.camada ?? undefined}
          fatorCaixa={currentProduct.fator_caixa ?? undefined}
        />
      )}

      {/* Quantity input */}
      {currentProduct && (
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
              {items.map((item, i) => (
                <div key={i} className="p-2 rounded-lg bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,20%)]">
                  <div className="flex justify-between items-baseline">
                    <span className="font-mono text-sm font-bold text-white">{item.sku}</span>
                    <span className="text-sm font-bold text-[#22C55E]">{item.quantidade_executada}</span>
                  </div>
                  <p className="text-xs text-[hsl(213,31%,55%)] truncate">{item.descricao}</p>
                  {item.lote && <span className="text-[10px] text-[hsl(213,31%,45%)]">Lote: {item.lote}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer action when no product selected */}
      {!currentProduct && items.length > 0 && (
        <ActionButton onClick={() => onNavigate(`/coletor/recebimento/conferencia`)} variant="primary">
          VER RESUMO / FINALIZAR
        </ActionButton>
      )}

      {/* Lote/Serie Modal */}
      {showLoteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-3 animate-in slide-in-from-bottom duration-200">
            <h3 className="text-lg font-bold text-white">Informações do Lote</h3>
            {(currentProduct?.tipo_controle === "LOTE" || currentProduct?.tipo_controle === "LOTE_SERIE") && (
              <div>
                <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Lote</label>
                <input value={lote} onChange={(e) => setLote(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-lg text-white outline-none focus:border-[hsl(217,91%,50%)]" />
              </div>
            )}
            {(currentProduct?.tipo_controle === "SERIE" || currentProduct?.tipo_controle === "LOTE_SERIE") && (
              <div>
                <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Série</label>
                <input value={serie} onChange={(e) => setSerie(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-lg text-white outline-none focus:border-[hsl(217,91%,50%)]" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Fabricação</label>
                <input type="date" value={fabricacao} onChange={(e) => setFabricacao(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Validade</label>
                <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-sm text-white outline-none focus:border-[hsl(217,91%,50%)]" />
              </div>
            </div>
            <ActionButton onClick={doConfirm} loading={saving} variant="success">CONFIRMAR COM LOTE</ActionButton>
            <ActionButton onClick={() => setShowLoteModal(false)} variant="secondary">CANCELAR</ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}
