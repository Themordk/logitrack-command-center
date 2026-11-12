import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, Loader2, Lock, Truck } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, type OverlayType } from "@/components/coletor/StatusOverlay";
import { StickyFooter } from "@/components/coletor/StickyFooter";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import { parseError } from "@/lib/errorMapper";
import { CargaRpcError, cargaService, type CargaEmbarque, type UnidadeEmbarqueItem } from "@/lib/cargaService";
import { UNIDADE_EMBARQUE_INSTRUCAO, descreverTransporte, nomeTransportadora } from "@/lib/cargaExibicao";
import { EMBARQUE_CARGA_KEY } from "@/pages/coletor/EmbarqueCargasPage";

interface Props { onNavigate: (path: string) => void; }

/** Códigos que pedem atenção do operador (aviso amarelo) e não erro. */
const AVISOS = new Set(["EMBARQUE_JA_EMBARCADA"]);

export function EmbarqueExecucaoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") ?? "";
  const usuarioId = localStorage.getItem("core_usuario_id") ?? "";
  const cargaId = sessionStorage.getItem(EMBARQUE_CARGA_KEY) ?? "";
  const bloqueado = useOnlineOnlyBlocked();
  const feedback = useFeedback();
  const result = useResultDialog({ coletorMode: true });
  const { showError } = result;

  const [carga, setCarga] = useState<CargaEmbarque | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<string | undefined>();
  const [overlay, setOverlay] = useState<{ tipo: OverlayType; msg?: string }>({ tipo: null });
  const [lista, setLista] = useState<"pendentes" | "embarcadas">("pendentes");
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const emVoo = useRef(false);
  const fecharOverlay = useCallback(() => setOverlay({ tipo: null }), []);

  const carregar = useCallback(async () => {
    if (!cargaId) { onNavigate("/coletor/embarque"); return; }
    try {
      setCarga(await cargaService.obterCargaColetor(tenantId, cargaId, usuarioId));
    } catch (e) {
      showError(e, { context: "embarque-carga", onClose: () => onNavigate("/coletor/embarque") });
    } finally {
      setLoading(false);
    }
  }, [cargaId, tenantId, usuarioId, onNavigate, showError]);

  useEffect(() => { void carregar(); }, [carregar]);

  const pendentes = useMemo(() => (carga?.unidades ?? []).filter((u) => u.status === "PENDENTE"), [carga]);
  const embarcadas = useMemo(() => (carga?.unidades ?? []).filter((u) => u.status === "EMBARCADA"), [carga]);
  const total = carga?.unidades.length ?? 0;
  const completa = total > 0 && pendentes.length === 0;
  const confirmacao = carga?.unidade_embarque === "CONFIRMACAO";
  const aberta = carga?.status === "LIBERADA" || carga?.status === "EM_CARREGAMENTO";

  const embarcar = async (p: { codigo?: string; unidadeId?: string }) => {
    if (emVoo.current || !carga) return;
    emVoo.current = true;
    setEnviando(true);
    if (p.codigo) setUltimo(p.codigo);
    try {
      const r = await cargaService.bipar({ tenantId, cargaId: carga.id, usuarioId, ...p });
      // Atualiza a lista na hora; a releitura em seguida confirma com o servidor.
      setCarga((c) => c && {
        ...c,
        unidades: c.unidades.map((u) => (u.id === r.dados?.unidade_id ? { ...u, status: "EMBARCADA", embarcada_em: new Date().toISOString() } : u)),
      });
      if (r.aviso?.codigo === "EMBARQUE_FORA_DE_ORDEM") {
        feedback.error();
        setOverlay({ tipo: "warning", msg: "Fora da ordem" });
      } else {
        feedback.success();
        setOverlay({ tipo: "success", msg: r.dados?.carga_completa ? "Carga completa!" : "Embarcado" });
      }
      void carregar();
    } catch (e) {
      feedback.error();
      const codigo = e instanceof CargaRpcError ? e.codigo : "";
      if (AVISOS.has(codigo)) {
        setOverlay({ tipo: "warning", msg: "Já embarcado" });
      } else if (codigo === "EMBARQUE_UNIDADE_OUTRA_CARGA" || codigo === "EMBARQUE_CODIGO_NAO_ENCONTRADO") {
        setOverlay({ tipo: "error", msg: codigo === "EMBARQUE_UNIDADE_OUTRA_CARGA" ? "Outra carga!" : "Não pertence" });
        const p2 = parseError(e, "embarque-bipar");
        result.showWarning(p2.title, { details: p2.details, instruction: p2.instruction });
      } else {
        result.showError(e, { context: "embarque-bipar" });
      }
    } finally {
      emVoo.current = false;
      setEnviando(false);
    }
  };

  const fechar = async () => {
    if (!carga) return;
    setEnviando(true);
    try {
      const r = await cargaService.fechar(tenantId, carga.id, usuarioId);
      feedback.success();
      sessionStorage.removeItem(EMBARQUE_CARGA_KEY);
      result.showSuccess(r.mensagem ?? `Carga #${carga.numero_carga} fechada.`, {
        details: "Avise o supervisor para imprimir o romaneio e colher a assinatura do motorista.",
        onClose: () => onNavigate("/coletor/embarque"),
      });
    } catch (e) {
      feedback.error();
      result.showError(e, { context: "embarque-fechar" });
      void carregar();
    } finally {
      setEnviando(false);
      setConfirmarFechar(false);
    }
  };

  const itemLista = (u: UnidadeEmbarqueItem, destaque: boolean) => (
    <li key={u.id} className={`flex items-center gap-3 px-3 py-3 rounded-xl border ${
      destaque ? "border-[hsl(217,91%,50%)] bg-[hsl(217,91%,50%)]/10" : "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]"}`}>
      <span className="w-8 h-8 rounded-full bg-[hsl(222,35%,20%)] text-white text-sm font-bold flex items-center justify-center shrink-0" aria-label={`Ordem ${u.sequencia}`}>
        {u.sequencia}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-white truncate font-mono">{u.descricao ?? u.codigo}</p>
        <p className="text-sm text-[hsl(213,31%,65%)] truncate">
          Pedido {u.numero_pedido ?? "—"} · {u.parceiro ?? "—"}{u.cidade ? ` · ${u.cidade}` : ""}
        </p>
      </div>
      {u.status === "EMBARCADA" ? (
        <CheckCircle2 size={22} className="text-[#22C55E] shrink-0" aria-label="Embarcada" />
      ) : confirmacao && aberta ? (
        <button type="button" onClick={() => void embarcar({ unidadeId: u.id })} disabled={enviando || bloqueado}
          className="h-12 px-4 rounded-xl bg-[#22C55E] text-white text-sm font-bold active:scale-95 disabled:opacity-40 shrink-0"
          aria-label={`Confirmar embarque do ${u.descricao ?? u.codigo}`}>
          Confirmar
        </button>
      ) : (
        <Circle size={22} className="text-[hsl(213,31%,40%)] shrink-0" aria-label="Pendente" />
      )}
    </li>
  );

  return (
    <ColetorLayout
      title="Embarque"
      titleBadge={carga ? <span className="text-sm font-mono font-bold text-white/90">#{carga.numero_carga}</span> : undefined}
      onNavigate={onNavigate}
      showBack
      backPath="/coletor/embarque"
    >
      <OnlineOnlyNotice flow="O embarque" />
      {loading || !carga ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" aria-label="Carregando carga" />
        </div>
      ) : (
        <>
          {/* Progresso */}
          <div className="shrink-0 rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-sm text-[hsl(213,31%,70%)]">
                <Truck size={16} aria-hidden="true" />{descreverTransporte({
                  modalidade: carga.modalidade, veiculo: carga.veiculo?.descricao,
                  transportadora: nomeTransportadora(carga.transportadora), placa: carga.placa,
                })}
              </span>
              <span className="text-lg font-bold font-mono text-white">{embarcadas.length}/{total}</span>
            </div>
            <div className="h-3 rounded-full bg-[hsl(222,35%,20%)] overflow-hidden" role="progressbar"
              aria-label="Unidades embarcadas" aria-valuemin={0} aria-valuemax={total} aria-valuenow={embarcadas.length}>
              <div className="h-full bg-[#22C55E] transition-all" style={{ width: `${total ? (embarcadas.length / total) * 100 : 0}%` }} />
            </div>
            {carga.unidade_embarque && (
              <p className="text-sm text-[hsl(213,31%,60%)] mt-2">{UNIDADE_EMBARQUE_INSTRUCAO[carga.unidade_embarque]}</p>
            )}
          </div>

          {aberta && !completa && (
            <ScanField
              label={confirmacao ? "Bipe o pedido (opcional)" : "Bipe a unidade"}
              lastScanned={ultimo}
              onScan={(codigo) => void embarcar({ codigo })}
              disabled={enviando || bloqueado}
            />
          )}

          {/* Próxima unidade esperada pela ordem da carga */}
          {carga.proxima && !completa && (
            <div className="shrink-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(213,31%,55%)] mb-1.5">Próxima na ordem</p>
              <ul>{itemLista(pendentes[0] ?? carga.proxima, true)}</ul>
              <p className="text-xs text-[hsl(213,31%,55%)] mt-1.5">A lista abaixo mostra as demais pendentes, na ordem da carga.</p>
            </div>
          )}

          {completa && aberta && (
            <div className="shrink-0 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 p-4 flex items-center gap-3">
              <CheckCircle2 size={28} className="text-[#22C55E] shrink-0" aria-hidden="true" />
              <div>
                <p className="text-base font-bold text-white">Todas as unidades embarcadas</p>
                <p className="text-sm text-[hsl(213,31%,70%)]">
                  {(carga.pendencias_fechamento ?? []).length > 0
                    ? `Antes de fechar, o supervisor precisa informar na Montagem de Carga: ${carga.pendencias_fechamento.join(", ").toLowerCase()}.`
                    : "Feche a carga para concluir as ondas."}
                </p>
              </div>
            </div>
          )}

          {/* Lista */}
          <div className="flex gap-2 shrink-0" role="tablist" aria-label="Unidades da carga">
            {(["pendentes", "embarcadas"] as const).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={lista === k} onClick={() => setLista(k)}
                className={`flex-1 h-12 rounded-xl border text-sm font-semibold ${
                  lista === k ? "border-[hsl(217,91%,50%)] bg-[hsl(217,91%,50%)]/15 text-white" : "border-[hsl(222,35%,22%)] text-[hsl(213,31%,65%)]"}`}>
                {k === "pendentes" ? `Pendentes (${pendentes.length})` : `Embarcadas (${embarcadas.length})`}
              </button>
            ))}
          </div>
          <ul className="flex flex-col gap-2 pb-2">
            {(lista === "pendentes" ? pendentes.slice(1) : [...embarcadas].reverse()).map((u) => itemLista(u, false))}
            {(lista === "pendentes" ? pendentes.slice(1) : embarcadas).length === 0 && (
              <li className="text-center text-sm text-[hsl(213,31%,55%)] py-6">
                {lista === "pendentes" ? (pendentes.length ? "Só falta a próxima unidade acima." : "Nada pendente.") : "Nenhuma unidade embarcada ainda."}
              </li>
            )}
          </ul>

          {aberta && (
            <StickyFooter>
              {confirmarFechar ? (
                <div className="flex gap-2">
                  <ActionButton variant="secondary" onClick={() => setConfirmarFechar(false)} disabled={enviando}>Voltar</ActionButton>
                  <ActionButton variant="success" onClick={() => void fechar()} loading={enviando}>Confirmar</ActionButton>
                </div>
              ) : (
                <ActionButton variant="success" onClick={() => setConfirmarFechar(true)} disabled={!completa || enviando || bloqueado}>
                  <Lock size={18} aria-hidden="true" /> {completa ? "Fechar carga" : `Faltam ${pendentes.length} unidade(s)`}
                </ActionButton>
              )}
            </StickyFooter>
          )}
        </>
      )}

      <StatusOverlay type={overlay.tipo} message={overlay.msg} onDone={fecharOverlay} />
      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
