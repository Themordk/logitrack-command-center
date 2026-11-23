/**
 * Módulo de Entregas — detalhe de uma parada, confirmação com foto do canhoto e ocorrência com foto.
 *
 * Três telas na mesma página (modo): detalhe → confirmar | ocorrência.
 * A foto é enviada ao bucket antes da RPC; se a RPC falhar, o reenvio reaproveita a foto já enviada.
 * Quem decide se pode (aceite, parada pendente, dono, motivo, observação, foto) é o servidor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, FileText, Loader2, MapPin, MessageSquareText, Navigation, Phone, RotateCcw, User } from "lucide-react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { StatusOverlay, type OverlayType } from "@/components/coletor/StatusOverlay";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import { entregaService, type EntregaDetalhe, type MotivoEntrega } from "@/lib/entregaService";
import { comprimirFoto, enviarFoto, obterPosicao } from "@/lib/entregaFoto";
import {
  PARADA_STATUS_LABEL, caminhoFotoEntrega, descreverDocumento, efeitoMotivo, enderecoLinha1, enderecoLinha2,
  formatarHora, linkMapa, linkTelefone,
} from "@/lib/entregaExibicao";
import { ENTREGA_CACHE_MIN, ENTREGA_ID_KEY, chaveCacheEntrega } from "@/pages/coletor/EntregasListPage";
import { useOffline } from "@/contexts/OfflineContext";
import { ENTREGA_PARADA_ID_KEY } from "@/pages/coletor/EntregaParadasPage";

interface Props { onNavigate: (path: string) => void; }

type Modo = "detalhe" | "confirmar" | "ocorrencia";

interface FotoTirada {
  blob: Blob;
  url: string;
  /** Caminho no bucket; definido no primeiro envio e reaproveitado se a RPC falhar. */
  caminho: string | null;
  enviada: boolean;
}

const cartao = "rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)]";
const rotulo = "text-xs font-semibold text-[hsl(213,31%,80%)]";
const campo = "w-full rounded-xl border border-[hsl(222,35%,28%)] bg-[hsl(222,40%,9%)] px-3 text-sm text-white placeholder:text-[hsl(213,31%,40%)] outline-none focus:border-[hsl(217,91%,60%)]";

export function EntregaParadaPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") ?? "";
  const usuarioId = localStorage.getItem("core_usuario_id") ?? "";
  const entregaId = sessionStorage.getItem(ENTREGA_ID_KEY) ?? "";
  const paradaId = sessionStorage.getItem(ENTREGA_PARADA_ID_KEY) ?? "";
  const bloqueado = useOnlineOnlyBlocked();
  const result = useResultDialog({ coletorMode: true });
  const { showError } = result;
  const feedback = useFeedback();
  const { cacheData, getCachedData } = useOffline();

  const [entrega, setEntrega] = useState<EntregaDetalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<Modo>("detalhe");
  const [foto, setFoto] = useState<FotoTirada | null>(null);
  const [preparandoFoto, setPreparandoFoto] = useState(false);
  const [recebedor, setRecebedor] = useState("");
  const [motivos, setMotivos] = useState<MotivoEntrega[] | null>(null);
  const [motivoId, setMotivoId] = useState<string | null>(null);
  const [observacao, setObservacao] = useState("");
  const [gravando, setGravando] = useState(false);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState<string>();
  const inputFoto = useRef<HTMLInputElement>(null);
  const limparOverlay = useCallback(() => setOverlay(null), []);

  const parada = entrega?.paradas.find((p) => p.id === paradaId) ?? null;
  const motivo = useMemo(() => motivos?.find((m) => m.id === motivoId) ?? null, [motivos, motivoId]);

  const carregar = useCallback(async () => {
    if (!entregaId || !paradaId) { onNavigate("/coletor/entregas"); return; }
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
      showError(e, { context: "entregas-parada", onClose: () => onNavigate("/coletor/entregas/paradas") });
    } finally {
      setLoading(false);
    }
  }, [tenantId, usuarioId, entregaId, paradaId, bloqueado, showError, onNavigate, cacheData, getCachedData]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => () => { if (foto) URL.revokeObjectURL(foto.url); }, [foto]);

  const trocarModo = (m: Modo) => {
    setFoto(null);
    setRecebedor("");
    setMotivoId(null);
    setObservacao("");
    setModo(m);
    if (m === "ocorrencia" && motivos === null) {
      entregaService.motivos(tenantId, usuarioId)
        .then(setMotivos)
        .catch((e) => { setMotivos([]); showError(e, { context: "entregas-motivos" }); });
    }
  };

  const abrirCamera = () => inputFoto.current?.click();

  const aoEscolherFoto = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = ev.target.files?.[0];
    ev.target.value = "";
    if (!arquivo) return;
    setPreparandoFoto(true);
    try {
      const blob = await comprimirFoto(arquivo);
      setFoto({ blob, url: URL.createObjectURL(blob), caminho: null, enviada: false });
    } finally {
      setPreparandoFoto(false);
    }
  };

  /** Envia a foto (uma vez) e devolve o caminho. */
  const garantirFotoEnviada = async (tipo: "canhoto" | "ocorrencia"): Promise<string> => {
    if (!foto || !parada) throw new Error("Tire a foto antes de gravar.");
    if (foto.enviada && foto.caminho) return foto.caminho;
    const caminho = foto.caminho ?? caminhoFotoEntrega(tenantId, entregaId, parada.id, tipo);
    await enviarFoto(caminho, foto.blob);
    setFoto((f) => (f ? { ...f, caminho, enviada: true } : f));
    return caminho;
  };

  const concluirAcao = (mensagem: string, dados?: EntregaDetalhe) => {
    feedback.success();
    setOverlayMsg(mensagem);
    setOverlay("success");
    if (dados) { setEntrega(dados); void cacheData(chaveCacheEntrega(dados.id), dados, ENTREGA_CACHE_MIN); }
    setTimeout(() => onNavigate("/coletor/entregas/paradas"), 1000);
  };

  const confirmar = async () => {
    if (!parada || !foto) return;
    setGravando(true);
    try {
      const [caminho, posicao] = await Promise.all([garantirFotoEnviada("canhoto"), obterPosicao()]);
      const r = await entregaService.confirmar(tenantId, usuarioId, parada.id, caminho, recebedor, posicao);
      concluirAcao(r.codigo === "ENTREGA_CONCLUIDA" ? "Entrega concluída!" : "Entrega registrada", r.dados);
    } catch (e) {
      feedback.error();
      showError(e, { context: "entregas-confirmar" });
    } finally {
      setGravando(false);
    }
  };

  const gravarOcorrencia = async () => {
    if (!parada || !foto || !motivo) return;
    setGravando(true);
    try {
      const [caminho, posicao] = await Promise.all([garantirFotoEnviada("ocorrencia"), obterPosicao()]);
      const r = await entregaService.ocorrencia(tenantId, usuarioId, parada.id, motivo.id, observacao, caminho, posicao);
      concluirAcao(r.codigo === "ENTREGA_CONCLUIDA" ? "Entrega concluída!" : "Ocorrência registrada", r.dados);
    } catch (e) {
      feedback.error();
      showError(e, { context: "entregas-ocorrencia" });
    } finally {
      setGravando(false);
    }
  };

  const podeAgir = entrega?.status === "EM_ROTA" && parada?.status === "PENDENTE" && !bloqueado;
  const obsObrigatoria = !!motivo?.exige_observacao;
  const podeGravarOcorrencia = !!motivo && !!foto && (!obsObrigatoria || observacao.trim().length >= 3);

  const titulo = modo === "confirmar" ? "Confirmar entrega" : modo === "ocorrencia" ? "Registrar ocorrência"
    : parada && entrega ? `Parada ${parada.sequencia} de ${entrega.total_paradas}` : "Parada";

  const blocoFoto = (rotuloFoto: string) => (
    <div className="flex flex-col gap-2">
      <input ref={inputFoto} type="file" accept="image/*" capture="environment" className="hidden" onChange={aoEscolherFoto}
        aria-label={rotuloFoto} />
      {foto ? (
        <>
          <img src={foto.url} alt={rotuloFoto} className="w-full max-h-64 object-contain rounded-xl border border-[hsl(222,35%,28%)] bg-black" />
          <button type="button" onClick={abrirCamera} disabled={gravando}
            className="self-start flex items-center gap-1.5 text-sm font-semibold text-[hsl(217,91%,70%)] py-2 disabled:opacity-40">
            <RotateCcw size={16} aria-hidden="true" /> Refazer foto
          </button>
        </>
      ) : (
        <button type="button" onClick={abrirCamera} disabled={preparandoFoto}
          className="w-full h-44 rounded-2xl border-2 border-dashed border-[hsl(222,35%,32%)] flex flex-col items-center justify-center gap-2 text-[hsl(213,31%,70%)] active:scale-[0.99]">
          {preparandoFoto ? <Loader2 size={32} className="animate-spin" aria-hidden="true" /> : <Camera size={36} aria-hidden="true" />}
          <span className="text-sm font-bold text-white">{rotuloFoto}</span>
          <span className="text-xs">toque para abrir a câmera</span>
        </button>
      )}
    </div>
  );

  return (
    <ColetorLayout title={titulo} onNavigate={(p) => (modo !== "detalhe" && p === "/coletor/entregas/paradas" ? setModo("detalhe") : onNavigate(p))}
      showBack backPath="/coletor/entregas/paradas">
      <OnlineOnlyNotice flow="Aceitar, confirmar entrega ou registrar ocorrência" />
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" aria-label="Carregando parada" />
        </div>
      ) : !parada || !entrega ? (
        <p className="text-sm text-center text-[hsl(213,31%,55%)] mt-8">Parada não encontrada.</p>
      ) : modo === "detalhe" ? (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
            <div>
              <p className="text-lg font-bold text-white leading-tight">{parada.parceiro_nome ?? "Cliente"}</p>
              <p className="text-xs text-[hsl(213,31%,60%)] flex items-center gap-1 mt-1">
                <FileText size={12} aria-hidden="true" /> {descreverDocumento(parada)}
              </p>
            </div>

            <div className={`${cartao} p-3 flex flex-col gap-1`}>
              <p className="text-sm font-semibold text-white flex items-start gap-1.5">
                <MapPin size={16} className="shrink-0 mt-0.5 text-[hsl(217,91%,65%)]" aria-hidden="true" /> {enderecoLinha1(parada)}
              </p>
              {enderecoLinha2(parada) && <p className="text-xs text-[hsl(213,31%,65%)] pl-[22px]">{enderecoLinha2(parada)}</p>}
              {parada.cep && <p className="text-xs text-[hsl(213,31%,55%)] pl-[22px]">CEP {parada.cep}</p>}
              {(parada.contato || parada.telefone) && (
                <p className="text-xs text-[hsl(213,31%,65%)] pl-[22px] flex items-center gap-1">
                  <User size={12} aria-hidden="true" /> {[parada.contato, parada.telefone].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            {parada.observacao_pedido && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5 mb-1">
                  <MessageSquareText size={14} aria-hidden="true" /> Observação do pedido
                </p>
                <p className="text-sm text-white whitespace-pre-line break-words">{parada.observacao_pedido}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {linkMapa(parada) ? (
                <a href={linkMapa(parada) ?? undefined} target="_blank" rel="noopener noreferrer"
                  className="h-12 rounded-xl border border-[hsl(217,91%,50%)] bg-[hsl(217,91%,50%)]/10 text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98]">
                  <Navigation size={16} aria-hidden="true" /> Abrir no mapa
                </a>
              ) : <span className="h-12 rounded-xl border border-[hsl(222,35%,22%)] text-xs text-[hsl(213,31%,45%)] flex items-center justify-center">Sem endereço</span>}
              {linkTelefone(parada.telefone) ? (
                <a href={linkTelefone(parada.telefone) ?? undefined}
                  className="h-12 rounded-xl border border-[hsl(217,91%,50%)] bg-[hsl(217,91%,50%)]/10 text-sm font-bold text-white flex items-center justify-center gap-2 active:scale-[0.98]">
                  <Phone size={16} aria-hidden="true" /> Ligar
                </a>
              ) : <span className="h-12 rounded-xl border border-[hsl(222,35%,22%)] text-xs text-[hsl(213,31%,45%)] flex items-center justify-center">Sem telefone</span>}
            </div>

            {parada.status !== "PENDENTE" && (
              <div className={`rounded-xl border px-3 py-2 text-sm ${parada.status === "ENTREGUE"
                ? "border-green-500/40 bg-green-500/10 text-green-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>
                <b>{PARADA_STATUS_LABEL[parada.status]}</b>
                {parada.status === "ENTREGUE" && <> às {formatarHora(parada.entregue_em)}{parada.recebedor_nome ? ` · recebido por ${parada.recebedor_nome}` : ""}</>}
                {parada.status === "NAO_ENTREGUE" && parada.ocorrencia && <> · {parada.ocorrencia.motivo} (ocorrência #{parada.ocorrencia.numero})</>}
              </div>
            )}
            {parada.status === "PENDENTE" && parada.ocorrencia && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Ocorrência #{parada.ocorrencia.numero} registrada ({parada.ocorrencia.motivo}). A entrega ainda pode ser confirmada.
              </div>
            )}
            {entrega.status === "AGUARDANDO_ACEITE" && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                Botões liberados só após o aceite da carga.
              </div>
            )}
          </div>

          {parada.status === "PENDENTE" && (
            <div className="shrink-0 flex flex-col gap-2 pt-1">
              <ActionButton variant="success" onClick={() => trocarModo("confirmar")} disabled={!podeAgir}>CONFIRMAR ENTREGA</ActionButton>
              <ActionButton variant="danger" onClick={() => trocarModo("ocorrencia")} disabled={!podeAgir}>OCORRÊNCIA</ActionButton>
            </div>
          )}
        </div>
      ) : modo === "confirmar" ? (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
            <p className="text-xs text-[hsl(213,31%,60%)]">{parada.parceiro_nome} · {descreverDocumento(parada)}</p>
            {blocoFoto("Foto do canhoto assinado")}
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Recebido por (opcional)</span>
              <input value={recebedor} onChange={(e) => setRecebedor(e.target.value)} maxLength={120}
                placeholder="Nome de quem recebeu" className={`${campo} h-12`} autoComplete="off" />
            </label>
          </div>
          <div className="shrink-0 flex flex-col gap-2 pt-1">
            <ActionButton variant="success" onClick={confirmar} loading={gravando} disabled={!foto || !podeAgir}>CONFIRMAR</ActionButton>
            <ActionButton variant="secondary" onClick={() => setModo("detalhe")} disabled={gravando}>Voltar</ActionButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
          <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
            <p className="text-xs text-[hsl(213,31%,60%)]">{parada.parceiro_nome} · {descreverDocumento(parada)}</p>
            <fieldset className="flex flex-col gap-2">
              <legend className={`${rotulo} mb-2`}>Motivo</legend>
              {motivos === null ? (
                <Loader2 size={20} className="animate-spin text-[hsl(217,91%,60%)]" aria-label="Carregando motivos" />
              ) : motivos.length === 0 ? (
                <p className="text-xs text-amber-300">Nenhum motivo de entrega cadastrado. Peça ao supervisor para cadastrar em Motivos de Ocorrência (etapa Entrega).</p>
              ) : motivos.map((m) => {
                const ativo = m.id === motivoId;
                return (
                  <button key={m.id} type="button" role="radio" aria-checked={ativo} onClick={() => setMotivoId(m.id)}
                    className={`min-h-12 px-3 py-2 rounded-xl border text-left text-sm flex items-center gap-3 ${
                      ativo ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/15 text-white" : "border-[hsl(222,35%,26%)] text-[hsl(213,31%,85%)]"}`}>
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${ativo ? "border-[hsl(217,91%,65%)] bg-[hsl(217,91%,65%)]" : "border-[hsl(213,31%,45%)]"}`} aria-hidden="true" />
                    {m.descricao}
                  </button>
                );
              })}
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <span className={rotulo}>Observação {obsObrigatoria ? "(obrigatória)" : "(opcional)"}</span>
              <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} maxLength={1000} rows={3}
                placeholder={obsObrigatoria ? "Descreva o que aconteceu" : "Opcional para este motivo"} className={`${campo} py-2`} />
            </label>
            {blocoFoto("Foto da ocorrência (obrigatória)")}
            {motivo && <p className="text-xs text-[hsl(213,31%,60%)]">{efeitoMotivo(motivo)}</p>}
          </div>
          <div className="shrink-0 flex flex-col gap-2 pt-1">
            <ActionButton variant="danger" onClick={gravarOcorrencia} loading={gravando} disabled={!podeGravarOcorrencia || !podeAgir}>GRAVAR OCORRÊNCIA</ActionButton>
            <ActionButton variant="secondary" onClick={() => setModo("detalhe")} disabled={gravando}>Voltar</ActionButton>
          </div>
        </div>
      )}
      <StatusOverlay type={overlay} message={overlayMsg} onDone={limparOverlay} duration={1000} />
      <ResultDialog {...result.dialogProps} />
    </ColetorLayout>
  );
}
