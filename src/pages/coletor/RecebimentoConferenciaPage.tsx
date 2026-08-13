import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { toast } from "sonner";
import { Loader2, AlertTriangle, Archive } from "lucide-react";
import { parseError } from "@/lib/errorMapper";
import { useOfflineAction } from "@/hooks/useOfflineAction";
import { useOffline } from "@/contexts/OfflineContext";

interface Props { onNavigate: (path: string) => void; }

interface ItemResumo {
  movimento_id: string;
  tarefa_execucao_id: string;
  sku: string;
  descricao: string;
  operador: string;
  codigo_hu: string | null;
  quantidade_executada: number;
  concluido_em: string | null;
  lote: string;
  divergente?: boolean;
}

export function RecebimentoConferenciaPage({ onNavigate }: Props) {
  const movimentoId = sessionStorage.getItem("coletor_movimento_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id");
  const tenantId = localStorage.getItem("core_tenant_id");
  const [itens, setItens] = useState<ItemResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const { execute: executeOffline } = useOfflineAction();

  useEffect(() => {
    loadResumo();
  }, []);

  const loadResumo = async () => {
    if (!movimentoId) { setLoading(false); return; }
    setLoading(true);

    // Offline: montar resumo a partir das tarefas em sessionStorage
    if (!isOnline) {
      try {
        const tarefasRaw = sessionStorage.getItem("coletor_recebimento_tarefas");
        const tarefas = tarefasRaw ? JSON.parse(tarefasRaw) : [];
        const resumo: ItemResumo[] = (tarefas as any[])
          .filter((t) => Number(t.conferido || 0) > 0)
          .map((t) => ({
            movimento_id: movimentoId,
            tarefa_execucao_id: t.id || t.tarefa_id || "",
            sku: t.sku || "",
            descricao: t.descricao || "",
            operador: "",
            codigo_hu: null,
            quantidade_executada: Number(t.conferido || 0),
            concluido_em: null,
            lote: "",
            divergente: false,
          }));
        setItens(resumo);
      } catch {
        toast.error("Erro ao montar resumo offline.");
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const { data, error } = await (supabase as any)
        .from("vw_movimento_entrada_conferencia_detalhe")
        .select("movimento_id, tarefa_execucao_id, sku, descricao, operador, codigo_hu, quantidade_executada, concluido_em, lote, status")
        .eq("movimento_id", movimentoId);
      if (error) throw error;

      // Group by SKU and sum quantities
      const grouped = new Map<string, ItemResumo>();
      for (const row of (data || [])) {
        const key = row.sku || row.tarefa_execucao_id;
        const isDiv = row.status === "DIVERGENTE";
        if (grouped.has(key)) {
          const existing = grouped.get(key)!;
          existing.quantidade_executada += Number(row.quantidade_executada || 0);
          if (isDiv) existing.divergente = true;
        } else {
          grouped.set(key, {
            ...row,
            quantidade_executada: Number(row.quantidade_executada || 0),
            divergente: isDiv,
          });
        }
      }
      setItens(Array.from(grouped.values()));
    } catch (err: any) {
      console.error("Erro resumo:", err);
      toast.error("Erro ao carregar resumo.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizar = async () => {
    if (!movimentoId || !usuarioId) return;
    setFinalizing(true);
    try {
      const offlineResult = await executeOffline("finalizar_conferencia_entrada_movimento", {
        p_tenant_id: tenantId,
        p_movimento_entrada_id: movimentoId,
        p_usuario: usuarioId,
      });
      if (!offlineResult.success) throw offlineResult.data;

      if (offlineResult.offline) {
        toast.info("Ação salva. Será enviada quando a conexão retornar.");
        setOverlay("success");
        setOverlayMsg("Recebimento finalizado!");
        setTimeout(() => onNavigate("/coletor/recebimento/concluido"), 1200);
        return;
      }

      const resultado = offlineResult.data as string;
      if (resultado === "CONFERENCIA_FINALIZADA_COM_DIVERGENCIA") {
        setOverlay("warning");
        setOverlayMsg("Finalizado com divergências!");
      } else {
        setOverlay("success");
        setOverlayMsg("Recebimento finalizado!");
      }
      setTimeout(() => onNavigate("/coletor/recebimento/concluido"), 1200);
    } catch (err: any) {
      const parsed = parseError(err, "recebimento-conferencia");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao finalizar." : parsed.title);
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return (
    <ColetorLayout title="Resumo" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/execucao">
      <div className="flex-1 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
    </ColetorLayout>
  );

  if (itens.length === 0) return (
    <ColetorLayout title="Resumo" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/execucao">
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
        <AlertTriangle size={40} className="text-[#F59E0B]" />
        <span className="text-[hsl(213,31%,55%)]">Resumo não encontrado para este movimento.</span>
        <ActionButton onClick={() => onNavigate("/coletor/recebimento/execucao")} variant="secondary">
          VOLTAR À CONFERÊNCIA
        </ActionButton>
      </div>
    </ColetorLayout>
  );

  return (
    <ColetorLayout title="Resumo da Conferência" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/execucao">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <div className="flex flex-col gap-4 flex-1 min-h-0">
        {/* Item list */}
        <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
          {(() => {
            const grupos = itens.reduce((acc, item) => {
              const key = item.codigo_hu || "__SEM_HU__";
              if (!acc[key]) acc[key] = [];
              acc[key].push(item);
              return acc;
            }, {} as Record<string, ItemResumo[]>);
            const groupKeys = Object.keys(grupos);
            const showHeaders = groupKeys.length > 1;

            const renderItem = (item: ItemResumo, idx: number) => (
              <div key={item.tarefa_execucao_id || item.sku || idx} className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 shrink-0">
                <div className="flex justify-between items-start mb-1 gap-2">
                  <span className="text-sm font-bold text-white truncate flex-1">{item.descricao}</span>
                  {item.divergente && (
                    <span title="Item divergente" className="shrink-0">
                      <AlertTriangle size={16} className="text-[#F59E0B]" />
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    sessionStorage.setItem("coletor_consulta_produto_sku", item.sku);
                    sessionStorage.setItem("coletor_consulta_produto_back", "/coletor/recebimento/conferencia");
                    (supabase as any).from("produto").select("id").eq("sku", item.sku).limit(1).then(({ data }: any) => {
                      if (data && data.length > 0) {
                        sessionStorage.setItem("coletor_consulta_produto_id", data[0].id);
                        onNavigate("/coletor/consulta/produto/detalhe");
                      }
                    });
                  }}
                  className="text-xs text-[hsl(217,91%,60%)] mb-1 underline cursor-pointer"
                >
                  SKU: {item.sku}
                </button>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                  <span className="text-[#22C55E]">Qtd: <strong>{item.quantidade_executada}</strong></span>
                  {item.operador && <span className="text-[hsl(213,31%,55%)]">Op: {item.operador}</span>}
                  {item.codigo_hu && <span className="text-[hsl(213,31%,55%)]">HU: {item.codigo_hu}</span>}
                  {item.lote && <span className="text-[hsl(213,31%,55%)]">Lote: {item.lote}</span>}
                </div>
              </div>
            );

            return groupKeys.map((huCode) => {
              const groupItems = grupos[huCode];
              const isSemHU = huCode === "__SEM_HU__";
              return (
                <div key={huCode} className="space-y-2">
                  {showHeaders && (
                    <div className="flex items-center gap-2 px-1 pt-2">
                      <Archive size={14} className={isSemHU ? "text-[hsl(213,31%,45%)]" : "text-[hsl(142,71%,45%)]"} />
                      <span
                        className="text-xs font-bold uppercase tracking-wide"
                        style={{ color: isSemHU ? "hsl(213,31%,55%)" : "hsl(142,71%,45%)" }}
                      >
                        {isSemHU ? "Sem HU" : huCode}
                      </span>
                      <span className="text-[10px] text-[hsl(213,31%,45%)]">
                        ({groupItems.length} {groupItems.length === 1 ? "item" : "itens"})
                      </span>
                    </div>
                  )}
                  {groupItems.map((it, i) => renderItem(it, i))}
                </div>
              );
            });
          })()}
        </div>

        <div className="shrink-0 space-y-2">
          <ActionButton onClick={handleFinalizar} loading={finalizing} variant="success">
            FINALIZAR CONFERÊNCIA
          </ActionButton>
          <ActionButton onClick={() => onNavigate("/coletor/recebimento/execucao")} variant="secondary">
            VOLTAR À CONFERÊNCIA
          </ActionButton>
        </div>
      </div>
    </ColetorLayout>
  );
}