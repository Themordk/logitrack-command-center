import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertOctagon, AlertTriangle, ArrowRightLeft, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import { cn } from "@/lib/utils";
import {
  rpc, listarMotivosRemocao,
  type AnaliseRemocao, type ResultadoRemocao,
} from "./remocaoDocumento";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (resultado: ResultadoRemocao | null) => void;
  tipo: "entrada" | "saida";
  movimentoId: string;
  empresaId: string;
  documento: { id: string; numero: string; parceiro?: string };
}

const ROTULO_TAREFA: Record<string, string> = {
  REDUZIR: "Reduzir quantidade",
  CANCELAR: "Cancelar",
  MANTER: "Manter",
  ESTORNAR_CONFERENCIA: "Estornar conferência",
  CRIAR_RECONFERENCIA: "Nova tarefa de conferência",
  ESTORNAR_SEPARACAO: "Estornar separação",
  CRIAR_SEP_ENDERECO_CANCELAMENTO: "Reconfirmar no endereço de cancelamento",
  CRIAR_SEP_RESTANTE: "Nova separação do restante",
};
const ROTULO_ITEM: Record<string, string> = {
  REDUZIR: "Reduzir",
  CANCELAR: "Cancelar",
  ESTORNAR_CONFERENCIA: "Estornar conferência",
  AJUSTAR_AUTOCONFERIDO: "Ajustar autoconferido",
  LIMPAR_SEPARACAO: "Estornar separação",
};
const COR: Record<string, string> = {
  sky: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  zinc: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  amber: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  emerald: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};
function corAcao(acao: string) {
  if (["CANCELAR"].includes(acao)) return COR.zinc;
  if (["ESTORNAR_CONFERENCIA", "LIMPAR_SEPARACAO", "ESTORNAR_SEPARACAO"].includes(acao)) return COR.amber;
  if (acao.startsWith("CRIAR_")) return COR.emerald;
  return COR.sky;
}
const n = (v: number | null | undefined) => (v == null ? "—" : Number(v).toLocaleString("pt-BR"));

type Passo = "motivo" | "previa" | "resultado";

export function RemoverDocumentoMovimentoModal({ open, onClose, onSuccess, tipo, movimentoId, empresaId, documento }: Props) {
  const { tenantId, usuarioId } = useTenant();
  const [passo, setPasso] = useState<Passo>("motivo");
  const [motivos, setMotivos] = useState<{ id: string; descricao: string }[]>([]);
  const [carregandoMotivos, setCarregandoMotivos] = useState(false);
  const [motivoId, setMotivoId] = useState("");
  const [motivoErro, setMotivoErro] = useState(false);
  const [observacao, setObservacao] = useState("");
  const [analise, setAnalise] = useState<AnaliseRemocao | null>(null);
  const [bloqueadoMsg, setBloqueadoMsg] = useState<string | null>(null);
  const [desatualizada, setDesatualizada] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoRemocao | null>(null);
  const travado = useRef(false);

  const entrada = tipo === "entrada";
  const titulo = entrada ? `Remover NF #${documento.numero} do movimento` : `Remover pedido #${documento.numero} da onda`;

  useEffect(() => {
    if (!open) return;
    setPasso("motivo"); setMotivoId(""); setMotivoErro(false); setObservacao("");
    setAnalise(null); setBloqueadoMsg(null); setDesatualizada(false); setCiente(false); setResultado(null);
    travado.current = false;
    if (!tenantId) return;
    setCarregandoMotivos(true);
    listarMotivosRemocao(tenantId, entrada ? "RECEBIMENTO" : "EXPEDICAO")
      .then(setMotivos)
      .catch((e) => toast.error(parseError(e, "motivos-remocao").title))
      .finally(() => setCarregandoMotivos(false));
  }, [open, tenantId, entrada]);

  const paramsBase = () => entrada
    ? { p_tenant_id: tenantId, p_empresa_id: empresaId, p_movimento_entrada_id: movimentoId, p_documento_entrada_id: documento.id, p_usuario_id: usuarioId }
    : { p_tenant_id: tenantId, p_empresa_id: empresaId, p_movimento_saida_id: movimentoId, p_documento_saida_id: documento.id, p_usuario_id: usuarioId };

  const analisar = async (aposDesatualizacao = false) => {
    if (!motivoId) { setMotivoErro(true); return; }
    setAnalisando(true);
    try {
      const r = await rpc<AnaliseRemocao>(entrada ? "fn_remocao_doc_entrada_analisar" : "fn_remocao_doc_saida_analisar", paramsBase());
      if (r.codigo === "DOC_NAO_VINCULADO") {
        toast.error("O documento já foi removido deste movimento.");
        onSuccess(null); onClose(); return;
      }
      if (!r.dados) { toast.error(r.mensagem || "Não foi possível analisar."); return; }
      setAnalise(r.dados);
      setBloqueadoMsg(r.codigo === "REMOCAO_BLOQUEADA" || !r.dados.pode_remover ? r.mensagem : null);
      setDesatualizada(aposDesatualizacao);
      setCiente(false);
      setPasso("previa");
    } catch (e) {
      toast.error(parseError(e, "remocao-analisar").title);
    } finally {
      setAnalisando(false);
    }
  };

  const confirmar = async () => {
    if (!analise || travado.current) return;
    travado.current = true;
    setConfirmando(true);
    try {
      const r = await rpc<ResultadoRemocao>(entrada ? "fn_remover_doc_movimento_entrada" : "fn_remover_doc_onda_carregamento", {
        ...paramsBase(),
        p_motivo_ocorrencia_id: motivoId,
        p_observacao: observacao.trim() || null,
        p_hash_analise: analise.hash_analise,
      });
      switch (r.codigo) {
        case "DOCUMENTO_REMOVIDO": {
          const occ = r.dados?.numero_ocorrencia ? ` Ocorrência #${r.dados.numero_ocorrencia}.` : "";
          toast.success(`${entrada ? "NF" : "Pedido"} #${documento.numero} removido.${occ}`);
          const transf = r.dados?.transferencias_sugeridas ?? [];
          if (!entrada && transf.length > 0) {
            setResultado(r.dados);
            setPasso("resultado");
          } else {
            onSuccess(r.dados); onClose();
          }
          return;
        }
        case "ANALISE_DESATUALIZADA":
          await analisar(true);
          return;
        case "DOC_NAO_VINCULADO":
          toast.error("O documento já foi removido deste movimento.");
          onSuccess(null); onClose();
          return;
        case "MOTIVO_OBRIGATORIO":
          setMotivoErro(true); setPasso("motivo");
          toast.error(r.mensagem || "Selecione o motivo.");
          return;
        case "REMOCAO_BLOQUEADA":
          await analisar();
          toast.error(r.mensagem);
          return;
        case "ERRO_INTERNO":
          toast.error(parseError(r, "remocao-executar").title);
          return;
        default:
          toast.error(r.mensagem || "Não foi possível remover o documento.");
      }
    } catch (e) {
      toast.error(parseError(e, "remocao-executar").title);
    } finally {
      setConfirmando(false);
      travado.current = false;
    }
  };

  const bloqueios = analise?.bloqueios ?? [];
  const avisos = analise?.avisos ?? [];
  const itens = analise?.itens ?? [];
  const tarefas = analise?.tarefas ?? [];
  const exigeCiencia = itens.some((i) => i.acao === "ESTORNAR_CONFERENCIA" || i.acao === "LIMPAR_SEPARACAO");
  const podeConfirmar = analise?.pode_remover === true && bloqueios.length === 0;
  const th = "px-2 py-1.5 font-medium text-muted-foreground uppercase";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !confirmando) { if (passo === "resultado") onSuccess(resultado); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Unlink size={16} /> {titulo}</DialogTitle>
          <DialogDescription>
            O documento volta para Pendente e poderá ser agrupado em outro movimento. As tarefas ligadas aos itens dele serão ajustadas.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-1">
          {passo === "motivo" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Motivo *</Label>
                <Select value={motivoId} onValueChange={(v) => { setMotivoId(v); setMotivoErro(false); }} disabled={carregandoMotivos}>
                  <SelectTrigger className={cn("h-10 rounded-lg bg-secondary/40", motivoErro && "border-destructive ring-1 ring-destructive")} aria-label="Motivo">
                    <SelectValue placeholder={carregandoMotivos ? "Carregando…" : "Selecione o motivo"} />
                  </SelectTrigger>
                  <SelectContent>
                    {motivos.map((m) => <SelectItem key={m.id} value={m.id}>{m.descricao}</SelectItem>)}
                  </SelectContent>
                </Select>
                {motivoErro && <p className="text-xs text-destructive">Selecione o motivo da remoção.</p>}
                {!carregandoMotivos && motivos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum motivo ativo cadastrado.</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obs-remocao" className="text-xs uppercase tracking-wide text-muted-foreground">Observação</Label>
                <Textarea id="obs-remocao" value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3} className="rounded-lg bg-secondary/40" />
              </div>
            </>
          )}

          {passo === "previa" && analise && (
            <>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div><p className="text-muted-foreground">{entrada ? "Movimento" : "Onda"}</p><p className="font-medium text-foreground">#{analise.numero_movimento ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Status atual</p><p className="font-medium text-foreground">{analise.status_movimento ?? "—"}</p></div>
                <div><p className="text-muted-foreground">Documento</p><p className="font-medium text-foreground">#{analise.numero_documento ?? documento.numero}{documento.parceiro ? ` · ${documento.parceiro}` : ""}</p></div>
              </div>

              {desatualizada && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" /> A operação mudou desde a análise. Revise antes de confirmar.
                </div>
              )}

              {(bloqueios.length > 0 || bloqueadoMsg) && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
                  <p className="flex items-center gap-2 font-semibold"><AlertOctagon size={14} /> Remoção bloqueada</p>
                  {bloqueios.length === 0 && bloqueadoMsg && <p>{bloqueadoMsg}</p>}
                  {bloqueios.map((b, i) => (
                    <p key={i}>{b.mensagem}{b.operador?.nome && <> — <strong>{b.operador.nome}</strong></>}</p>
                  ))}
                </div>
              )}

              {avisos.length > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-400 space-y-1">
                  <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={14} /> Avisos</p>
                  {avisos.map((a, i) => <p key={i}>{a.mensagem}</p>)}
                </div>
              )}

              {itens.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase mb-1.5">Itens</h4>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/40"><tr>
                        <th className={cn(th, "text-left")}>SKU</th><th className={cn(th, "text-left")}>Produto</th>
                        <th className={cn(th, "text-right")}>Qtd doc.</th><th className={cn(th, "text-right")}>Esperada</th>
                        {entrada ? (<><th className={cn(th, "text-right")}>Conferido</th><th className={cn(th, "text-right")}>A estornar</th></>)
                          : (<><th className={cn(th, "text-right")}>Separado</th><th className={cn(th, "text-right")}>Reconfirmar no end. canc.</th><th className={cn(th, "text-right")}>Excedente</th></>)}
                        <th className={cn(th, "text-left")}>Ação</th>
                      </tr></thead>
                      <tbody>
                        {itens.map((it, i) => (
                          <tr key={i} className="border-t border-border/40">
                            <td className="px-2 py-1.5 font-mono">{it.sku}</td>
                            <td className="px-2 py-1.5 max-w-[180px] truncate">{it.produto ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right">{n(it.qtd_documento)}</td>
                            <td className="px-2 py-1.5 text-right whitespace-nowrap">{n(it.qtd_esperada_atual)} → {n(it.qtd_esperada_nova)}</td>
                            {entrada ? (<><td className="px-2 py-1.5 text-right">{n(it.qtd_conferida)}</td><td className="px-2 py-1.5 text-right">{n(it.qtd_a_estornar)}</td></>)
                              : (<><td className="px-2 py-1.5 text-right">{n(it.qtd_separada)}</td><td className="px-2 py-1.5 text-right">{n(it.qtd_sep_endereco_cancelamento)}</td><td className="px-2 py-1.5 text-right">{n(it.qtd_excedente)}</td></>)}
                            <td className="px-2 py-1.5"><Badge variant="outline" className={cn("text-[10px]", corAcao(it.acao))}>{ROTULO_ITEM[it.acao] ?? it.acao}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tarefas.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-foreground uppercase mb-1.5">Tarefas</h4>
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-secondary/40"><tr>
                        <th className={cn(th, "text-left")}>Tipo</th><th className={cn(th, "text-left")}>SKU</th>
                        <th className={cn(th, "text-left")}>Status</th><th className={cn(th, "text-left")}>Operador</th>
                        <th className={cn(th, "text-right")}>Qtd</th><th className={cn(th, "text-left")}>Ação</th>
                      </tr></thead>
                      <tbody>
                        {tarefas.map((t, i) => {
                          const rot = ROTULO_TAREFA[t.acao] ?? t.acao;
                          return (
                            <tr key={i} className="border-t border-border/40">
                              <td className="px-2 py-1.5 font-mono">{t.tipo}</td>
                              <td className="px-2 py-1.5 font-mono">{t.sku ?? "—"}</td>
                              <td className="px-2 py-1.5">{t.status ?? "—"}</td>
                              <td className="px-2 py-1.5">{t.operador?.nome ?? "—"}</td>
                              <td className="px-2 py-1.5 text-right whitespace-nowrap">{n(t.qtd_atual)} → {n(t.qtd_nova)}</td>
                              <td className="px-2 py-1.5"><Badge variant="outline" className={cn("text-[10px]", corAcao(t.acao))}>{rot}{t.origem ? ` (${t.origem})` : ""}</Badge></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {podeConfirmar && exigeCiencia && (
                <label className="flex items-start gap-2 text-xs text-foreground cursor-pointer">
                  <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(v === true)} className="mt-0.5" />
                  Entendo que os operadores serão notificados para separar a mercadoria e refazer a conferência/separação desses itens.
                </label>
              )}
            </>
          )}

          {passo === "resultado" && resultado && (
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-xs text-sky-400 space-y-1.5">
              <p className="flex items-center gap-2 font-semibold">
                <ArrowRightLeft size={14} /> Transferir excedente do endereço de cancelamento ({resultado.endereco_cancelamento ?? "—"})
              </p>
              {(resultado.transferencias_sugeridas ?? []).map((t, i) => (
                <p key={i} className="font-mono text-foreground">{n(t.quantidade)} un {t.sku} → {t.endereco_destino}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {passo === "motivo" && (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={() => analisar()} disabled={analisando}>
                {analisando && <Loader2 size={14} className="animate-spin" />} Analisar impacto
              </Button>
            </>
          )}
          {passo === "previa" && (
            <>
              <Button variant="outline" onClick={() => setPasso("motivo")} disabled={confirmando || analisando}>Voltar</Button>
              <Button variant="outline" onClick={onClose} disabled={confirmando}>Cancelar</Button>
              {podeConfirmar && (
                <Button variant="destructive" onClick={confirmar} disabled={confirmando || analisando || (exigeCiencia && !ciente)}>
                  {confirmando || analisando ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} />} Confirmar remoção
                </Button>
              )}
            </>
          )}
          {passo === "resultado" && (
            <Button onClick={() => { onSuccess(resultado); onClose(); }}>Entendi</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
