import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { MapPin, Package, BoxIcon, CheckCircle, XCircle } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface EmbalagemInfo { ean: string; fator: number; embalagem: string }
interface ProdutoInfo { sku: string; descricao: string; tipo_controle: string }

const ERROR_MAP: Record<string, string> = {
  INVENTARIO_NAO_ENCONTRADO: "Inventário não encontrado.",
  INVENTARIO_NAO_GERAL: "Este inventário não é do tipo Geral.",
  INVENTARIO_STATUS_INVALIDO: "Inventário não está em contagem.",
  ENDERECO_NAO_ENCONTRADO: "Endereço não encontrado ou inativo.",
  ENDERECO_ARMAZEM_INVALIDO: "Endereço não pertence ao armazém deste inventário.",
  EAN_NAO_ENCONTRADO: "EAN não cadastrado ou inativo.",
  PRODUTO_EMPRESA_INVALIDO: "Produto não pertence à empresa deste inventário.",
  JA_CONTADO: "Este produto já foi contado neste endereço.",
  TIPO_TAREFA_NAO_CONFIGURADO: "Tipo de tarefa não configurado. Acesse Configurações > Inventário.",
};

export function InventarioLivreProdutoPage({ onNavigate }: Props) {
  const [eanScanned, setEanScanned] = useState("");
  const [embalagemInfo, setEmbalagemInfo] = useState<EmbalagemInfo | null>(null);
  const [produtoInfo, setProdutoInfo] = useState<ProdutoInfo | null>(null);
  const [eanConfirmado, setEanConfirmado] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [resultDialog, setResultDialog] = useState<{
    sucesso: boolean;
    mensagem: string;
    divergencia?: number;
    saldoSistema?: number;
    quantidadeContada?: number;
  } | null>(null);
  const [showEanErroDialog, setShowEanErroDialog] = useState(false);
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [lote, setLote] = useState("");
  const [fabricacao, setFabricacao] = useState("");
  const [validade, setValidade] = useState("");

  const numero = sessionStorage.getItem("coletor_inventario_numero") || "";
  const inventarioId = sessionStorage.getItem("coletor_inventario_id") || "";
  const enderecoCodigo = sessionStorage.getItem("coletor_inventario_livre_endereco_codigo") || "";
  const enderecoDescricao = sessionStorage.getItem("coletor_inventario_livre_endereco_descricao") || "";
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    if (!enderecoCodigo) {
      onNavigate("/coletor/inventario/livre/endereco");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScanEan = async (code: string) => {
    setEanScanned(code);
    setEmbalagemInfo(null);
    setProdutoInfo(null);
    setEanConfirmado(false);

    try {
      const { data, error } = await (supabase as any)
        .from("produto_embalagem")
        .select("fator, produto_id, embalagem, ean")
        .eq("ean", code)
        .limit(1);
      if (error || !data || data.length === 0) {
        setShowEanErroDialog(true);
        return;
      }
      const emb = data[0];

      const { data: prod } = await (supabase as any)
        .from("produto")
        .select("sku, descricao, tipo_controle")
        .eq("id", emb.produto_id)
        .limit(1);

      const produto = prod?.[0];
      setEmbalagemInfo({ ean: emb.ean, fator: emb.fator, embalagem: emb.embalagem });
      setProdutoInfo({ sku: produto?.sku || "—", descricao: produto?.descricao || "—", tipo_controle: produto?.tipo_controle || "UNIDADE" });
      setEanConfirmado(true);
      toast.success(`EAN confirmado! Fator: ${emb.fator}`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao validar EAN.");
    }
  };

  const requiresLote = () => {
    const ctrl = produtoInfo?.tipo_controle;
    return ctrl === "LOTE" || ctrl === "LOTE_SERIE" || ctrl === "VALIDADE";
  };

  const handleConfirmarClick = () => {
    if (!eanConfirmado || quantidade === "") return;
    const qtd = Number(quantidade);
    if (isNaN(qtd) || qtd < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    if (requiresLote()) {
      setShowLoteModal(true);
      return;
    }
    handleConfirmar();
  };

  const handleConfirmar = async () => {
    if (!eanConfirmado || quantidade === "") return;
    const qtd = Number(quantidade);
    if (isNaN(qtd) || qtd < 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    setConfirming(true);
    try {
      const { data, error } = await supabase.rpc("fn_inventario_contagem_livre" as any, {
        p_tenant_id: tenantId,
        p_inventario_id: inventarioId,
        p_usuario_id: usuarioId,
        p_endereco_codigo: Number(enderecoCodigo),
        p_ean: eanScanned,
        p_quantidade: qtd,
        p_lote: lote || "",
        p_validade: validade || "1900-01-01",
        p_fabricacao: fabricacao || "1900-01-01",
      });
      if (error) throw error;

      let result: any = data;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { /* keep */ }
      }

      if (result && typeof result === "object" && result.sucesso === false) {
        const msg = result.mensagem || ERROR_MAP[result.codigo] || "Erro desconhecido";
        setResultDialog({ sucesso: false, mensagem: msg });
        return;
      }

      const isDiverg = result?.resultado === "DIVERGENCIA";
      const mensagem = isDiverg
        ? `Contagem registrada — Divergência: ${result.divergencia} (Sistema: ${result.saldo_sistema}, Contado: ${result.quantidade_contada})`
        : "Contagem registrada!";

      setResultDialog({
        sucesso: true,
        mensagem,
        divergencia: result?.divergencia,
        saldoSistema: result?.saldo_sistema,
        quantidadeContada: result?.quantidade_contada,
      });
    } catch (err: any) {
      setResultDialog({ sucesso: false, mensagem: err.message || "Erro ao registrar contagem." });
    } finally {
      setConfirming(false);
      setShowLoteModal(false);
    }
  };

  const handleDialogClose = () => {
    const wasSuccess = resultDialog?.sucesso;
    setResultDialog(null);
    if (wasSuccess) {
      setEanScanned("");
      setEmbalagemInfo(null);
      setProdutoInfo(null);
      setEanConfirmado(false);
      setQuantidade("");
      setLote("");
      setFabricacao("");
      setValidade("");
      toast.info("Escaneie outro produto ou volte para endereços.");
    }
  };

  const hasDivergencia = resultDialog?.sucesso && (resultDialog.divergencia ?? 0) !== 0;

  return (
    <ColetorLayout
      title={`Inventário #${numero} — Contagem Livre`}
      onNavigate={onNavigate}
      showBack
      backPath="/coletor/inventario/livre/endereco"
    >
      <div className="flex flex-col gap-3 flex-1">
        {/* Address card */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <MapPin size={18} className="text-[hsl(217,91%,60%)]" />
            <span className="text-sm font-bold text-white">Endereço</span>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">
            Descrição: <span className="font-bold text-[hsl(213,31%,91%)]">{enderecoDescricao || "—"}</span>
          </div>
          <div className="mt-2 py-3 px-4 bg-[hsl(217,91%,50%)]/10 rounded-xl border border-[hsl(217,91%,50%)]/30 text-center">
            <p className="text-2xl font-black text-white tracking-wide font-mono">{enderecoCodigo || "—"}</p>
          </div>
        </div>

        {/* EAN scan */}
        <ScanField
          label="Escanear EAN do Produto"
          lastScanned={eanScanned}
          onScan={handleScanEan}
          placeholder="Escaneie o código de barras"
        />

        {eanConfirmado && (
          <>
            {/* Product */}
            <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Package size={18} className="text-[hsl(217,91%,60%)]" />
                <span className="text-sm font-bold text-white">Produto identificado</span>
              </div>
              <div className="text-xs text-[hsl(213,31%,55%)]">SKU: <span className="font-bold text-[hsl(213,31%,91%)]">{produtoInfo?.sku || "—"}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Descrição: <span className="font-bold text-[hsl(213,31%,91%)]">{produtoInfo?.descricao || "—"}</span></div>
            </div>

            {/* Embalagem */}
            {embalagemInfo && embalagemInfo.fator > 1 && (
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

            {/* Quantidade */}
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

            <ActionButton
              onClick={handleConfirmarClick}
              disabled={!quantidade || confirming}
              loading={confirming}
              variant="success"
            >
              Confirmar Contagem
            </ActionButton>
          </>
        )}

        <ActionButton onClick={() => onNavigate("/coletor/inventario/livre/endereco")} variant="secondary">
          Outro endereço
        </ActionButton>
      </div>

      {/* EAN Error Dialog */}
      {showEanErroDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-4 space-y-3 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col items-center gap-3">
              <XCircle size={48} className="text-[#E02424]" />
              <h3 className="text-base font-bold text-white text-center">EAN Inválido</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">
                O EAN escaneado não foi encontrado.
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

              {resultDialog.sucesso && hasDivergencia && (
                <div className="w-full rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-center">
                  <p className="text-xs text-red-300">
                    Divergência: <span className="font-bold">{(resultDialog.divergencia ?? 0) > 0 ? "+" : ""}{resultDialog.divergencia}</span>
                    {" "}| Sistema: <span className="font-bold">{resultDialog.saldoSistema}</span>
                    {" "}| Contado: <span className="font-bold">{resultDialog.quantidadeContada}</span>
                  </p>
                </div>
              )}
              {resultDialog.sucesso && !hasDivergencia && (
                <div className="w-full rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-center">
                  <p className="text-xs text-green-300 font-bold">✓ Sem divergência</p>
                </div>
              )}
            </div>
            <ActionButton onClick={handleDialogClose} variant={resultDialog.sucesso ? "success" : "primary"}>
              {resultDialog.sucesso ? "Continuar" : "Fechar"}
            </ActionButton>
          </div>
        </div>
      )}

      {/* Lote/Validade Modal */}
      {showLoteModal && produtoInfo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-3 animate-in slide-in-from-bottom duration-200">
            <h3 className="text-lg font-bold text-white">
              {produtoInfo.tipo_controle === "VALIDADE" ? "Informações de Validade" : "Informações do Lote"}
            </h3>

            <div className="rounded-lg bg-[hsl(222,40%,14%)] p-2 text-center">
              <span className="text-xs text-[hsl(213,31%,55%)] uppercase">Quantidade</span>
              <p className="text-2xl font-bold text-white">{quantidade}</p>
            </div>

            {(produtoInfo.tipo_controle === "LOTE" || produtoInfo.tipo_controle === "LOTE_SERIE") && (
              <div>
                <label className="block text-xs font-semibold text-[hsl(213,31%,55%)] mb-1 uppercase">Lote *</label>
                <input
                  value={lote}
                  onChange={(e) => setLote(e.target.value)}
                  className="w-full h-12 px-3 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,14%)] text-lg text-white outline-none focus:border-[hsl(217,91%,50%)]"
                  autoFocus
                />
              </div>
            )}

            {(produtoInfo.tipo_controle === "VALIDADE" || produtoInfo.tipo_controle === "LOTE" || produtoInfo.tipo_controle === "LOTE_SERIE") && (
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
              onClick={handleConfirmar}
              loading={confirming}
              variant="success"
              disabled={
                confirming ||
                ((produtoInfo.tipo_controle === "LOTE" || produtoInfo.tipo_controle === "LOTE_SERIE") && !lote) ||
                ((produtoInfo.tipo_controle === "VALIDADE" || produtoInfo.tipo_controle === "LOTE" || produtoInfo.tipo_controle === "LOTE_SERIE") && (!fabricacao || !validade))
              }
            >
              CONFIRMAR
            </ActionButton>
            <ActionButton onClick={() => setShowLoteModal(false)} variant="secondary">
              CANCELAR
            </ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}
