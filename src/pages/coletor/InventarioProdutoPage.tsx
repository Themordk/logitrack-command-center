import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { Package, BoxIcon, XCircle } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";
import { RegistrarOcorrenciaColetorButton } from "@/components/ocorrencia/RegistrarOcorrenciaColetorButton";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { parseError } from "@/lib/errorMapper";


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
  const [showZeroConfirm, setShowZeroConfirm] = useState(false);
  const result = useResultDialog({ coletorMode: true });



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
    // LMS: mark task as started on first EAN scan
    markTarefaIniciadaByTarefa(tarefa.tarefa_id || tarefa.id, usuarioId);

    try {
      const { data, error } = await (supabase as any)
        .from("produto_embalagem")
        .select("fator, produto_id, embalagem, ean")
        .eq("ean", code)
        .limit(1);
      if (error) throw error;

      if (!data || data.length === 0) {
        result.showWarning("EAN não cadastrado no sistema.", {
          instruction: "Escaneie o EAN correto do produto.",
          onClose: () => setEanScanned(""),
        });
        return;
      }

      const emb = data[0];
      // Validate product matches
      const currentProdutoId = tarefa.produto_id;
      if (currentProdutoId && emb.produto_id !== currentProdutoId) {
        result.showWarning("Este EAN não pertence ao produto esperado.", {
          instruction: "Escaneie o EAN correto do produto.",
          onClose: () => setEanScanned(""),
        });
        return;
      }

      setEmbalagemInfo({ ean: emb.ean, fator: emb.fator, embalagem: emb.embalagem });
      setEanConfirmado(true);
      toast.success(`EAN confirmado! Fator: ${emb.fator}`);
    } catch (err: unknown) {
      const parsed = parseError(err, "inventario-ean");
      toast.error(parsed.title);
    }

  };

  const handleConfirmar = async () => {
    if (!tarefa || quantidade === "" || !usuarioId) return;
    const qtd = Number(quantidade);
    if (isNaN(qtd) || qtd < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    // Confirmação para contagem zero
    if (qtd === 0 && !showZeroConfirm) {
      setShowZeroConfirm(true);
      return;
    }
    setShowZeroConfirm(false);



    const fator = embalagemInfo?.fator || 1;
    const qtdFinal = qtd * fator;

    setConfirming(true);
    try {
      const contagem = Number(sessionStorage.getItem("coletor_inventario_contagem") || "1");

      const { data, error } = await supabase.rpc("fn_inventario_registrar_contagem" as any, {
        p_tenant_id: tenantId,
        p_tarefa_id: tarefa.tarefa_id || tarefa.id,
        p_usuario: usuarioId,
        p_contagem: contagem,
        p_quantidade: qtdFinal,
        p_endereco_origem_id: tarefa.endereco_id || tarefa.id_local_origem || null,
        p_lote: tarefa.lote || null,
        p_validade: tarefa.validade || null,
        p_fabricacao: tarefa.fabricacao || null,
        p_hu: tarefa.hu_id || tarefa.id_hu || null,
      });
      if (error) throw error;

      let rpcResult: any = data;
      if (typeof data === "string") {
        try { rpcResult = JSON.parse(data); } catch { /* keep */ }
      }

      if (rpcResult && typeof rpcResult === "object" && !Array.isArray(rpcResult) && rpcResult.sucesso === false) {
        result.showWarning(rpcResult.mensagem || "Erro ao registrar contagem");
        return;
      }

      result.showSuccess("Contagem registrada com sucesso!", { onClose: advanceToNext });
    } catch (err: unknown) {
      result.showError(err, { context: "inventario-contagem" });
    } finally {
      setConfirming(false);
    }
  };

  const advanceToNext = () => {
    const tarefas = JSON.parse(sessionStorage.getItem("coletor_inventario_tarefas") || "[]");
    const idx = Number(sessionStorage.getItem("coletor_inventario_tarefa_idx") || "0");
    const nextIdx = idx + 1;

    if (nextIdx >= tarefas.length) {
      toast.success("Todas as contagens foram concluídas!");
      onNavigate("/coletor/inventario");
      return;
    }

    const proxima = tarefas[nextIdx];
    sessionStorage.setItem("coletor_inventario_tarefa_idx", String(nextIdx));

    const enderecoAtual =
      tarefa?.endereco_id || tarefa?.id_local_origem || tarefa?.codigo_endereco;
    const enderecoProxima =
      proxima?.endereco_id || proxima?.id_local_origem || proxima?.codigo_endereco;

    if (enderecoAtual && enderecoProxima && enderecoAtual === enderecoProxima) {
      sessionStorage.setItem("coletor_inventario_tarefa_atual", JSON.stringify(proxima));
      setTarefa(proxima);
      setEanScanned("");
      setEmbalagemInfo(null);
      setEanConfirmado(false);
      setQuantidade("");
      toast.success("Próximo produto no mesmo endereço");
      return;
    }

    onNavigate("/coletor/inventario/endereco");
  };



  if (!tarefa) return null;

  return (
    <ColetorLayout title={`Inventário #${numero}`} onNavigate={onNavigate} showBack backPath="/coletor/inventario/endereco">
      {(() => {
        const contagem = Number(sessionStorage.getItem("coletor_inventario_contagem") || "1");
        if (contagem > 1) {
          return (
            <div className="mb-2 flex justify-center">
              <span className="text-[10px] px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 font-medium">
                {contagem}ª Contagem — Recontagem
              </span>
            </div>
          );
        }
        return null;
      })()}
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
        {(() => {
          const qtdNum = Number(quantidade);
          const podeConfirmar =
            quantidade !== "" &&
            !isNaN(qtdNum) &&
            (qtdNum === 0 || eanConfirmado);
          return (
            <ActionButton
              onClick={handleConfirmar}
              disabled={!podeConfirmar || confirming}
              loading={confirming}
              variant="success"
            >
              Confirmar Contagem
            </ActionButton>
          );
        })()}

        <RegistrarOcorrenciaColetorButton
          contexto={{
            etapa: "INVENTARIO",
            produto_id: tarefa?.produto_id,
            produto_descricao: tarefa?.descricao || tarefa?.produto,
            tarefa_id: tarefa?.id,
            endereco_id: tarefa?.endereco_id,
            endereco_descricao: tarefa?.endereco,
          }}
        />
      </div>

      {/* Zero Quantity Confirmation Dialog */}
      {showZeroConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col items-center gap-3">
              <XCircle size={48} className="text-amber-400" />
              <h3 className="text-base font-bold text-white text-center">Contagem Zero</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">
                Você está informando quantidade <strong>ZERO</strong> para este produto. Isso pode zerar o saldo no estoque. Confirma?
              </p>
            </div>
            <div className="flex gap-2">
              <ActionButton onClick={() => setShowZeroConfirm(false)} variant="secondary">
                Cancelar
              </ActionButton>
              <ActionButton onClick={handleConfirmar} variant="success">
                Sim, Confirmar Zero
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* EAN Error Dialog */}
      {showEanErroDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
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
              {resultDialog.sucesso ? "Continuar" : "Fechar"}
            </ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}
