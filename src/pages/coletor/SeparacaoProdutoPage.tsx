import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ScanField } from "@/components/coletor/ScanField";
import { toast } from "sonner";
import { Package, AlertTriangle, BoxIcon } from "lucide-react";
import { markTarefaIniciadaByTarefa } from "@/lib/lmsTimestamp";
import { formatDate } from "@/utils/dateTime";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { parseError } from "@/lib/errorMapper";



interface Props { onNavigate: (path: string) => void; }

interface EmbalagemInfo {
  ean: string;
  fator: number;
  embalagem: string;
}

interface LoteSelecionado {
  lote: string;
  validade: string | null;
  fabricacao: string | null;
  hu_id: string | null;
  saldo_disponivel: number;
}

export function SeparacaoProdutoPage({ onNavigate }: Props) {
  const [tarefa, setTarefa] = useState<any>(null);
  const [produtoId, setProdutoId] = useState<string | null>(null);
  const [referencia, setReferencia] = useState<string>("");
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [eanScanned, setEanScanned] = useState("");
  const [embalagemInfo, setEmbalagemInfo] = useState<EmbalagemInfo | null>(null);
  const [eanConfirmado, setEanConfirmado] = useState(false);
  const [quantidade, setQuantidade] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [qtdSeparada, setQtdSeparada] = useState(0);
  const result = useResultDialog({ coletorMode: true });
  const [loteSel, setLoteSel] = useState<LoteSelecionado | null>(null);
  const [showVolumeDialog, setShowVolumeDialog] = useState(false);

  const [volumeQtd, setVolumeQtd] = useState("");
  const [volumeSaving, setVolumeSaving] = useState(false);
  const [geraVolumeEtapa, setGeraVolumeEtapa] = useState<string>("NENHUMA");

  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_separacao_tarefa_atual");
    if (raw) {
      const t = JSON.parse(raw);
      setTarefa(t);
      setQtdSeparada(Number(t.separado || 0));

      // Use produto_id from tarefa if available
      if (t.produto_id) {
        setProdutoId(t.produto_id);
        // Fetch referencia
        fetchProdutoDetails(t.produto_id);
      } else if (t.sku) {
        // Look up produto by sku
        fetchProdutoBySku(t.sku);
      }

      if (t.referencia) {
        setReferencia(t.referencia);
      }

      // Resolve endereco_id
      if (t.endereco_alternativo_id) {
        setEnderecoId(t.endereco_alternativo_id);
      } else if (t.endereco_id) {
        setEnderecoId(t.endereco_id);
      } else if (t.endereco) {
        lookupEnderecoId(t.endereco);
      }
    }

    // Load selected lote (when tipo_controle requires it)
    const rawLote = sessionStorage.getItem("coletor_separacao_lote_selecionado");
    if (rawLote) {
      try { setLoteSel(JSON.parse(rawLote)); } catch { /* ignore */ }
    }

    // Fetch gera_volume_etapa from tipo_saida
    const movId = sessionStorage.getItem("coletor_separacao_movimento_id");
    if (movId) {
      (async () => {
        try {
          const { data: movData } = await (supabase as any)
            .from("movimento_saida")
            .select("tipo_saida_rel:tipo_saida(gera_volume_etapa)")
            .eq("id", movId)
            .single();
          if (movData?.tipo_saida_rel?.gera_volume_etapa) {
            setGeraVolumeEtapa(movData.tipo_saida_rel.gera_volume_etapa);
          }
        } catch { /* fallback NENHUMA */ }
      })();
    }
  }, []);

  const fetchProdutoDetails = async (id: string) => {
    try {
      const { data } = await (supabase as any)
        .from("produto")
        .select("referencia")
        .eq("id", id)
        .limit(1);
      if (data && data.length > 0) {
        setReferencia(data[0].referencia || "");
      }
    } catch { /* non-blocking */ }
  };

  const fetchProdutoBySku = async (sku: string) => {
    try {
      const { data } = await (supabase as any)
        .from("produto")
        .select("id, referencia")
        .eq("sku", sku)
        .limit(1);
      if (data && data.length > 0) {
        setProdutoId(data[0].id);
        setReferencia(data[0].referencia || "");
      }
    } catch { /* non-blocking */ }
  };

  const lookupEnderecoId = async (descricao: string) => {
    try {
      const { data } = await (supabase as any)
        .from("endereco")
        .select("id")
        .eq("descricao", descricao)
        .limit(1);
      if (data && data.length > 0) {
        setEnderecoId(data[0].id);
      }
    } catch { /* non-blocking */ }
  };

  const handleScanEan = async (code: string) => {
    if (!tarefa) return;
    setEanScanned(code);
    setEmbalagemInfo(null);
    setEanConfirmado(false);
    // LMS: mark task as started on first EAN scan
    markTarefaIniciadaByTarefa(tarefa.tarefa_id, usuarioId);

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
        });
        setEanScanned(code);
        return;
      }

      const emb = data[0];

      // Compare with resolved produto_id
      const currentProdutoId = produtoId || tarefa.produto_id;

      if (!currentProdutoId || emb.produto_id !== currentProdutoId) {
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
      const parsed = parseError(err, "separacao-ean");
      toast.error(parsed.title);
    }
  };



  const handleConfirmar = async () => {
    if (!tarefa || !quantidade || !usuarioId) return;
    const qtd = Number(quantidade);
    if (isNaN(qtd) || qtd <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }

    // Multiply by embalagem fator
    const fator = embalagemInfo?.fator || 1;
    const qtdFinal = qtd * fator;

    // Guard-rail: produtos com controle de lote exigem lote selecionado
    const requerLote = ["LOTE", "VALIDADE", "LOTE_SERIE"].includes(tarefa.tipo_controle);
    if (requerLote && !loteSel) {
      toast.error("Selecione um lote antes de confirmar.");
      onNavigate("/coletor/separacao/lote");
      return;
    }

    // Validação de saldo do lote selecionado
    if (loteSel && qtdFinal > loteSel.saldo_disponivel) {
      result.showWarning(
        `Quantidade (${qtdFinal}) excede o saldo disponível no lote (${loteSel.saldo_disponivel}).`,
        { instruction: "Volte e selecione outro lote ou ajuste a quantidade." },
      );
      return;
    }

    setConfirming(true);
    try {
      const resolvedEnderecoId = enderecoId || tarefa.endereco_id || tarefa.endereco_alternativo_id;

      const { data, error } = await supabase.rpc("separacao_executar_coleta" as any, {
        p_tenant_id: tenantId,
        p_tarefa_id: tarefa.tarefa_id,
        p_quantidade: qtdFinal,
        p_endereco_id: resolvedEnderecoId,
        p_usuario_id: usuarioId,
        p_validade: loteSel?.validade ?? null,
        p_fabricacao: loteSel?.fabricacao ?? null,
        p_lote: loteSel?.lote ?? null,
        p_hu: loteSel?.hu_id ?? null,
      });
      if (error) throw error;

      let rpcResult: any = data;
      if (typeof data === "string") {
        try { rpcResult = JSON.parse(data); } catch { /* keep */ }
      }

      if (rpcResult && typeof rpcResult === "object" && !Array.isArray(rpcResult) && rpcResult.sucesso === false) {
        result.showWarning(rpcResult.mensagem || "Erro ao registrar coleta");
        return;
      }

      // Refresh task data from server to get accurate separado/restante
      try {
        const tarefas = JSON.parse(sessionStorage.getItem("coletor_separacao_tarefas") || "[]");
        const idx = Number(sessionStorage.getItem("coletor_separacao_tarefa_idx") || "0");
        const currentTarefa = tarefas[idx];
        if (currentTarefa?.tarefa_id) {
          const { data: tarefaAtualizada } = await (supabase as any)
            .from("tarefa")
            .select("quantidade_executada, quantidade_requerida, status")
            .eq("id", currentTarefa.tarefa_id)
            .single();
          if (tarefaAtualizada) {
            const serverSeparada = Number(tarefaAtualizada.quantidade_executada || 0);
            setQtdSeparada(serverSeparada);
            setQuantidade("");
            if (serverSeparada >= Number(tarefaAtualizada.quantidade_requerida) || tarefaAtualizada.status === "CONCLUIDA") {
              result.showSuccess("Quantidade completa! Avançando para próxima tarefa.", {
                onClose: advanceToNext,
              });
              return;
            }
            toast.success("Quantidade registrada!");
            return;
          }
        }
      } catch { /* fallback below */ }

      // Fallback: local calculation
      const newQtdSeparada = qtdSeparada + qtdFinal;
      setQtdSeparada(newQtdSeparada);
      setQuantidade("");

      if (newQtdSeparada >= Number(tarefa.quantidade_requerida)) {
        result.showSuccess("Quantidade completa! Avançando para próxima tarefa.", {
          onClose: advanceToNext,
        });
      } else {
        toast.success("Quantidade registrada!");
      }
    } catch (err: unknown) {
      result.showError(err, { context: "separacao" });
    } finally {
      setConfirming(false);
    }
  };



  const advanceToNext = () => {
    const tarefas = JSON.parse(sessionStorage.getItem("coletor_separacao_tarefas") || "[]");
    const idx = Number(sessionStorage.getItem("coletor_separacao_tarefa_idx") || "0");
    const nextIdx = idx + 1;

    // Clear lote selection so it doesn't leak into the next task
    sessionStorage.removeItem("coletor_separacao_lote_selecionado");

    if (nextIdx >= tarefas.length) {
      if (geraVolumeEtapa === "SEPARAÇÃO") {
        setShowVolumeDialog(true);
        return;
      }
      toast.success("Separação concluída para esta onda!");
      onNavigate("/coletor/separacao/iniciar");
      return;
    }

    sessionStorage.setItem("coletor_separacao_tarefa_idx", String(nextIdx));

    // Se o próximo item está no mesmo endereço, evita re-leitura: troca apenas os dados do produto
    const atual = tarefas[idx] || tarefa;
    const proxima = tarefas[nextIdx];
    const keyAtual =
      atual?.endereco_alternativo_id || atual?.endereco_id || atual?.endereco || null;
    const keyProx =
      proxima?.endereco_alternativo_id || proxima?.endereco_id || proxima?.endereco || null;

    if (keyAtual && keyProx && keyAtual === keyProx) {
      sessionStorage.setItem("coletor_separacao_tarefa_atual", JSON.stringify(proxima));
      setTarefa(proxima);
      setQtdSeparada(Number(proxima.separado || 0));
      setEanScanned("");
      setEmbalagemInfo(null);
      setEanConfirmado(false);
      setQuantidade("");
      setLoteSel(null);
      setProdutoId(proxima.produto_id || null);
      setReferencia(proxima.referencia || "");
      setEnderecoId(proxima.endereco_alternativo_id || proxima.endereco_id || null);

      if (proxima.produto_id) {
        fetchProdutoDetails(proxima.produto_id);
      } else if (proxima.sku) {
        fetchProdutoBySku(proxima.sku);
      }
      if (!proxima.endereco_alternativo_id && !proxima.endereco_id && proxima.endereco) {
        lookupEnderecoId(proxima.endereco);
      }

      toast.success(`Próximo produto: ${proxima.sku || proxima.produto || ""}`);
      return;
    }

    onNavigate("/coletor/separacao/endereco");
  };

  const handleSalvarVolumes = async () => {
    const qtd = Number(volumeQtd);
    if (!qtd || qtd <= 0) {
      toast.error("Informe uma quantidade válida.");
      return;
    }
    setVolumeSaving(true);
    try {
      const movId = sessionStorage.getItem("coletor_separacao_movimento_id");
      const empresaId = localStorage.getItem("core_empresa_id");
      const { data, error } = await supabase.rpc("gerar_volumes_expedicao" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_movimento_saida_id: movId,
        p_quantidade_volumes: qtd,
        p_etapa_origem: "SEPARAÇÃO",
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
      onNavigate("/coletor/separacao/iniciar");
    } catch (err: any) {
      const parsed = parseError(err, "separacao-produto");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao gerar volumes." : parsed.title);
    } finally {
      setVolumeSaving(false);
    }
  };

  if (!tarefa) return null;

  const restante = Number(tarefa.quantidade_requerida) - qtdSeparada;
  const temLote = ["LOTE", "VALIDADE", "LOTE_SERIE"].includes(tarefa.tipo_controle);
  const backPath = temLote ? "/coletor/separacao/lote" : "/coletor/separacao/endereco";

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso || iso === "1900-01-01") return "—";
    return formatDate(iso.length === 10 ? iso + "T00:00:00" : iso);
  };

  return (
    <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath={backPath}>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {/* Product info */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Package size={18} className="text-[hsl(217,91%,60%)]" />
              <span className="text-sm font-bold text-white">Produto</span>
            </div>
            <button
              onClick={() => onNavigate("/coletor/separacao/ocorrencias")}
              className="w-8 h-8 rounded-lg bg-[#F59E0B] flex items-center justify-center"
            >
              <AlertTriangle size={16} className="text-white" />
            </button>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">SKU: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.sku || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Referência: <span className="font-bold text-[hsl(213,31%,91%)]">{referencia || tarefa.referencia || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Descrição: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.produto || "—"}</span></div>
          {tarefa.fator_caixa && <div className="text-xs text-[hsl(213,31%,55%)]">Fator Caixa: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.fator_caixa}</span></div>}

          {temLote && (
            <div className="mt-2 pt-2 border-t border-[hsl(222,35%,22%)] space-y-1">
              <div className="text-xs text-[hsl(213,31%,55%)]">Lote: <span className="font-bold text-[hsl(213,31%,91%)]">{loteSel?.lote || tarefa.lote || "—"}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Validade: <span className="font-bold text-[hsl(213,31%,91%)]">{fmtDate(loteSel?.validade ?? tarefa.validade)}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Fabricação: <span className="font-bold text-[hsl(213,31%,91%)]">{fmtDate(loteSel?.fabricacao ?? tarefa.fabricacao)}</span></div>
              {loteSel && <div className="text-xs text-[hsl(213,31%,55%)]">Saldo do Lote: <span className="font-bold text-[hsl(142,71%,45%)]">{loteSel.saldo_disponivel}</span></div>}
            </div>
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
        <ScanField label="Escanear EAN do Produto" lastScanned={eanScanned} onScan={handleScanEan} placeholder="Escaneie o código de barras" />

        {/* Embalagem info stat - always visible after scan */}
        {embalagemInfo && (
          <div className="bg-[hsl(222,40%,12%)] rounded-xl border border-[hsl(222,35%,22%)] px-3 py-2 flex items-center gap-4">
            <BoxIcon size={16} className="text-[hsl(217,91%,60%)] shrink-0" />
            <div className="flex items-center gap-4 flex-1 text-xs overflow-hidden">
              
              <span className="text-[hsl(213,31%,55%)]">Fator: <span className="font-bold text-[hsl(217,91%,60%)]">{embalagemInfo.fator}</span></span>
              <span className="text-[hsl(213,31%,55%)] truncate">Emb: <span className="font-bold text-[hsl(213,31%,91%)]">{embalagemInfo.embalagem}</span></span>
            </div>
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
      </div>

      {/* Sticky confirm button */}
      <div className="shrink-0 space-y-2">
        <ActionButton
          onClick={handleConfirmar}
          disabled={!quantidade || confirming || !eanConfirmado}
          loading={confirming}
          variant="success"
        >
          Confirmar Quantidade
        </ActionButton>
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
                Separação finalizada! Informe a quantidade de volumes gerados para esta onda.
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

      <ResultDialog {...result.dialogProps} />

    </ColetorLayout>
  );
}
