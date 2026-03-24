import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { Package, BoxIcon, CheckCircle, XCircle } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface EmbalagemInfo {
  ean: string;
  fator: number;
  embalagem: string;
}

export function InventarioProdutoPage({ onNavigate }: Props) {
  const [tarefa, setTarefa] = useState<any>(null);
  const [eanScanned, setEanScanned] = useState("");
  const [embalagemInfo, setEmbalagemInfo] = useState<EmbalagemInfo | null>(null);
  const [eanConfirmado, setEanConfirmado] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [resultDialog, setResultDialog] = useState<{ sucesso: boolean; mensagem: string } | null>(null);
  const [showEanErroDialog, setShowEanErroDialog] = useState(false);

  const numero = sessionStorage.getItem("coletor_inventario_numero") || "";
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_inventario_tarefa_atual");
    if (raw) {
      setTarefa(JSON.parse(raw));
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
        setShowEanErroDialog(true);
        return;
      }

      const emb = data[0];
      // Validate product matches
      const currentProdutoId = tarefa.produto_id;
      if (currentProdutoId && emb.produto_id !== currentProdutoId) {
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

  const handleConfirmar = async () => {
    if (!tarefa || !quantidade || !usuarioId) return;
    const qtd = Number(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    const fator = embalagemInfo?.fator || 1;
    const qtdFinal = qtd * fator;

    setConfirming(true);
    try {
      const { data, error } = await supabase.rpc("fn_inventario_finalizar_conferencia_endereco" as any, {
        p_tarefa_id: tarefa.tarefa_id || tarefa.id,
        p_usuario: usuarioId,
        p_quantidade: qtdFinal,
        p_lote: tarefa.lote || "",
        p_validade: tarefa.validade || "1900-01-01",
        p_fabricacao: tarefa.fabricacao || "1900-01-01",
        p_hu: tarefa.hu_id || tarefa.id_hu || null,
        p_endereco_origem_id: tarefa.endereco_id || tarefa.id_local_origem || null,
      });
      if (error) throw error;

      let result: any = data;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { /* keep */ }
      }

      if (result && typeof result === "object" && !Array.isArray(result) && result.sucesso === false) {
        setResultDialog({ sucesso: false, mensagem: result.mensagem || "Erro ao registrar contagem" });
        return;
      }

      setResultDialog({ sucesso: true, mensagem: "Contagem registrada com sucesso!" });
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
      // Advance to next task
      const tarefas = JSON.parse(sessionStorage.getItem("coletor_inventario_tarefas") || "[]");
      const idx = Number(sessionStorage.getItem("coletor_inventario_tarefa_idx") || "0");
      const nextIdx = idx + 1;

      if (nextIdx >= tarefas.length) {
        toast.success("Todas as contagens foram concluídas!");
        onNavigate("/coletor/inventario");
        return;
      }

      sessionStorage.setItem("coletor_inventario_tarefa_idx", String(nextIdx));
      onNavigate("/coletor/inventario/endereco");
    }
  };

  if (!tarefa) return null;

  return (
    <ColetorLayout title={`Inventário #${numero}`} onNavigate={onNavigate} showBack backPath="/coletor/inventario/endereco">
      <div className="flex flex-col gap-3 flex-1">
        {/* Product info */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Package size={18} className="text-[hsl(217,91%,60%)]" />
            <span className="text-sm font-bold text-white">Produto</span>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">SKU: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.sku || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Referência: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.referencia || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Descrição: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.descricao || tarefa.produto || "—"}</span></div>
        </div>

        {/* EAN Scan */}
        <ScanField
          label="Escanear EAN do Produto"
          lastScanned={eanScanned}
          onScan={handleScanEan}
          placeholder="Escaneie o código de barras"
        />

        {/* Embalagem info */}
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
          <label className="text-xs text-[hsl(213,31%,55%)] block mb-2">Informar Quantidade</label>
          <input
            type="number"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            placeholder="0"
            className="w-full h-12 rounded-xl bg-[hsl(222,35%,8%)] border border-[hsl(222,35%,22%)] text-center text-xl font-bold text-white outline-none focus:border-[hsl(217,91%,50%)]"
          />
        </div>

        {/* Confirm */}
        <ActionButton
          onClick={handleConfirmar}
          disabled={!quantidade || confirming || !eanConfirmado}
          loading={confirming}
          variant="success"
        >
          Confirmar Contagem
        </ActionButton>
      </div>

      {/* EAN Error Dialog */}
      {showEanErroDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-6 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <XCircle size={48} className="text-[#E02424]" />
              <h3 className="text-base font-bold text-white text-center">EAN Inválido</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">
                O EAN escaneado não foi encontrado ou não pertence ao produto esperado.
              </p>
            </div>
            <ActionButton onClick={() => { setShowEanErroDialog(false); setEanScanned(""); }} variant="primary">
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
