import { useCallback, useEffect, useState } from "react";
import { Loader2, Truck, Warehouse, User } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { cargaService, type CargaColetor } from "@/lib/cargaService";
import { CARGA_STATUS_LABEL, UNIDADE_EMBARQUE_LABEL, descreverTransporte, PRIORIDADE_TOM } from "@/lib/cargaExibicao";

interface Props { onNavigate: (path: string) => void; }

export const EMBARQUE_CARGA_KEY = "coletor_embarque_carga_id";

export function EmbarqueCargasPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") ?? "";
  const empresaId = localStorage.getItem("core_empresa_id") ?? "";
  const usuarioId = localStorage.getItem("core_usuario_id") ?? "";
  const bloqueado = useOnlineOnlyBlocked();
  const result = useResultDialog({ coletorMode: true });
  const { showError } = result;

  const [cargas, setCargas] = useState<CargaColetor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (bloqueado) { setLoading(false); return; }
    try {
      const lista = await cargaService.buscarCargasColetor(tenantId, empresaId, usuarioId);
      setCargas(lista);
      setSelecionada((s) => (s && lista.some((c) => c.id === s) ? s : null));
    } catch (e) {
      showError(e, { context: "embarque-cargas" });
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId, usuarioId, bloqueado, showError]);

  useEffect(() => { void carregar(); }, [carregar]);

  const iniciar = () => {
    if (!selecionada) return;
    sessionStorage.setItem(EMBARQUE_CARGA_KEY, selecionada);
    onNavigate("/coletor/embarque/carga");
  };

  return (
    <ColetorLayout title="Embarque" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <OnlineOnlyNotice flow="O embarque" />
      <div className="flex flex-col gap-3 flex-1 min-h-0">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <p className="text-sm text-[hsl(213,31%,60%)]">Selecione a carga que você vai carregar</p>
          <RefreshListButton onRefresh={carregar} />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" aria-label="Carregando cargas" />
          </div>
        ) : cargas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <Truck size={36} className="text-[hsl(213,31%,45%)]" aria-hidden="true" />
            <p className="text-base font-semibold text-white">Nenhuma carga liberada</p>
            <p className="text-sm text-[hsl(213,31%,60%)]">
              As cargas aparecem aqui quando o supervisor libera na tela Montagem de Carga.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto" role="listbox" aria-label="Cargas para embarque">
            {cargas.map((c) => {
              const ativa = c.id === selecionada;
              const pct = c.unidades_total > 0 ? Math.round((c.unidades_embarcadas / c.unidades_total) * 100) : 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={ativa}
                  onClick={() => setSelecionada(ativa ? null : c.id)}
                  className={`flex flex-col gap-2 p-4 rounded-2xl border text-left shrink-0 transition-all min-h-[48px] ${
                    ativa ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]" : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="text-lg font-bold text-white font-mono">Carga #{c.numero_carga}</span>
                      {c.prioridade && c.prioridade !== "NORMAL" && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded border font-semibold ${PRIORIDADE_TOM[c.prioridade]}`}>{c.prioridade}</span>
                      )}
                      {c.convocado && <span className="text-[11px] px-1.5 py-0.5 rounded border border-[hsl(217,91%,50%)]/50 text-[hsl(217,91%,70%)]">Sua</span>}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${
                      c.status === "EM_CARREGAMENTO" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" : "bg-blue-500/15 text-blue-400 border-blue-500/30"}`}>
                      {CARGA_STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1 text-sm text-[hsl(213,31%,70%)]">
                    <span className="flex items-center gap-1.5"><Truck size={14} aria-hidden="true" />{descreverTransporte(c)}</span>
                    <span className="flex items-center gap-1.5"><Warehouse size={14} aria-hidden="true" />Box: {c.box ?? "—"}</span>
                    {c.motorista && <span className="flex items-center gap-1.5"><User size={14} aria-hidden="true" />{c.motorista}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full bg-[hsl(222,35%,20%)] overflow-hidden">
                      <div className="h-full bg-[#22C55E]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-mono text-white">{c.unidades_embarcadas}/{c.unidades_total}</span>
                  </div>
                  <span className="text-xs text-[hsl(213,31%,55%)]">
                    {c.documentos} pedido(s) · bipar {c.unidade_embarque ? UNIDADE_EMBARQUE_LABEL[c.unidade_embarque].toLowerCase() : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="shrink-0 pt-1">
          <ActionButton onClick={iniciar} disabled={!selecionada || bloqueado}>Iniciar embarque</ActionButton>
        </div>
      </div>
      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
