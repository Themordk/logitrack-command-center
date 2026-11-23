/**
 * Módulo de Entregas — lista "Minhas entregas" do coletor (aguardando aceite no topo, depois em rota).
 * Aceitar grava aceita_em no servidor (entrega_aceitar); antes do aceite nada é liberado.
 */
import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, MapPinned, Truck } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { StatusOverlay, type OverlayType } from "@/components/coletor/StatusOverlay";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import { avisarEntregasAtualizadas } from "@/hooks/useEntregaPendenteAlerta";
import { entregaService, type EntregaResumo } from "@/lib/entregaService";
import { obterPosicao } from "@/lib/entregaFoto";
import { ENTREGA_STATUS_LABEL, formatarHora } from "@/lib/entregaExibicao";

interface Props { onNavigate: (path: string) => void; }

export const ENTREGA_ID_KEY = "coletor_entrega_id";

export function EntregasListPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") ?? "";
  const usuarioId = localStorage.getItem("core_usuario_id") ?? "";
  const bloqueado = useOnlineOnlyBlocked();
  const result = useResultDialog({ coletorMode: true });
  const { showError } = result;
  const feedback = useFeedback();

  const [entregas, setEntregas] = useState<EntregaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmarAceite, setConfirmarAceite] = useState<EntregaResumo | null>(null);
  const [aceitando, setAceitando] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState<string>();
  const limparOverlay = useCallback(() => setOverlay(null), []);

  const carregar = useCallback(async () => {
    if (bloqueado) { setLoading(false); return; }
    try {
      setEntregas(await entregaService.minhas(tenantId, usuarioId));
    } catch (e) {
      showError(e, { context: "entregas-lista" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, usuarioId, bloqueado, showError]);

  useEffect(() => { void carregar(); }, [carregar]);
  // Mantém a lista viva enquanto aberta (nova carga atribuída aparece sozinha).
  useEffect(() => {
    const iv = setInterval(() => { void carregar(); }, 30_000);
    return () => clearInterval(iv);
  }, [carregar]);

  const abrir = (e: EntregaResumo) => {
    sessionStorage.setItem(ENTREGA_ID_KEY, e.id);
    onNavigate("/coletor/entregas/paradas");
  };

  const aceitar = async () => {
    if (!confirmarAceite) return;
    setAceitando(true);
    try {
      const posicao = await obterPosicao(4000);
      const r = await entregaService.aceitar(tenantId, usuarioId, confirmarAceite.id, posicao);
      feedback.success();
      avisarEntregasAtualizadas();
      setOverlayMsg(r.mensagem ?? "Carga aceita");
      setOverlay("success");
      const id = confirmarAceite.id;
      setConfirmarAceite(null);
      setTimeout(() => {
        sessionStorage.setItem(ENTREGA_ID_KEY, id);
        onNavigate("/coletor/entregas/paradas");
      }, 900);
    } catch (e) {
      feedback.error();
      setConfirmarAceite(null);
      showError(e, { context: "entregas-aceitar" });
      void carregar();
    } finally {
      setAceitando(false);
    }
  };

  return (
    <ColetorLayout title="Minhas entregas" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <OnlineOnlyNotice flow="As entregas" />
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <p className="text-xs text-[hsl(213,31%,55%)] truncate min-w-0">Cargas atribuídas a você</p>
          <RefreshListButton onRefresh={carregar} />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" aria-label="Carregando entregas" />
          </div>
        ) : entregas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <Truck size={32} className="text-[hsl(213,31%,45%)]" aria-hidden="true" />
            <p className="text-sm font-semibold text-white">Nenhuma entrega para você agora.</p>
            <p className="text-xs text-[hsl(213,31%,55%)]">
              Quando uma carga do seu veículo for carregada, ela aparece aqui e o coletor avisa com som.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto" aria-label="Entregas">
            {entregas.map((e) => {
              const aguardando = e.status === "AGUARDANDO_ACEITE";
              const finalizadas = e.paradas_entregues + e.paradas_nao_entregues;
              const pct = e.total_paradas > 0 ? Math.round((finalizadas / e.total_paradas) * 100) : 0;
              return (
                <div
                  key={e.id}
                  className={`flex flex-col gap-2 p-4 rounded-2xl border shrink-0 ${
                    aguardando ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]" : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-white font-mono">Carga #{e.numero_carga}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
                      aguardando ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-blue-500/15 text-blue-300 border-blue-500/30"}`}>
                      {ENTREGA_STATUS_LABEL[e.status]}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)] min-w-0">
                    <Truck size={12} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      <span className="font-bold text-[hsl(213,31%,91%)]">{e.veiculo ?? "—"}</span>{e.placa ? ` · ${e.placa}` : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)]">
                    <MapPinned size={12} className="shrink-0" aria-hidden="true" />
                    <span>{e.total_paradas} {e.total_paradas === 1 ? "parada" : "paradas"}</span>
                    <Clock size={12} className="shrink-0 ml-2" aria-hidden="true" />
                    <span>{aguardando ? `Atribuída ${formatarHora(e.atribuida_em)}` : `Aceita ${formatarHora(e.aceita_em)}`}</span>
                  </div>
                  {!aguardando && (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-[hsl(222,35%,20%)] overflow-hidden" aria-hidden="true">
                        <div className="h-full bg-[#22C55E]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-mono text-white">{finalizadas}/{e.total_paradas}</span>
                    </div>
                  )}
                  {aguardando ? (
                    <ActionButton onClick={() => setConfirmarAceite(e)} disabled={bloqueado}>ACEITAR CARGA</ActionButton>
                  ) : (
                    <ActionButton variant="secondary" onClick={() => abrir(e)}>Ver paradas</ActionButton>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmarAceite && (
        <div className="fixed inset-0 z-[60] bg-black/60 flex items-end" role="dialog" aria-modal="true" aria-labelledby="aceite-titulo">
          <div className="w-full bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-2xl p-4 flex flex-col gap-3">
            <p id="aceite-titulo" className="text-base font-bold text-white">
              Aceitar a carga #{confirmarAceite.numero_carga} com {confirmarAceite.total_paradas} {confirmarAceite.total_paradas === 1 ? "parada" : "paradas"}?
            </p>
            <p className="text-xs text-[hsl(213,31%,55%)]">O horário do aceite fica registrado e as entregas são liberadas.</p>
            <ActionButton onClick={aceitar} loading={aceitando}>Aceitar</ActionButton>
            <ActionButton variant="secondary" onClick={() => setConfirmarAceite(null)} disabled={aceitando}>Voltar</ActionButton>
          </div>
        </div>
      )}

      <StatusOverlay type={overlay} message={overlayMsg} onDone={limparOverlay} duration={900} />
      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
