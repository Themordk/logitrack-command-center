/**
 * Módulo de Entregas — paradas de uma entrega, na ordem de entrega (vinda do servidor).
 * Verde = entregue, vermelho = não entregue, destaque = próxima (proxima_parada_id).
 */
import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { entregaService, type EntregaDetalhe } from "@/lib/entregaService";
import { ENTREGA_STATUS_LABEL, PARADA_STATUS_LABEL, avisoCargaNaoFechada, enderecoLinha1, enderecoLinha2, formatarHora } from "@/lib/entregaExibicao";
import { ENTREGA_CACHE_MIN, ENTREGA_ID_KEY, chaveCacheEntrega } from "@/pages/coletor/EntregasListPage";
import { useOffline } from "@/contexts/OfflineContext";

interface Props { onNavigate: (path: string) => void; }

export const ENTREGA_PARADA_ID_KEY = "coletor_entrega_parada_id";

export function EntregaParadasPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") ?? "";
  const usuarioId = localStorage.getItem("core_usuario_id") ?? "";
  const entregaId = sessionStorage.getItem(ENTREGA_ID_KEY) ?? "";
  const bloqueado = useOnlineOnlyBlocked();
  const result = useResultDialog({ coletorMode: true });
  const { showError } = result;
  const { cacheData, getCachedData } = useOffline();

  const [entrega, setEntrega] = useState<EntregaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    if (!entregaId) { onNavigate("/coletor/entregas"); return; }
    if (bloqueado) {
      const cache = await getCachedData<EntregaDetalhe>(chaveCacheEntrega(entregaId));
      if (cache) setEntrega(cache);
      setLoading(false);
      return;
    }
    try {
      const d = await entregaService.detalhe(tenantId, usuarioId, entregaId);
      setEntrega(d);
      void cacheData(chaveCacheEntrega(entregaId), d, ENTREGA_CACHE_MIN);
    } catch (e) {
      showError(e, { context: "entregas-paradas", onClose: () => onNavigate("/coletor/entregas") });
    } finally {
      setLoading(false);
    }
  }, [tenantId, usuarioId, entregaId, bloqueado, showError, onNavigate, cacheData, getCachedData]);

  useEffect(() => { void carregar(); }, [carregar]);

  const abrirParada = (id: string) => {
    sessionStorage.setItem(ENTREGA_PARADA_ID_KEY, id);
    onNavigate("/coletor/entregas/parada");
  };

  const finalizadas = entrega ? entrega.paradas_entregues + entrega.paradas_nao_entregues : 0;
  const pct = entrega && entrega.total_paradas > 0 ? (finalizadas / entrega.total_paradas) * 100 : 0;

  return (
    <ColetorLayout title={entrega ? `Carga #${entrega.numero_carga}` : "Paradas"} onNavigate={onNavigate} showBack backPath="/coletor/entregas">
      <OnlineOnlyNotice flow="Aceitar, confirmar entrega ou registrar ocorrência" />
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" aria-label="Carregando paradas" />
        </div>
      ) : entrega && (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="shrink-0 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-[hsl(213,31%,55%)]">
                {finalizadas} de {entrega.total_paradas} finalizadas · {ENTREGA_STATUS_LABEL[entrega.status]}
              </p>
              <RefreshListButton onRefresh={carregar} />
            </div>
            <div className="h-1.5 rounded-full bg-[hsl(222,35%,20%)] overflow-hidden" role="progressbar"
              aria-valuemin={0} aria-valuemax={entrega.total_paradas} aria-valuenow={finalizadas} aria-label="Paradas finalizadas">
              <div className="h-full bg-[hsl(217,91%,55%)]" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {avisoCargaNaoFechada(entrega) && (
            <div className="shrink-0 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs text-sky-200">
              {avisoCargaNaoFechada(entrega)} Confira com a expedição antes de sair.
            </div>
          )}

          {entrega.status === "AGUARDANDO_ACEITE" && (
            <div className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Aceite a carga na lista de entregas para liberar as confirmações.
            </div>
          )}

          <ol className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto" aria-label="Paradas na ordem de entrega">
            {entrega.paradas.map((p) => {
              const proxima = p.id === entrega.proxima_parada_id;
              const entregue = p.status === "ENTREGUE";
              const nao = p.status === "NAO_ENTREGUE";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => abrirParada(p.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all active:scale-[0.99] ${
                      proxima ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)] border-2"
                        : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"}`}
                  >
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold border ${
                      entregue ? "bg-green-500/15 border-green-500 text-green-400"
                        : nao ? "bg-red-500/15 border-red-500 text-red-400"
                        : proxima ? "bg-[hsl(217,91%,50%)]/20 border-[hsl(217,91%,60%)] text-white"
                        : "border-[hsl(222,35%,32%)] text-[hsl(213,31%,80%)]"}`}
                      aria-hidden="true">
                      {entregue ? <Check size={16} /> : nao ? <X size={16} /> : p.sequencia}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold text-white truncate">{p.parceiro_nome ?? "Cliente"}</span>
                      <span className="block text-xs text-[hsl(213,31%,60%)] truncate">
                        {entregue ? `Entregue ${formatarHora(p.entregue_em)}`
                          : nao ? `Não entregue${p.ocorrencia?.motivo ? ` · ${p.ocorrencia.motivo}` : ""}`
                          : `${proxima ? "Próxima · " : ""}${enderecoLinha1(p)}`}
                      </span>
                      {!entregue && !nao && enderecoLinha2(p) && (
                        <span className="block text-[11px] text-[hsl(213,31%,48%)] truncate">{enderecoLinha2(p)}</span>
                      )}
                      {!entregue && !nao && (p.numero_nf || p.observacao_pedido) && (
                        <span className="block text-[11px] text-[hsl(213,31%,48%)] truncate">
                          {p.numero_nf ? `NF ${p.numero_nf}` : ""}{p.numero_nf && p.observacao_pedido ? " · " : ""}
                          {p.observacao_pedido && <span className="text-amber-300">Tem observação</span>}
                        </span>
                      )}
                    </span>
                    <span className="sr-only">{PARADA_STATUS_LABEL[p.status]}</span>
                  </button>
                </li>
              );
            })}
          </ol>

          {entrega.status === "CONCLUIDA" && (
            <div className="shrink-0 flex flex-col gap-2">
              <p className="text-sm text-center text-green-400 font-semibold">Todas as paradas foram finalizadas.</p>
              <ActionButton variant="secondary" onClick={() => onNavigate("/coletor/entregas")}>Voltar às entregas</ActionButton>
            </div>
          )}
        </div>
      )}
      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
