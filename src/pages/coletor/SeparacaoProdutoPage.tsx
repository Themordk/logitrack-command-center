import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { Package, AlertTriangle, CheckCircle, XCircle, BoxIcon } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface EmbalagemInfo {
  ean: string;
  fator: number;
  embalagem: string;
}

export function SeparacaoProdutoPage({ onNavigate }: Props) {
  const [tarefa, setTarefa] = useState<any>(null);
  const [eanScanned, setEanScanned] = useState("");
  const [embalagemInfo, setEmbalagemInfo] = useState<EmbalagemInfo | null>(null);
  const [eanConfirmado, setEanConfirmado] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [qtdSeparada, setQtdSeparada] = useState(0);
  const [resultDialog, setResultDialog] = useState<{ sucesso: boolean; mensagem: string } | null>(null);
  const [showEanErroDialog, setShowEanErroDialog] = useState(false);
  const [eanPendente, setEanPendente] = useState("");

  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_separacao_tarefa_atual");
    if (raw) {
      const t = JSON.parse(raw);
      setTarefa(t);
      setQtdSeparada(Number(t.separado || 0));
    }
  }, []);

  const handleScanEan = async (code: string) => {
    if (!tarefa) return;
    setEanScanned(code);
    setEmbalagemInfo(null);
    setEanConfirmado(false);

    try {
      const { data, error } = await (supabase as any)
        .from("produto_embalagem")
        .select("fator, produto_id, embalagem, ean")
        .eq("ean", code)
        .limit(1);
      if (error) throw error;

      if (!data || data.length === 0) {
        toast.error("EAN não encontrado.");
        return;
      }

      const emb = data[0];

      if (emb.produto_id !== tarefa.produto_id) {
        // EAN belongs to different product - show confirmation dialog
        setEanPendente(code);
        setShowEanErroDialog(true);
        return;
      }

      setEmbalagemInfo({ ean: emb.ean, fator: emb.fator, embalagem: emb.embalagem });
      setEanConfirmado(true);
      toast.success(`EAN confirmado! Fator: ${emb.fator}`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleConfirmarEanErro = () => {
    // User says "yes this is the correct product" even though EAN doesn't match
    setShowEanErroDialog(false);
    setEanConfirmado(true);
    toast.info("Produto confirmado manualmente.");
  };

  const handleCancelarEanErro = () => {
    setShowEanErroDialog(false);
    setEanPendente("");
    setEanScanned("");
  };

  const handleConfirmar = async () => {
    if (!tarefa || !quantidade || !usuarioId) return;
    const qtd = Number(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    setConfirming(true);
    try {
      const { data, error } = await supabase.rpc("separacao_executar_coleta" as any, {
        p_tarefa_id: tarefa.tarefa_id,
        p_quantidade: qtd,
        p_usuario: usuarioId,
      });
      if (error) throw error;

      // Check if result is error
      let result: any = data;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { /* keep */ }
      }

      if (result && typeof result === "object" && !Array.isArray(result) && result.sucesso === false) {
        setResultDialog({ sucesso: false, mensagem: result.mensagem || "Erro ao registrar coleta" });
        return;
      }

      const newQtdSeparada = qtdSeparada + qtd;
      setQtdSeparada(newQtdSeparada);
      setQuantidade("");

      if (newQtdSeparada >= Number(tarefa.quantidade_requerida)) {
        setResultDialog({ sucesso: true, mensagem: "Quantidade completa! Avançando para próxima tarefa." });
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
    if (wasSuccess) {
      advanceToNext();
    }
  };

  const advanceToNext = () => {
    const tarefas = JSON.parse(sessionStorage.getItem("coletor_separacao_tarefas") || "[]");
    const idx = Number(sessionStorage.getItem("coletor_separacao_tarefa_idx") || "0");
    const nextIdx = idx + 1;

    if (nextIdx >= tarefas.length) {
      toast.success("Separação concluída para esta onda!");
      onNavigate("/coletor/separacao/iniciar");
      return;
    }

    sessionStorage.setItem("coletor_separacao_tarefa_idx", String(nextIdx));
    onNavigate("/coletor/separacao/endereco");
  };

  if (!tarefa) return null;

  const restante = Number(tarefa.quantidade_requerida) - qtdSeparada;
  const temLote = tarefa.tipo_controle === "LOTE" || tarefa.tipo_controle === "VALIDADE";

  return (
    <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/endereco">
      <div className="flex flex-col gap-3 flex-1">
        {/* Product info */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Package size={18} className="text-[hsl(217,91%,60%)]" />
            <span className="text-sm font-bold text-white">Produto</span>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">SKU: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.sku || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Referência: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.referencia || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Descrição: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.produto || "—"}</span></div>
          {tarefa.fator_caixa && <div className="text-xs text-[hsl(213,31%,55%)]">Fator Caixa: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.fator_caixa}</span></div>}

          {temLote && (
            <>
              <div className="text-xs text-[hsl(213,31%,55%)]">Lote: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.lote || "—"}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Validade: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.validade ? new Date(tarefa.validade).toLocaleDateString("pt-BR") : "—"}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Fabricação: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.fabricacao ? new Date(tarefa.fabricacao).toLocaleDateString("pt-BR") : "—"}</span></div>
            </>
          )}
        </div>

        {/* Quantities */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[hsl(222,40%,12%)] rounded-xl border border-[hsl(222,35%,22%)] p-3 text-center">
            <p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Requerida</p>
            <p className="text-lg font-bold text-white">{tarefa.quantidade_requerida}</p>
          </div>
          <div className="bg-[hsl(222,40%,12%)] rounded-xl border border-[hsl(222,35%,22%)] p-3 text-center">
            <p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Separada</p>
            <p className="text-lg font-bold text-[hsl(142,71%,45%)]">{qtdSeparada}</p>
          </div>
          <div className="bg-[hsl(222,40%,12%)] rounded-xl border border-[hsl(222,35%,22%)] p-3 text-center">
            <p className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Restante</p>
            <p className="text-lg font-bold text-[hsl(0,84%,60%)]">{restante > 0 ? restante : 0}</p>
          </div>
        </div>

        {/* EAN Scan */}
        <ScanField
          label="Escanear EAN do Produto"
          lastScanned={eanScanned}
          onScan={handleScanEan}
          placeholder="Escaneie o código de barras"
        />

        {/* Embalagem info stat */}
        {embalagemInfo && (
          <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <BoxIcon size={18} className="text-[hsl(217,91%,60%)]" />
              <span className="text-sm font-bold text-white">Embalagem</span>
            </div>
            <div className="text-xs text-[hsl(213,31%,55%)]">EAN: <span className="font-bold text-[hsl(213,31%,91%)]">{embalagemInfo.ean}</span></div>
            <div className="text-xs text-[hsl(213,31%,55%)]">Fator: <span className="font-bold text-[hsl(217,91%,60%)]">{embalagemInfo.fator}</span></div>
            <div className="text-xs text-[hsl(213,31%,55%)]">Embalagem: <span className="font-bold text-[hsl(213,31%,91%)]">{embalagemInfo.embalagem}</span></div>
          </div>
        )}

        {/* Quantity input */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4">
          <label className="text-xs text-[hsl(213,31%,55%)] block mb-2">Quantidade Coletada</label>
          <input
            type="number"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="0"
            className="w-full h-12 rounded-xl bg-[hsl(222,35%,8%)] border border-[hsl(222,35%,22%)] text-center text-xl font-bold text-white outline-none focus:border-[hsl(217,91%,50%)]"
          />
        </div>

        {/* Actions */}
        <ActionButton
          onClick={handleConfirmar}
          disabled={!quantidade || confirming || !eanConfirmado}
          loading={confirming}
          variant="success"
        >
          Confirmar Quantidade
        </ActionButton>

        <ActionButton onClick={() => onNavigate("/coletor/separacao/ocorrencias")} variant="warning">
          <AlertTriangle size={18} /> Ocorrências
        </ActionButton>
      </div>

      {/* EAN Erro Dialog - produto diferente */}
      {showEanErroDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-6 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <AlertTriangle size={48} className="text-[#F59E0B]" />
              <h3 className="text-base font-bold text-white text-center">EAN de outro produto</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">
                O EAN escaneado não pertence ao produto esperado. Este é o produto correto?
              </p>
            </div>
            <div className="flex gap-2">
              <ActionButton onClick={handleCancelarEanErro} variant="secondary">
                Não
              </ActionButton>
              <ActionButton onClick={handleConfirmarEanErro} variant="success">
                Sim, é o correto
              </ActionButton>
            </div>
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
