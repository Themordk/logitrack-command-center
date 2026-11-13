import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Truck, User, UserRound, Warehouse } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { FilterListButton } from "@/components/coletor/FilterListButton";
import { FiltroCargasSheet } from "@/components/coletor/FiltroCargasSheet";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { cargaService, type CargaColetor } from "@/lib/cargaService";
import {
  CARGA_STATUS_LABEL, FILTROS_CARGA_COLETOR_VAZIOS, PRIORIDADE_TOM, UNIDADE_EMBARQUE_LABEL, contarFiltrosCarga, descreverResponsavelCarga,
  descreverTransporte, filtrarCargasColetor, opcoesFiltroCargas, type FiltrosCargaColetor,
} from "@/lib/cargaExibicao";

interface Props { onNavigate: (path: string) => void; }

export const EMBARQUE_CARGA_KEY = "coletor_embarque_carga_id";
const FILTRO_KEY = "coletor_filtro_cargas_embarque";

function lerFiltros(): FiltrosCargaColetor {
  try {
    const raw = sessionStorage.getItem(FILTRO_KEY);
    return raw ? { ...FILTROS_CARGA_COLETOR_VAZIOS, ...JSON.parse(raw) } : FILTROS_CARGA_COLETOR_VAZIOS;
  } catch {
    return FILTROS_CARGA_COLETOR_VAZIOS;
  }
}

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
  const [filtroOpen, setFiltroOpen] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosCargaColetor>(lerFiltros);

  const aplicarFiltros = useCallback((f: FiltrosCargaColetor) => {
    setFiltros(f);
    setSelecionada(null);
    try {
      if (contarFiltrosCarga(f) === 0) sessionStorage.removeItem(FILTRO_KEY);
      else sessionStorage.setItem(FILTRO_KEY, JSON.stringify(f));
    } catch { /* storage indisponível */ }
  }, []);
  const visiveis = useMemo(() => filtrarCargasColetor(cargas, filtros), [cargas, filtros]);
  const opcoes = useMemo(() => opcoesFiltroCargas(cargas), [cargas]);

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
          <p className="text-xs text-[hsl(213,31%,55%)] truncate min-w-0">Selecione uma carga para iniciar o embarque</p>
          <div className="flex items-center gap-3 shrink-0">
            <FilterListButton onClick={() => setFiltroOpen(true)} activeCount={contarFiltrosCarga(filtros)} />
            <RefreshListButton onRefresh={carregar} />
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" aria-label="Carregando cargas" />
          </div>
        ) : cargas.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
            <Truck size={32} className="text-[hsl(213,31%,45%)]" aria-hidden="true" />
            <p className="text-sm font-semibold text-white">Nenhuma carga liberada para embarque.</p>
            <p className="text-xs text-[hsl(213,31%,55%)]">
              As cargas aparecem aqui quando o supervisor libera na tela Montagem de Carga.
            </p>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma carga corresponde aos filtros.</p>
            <button
              type="button"
              onClick={() => aplicarFiltros(FILTROS_CARGA_COLETOR_VAZIOS)}
              className="h-9 px-4 rounded-xl border border-amber-500/40 text-xs font-medium text-amber-400 active:scale-95 transition-all"
            >
              Limpar filtros
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto" role="listbox" aria-label="Cargas para embarque">
            {visiveis.map((c) => {
              const ativa = c.id === selecionada;
              const pct = c.unidades_total > 0 ? Math.round((c.unidades_embarcadas / c.unidades_total) * 100) : 0;
              const resp = descreverResponsavelCarga(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={ativa}
                  onClick={() => setSelecionada(ativa ? null : c.id)}
                  className={`flex flex-col gap-1.5 p-4 rounded-2xl border text-left shrink-0 transition-all ${
                    ativa ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                      : resp.tom === "VOCE" ? "bg-[hsl(222,40%,12%)] border-emerald-500/40"
                      : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-bold text-white font-mono">Carga #{c.numero_carga}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PRIORIDADE_TOM[c.prioridade] ?? PRIORIDADE_TOM.NORMAL}`}>
                        {c.prioridade ?? "NORMAL"}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                        c.status === "EM_CARREGAMENTO" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" : "bg-blue-500/15 text-blue-400 border-blue-500/30"}`}>
                        {CARGA_STATUS_LABEL[c.status]}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)] min-w-0">
                    <Truck size={12} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">Veículo: <span className="font-bold text-[hsl(213,31%,91%)]">{descreverTransporte(c)}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)] min-w-0">
                    <Warehouse size={12} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">Box: <span className="font-bold text-[hsl(213,31%,91%)]">{c.box ?? "—"}</span></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[hsl(213,31%,55%)] min-w-0">
                    <User size={12} className="shrink-0" aria-hidden="true" />
                    <span className="truncate">Motorista: <span className="font-bold text-[hsl(213,31%,91%)]">{c.motorista || "—"}</span></span>
                  </div>
                  <div className={`flex items-center gap-1.5 text-xs min-w-0 ${
                    resp.tom === "VOCE" ? "text-emerald-400" : resp.tom === "LIVRE" ? "text-blue-400" : "text-[hsl(213,31%,55%)]"}`}>
                    <UserRound size={12} className="shrink-0" aria-hidden="true" />
                    <span className="truncate" title={resp.nomes || undefined}>
                      {resp.prefixo}{resp.nomes && <> <span className={`font-bold ${resp.tom === "OUTROS" ? "text-[hsl(213,31%,91%)]" : ""}`}>{resp.nomes}</span></>}
                    </span>
                    {c.reserva_carga && (
                      <span className="ml-auto shrink-0 flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-[hsl(222,35%,28%)] text-[hsl(213,31%,70%)]">
                        <Lock size={9} aria-hidden="true" /> 1 operador
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-0.5">
                    <div className="h-1.5 flex-1 rounded-full bg-[hsl(222,35%,20%)] overflow-hidden" aria-hidden="true">
                      <div className="h-full bg-[#22C55E]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-mono text-white" aria-label={`${c.unidades_embarcadas} de ${c.unidades_total} volumes embarcados`}>
                      {c.unidades_embarcadas}/{c.unidades_total}
                    </span>
                  </div>
                  <div className="text-xs text-[hsl(213,31%,45%)]">
                    Pedidos: <span className="font-medium text-[hsl(213,31%,70%)]">{c.documentos}</span>
                    {" · "}bipar <span className="font-medium text-[hsl(213,31%,70%)]">{c.unidade_embarque ? UNIDADE_EMBARQUE_LABEL[c.unidade_embarque].toLowerCase() : "—"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="shrink-0 pt-1">
          <ActionButton onClick={iniciar} disabled={!selecionada || bloqueado}>Iniciar embarque</ActionButton>
        </div>
      </div>

      <FiltroCargasSheet
        open={filtroOpen}
        onClose={() => setFiltroOpen(false)}
        filters={filtros}
        opcoes={opcoes}
        onApply={aplicarFiltros}
        onClear={() => aplicarFiltros(FILTROS_CARGA_COLETOR_VAZIOS)}
      />
      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
