/**
 * Fluxo de Expedição · F6.4 — execução do embarque no coletor.
 * 1) Confirmar o veículo pelo QR da etiqueta (quando o tipo de saída exige);
 * 2) Conferir volume a volume (pedido mostra conferidos/total; pedido sem volume gera os volumes aqui);
 * 3) Fechar a carga. Todas as regras vêm das RPCs embarque_* (cargaService).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, Keyboard, Loader2, Lock, Package, PackagePlus, QrCode, Truck } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, type OverlayType } from "@/components/coletor/StatusOverlay";
import { StickyFooter } from "@/components/coletor/StickyFooter";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import { useSolicitarImpressao } from "@/hooks/useSolicitarImpressao";
import { parseError } from "@/lib/errorMapper";
import {
  CargaRpcError, cargaService, type CargaDocumento, type CargaEmbarque, type UnidadeEmbarqueItem,
} from "@/lib/cargaService";
import { descreverTransporte, nomeTransportadora, proximoPedidoEmbarque, situacaoPedidoEmbarque } from "@/lib/cargaExibicao";
import { EMBARQUE_CARGA_KEY } from "@/pages/coletor/EmbarqueCargasPage";

interface Props { onNavigate: (path: string) => void; }

/** Códigos que pedem atenção do operador (aviso amarelo) e não erro. */
const AVISOS = new Set(["EMBARQUE_JA_EMBARCADA"]);
const RECUSAS_LEITURA = new Set(["EMBARQUE_UNIDADE_OUTRA_CARGA", "EMBARQUE_CODIGO_NAO_ENCONTRADO", "EMBARQUE_LEITURA_OBRIGATORIA"]);

const cardBase = "rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]";
const textoFraco = "text-[hsl(213,31%,65%)]";

export function EmbarqueExecucaoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") ?? "";
  const usuarioId = localStorage.getItem("core_usuario_id") ?? "";
  const cargaId = sessionStorage.getItem(EMBARQUE_CARGA_KEY) ?? "";
  const bloqueado = useOnlineOnlyBlocked();
  const feedback = useFeedback();
  const result = useResultDialog({ coletorMode: true });
  const { showError } = result;
  const { solicitar } = useSolicitarImpressao();

  const [carga, setCarga] = useState<CargaEmbarque | null>(null);
  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [ultimo, setUltimo] = useState<string | undefined>();
  const [overlay, setOverlay] = useState<{ tipo: OverlayType; msg?: string }>({ tipo: null });
  const [lista, setLista] = useState<"pendentes" | "embarcadas">("pendentes");
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [gerarPara, setGerarPara] = useState<CargaDocumento | null>(null);
  const [qtdVolumes, setQtdVolumes] = useState("");
  const [digitarAberto, setDigitarAberto] = useState(false);
  const [codigoDigitado, setCodigoDigitado] = useState("");
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
  const pedidos = useMemo(() => [...(carga?.documentos ?? [])].sort((a, b) => a.sequencia - b.sequencia), [carga]);
  const semVolumes = pedidos.filter((d) => d.unidades_total === 0);
  const proximo = proximoPedidoEmbarque(pedidos);
  const total = carga?.unidades.length ?? 0;
  const completa = !!carga && pedidos.length > 0 && !proximo;
  const aberta = carga?.status === "LIBERADA" || carga?.status === "EM_CARREGAMENTO";
  const precisaVeiculo = !!carga?.exige_confirmacao_veiculo && !carga.veiculo_confirmado_em && aberta;
  const etapa = precisaVeiculo ? 1 : completa ? 3 : 2;

  // ---------- 1. veículo ----------
  const confirmarVeiculo = async (codigo: string) => {
    if (emVoo.current || !carga) return;
    emVoo.current = true;
    setEnviando(true);
    try {
      const r = await cargaService.confirmarVeiculo(tenantId, carga.id, usuarioId, codigo);
      feedback.success();
      setOverlay({ tipo: "success", msg: "Veículo confirmado" });
      result.showSuccess(r.mensagem ?? "Veículo confirmado.");
      await carregar();
    } catch (e) {
      feedback.error();
      setOverlay({ tipo: "error", msg: "Veículo errado" });
      result.showError(e, { context: "embarque-veiculo" });
    } finally {
      emVoo.current = false;
      setEnviando(false);
    }
  };

  // ---------- 2. volumes ----------
  const embarcar = async (codigo: string, digitado = false) => {
    if (emVoo.current || !carga) return;
    emVoo.current = true;
    setEnviando(true);
    setUltimo(codigo);
    try {
      const r = await cargaService.bipar({ tenantId, cargaId: carga.id, usuarioId, codigo, digitado });
      // Atualiza na hora; a releitura em seguida confirma com o servidor.
      setCarga((c) => c && {
        ...c,
        unidades: c.unidades.map((u) => (u.id === r.dados?.unidade_id ? { ...u, status: "EMBARCADA", embarcada_em: new Date().toISOString() } : u)),
        documentos: c.documentos.map((d) => {
          const u = c.unidades.find((x) => x.id === r.dados?.unidade_id);
          return u && u.carga_documento_id === d.carga_documento_id ? { ...d, unidades_embarcadas: r.dados?.documento_embarcadas ?? d.unidades_embarcadas } : d;
        }),
      });
      if (r.aviso?.codigo === "EMBARQUE_FORA_DE_ORDEM") {
        feedback.error();
        setOverlay({ tipo: "warning", msg: "Fora da ordem" });
      } else {
        feedback.success();
        setOverlay({
          tipo: "success",
          msg: r.dados?.carga_completa ? "Carga completa!"
            : r.dados ? `${r.dados.documento_embarcadas}/${r.dados.documento_total} do pedido` : "Embarcado",
        });
      }
      void carregar();
    } catch (e) {
      feedback.error();
      const codigoErro = e instanceof CargaRpcError ? e.codigo : "";
      if (AVISOS.has(codigoErro)) {
        setOverlay({ tipo: "warning", msg: "Já embarcado" });
      } else if (RECUSAS_LEITURA.has(codigoErro)) {
        setOverlay({ tipo: "error", msg: codigoErro === "EMBARQUE_UNIDADE_OUTRA_CARGA" ? "Outra carga!" : "Não pertence" });
        const p2 = parseError(e, "embarque-bipar");
        result.showWarning(p2.title, { details: p2.details, instruction: p2.instruction });
      } else {
        result.showError(e, { context: "embarque-bipar" });
        if (codigoErro === "EMBARQUE_VEICULO_NAO_CONFIRMADO") void carregar();
      }
    } finally {
      emVoo.current = false;
      setEnviando(false);
    }
  };

  const gerarVolumes = async () => {
    const qtd = Number(qtdVolumes);
    if (!carga || !gerarPara || !Number.isInteger(qtd) || qtd < 1 || qtd > 999) {
      result.showWarning("Quantidade inválida", { instruction: "Informe de 1 a 999 volumes." });
      return;
    }
    setEnviando(true);
    try {
      const r = await cargaService.gerarVolumes(tenantId, carga.id, usuarioId, gerarPara.carga_documento_id, qtd);
      for (const v of r.dados?.volumes ?? []) {
        void solicitar({
          tipoEtiqueta: "VOLUME",
          dados: {
            codigo_volume: v.codigo_volume, numero_volume: String(v.numero_volume), total_volumes: String(v.total_volumes),
            numero_pedido: v.numero_pedido != null ? String(v.numero_pedido) : "",
          },
          origem: "EMBARQUE",
          documentoOrigemId: v.id,
          tipoDocumentoOrigem: "volume_expedicao",
          prioridade: 5,
        });
      }
      feedback.success();
      result.showSuccess(r.mensagem ?? "Volumes gerados.", { details: "As etiquetas foram para a impressora. Cole cada uma e bipe ao carregar." });
      setGerarPara(null);
      setQtdVolumes("");
      await carregar();
    } catch (e) {
      feedback.error();
      result.showError(e, { context: "embarque-gerar-volumes" });
    } finally {
      setEnviando(false);
    }
  };

  // ---------- 3. fechar ----------
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

  // ---------- partes da tela ----------
  const contador = (d: CargaDocumento) => {
    const sit = situacaoPedidoEmbarque(d);
    if (sit === "SEM_VOLUMES") {
      return aberta && !precisaVeiculo ? (
        <button type="button" onClick={() => { setGerarPara(d); setQtdVolumes(""); }} disabled={enviando || bloqueado}
          className="h-12 px-3 rounded-xl bg-[hsl(217,91%,45%)] text-white text-sm font-bold inline-flex items-center gap-1.5 active:scale-95 disabled:opacity-40 shrink-0"
          aria-label={`Gerar volumes do pedido ${d.numero_pedido ?? ""}`}>
          <PackagePlus size={18} aria-hidden="true" /> Gerar volumes
        </button>
      ) : <span className="text-sm text-yellow-400 shrink-0">Sem volumes</span>;
    }
    const cor = sit === "COMPLETO" ? "text-[#22C55E] border-[#22C55E]/40 bg-[#22C55E]/10"
      : sit === "PARCIAL" ? "text-yellow-300 border-yellow-500/40 bg-yellow-500/10"
      : "text-white border-[hsl(222,35%,28%)] bg-[hsl(222,35%,18%)]";
    return (
      <span className={`min-w-[72px] h-12 px-3 rounded-xl border font-mono text-lg font-bold inline-flex items-center justify-center gap-1 shrink-0 ${cor}`}
        aria-label={`${d.unidades_embarcadas} de ${d.unidades_total} volumes conferidos`}>
        {sit === "COMPLETO" && <CheckCircle2 size={16} aria-hidden="true" />}
        {d.unidades_embarcadas}/{d.unidades_total}
      </span>
    );
  };

  const cardPedido = (d: CargaDocumento, destaque: boolean) => (
    <li key={d.carga_documento_id} className={`flex items-center gap-3 px-3 py-3 rounded-xl border ${
      destaque ? "border-[hsl(217,91%,50%)] bg-[hsl(217,91%,50%)]/10" : "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]"}`}>
      <span className="w-8 h-8 rounded-full bg-[hsl(222,35%,20%)] text-white text-sm font-bold flex items-center justify-center shrink-0" aria-label={`Ordem ${d.sequencia}`}>
        {d.sequencia}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-white truncate font-mono">Pedido {d.numero_pedido ?? d.codigo_erp ?? "—"}</p>
        <p className={`text-sm truncate ${textoFraco}`}>{d.parceiro ?? "—"}{d.cidade ? ` · ${d.cidade}` : ""}</p>
      </div>
      {contador(d)}
    </li>
  );

  const itemVolume = (u: UnidadeEmbarqueItem) => (
    <li key={u.id} className={`flex items-center gap-3 px-3 py-2.5 ${cardBase}`}>
      {u.status === "EMBARCADA"
        ? <CheckCircle2 size={20} className="text-[#22C55E] shrink-0" aria-label="Embarcado" />
        : <Circle size={20} className="text-[hsl(213,31%,40%)] shrink-0" aria-label="Pendente" />}
      <div className="min-w-0 flex-1">
        <p className="text-base font-semibold text-white truncate font-mono">{u.codigo}</p>
        <p className={`text-sm truncate ${textoFraco}`}>
          {u.descricao ?? "Volume"} · Pedido {u.numero_pedido ?? "—"}{u.parceiro ? ` · ${u.parceiro}` : ""}
        </p>
      </div>
    </li>
  );

  const passos = [
    ...(carga?.exige_confirmacao_veiculo ? [{ n: 1, rotulo: "Veículo" }] : []),
    { n: 2, rotulo: "Volumes" },
    { n: 3, rotulo: "Fechar" },
  ];

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
          {/* Etapas */}
          <ol className="flex items-center gap-2 shrink-0" aria-label="Etapas do embarque">
            {passos.map((p, i) => {
              const feito = etapa > p.n; const atual = etapa === p.n;
              return (
                <li key={p.n} className="flex items-center gap-2 flex-1 min-w-0" aria-current={atual ? "step" : undefined}>
                  <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                    feito ? "bg-[#22C55E] text-white" : atual ? "bg-[hsl(217,91%,50%)] text-white" : "bg-[hsl(222,35%,20%)] text-[hsl(213,31%,60%)]"}`}>
                    {feito ? <CheckCircle2 size={14} aria-hidden="true" /> : i + 1}
                  </span>
                  <span className={`text-sm truncate ${atual ? "text-white font-semibold" : textoFraco}`}>{p.rotulo}</span>
                </li>
              );
            })}
          </ol>

          {/* Veículo e progresso */}
          <div className={`shrink-0 p-3 ${cardBase}`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`flex items-center gap-1.5 text-sm ${textoFraco}`}>
                <Truck size={16} aria-hidden="true" />{descreverTransporte({
                  modalidade: carga.modalidade, veiculo: carga.veiculo?.descricao,
                  transportadora: nomeTransportadora(carga.transportadora), placa: carga.placa,
                })}
              </span>
              <span className="text-lg font-bold font-mono text-white" aria-label={`${embarcadas.length} de ${total} volumes embarcados`}>
                {embarcadas.length}/{total}
              </span>
            </div>
            <div className="h-3 rounded-full bg-[hsl(222,35%,20%)] overflow-hidden" role="progressbar"
              aria-label="Volumes embarcados" aria-valuemin={0} aria-valuemax={total} aria-valuenow={embarcadas.length}>
              <div className="h-full bg-[#22C55E] transition-all" style={{ width: `${total ? (embarcadas.length / total) * 100 : 0}%` }} />
            </div>
            {carga.veiculo_confirmado_em && (
              <p className="text-sm text-[#22C55E] mt-2 flex items-center gap-1.5">
                <CheckCircle2 size={14} aria-hidden="true" /> Veículo confirmado{carga.veiculo_confirmado_por_nome ? ` por ${carga.veiculo_confirmado_por_nome}` : ""}
              </p>
            )}
            {semVolumes.length > 0 && !precisaVeiculo && (
              <p className="text-sm text-yellow-300 mt-2">
                {semVolumes.length} pedido(s) sem volume: gere os volumes no pedido para imprimir as etiquetas.
              </p>
            )}
          </div>

          {precisaVeiculo ? (
            <>
              <div className={`shrink-0 p-4 flex items-start gap-3 ${cardBase}`}>
                <QrCode size={28} className="text-[hsl(217,91%,60%)] shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-base font-bold text-white">Confirme o veículo</p>
                  <p className={`text-sm ${textoFraco}`}>
                    Bipe o QR da etiqueta do veículo {carga.veiculo?.descricao ?? ""}{carga.veiculo?.placa ? ` (${carga.veiculo.placa})` : ""} para liberar a conferência.
                  </p>
                </div>
              </div>
              <ScanField label="Bipe o QR do veículo" onScan={(c) => void confirmarVeiculo(c)} disabled={enviando || bloqueado} />
            </>
          ) : (
            <>
              {aberta && !completa && total > 0 && (
                <div className="shrink-0 space-y-2">
                  <ScanField label="Bipe a etiqueta do volume" lastScanned={ultimo} onScan={(c) => void embarcar(c)} disabled={enviando || bloqueado} />
                  <button type="button" onClick={() => { setDigitarAberto(true); setCodigoDigitado(""); }} disabled={enviando || bloqueado}
                    className={`w-full h-11 rounded-xl border border-[hsl(222,35%,22%)] text-sm inline-flex items-center justify-center gap-2 ${textoFraco} disabled:opacity-40`}>
                    <Keyboard size={16} aria-hidden="true" /> Etiqueta ilegível? Digitar código
                  </button>
                </div>
              )}

              {completa && aberta && (
                <div className="shrink-0 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/10 p-4 flex items-center gap-3">
                  <CheckCircle2 size={28} className="text-[#22C55E] shrink-0" aria-hidden="true" />
                  <div>
                    <p className="text-base font-bold text-white">Todos os volumes embarcados</p>
                    <p className={`text-sm ${textoFraco}`}>
                      {(carga.pendencias_fechamento ?? []).length > 0
                        ? `Antes de fechar, o supervisor precisa informar na Montagem de Carga: ${carga.pendencias_fechamento.join(", ").toLowerCase()}.`
                        : "Feche a carga para concluir as ondas."}
                    </p>
                  </div>
                </div>
              )}

              {/* Pedidos: volumes conferidos / total */}
              <section className="shrink-0" aria-label="Pedidos da carga">
                <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(213,31%,55%)] mb-1.5">Pedidos na ordem da carga</p>
                <ul className="flex flex-col gap-2">{pedidos.map((d) => cardPedido(d, d.carga_documento_id === proximo?.carga_documento_id))}</ul>
              </section>

              {/* Volumes */}
              <div className="flex gap-2 shrink-0" role="tablist" aria-label="Volumes da carga">
                {(["pendentes", "embarcadas"] as const).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={lista === k} onClick={() => setLista(k)}
                    className={`flex-1 h-12 rounded-xl border text-sm font-semibold ${
                      lista === k ? "border-[hsl(217,91%,50%)] bg-[hsl(217,91%,50%)]/15 text-white" : `border-[hsl(222,35%,22%)] ${textoFraco}`}`}>
                    {k === "pendentes" ? `Pendentes (${pendentes.length})` : `Embarcados (${embarcadas.length})`}
                  </button>
                ))}
              </div>
              <ul className="flex flex-col gap-2 pb-2">
                {(lista === "pendentes" ? pendentes : [...embarcadas].reverse()).map(itemVolume)}
                {(lista === "pendentes" ? pendentes : embarcadas).length === 0 && (
                  <li className="text-center text-sm text-[hsl(213,31%,55%)] py-6 flex flex-col items-center gap-2">
                    <Package size={22} aria-hidden="true" />
                    {lista === "pendentes"
                      ? (semVolumes.length ? "Nenhum volume pendente. Gere os volumes dos pedidos acima." : "Nada pendente.")
                      : "Nenhum volume embarcado ainda."}
                  </li>
                )}
              </ul>
            </>
          )}

          {aberta && !precisaVeiculo && (
            <StickyFooter>
              {confirmarFechar ? (
                <div className="flex gap-2">
                  <ActionButton variant="secondary" onClick={() => setConfirmarFechar(false)} disabled={enviando}>Voltar</ActionButton>
                  <ActionButton variant="success" onClick={() => void fechar()} loading={enviando}>Confirmar</ActionButton>
                </div>
              ) : (
                <ActionButton variant="success" onClick={() => setConfirmarFechar(true)} disabled={!completa || enviando || bloqueado}>
                  <Lock size={18} aria-hidden="true" />{" "}
                  {completa ? "Fechar carga"
                    : semVolumes.length ? `${semVolumes.length} pedido(s) sem volume`
                    : `Faltam ${pendentes.length} volume(s)`}
                </ActionButton>
              )}
            </StickyFooter>
          )}
        </>
      )}

      {/* Gerar volumes do pedido */}
      {gerarPara && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="gerar-vol-titulo">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-5 space-y-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-500/15 flex items-center justify-center">
                <PackagePlus size={24} className="text-[hsl(217,91%,60%)]" aria-hidden="true" />
              </div>
              <h3 id="gerar-vol-titulo" className="text-base font-bold text-white">Volumes do pedido {gerarPara.numero_pedido ?? ""}</h3>
              <p className={`text-sm ${textoFraco}`}>Conte os volumes do pedido. As etiquetas vão para a impressora; cole cada uma e bipe ao carregar.</p>
            </div>
            <div>
              <label htmlFor="qtd-volumes" className="text-xs text-[hsl(213,31%,55%)] mb-1 block uppercase font-medium">Quantidade de volumes</label>
              <input id="qtd-volumes" type="number" inputMode="numeric" min={1} max={999} value={qtdVolumes} autoFocus
                onChange={(e) => setQtdVolumes(e.target.value)} placeholder="0"
                className="w-full h-14 px-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] text-white text-2xl font-bold text-center outline-none focus:border-[hsl(217,91%,50%)]" />
            </div>
            <div className="flex gap-2">
              <ActionButton variant="secondary" onClick={() => setGerarPara(null)} disabled={enviando}>Cancelar</ActionButton>
              <ActionButton variant="success" onClick={() => void gerarVolumes()} loading={enviando} disabled={!qtdVolumes || Number(qtdVolumes) <= 0}>
                Gerar e imprimir
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      {/* Digitar código (etiqueta ilegível) */}
      {digitarAberto && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="digitar-titulo">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-5 space-y-4">
            <div className="text-center space-y-1">
              <h3 id="digitar-titulo" className="text-base font-bold text-white">Digitar código do volume</h3>
              <p className={`text-sm ${textoFraco}`}>Use só quando a etiqueta não ler. A digitação fica registrada na carga.</p>
            </div>
            <label htmlFor="codigo-digitado" className="sr-only">Código do volume</label>
            <input id="codigo-digitado" value={codigoDigitado} autoFocus autoCapitalize="characters" placeholder="VOL-000000"
              onChange={(e) => setCodigoDigitado(e.target.value.toUpperCase())}
              className="w-full h-14 px-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] text-white text-xl font-mono text-center outline-none focus:border-[hsl(217,91%,50%)]" />
            <div className="flex gap-2">
              <ActionButton variant="secondary" onClick={() => setDigitarAberto(false)} disabled={enviando}>Cancelar</ActionButton>
              <ActionButton variant="success" disabled={!codigoDigitado.trim() || enviando}
                onClick={() => { setDigitarAberto(false); void embarcar(codigoDigitado.trim(), true); }}>
                Embarcar
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      <StatusOverlay type={overlay.tipo} message={overlay.msg} onDone={fecharOverlay} />
      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
