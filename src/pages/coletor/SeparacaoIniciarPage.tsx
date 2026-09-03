import { useCallback, useEffect, useState } from "react";
import { useOffline } from "@/contexts/OfflineContext";
import { useOfflineCache } from "@/hooks/useOfflineCache";

import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Loader2, Database, Ban } from "lucide-react";
import { toast } from "sonner";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { FilterListButton } from "@/components/coletor/FilterListButton";
import { FiltroOndasSheet } from "@/components/coletor/FiltroOndasSheet";
import { useOndasFilter } from "@/hooks/useOndasFilter";
import { useResultDialog } from "@/hooks/useResultDialog";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { parseError } from "@/lib/errorMapper";

interface Props { onNavigate: (path: string) => void; }

interface OndaResumo {
  movimento_saida_id: string;
  numero_onda: number;
  pedidos: string;
  tipo_venda: string;
  prioridade: string;
  status: string;
}

export function SeparacaoIniciarPage({ onNavigate }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const result = useResultDialog({ coletorMode: true });
  const { isOnline, cacheData, getCachedData } = useOffline();

  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const prioridadeOrdem: Record<string, number> = { URGENTE: 0, ALTA: 1, NORMAL: 2, BAIXA: 3 };

  const fetchOndas = useCallback(async (): Promise<OndaResumo[]> => {
    const { data, error } = await supabase.rpc("separacao_buscar_ondas" as any, {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_usuario_id: usuarioId,
    });
    if (error) throw error;
    const parsed = Array.isArray(data) ? data : typeof data === "string" ? JSON.parse(data) : [];
    parsed.sort((a: any, b: any) => {
      const pa = prioridadeOrdem[(a.prioridade || "NORMAL").toUpperCase()] ?? 2;
      const pb = prioridadeOrdem[(b.prioridade || "NORMAL").toUpperCase()] ?? 2;
      if (pa !== pb) return pa - pb;
      return (a.numero_onda || 0) - (b.numero_onda || 0);
    });
    return parsed as OndaResumo[];
  }, [tenantId, empresaId, usuarioId]);

  const { data, loading, isFromCache, error, refetch } = useOfflineCache<OndaResumo[]>(
    `ondas_separacao_${empresaId}`,
    fetchOndas,
    30,
  );
  const ondas = data ?? [];

  const [pedcanPorOnda, setPedcanPorOnda] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!isOnline || ondas.length === 0 || !tenantId || !usuarioId) return;
    let cancelado = false;
    (async () => {
      const entries = await Promise.all(
        ondas.map(async (o) => {
          try {
            const { data, error } = await supabase.rpc("separacao_verificar_itens_cancelados" as any, {
              p_tenant_id: tenantId,
              p_movimento_saida_id: o.movimento_saida_id,
              p_usuario_id: usuarioId,
            });
            if (error) return null;
            const r: any = typeof data === "string" ? JSON.parse(data) : data;
            if (r?.tem_itens_cancelados && r.itens?.length > 0) return [o.movimento_saida_id, r] as const;
            return null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelado) return;
      const map: Record<string, any> = {};
      entries.forEach((e) => { if (e) map[e[0]] = e[1]; });
      setPedcanPorOnda(map);
    })();
    return () => { cancelado = true; };
  }, [data, isOnline, tenantId, usuarioId]);

  useEffect(() => {
    if (error) result.showWarning("Não foi possível carregar as ondas.");
  }, [error]);

  const loadOndas = refetch;

  const irParaEntregaCancelados = (movimentoSaidaId: string, resultado: any) => {
    sessionStorage.setItem("coletor_separacao_cancel_itens", JSON.stringify(resultado.itens || []));
    sessionStorage.setItem("coletor_separacao_cancel_endereco", resultado.endereco_cancelamento || "");
    sessionStorage.setItem("coletor_separacao_cancel_endereco_id", resultado.endereco_cancelamento_id || "");
    sessionStorage.setItem("coletor_separacao_cancel_docs", JSON.stringify(resultado.documentos_cancelados || []));
    sessionStorage.setItem("coletor_separacao_cancel_movimento_id", movimentoSaidaId);
    onNavigate("/coletor/separacao/cancelamento-entrega");
  };

  const handleIniciar = async () => {

    if (!selectedId) return;
    const onda = ondas.find((o) => o.movimento_saida_id === selectedId);
    if (!onda) return;

    // Onda com itens cancelados pendentes → devolução ao endereço de cancelamento
    const pendencia = pedcanPorOnda[selectedId];
    if (pendencia) {
      irParaEntregaCancelados(selectedId, pendencia);
      return;
    }



    setStarting(true);
    const cacheKey = `tarefas_separacao_${selectedId}`;
    try {
      let tarefas: any[] = [];

      if (!isOnline) {
        const cached = await getCachedData<any[]>(cacheKey);
        if (!cached || cached.length === 0) {
          result.showWarning("Sem conexão e sem tarefas em cache para esta onda.");
          return;
        }
        tarefas = cached;
      } else {
        const { data, error } = await supabase.rpc("separacao_buscar_tarefas" as any, {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_movimento_saida_id: selectedId,
          p_usuario_id: usuarioId,
        });
        if (error) throw error;

        let rpcResult: any = data;
        if (typeof data === "string") {
          try { rpcResult = JSON.parse(data); } catch { /* keep as is */ }
        }

        if (rpcResult && typeof rpcResult === "object" && !Array.isArray(rpcResult) && rpcResult.sucesso === false) {
          result.showWarning(rpcResult.mensagem || "Erro ao buscar tarefas");
          return;
        }

        tarefas = Array.isArray(rpcResult) ? rpcResult : [];
        await cacheData(cacheKey, tarefas, 120).catch(() => {});
      }

      sessionStorage.setItem("coletor_separacao_movimento_id", selectedId);
      sessionStorage.setItem("coletor_separacao_numero_onda", String(onda.numero_onda));
      sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify(tarefas));
      sessionStorage.setItem("coletor_separacao_tarefa_idx", "0");

      // Pré-cache dos EANs dos produtos desta onda (não bloqueante)
      if (isOnline) {
        void (async () => {
          try {
            const produtoIds = [...new Set(tarefas.map((t: any) => t.produto_id).filter(Boolean))];
            if (produtoIds.length === 0) return;
            const { data: eans } = await (supabase as any)
              .from("produto_embalagem")
              .select("ean, fator, embalagem, produto_id")
              .in("produto_id", produtoIds);
            if (eans && eans.length > 0) {
              const { saveEanBatchToCache } = await import("@/lib/offlineEanCache");
              await saveEanBatchToCache(eans);
            }
          } catch { /* non-blocking */ }
        })();
      }


      if (tarefas.length === 0) {
        result.showWarning("Nenhuma tarefa pendente para esta onda.");
        return;
      }

      result.showSuccess(`Separação da Onda #${onda.numero_onda} iniciada com ${tarefas.length} tarefa(s)!`, {
        onClose: () => onNavigate("/coletor/separacao/endereco"),
      });
    } catch (err: unknown) {
      result.showError(err, { context: "separacao-iniciar" });
    } finally {
      setStarting(false);
    }
  };

  const getPrioridadeColor = (p: string) => {
    const upper = (p || "").toUpperCase();
    if (upper === "ALTA" || upper === "URGENTE") return "text-red-400 bg-red-500/15 border-red-500/30";
    if (upper === "MEDIA") return "text-yellow-400 bg-yellow-500/15 border-yellow-500/30";
    return "text-blue-400 bg-blue-500/15 border-blue-500/30";
  };

  return (
    <ColetorLayout title="Separação" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs text-[hsl(213,31%,55%)] truncate">Selecione uma onda para iniciar a separação</p>
            {isFromCache && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                <Database size={10} /> Cache
              </span>
            )}
          </div>
          <RefreshListButton onRefresh={loadOndas} />
        </div>


        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
          </div>
        ) : ondas.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma onda liberada para separação.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
            {ondas.map((onda) => (
              <button
                key={onda.movimento_saida_id}
                onClick={() => setSelectedId(onda.movimento_saida_id === selectedId ? null : onda.movimento_saida_id)}
                className={`flex flex-col gap-1.5 p-4 rounded-2xl border transition-all text-left shrink-0 ${
                  pedcanPorOnda[onda.movimento_saida_id]
                    ? "bg-[hsl(222,40%,12%)] border-red-500/30"
                    : selectedId === onda.movimento_saida_id
                    ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                    : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-white font-mono">Onda #{onda.numero_onda}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${getPrioridadeColor(onda.prioridade)}`}>
                      {onda.prioridade}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
                      {onda.status}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-[hsl(213,31%,55%)]">
                  Pedidos: <span className="font-bold text-[hsl(213,31%,91%)]">{onda.pedidos}</span>
                </div>
                <div className="text-xs text-[hsl(213,31%,45%)]">
                  Tipo: <span className="font-medium text-[hsl(213,31%,70%)]">{onda.tipo_venda}</span>
                </div>
                {pedcanPorOnda[onda.movimento_saida_id] && (
                  <div className="flex items-center gap-2 mt-1 pt-2 border-t border-red-500/20">
                    <Ban size={14} className="text-red-400 shrink-0 animate-pulse" />
                    <span className="text-sm text-red-400 font-medium">
                      {(pedcanPorOnda[onda.movimento_saida_id].itens?.length || 0)}{" "}
                      {(pedcanPorOnda[onda.movimento_saida_id].itens?.length || 0) === 1 ? "item cancelado" : "itens cancelados"} — devolução pendente
                    </span>
                  </div>
                )}
              </button>

            ))}
          </div>
        )}

        <div className="shrink-0 pt-1">
          <ActionButton onClick={handleIniciar} disabled={!selectedId} loading={starting}>
            Iniciar Separação
          </ActionButton>
        </div>
      </div>

      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
