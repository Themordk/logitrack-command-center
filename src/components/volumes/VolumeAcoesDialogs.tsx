/**
 * Ações da tela Volumes (A21, A22): cancelar, acrescentar volumes ao pedido, ligar a um pedido e
 * registrar peso/cubagem. As regras (permissão, bloqueios, ocorrência, NF) são das RPCs.
 */
import { useEffect, useState } from "react";
import { Loader2, PackagePlus, Ruler, Link2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { volumesService, VolumeRpcError, type RespostaVolume } from "@/lib/volumesService";
import { numeroDigitado } from "@/lib/volumesExibicao";
import { parseError } from "@/lib/errorMapper";

const input = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary";
const rotulo = "text-xs font-medium text-muted-foreground mb-1.5 block";

function mostrarErro(e: unknown, contexto: string) {
  if (e instanceof VolumeRpcError) { toast.error(e.message); return; }
  const p = parseError(e, contexto);
  toast.error(p.title, { description: p.technicalMessage });
}

function avisos(r: RespostaVolume<unknown>) {
  for (const a of r.avisos ?? []) if (a?.mensagem) toast.warning(a.mensagem, { duration: 8000 });
}

function Rodape({ ocupado, onCancelar, onConfirmar, rotuloConfirmar, perigo, desabilitado }: {
  ocupado: boolean; onCancelar: () => void; onConfirmar: () => void; rotuloConfirmar: string; perigo?: boolean; desabilitado?: boolean;
}) {
  return (
    <DialogFooter>
      <button type="button" onClick={onCancelar} disabled={ocupado}
        className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
        Voltar
      </button>
      <button type="button" onClick={onConfirmar} disabled={ocupado || desabilitado}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 ${perigo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}>
        {ocupado && <Loader2 size={14} className="animate-spin" />}
        {rotuloConfirmar}
      </button>
    </DialogFooter>
  );
}

// ---------- Cancelar ----------
export function CancelarVolumeDialog({ volume, onClose, onFeito }: {
  volume: { id: string; codigo_volume: string; numero_pedido: number | null } | null;
  onClose: () => void;
  /** Recebe os ids dos volumes que sobraram no pedido, para oferecer a reimpressão. */
  onFeito: (restantes: string[]) => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setMotivo(""); }, [volume?.id]);
  const confirmar = async () => {
    if (!volume) return;
    setOcupado(true);
    try {
      const r = await volumesService.cancelar(volume.id, motivo);
      toast.success(r.mensagem ?? "Volume cancelado.");
      onFeito((r.dados?.volumes_restantes ?? []).map((v) => v.id));
    } catch (e) { mostrarErro(e, "cancelar-volume"); } finally { setOcupado(false); }
  };
  return (
    <Dialog open={!!volume} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><XCircle size={18} className="text-destructive" aria-hidden="true" /> Cancelar volume {volume?.codigo_volume}</DialogTitle>
          <DialogDescription>
            O volume sai da lista ativa e fica no histórico de cancelados, com o motivo e quem cancelou. Uma ocorrência é registrada.
            Volumes já embarcados, expedidos ou numa carga não podem ser cancelados.
          </DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="cancelar-motivo" className={rotulo}>Motivo (obrigatório)</label>
          <Textarea id="cancelar-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: caixa unificada com outro volume, gerado a mais..." />
          <p className="text-[11px] text-muted-foreground mt-1">O total de volumes do pedido {volume?.numero_pedido ?? ""} muda: as etiquetas dos outros volumes podem precisar de reimpressão.</p>
        </div>
        <Rodape ocupado={ocupado} onCancelar={onClose} onConfirmar={() => void confirmar()} rotuloConfirmar="Cancelar volume" perigo desabilitado={motivo.trim().length < 5} />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Acrescentar ----------
export function AcrescentarVolumesDialog({ alvo, onClose, onFeito }: {
  alvo: { movimentoSaidaId: string; documentoSaidaId: string; numeroPedido: number | null; atuais: number } | null;
  onClose: () => void;
  /** Recebe os ids de todos os volumes do pedido (o total mudou). */
  onFeito: (volumesDoPedido: string[]) => void;
}) {
  const [qtd, setQtd] = useState("1");
  const [motivo, setMotivo] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setQtd("1"); setMotivo(""); }, [alvo?.documentoSaidaId]);
  const n = Number(qtd);
  const valido = Number.isInteger(n) && n >= 1 && n <= 99 && motivo.trim().length >= 5;
  const confirmar = async () => {
    if (!alvo) return;
    setOcupado(true);
    try {
      const r = await volumesService.acrescentar(alvo.movimentoSaidaId, alvo.documentoSaidaId, n, motivo);
      toast.success(r.mensagem ?? "Volumes acrescentados.");
      avisos(r as RespostaVolume<unknown>);
      onFeito(r.dados?.volumes_do_pedido ?? []);
    } catch (e) { mostrarErro(e, "acrescentar-volume"); } finally { setOcupado(false); }
  };
  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><PackagePlus size={18} className="text-primary" aria-hidden="true" /> Acrescentar volumes ao pedido {alvo?.numeroPedido ?? ""}</DialogTitle>
          <DialogDescription>
            O pedido tem {alvo?.atuais ?? 0} volume(s). Os novos continuam a numeração e, se o pedido estiver numa carga aberta,
            entram na conferência do embarque. A quantidade é conferida com a NF conforme o tipo de saída.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="acrescentar-qtd" className={rotulo}>Quantidade de volumes a acrescentar</label>
            <input id="acrescentar-qtd" type="number" min={1} max={99} value={qtd} onChange={(e) => setQtd(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="acrescentar-motivo" className={rotulo}>Motivo (obrigatório)</label>
            <Textarea id="acrescentar-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: mercadoria não coube nas caixas previstas" />
          </div>
        </div>
        <Rodape ocupado={ocupado} onCancelar={onClose} onConfirmar={() => void confirmar()} rotuloConfirmar="Acrescentar" desabilitado={!valido} />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Ligar a pedido ----------
export function VincularPedidoDialog({ alvo, onClose, onFeito }: {
  alvo: { volumeId: string; codigoVolume: string; pedidos: { documento_saida_id: string; numero_pedido: number | null; parceiro_nome: string | null }[] } | null;
  onClose: () => void;
  onFeito: () => void;
}) {
  const [doc, setDoc] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setDoc(alvo?.pedidos.length === 1 ? alvo.pedidos[0].documento_saida_id : ""); }, [alvo]);
  const confirmar = async () => {
    if (!alvo || !doc) return;
    setOcupado(true);
    try {
      const r = await volumesService.vincularPedido(alvo.volumeId, doc);
      toast.success(r.mensagem ?? "Volume ligado ao pedido.");
      onFeito();
    } catch (e) { mostrarErro(e, "vincular-volume"); } finally { setOcupado(false); }
  };
  return (
    <Dialog open={!!alvo} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Link2 size={18} className="text-primary" aria-hidden="true" /> Ligar {alvo?.codigoVolume} a um pedido</DialogTitle>
          <DialogDescription>Sem pedido, a etiqueta sai sem cliente e sem NF. Escolha um dos pedidos da onda do volume.</DialogDescription>
        </DialogHeader>
        <div>
          <label htmlFor="vincular-pedido" className={rotulo}>Pedido</label>
          <select id="vincular-pedido" value={doc} onChange={(e) => setDoc(e.target.value)} className={input}>
            <option value="">Selecione...</option>
            {(alvo?.pedidos ?? []).map((p) => (
              <option key={p.documento_saida_id} value={p.documento_saida_id}>{p.numero_pedido ?? "?"} — {p.parceiro_nome ?? "sem cliente"}</option>
            ))}
          </select>
        </div>
        <Rodape ocupado={ocupado} onCancelar={onClose} onConfirmar={() => void confirmar()} rotuloConfirmar="Ligar ao pedido" desabilitado={!doc} />
      </DialogContent>
    </Dialog>
  );
}

// ---------- Peso e cubagem ----------
export function MedidasVolumeDialog({ volumeIds, onClose, onFeito }: {
  volumeIds: string[] | null;
  onClose: () => void;
  onFeito: () => void;
}) {
  const [peso, setPeso] = useState("");
  const [alt, setAlt] = useState("");
  const [larg, setLarg] = useState("");
  const [comp, setComp] = useState("");
  const [m3, setM3] = useState("");
  const [ocupado, setOcupado] = useState(false);
  useEffect(() => { setPeso(""); setAlt(""); setLarg(""); setComp(""); setM3(""); }, [volumeIds]);

  // Cubagem calculada pelas medidas (cm) quando as três foram informadas
  const a = numeroDigitado(alt), l = numeroDigitado(larg), c = numeroDigitado(comp);
  const m3Calculado = a && l && c ? Math.round(((a * l * c) / 1_000_000) * 10_000) / 10_000 : null;
  const m3Final = numeroDigitado(m3) ?? m3Calculado;
  const pesoFinal = numeroDigitado(peso);
  const qtd = volumeIds?.length ?? 0;

  const confirmar = async () => {
    if (!volumeIds?.length) return;
    setOcupado(true);
    try {
      const r = await volumesService.registrarMedidas(volumeIds, pesoFinal, m3Final);
      toast.success(r.mensagem ?? "Medidas registradas.");
      onFeito();
    } catch (e) { mostrarErro(e, "medidas-volume"); } finally { setOcupado(false); }
  };
  return (
    <Dialog open={!!volumeIds} onOpenChange={(o) => !o && !ocupado && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Ruler size={18} className="text-primary" aria-hidden="true" /> Peso e cubagem</DialogTitle>
          <DialogDescription>
            {qtd === 1 ? "O peso entra na etiqueta e no romaneio." : `Os valores serão gravados em cada um dos ${qtd} volumes selecionados.`} Deixe em branco o que não quiser alterar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="medida-peso" className={rotulo}>Peso bruto (kg)</label>
            <input id="medida-peso" inputMode="decimal" value={peso} onChange={(e) => setPeso(e.target.value)} placeholder="Ex.: 12,5" className={input} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([["medida-alt", "Altura (cm)", alt, setAlt], ["medida-larg", "Largura (cm)", larg, setLarg], ["medida-comp", "Comprimento (cm)", comp, setComp]] as const).map(([id, r, v, set]) => (
              <div key={id}>
                <label htmlFor={id} className={rotulo}>{r}</label>
                <input id={id} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} className={input} />
              </div>
            ))}
          </div>
          <div>
            <label htmlFor="medida-m3" className={rotulo}>Cubagem (m³)</label>
            <input id="medida-m3" inputMode="decimal" value={m3} onChange={(e) => setM3(e.target.value)}
              placeholder={m3Calculado != null ? `${String(m3Calculado).replace(".", ",")} (calculado pelas medidas)` : "Ex.: 0,08"} className={input} />
          </div>
        </div>
        <Rodape ocupado={ocupado} onCancelar={onClose} onConfirmar={() => void confirmar()} rotuloConfirmar="Gravar medidas"
          desabilitado={pesoFinal == null && m3Final == null} />
      </DialogContent>
    </Dialog>
  );
}
