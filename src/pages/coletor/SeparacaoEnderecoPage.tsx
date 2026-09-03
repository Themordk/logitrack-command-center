import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { MapPin, SkipForward, MoreVertical, MapPinned, Loader2, Package, Navigation, Ban } from "lucide-react";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { parseError } from "@/lib/errorMapper";
import { formatDate } from "@/utils/dateTime";
import { useOffline } from "@/contexts/OfflineContext";
import { useCancelamentoRealtime } from "@/hooks/useCancelamentoRealtime";
import { useFeedback } from "@/hooks/useFeedback";



interface Props { onNavigate: (path: string) => void; }

interface Tarefa {
  tarefa_id: string;
  produto_id?: string;
  sku?: string;
  produto?: string;
  referencia?: string;
  endereco?: string;
  endereco_id?: string;
  setor?: string;
  armazem?: string;
  quantidade_requerida: number;
  ordem_tarefa: number;
  separado?: number;
  status?: string;
  fator_caixa?: number;
  lote?: string;
  validade?: string;
  fabricacao?: string;
  tipo_controle?: string;
  saldo_endereco?: number;
  [key: string]: any;
}

interface EnderecoAlternativo {
  endereco_id: string;
  endereco_descricao: string;
  quantidade_disponivel: number;
  lote: string;
  setor?: string;
}

export function SeparacaoEnderecoPage({ onNavigate }: Props) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lastScanned, setLastScanned] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showOutrosEnderecos, setShowOutrosEnderecos] = useState(false);
  const [outrosEnderecos, setOutrosEnderecos] = useState<EnderecoAlternativo[]>([]);
  const [loadingEnderecos, setLoadingEnderecos] = useState(false);
  const [selectedEnderecoAlt, setSelectedEnderecoAlt] = useState<string | null>(null);
  const result = useResultDialog({ coletorMode: true });
  const { isOnline } = useOffline();

  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";

  const feedback = useFeedback();
  const movimentoSaidaId = sessionStorage.getItem("coletor_separacao_movimento_id");
  const usuarioIdAtual = localStorage.getItem("core_usuario_id");
  const { notificacoes, dismissNotificacao } = useCancelamentoRealtime({
    movimentoSaidaId,
    usuarioId: usuarioIdAtual,
    enabled: true,
  });

  useEffect(() => {
    if (notificacoes.length > 0) feedback.error();
  }, [notificacoes.length]);


  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_separacao_tarefas");
    const idx = Number(sessionStorage.getItem("coletor_separacao_tarefa_idx") || "0");
    if (raw) {
      const parsed = JSON.parse(raw) as Tarefa[];
      parsed.sort((a, b) => (a.ordem_tarefa || 0) - (b.ordem_tarefa || 0));

      // Enrich tarefas with produto_id if missing (lookup by sku)
      enrichTarefas(parsed).then((enriched) => {
        setTarefas(enriched);
        setCurrentIdx(idx);
      });
    }
  }, []);

  const enrichTarefas = async (tarefas: Tarefa[]): Promise<Tarefa[]> => {
    // Offline: não enriquece — usa os dados que já vieram da RPC
    if (!isOnline) return tarefas;

    // Collect SKUs missing produto_id OR tipo_controle
    const skusToLookup = tarefas
      .filter((t) => (!t.produto_id || !t.tipo_controle) && t.sku)
      .map((t) => t.sku!);

    if (skusToLookup.length === 0) return tarefas;

    try {
      const uniqueSkus = [...new Set(skusToLookup)];
      const { data } = await (supabase as any)
        .from("produto")
        .select("id, sku, referencia, tipo_controle")
        .in("sku", uniqueSkus);

      if (data && data.length > 0) {
        const skuMap: Record<string, { id: string; referencia: string; tipo_controle: string }> = {};
        data.forEach((p: any) => { skuMap[p.sku] = { id: p.id, referencia: p.referencia, tipo_controle: p.tipo_controle }; });

        return tarefas.map((t) => {
          if (t.sku && skuMap[t.sku]) {
            return {
              ...t,
              produto_id: t.produto_id || skuMap[t.sku].id,
              referencia: t.referencia || skuMap[t.sku].referencia,
              tipo_controle: t.tipo_controle || skuMap[t.sku].tipo_controle,
            };
          }
          return t;
        });
      }
    } catch {
      // Non-blocking
    }
    return tarefas;
  };

  const requerLote = (tc?: string) => !!tc && ["LOTE", "VALIDADE", "LOTE_SERIE"].includes(tc);

  const tarefa = tarefas[currentIdx];

  const handleScan = async (code: string) => {
    if (!tarefa) return;
    setLastScanned(code);

    try {
      // Offline: valida localmente contra o endereço da tarefa em cache
      if (!isOnline) {
        const esperado = String(tarefa.endereco || "").trim().toUpperCase();
        if (esperado && esperado !== code.trim().toUpperCase()) {
          result.showWarning("Endereço incorreto! Escaneie o endereço informado.", { onClose: () => setLastScanned("") });
          return;
        }
        sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify(tarefas));
        sessionStorage.setItem("coletor_separacao_tarefa_idx", String(currentIdx));
        sessionStorage.setItem("coletor_separacao_tarefa_atual", JSON.stringify(tarefa));
        sessionStorage.removeItem("coletor_separacao_lote_selecionado");
        toast.info("Endereço confirmado offline.");
        onNavigate(requerLote(tarefa.tipo_controle) ? "/coletor/separacao/lote" : "/coletor/separacao/produto");
        return;
      }

      // Pre-check: endereco situacao
      const { data: endCheck } = await (supabase as any)
        .from("endereco")
        .select("descricao, situacao")
        .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
        .limit(1);
      if (endCheck && endCheck.length > 0 && !["LIVRE", "OCUPADO"].includes(endCheck[0].situacao)) {
        result.showWarning(
          `Endereço ${endCheck[0].descricao} está ${endCheck[0].situacao}.`,
          { instruction: "Movimentações não são permitidas. Procure a supervisão.", onClose: () => setLastScanned("") }
        );
        return;
      }

      const { data, error } = await supabase.rpc("separacao_confirmar_endereco" as any, {
        p_tenant_id: localStorage.getItem("core_tenant_id"),
        p_tarefa_id: tarefa.tarefa_id,
        p_endereco_lido: code,
      });
      if (error) throw error;


      let rpcResult: any;
      if (typeof data === "string") {
        try { rpcResult = JSON.parse(data); } catch { rpcResult = data; }
      } else {
        rpcResult = data;
      }

      // Handle object result with sucesso field
      if (rpcResult && typeof rpcResult === "object" && rpcResult.sucesso === false) {
        result.showWarning(rpcResult.mensagem || "Endereço incorreto! Escaneie o endereço informado.", { onClose: () => setLastScanned("") });
        return;
      }

      // Handle string error result
      if (typeof rpcResult === "string" && rpcResult.toLowerCase().includes("erro")) {
        result.showWarning(rpcResult, { onClose: () => setLastScanned("") });
        return;
      }

      // Update tarefas in session with enriched data
      sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify(tarefas));
      sessionStorage.setItem("coletor_separacao_tarefa_idx", String(currentIdx));
      sessionStorage.setItem("coletor_separacao_tarefa_atual", JSON.stringify(tarefa));
      // Clear any stale lote selection from previous task
      sessionStorage.removeItem("coletor_separacao_lote_selecionado");
      toast.success("Endereço confirmado!");
      onNavigate(requerLote(tarefa.tipo_controle) ? "/coletor/separacao/lote" : "/coletor/separacao/produto");
    } catch (err: unknown) {
      result.showError(err, { context: "separacao-endereco", onClose: () => setLastScanned("") });
    }

  };

  const handlePular = () => {
    if (!tarefas.length) return;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= tarefas.length) {
      setCurrentIdx(0);
      sessionStorage.setItem("coletor_separacao_tarefa_idx", "0");
      setLastScanned("");
      toast.info("Retornando ao primeiro endereço.");
      return;
    }
    setCurrentIdx(nextIdx);
    sessionStorage.setItem("coletor_separacao_tarefa_idx", String(nextIdx));
    setLastScanned("");
  };

  const loadOutrosEnderecos = async () => {
    if (!tarefa) return;
    
    let produtoId = tarefa.produto_id;
    
    // If produto_id is missing, look it up by sku
    if (!produtoId && tarefa.sku) {
      try {
        const { data } = await (supabase as any)
          .from("produto")
          .select("id")
          .eq("sku", tarefa.sku)
          .limit(1);
        if (data && data.length > 0) {
          produtoId = data[0].id;
          // Update tarefa with produto_id
          const updated = { ...tarefa, produto_id: produtoId };
          const newTarefas = [...tarefas];
          newTarefas[currentIdx] = updated;
          setTarefas(newTarefas);
        }
      } catch {
        result.showWarning("Erro ao buscar produto.");
        return;
      }
    }

    if (!produtoId) {
      result.showWarning("Produto não identificado.");
      return;
    }

    setLoadingEnderecos(true);
    setShowOutrosEnderecos(true);
    setShowOptions(false);
    try {
      const { data, error } = await (supabase as any)
        .from("estoque_geral")
        .select("id, endereco_id, quantidade_disponivel, lote")
        .eq("produto_id", produtoId)
        .gt("quantidade_disponivel", 0)
        .limit(50);
      if (error) throw error;

      if (!data || data.length === 0) {
        setOutrosEnderecos([]);
        setLoadingEnderecos(false);
        return;
      }

      // Get endereco descriptions
      const endIds = [...new Set(data.map((d: any) => d.endereco_id).filter(Boolean))];
      const { data: endData } = await (supabase as any)
        .from("endereco")
        .select("id, descricao, setor_id")
        .in("id", endIds);

      const endMap: Record<string, any> = {};
      (endData || []).forEach((e: any) => { endMap[e.id] = e; });

      const lista: EnderecoAlternativo[] = data
        .filter((d: any) => d.endereco_id)
        .map((d: any) => ({
          endereco_id: d.endereco_id,
          endereco_descricao: endMap[d.endereco_id]?.descricao || d.endereco_id,
          quantidade_disponivel: d.quantidade_disponivel,
          lote: d.lote || "—",
        }));

      setOutrosEnderecos(lista);
    } catch (err: any) {
      const parsed = parseError(err, "separacao-endereco");
      result.showParsedError(parsed);
    } finally {
      setLoadingEnderecos(false);
    }
  };

  const handleConfirmarEnderecoAlt = () => {
    if (!selectedEnderecoAlt || !tarefa) return;
    const endAlt = outrosEnderecos.find((e) => e.endereco_id === selectedEnderecoAlt);
    if (!endAlt) return;

    const updatedTarefa = {
      ...tarefa,
      endereco_alternativo_id: selectedEnderecoAlt,
      endereco_alternativo_desc: endAlt.endereco_descricao,
    };
    sessionStorage.setItem("coletor_separacao_tarefa_idx", String(currentIdx));
    sessionStorage.setItem("coletor_separacao_tarefa_atual", JSON.stringify(updatedTarefa));
    sessionStorage.removeItem("coletor_separacao_lote_selecionado");
    toast.success(`Endereço alternativo selecionado: ${endAlt.endereco_descricao}`);
    setShowOutrosEnderecos(false);
    onNavigate(requerLote(tarefa.tipo_controle) ? "/coletor/separacao/lote" : "/coletor/separacao/produto");
  };

  if (!tarefa) {
    return (
      <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/iniciar">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa pendente.</p>
          <ActionButton onClick={() => onNavigate("/coletor/separacao/iniciar")}>Voltar</ActionButton>
        </div>
      </ColetorLayout>
    );
  }

  const progress = `${currentIdx + 1}/${tarefas.length}`;
  const progressPct = tarefas.length > 0 ? ((currentIdx + 1) / tarefas.length) * 100 : 0;

  const restante = Math.max(0, (tarefa.quantidade_requerida || 0) - (tarefa.separado || 0));
  const showLote = requerLote(tarefa.tipo_controle);

  const fmtDate = (iso: string | null | undefined) => {
    if (!iso || iso === "1900-01-01") return "—";
    return formatDate(iso.length === 10 ? iso + "T00:00:00" : iso);
  };

  const countSameEndereco = (() => {
    let count = 1;
    for (let i = currentIdx + 1; i < tarefas.length; i++) {
      const keyAtual = tarefa?.endereco_id || tarefa?.endereco;
      const keyNext = tarefas[i]?.endereco_id || tarefas[i]?.endereco;
      if (keyAtual && keyNext && keyAtual === keyNext) count++;
      else break;
    }
    return count;
  })();

  const proximosEnderecos = (() => {
    const proximos: Array<{ endereco: string; idx: number }> = [];
    const seen = new Set<string>();
    const atual = tarefa?.endereco || "";
    if (atual) seen.add(atual);
    for (let i = currentIdx + 1; i < tarefas.length && proximos.length < 2; i++) {
      const end = tarefas[i]?.endereco || "—";
      if (!seen.has(end)) {
        seen.add(end);
        proximos.push({ endereco: end, idx: i + 1 });
      }
    }
    return proximos;
  })();

  return (
    <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/iniciar">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {/* Banner de cancelamento (realtime) */}
        {notificacoes.map((notif) => (
          <div
            key={notif.documentoSaidaId}
            className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 animate-pulse"
          >
            <Ban size={18} className="text-red-400 shrink-0 mt-0.5" />
            <p className="text-sm text-red-400 flex-1">
              <span className="font-bold">{notif.documentoNumero}</span> — itens já separados serão devolvidos ao final da onda.
            </p>
            <button
              onClick={() => dismissNotificacao(notif.documentoSaidaId)}
              className="text-red-400/60 text-sm shrink-0"
              aria-label="Fechar notificação"
            >
              ✕
            </button>
          </div>
        ))}

        {/* Progress */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[hsl(213,31%,55%)]">Endereço {progress}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            Ordem: {tarefa.ordem_tarefa}
          </span>
        </div>


        {/* Progress bar */}
        <div className="w-full h-1.5 bg-[hsl(222,35%,18%)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[hsl(217,91%,60%)] rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Address info */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <MapPin size={18} className="text-[hsl(217,91%,60%)]" />
              <span className="text-sm font-bold text-white">Endereço para Coleta</span>
              {countSameEndereco > 1 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(142,76%,36%)]/15 text-[hsl(142,71%,45%)] border border-[hsl(142,76%,36%)]/30">
                  {countSameEndereco} itens neste endereço
                </span>
              )}
            </div>
            {/* Options button */}
            <div className="relative">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="p-2 rounded-lg hover:bg-[hsl(222,35%,20%)] transition-colors"
              >
                <MoreVertical size={18} className="text-[hsl(213,31%,55%)]" />
              </button>
              {showOptions && (
                <div className="absolute right-0 top-full mt-1 bg-[hsl(222,40%,14%)] border border-[hsl(222,35%,22%)] rounded-xl shadow-lg z-10 min-w-[200px]">
                  <button
                    onClick={loadOutrosEnderecos}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-white hover:bg-[hsl(222,35%,20%)] rounded-xl transition-colors"
                  >
                    <MapPinned size={16} className="text-[hsl(217,91%,60%)]" />
                    Outros Endereços do Produto
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Armazém: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.armazem || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Setor: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.setor || "—"}</span></div>
          {/* Highlighted address */}
          <div className="mt-2 py-3 px-4 bg-[hsl(217,91%,50%)]/10 rounded-xl border border-[hsl(217,91%,50%)]/30 text-center">
            <p className="text-2xl font-black text-white tracking-wide font-mono">{tarefa.endereco || "—"}</p>
          </div>
        </div>

        {/* Product preview card */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-3 opacity-90">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-[hsl(217,91%,60%)]" />
            <span className="text-sm font-bold text-[hsl(213,31%,91%)]">Produto a coletar</span>
            {(() => {
              // Indica quando esta tarefa é split do mesmo produto da tarefa anterior
              if (currentIdx > 0) {
                const anterior = tarefas[currentIdx - 1];
                const mesmoItem =
                  anterior &&
                  tarefa.produto_id &&
                  anterior.produto_id === tarefa.produto_id &&
                  (anterior.endereco_id || anterior.endereco) !== (tarefa.endereco_id || tarefa.endereco);
                if (mesmoItem) {
                  return (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(217,91%,50%)]/15 text-[hsl(217,91%,60%)] border border-[hsl(217,91%,50%)]/30">
                      Continuação
                    </span>
                  );
                }
              }
              return null;
            })()}
          </div>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="text-xs text-[hsl(213,31%,55%)]">SKU: <span className="font-bold text-[hsl(213,31%,91%)] font-mono">{tarefa.sku || "—"}</span></div>
            <div className="text-xs text-[hsl(213,31%,55%)]">Ref: <span className="font-bold text-[hsl(213,31%,91%)] font-mono">{tarefa.referencia || "—"}</span></div>
          </div>
          <div className="text-xs text-[hsl(213,31%,91%)] leading-snug">{tarefa.produto || "—"}</div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[hsl(222,40%,12%)] rounded-xl border border-[hsl(222,35%,22%)] p-2 text-center">
              <div className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Saldo</div>
              <div className="text-base font-bold text-[hsl(217,91%,60%)]">{tarefa.saldo_endereco ?? 0}</div>
            </div>
            <div className="bg-[hsl(222,40%,12%)] rounded-xl border border-[hsl(222,35%,22%)] p-2 text-center">
              <div className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Requerida</div>
              <div className="text-base font-bold text-white">{tarefa.quantidade_requerida ?? 0}</div>
            </div>
            <div className="bg-[hsl(222,40%,12%)] rounded-xl border border-[hsl(222,35%,22%)] p-2 text-center">
              <div className="text-[10px] uppercase text-[hsl(213,31%,45%)]">Separada</div>
              <div className="text-base font-bold text-[hsl(142,71%,45%)]">{tarefa.separado || 0}</div>
            </div>
          </div>

          {showLote && (
            <div className="border-t border-[hsl(222,35%,22%)] pt-2 mt-2 flex items-center gap-4 flex-wrap">
              <div className="text-xs text-[hsl(213,31%,55%)]">Lote: <span className="font-bold text-[hsl(213,31%,91%)] font-mono">{tarefa.lote || "—"}</span></div>
              <div className="text-xs text-[hsl(213,31%,55%)]">Validade: <span className="font-bold text-[hsl(213,31%,91%)]">{fmtDate(tarefa.validade)}</span></div>
              {tarefa.fabricacao && (
                <div className="text-xs text-[hsl(213,31%,55%)]">Fabricação: <span className="font-bold text-[hsl(213,31%,91%)]">{fmtDate(tarefa.fabricacao)}</span></div>
              )}
            </div>
          )}
        </div>

        {/* Scan field */}
        <ScanField
          label="Confirmar Endereço"
          lastScanned={lastScanned}
          onScan={handleScan}
          placeholder="Escaneie o endereço para confirmar"
        />

        {/* Próximos endereços */}
        {proximosEnderecos.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-[hsl(213,31%,40%)] flex-wrap">
            <Navigation size={14} className="text-[hsl(213,31%,35%)]" />
            <span>Próximos:</span>
            {proximosEnderecos.map((p, i) => (
              <span key={`${p.endereco}-${p.idx}`} className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[hsl(222,35%,15%)] text-[hsl(213,31%,55%)] font-mono text-[10px]">{p.endereco}</span>
                {i < proximosEnderecos.length - 1 && <span className="text-[hsl(213,31%,30%)]">→</span>}
              </span>
            ))}
          </div>
        )}
      </div>


      {/* Sticky skip button */}
      <div className="shrink-0">
        <ActionButton onClick={handlePular} variant="secondary">
          <SkipForward size={18} /> Pular Endereço
        </ActionButton>
      </div>


      <ResultDialog {...result.dialogProps} />


      {/* Outros Endereços Modal */}
      {showOutrosEnderecos && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
          <div className="w-full max-w-md bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-3xl p-6 space-y-4 animate-slide-up max-h-[80vh] flex flex-col">
            <h3 className="text-base font-bold text-white">Outros Endereços do Produto</h3>
            <p className="text-xs text-[hsl(213,31%,55%)]">{tarefa.sku} - {tarefa.produto}</p>

            {loadingEnderecos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
              </div>
            ) : outrosEnderecos.length === 0 ? (
              <p className="text-sm text-[hsl(213,31%,45%)] text-center py-4">Nenhum endereço com saldo encontrado.</p>
            ) : (
              <div className="flex flex-col gap-2 overflow-auto flex-1">
                {outrosEnderecos.map((end) => (
                  <button
                    key={`${end.endereco_id}-${end.lote}`}
                    onClick={() => setSelectedEnderecoAlt(end.endereco_id === selectedEnderecoAlt ? null : end.endereco_id)}
                    className={`flex flex-col gap-1 p-3 rounded-xl border transition-all text-left ${
                      selectedEnderecoAlt === end.endereco_id
                        ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                        : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                    }`}
                  >
                    <span className="text-sm font-bold text-white font-mono">{end.endereco_descricao}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[hsl(213,31%,55%)]">Saldo: <span className="font-bold text-[hsl(142,71%,45%)]">{end.quantidade_disponivel}</span></span>
                      <span className="text-xs text-[hsl(213,31%,55%)]">Lote: <span className="font-bold text-[hsl(213,31%,91%)]">{end.lote}</span></span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <ActionButton onClick={() => { setShowOutrosEnderecos(false); setSelectedEnderecoAlt(null); }} variant="secondary">
                Cancelar
              </ActionButton>
              <ActionButton onClick={handleConfirmarEnderecoAlt} disabled={!selectedEnderecoAlt}>
                Confirmar
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}
