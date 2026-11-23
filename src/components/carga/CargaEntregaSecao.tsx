/**
 * Módulo de Entregas — seção "Entrega" no detalhe da carga (web).
 * Lê entrega_carga_detalhe (status, tempos, paradas, eventos, permissões) e age só pelas RPCs
 * entrega_gerar_manual / entrega_reatribuir / entrega_cancelar / entrega_parada_estornar.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronDown, Loader2, MapPinned, RotateCcw, Send, UserRoundCog, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseError } from "@/lib/errorMapper";
import { abrirAnexo } from "@/lib/ocorrenciaAnexos";
import { entregaService, type EntregaParada } from "@/lib/entregaService";
import {
  ENTREGA_EVENTO_LABEL, ENTREGA_STATUS_LABEL, PARADA_STATUS_LABEL, formatarDiaHora, formatarDuracao, formatarHora,
} from "@/lib/entregaExibicao";
import { SeletorBusca } from "@/components/carga/SeletorBusca";

interface Props {
  tenantId: string;
  usuarioId: string;
  cargaId: string;
}

type Acao = { tipo: "reatribuir" } | { tipo: "cancelar" } | { tipo: "estornar"; parada: EntregaParada };

const STATUS_TOM: Record<string, string> = {
  AGUARDANDO_ACEITE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  EM_ROTA: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CONCLUIDA: "bg-green-500/15 text-green-400 border-green-500/30",
  CANCELADA: "bg-red-500/15 text-red-400 border-red-500/30",
};
const PARADA_COR: Record<string, string> = { ENTREGUE: "bg-green-500", NAO_ENTREGUE: "bg-red-500", PENDENTE: "bg-yellow-500" };

function erro(e: unknown, contexto: string) {
  const p = parseError(e, contexto);
  toast.error(p.title, { description: p.instruction || p.details });
}

export function CargaEntregaSecao({ tenantId, usuarioId, cargaId }: Props) {
  const qc = useQueryClient();
  const chave = ["carga-entrega", tenantId, cargaId];
  const q = useQuery({
    queryKey: chave,
    queryFn: () => entregaService.daCarga(tenantId, usuarioId || null, cargaId),
    refetchInterval: (query) => {
      const st = query.state.data?.entrega?.status;
      return st === "AGUARDANDO_ACEITE" || st === "EM_ROTA" ? 30_000 : false;
    },
  });
  const [acao, setAcao] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState("");
  const [novoUsuario, setNovoUsuario] = useState("");
  const [verEventos, setVerEventos] = useState(false);

  const entregadores = useQuery({
    queryKey: ["entregadores", tenantId],
    enabled: acao?.tipo === "reatribuir",
    queryFn: () => entregaService.entregadores(tenantId),
  });

  const fechar = () => { setAcao(null); setMotivo(""); setNovoUsuario(""); };
  const aplicar = (r: { mensagem?: string }) => {
    toast.success(r.mensagem ?? "Feito.");
    void qc.invalidateQueries({ queryKey: chave });
    fechar();
  };

  const gerar = useMutation({
    mutationFn: () => entregaService.gerarManual(tenantId, usuarioId || null, cargaId),
    onSuccess: aplicar,
    onError: (e) => erro(e, "entrega-gerar"),
  });
  const executar = useMutation({
    mutationFn: async () => {
      const ent = q.data?.entrega;
      if (!acao || !ent) throw new Error("Nada a fazer.");
      if (acao.tipo === "reatribuir") return entregaService.reatribuir(tenantId, usuarioId || null, ent.id, novoUsuario, motivo);
      if (acao.tipo === "cancelar") return entregaService.cancelar(tenantId, usuarioId || null, ent.id, motivo);
      return entregaService.estornarParada(tenantId, usuarioId || null, acao.parada.id, motivo);
    },
    onSuccess: aplicar,
    onError: (e) => erro(e, `entrega-${acao?.tipo ?? "acao"}`),
  });

  const verFoto = async (path: string | null | undefined) => {
    if (!path) return;
    const url = await abrirAnexo(path);
    if (!url) toast.error("Não foi possível abrir a foto.");
  };

  if (q.isLoading) {
    return <div className="rounded-lg border border-border p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={14} className="animate-spin" /> Carregando entrega…</div>;
  }
  if (q.isError || !q.data) {
    return <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground">Não foi possível carregar a entrega desta carga.</div>;
  }

  const { entrega: ent, motivo_sem_entrega, pode_gerar, pode_gerenciar, eventos, veiculo_entregador } = q.data;
  const ativa = ent && (ent.status === "AGUARDANDO_ACEITE" || ent.status === "EM_ROTA");
  const finalizadas = ent ? ent.paradas_entregues + ent.paradas_nao_entregues : 0;

  return (
    <section className="rounded-lg border border-border p-4 space-y-3" aria-labelledby="carga-entrega-titulo">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 id="carga-entrega-titulo" className="text-sm font-semibold text-foreground flex items-center gap-2">
          <MapPinned size={15} aria-hidden="true" /> Entrega
          {ent && <span className={`text-[11px] px-2 py-0.5 rounded-full border ${STATUS_TOM[ent.status]}`}>{ENTREGA_STATUS_LABEL[ent.status]}</span>}
        </h3>
        <div className="flex gap-2">
          {pode_gerar && (
            <Button size="sm" onClick={() => gerar.mutate()} disabled={gerar.isPending}>
              {gerar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Gerar entrega
            </Button>
          )}
          {ent && ativa && pode_gerenciar && (
            <>
              <Button size="sm" variant="outline" onClick={() => setAcao({ tipo: "reatribuir" })}><UserRoundCog size={14} /> Reatribuir</Button>
              <Button size="sm" variant="outline" className="text-red-400 border-red-500/40" onClick={() => setAcao({ tipo: "cancelar" })}>
                <XCircle size={14} /> Cancelar entrega
              </Button>
            </>
          )}
        </div>
      </div>

      {!ent ? (
        <p className="text-sm text-muted-foreground">
          {motivo_sem_entrega ?? "A entrega ainda não foi gerada."}
          {!motivo_sem_entrega && veiculo_entregador && <> Entregador do veículo: <b>{veiculo_entregador}</b>.</>}
        </p>
      ) : (
        <>
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <p><span className="text-muted-foreground">Entregador:</span> <b>{ent.usuario_nome ?? "—"}</b></p>
            <p><span className="text-muted-foreground">Paradas:</span> <span className="font-mono">{finalizadas}/{ent.total_paradas}</span>
              {ent.paradas_nao_entregues > 0 && <span className="text-red-400"> · {ent.paradas_nao_entregues} não entregue(s)</span>}</p>
            <p><span className="text-muted-foreground">Atribuída:</span> {formatarDiaHora(ent.atribuida_em)}</p>
            <p><span className="text-muted-foreground">Aceita:</span> {ent.aceita_em
              ? <>{formatarDiaHora(ent.aceita_em)} <span className="text-muted-foreground">({formatarDuracao(ent.atribuida_em, ent.aceita_em)} após a atribuição)</span></>
              : "aguardando"}</p>
            {ent.concluida_em && <p><span className="text-muted-foreground">Concluída:</span> {formatarDiaHora(ent.concluida_em)}
              {ent.aceita_em && <span className="text-muted-foreground"> ({formatarDuracao(ent.aceita_em, ent.concluida_em)} de rota)</span>}</p>}
            {ent.cancelada_em && <p className="sm:col-span-2 text-red-400">Cancelada em {formatarDiaHora(ent.cancelada_em)}: {ent.motivo_cancelamento}</p>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="py-1.5 pr-2 font-medium">Seq</th>
                  <th className="py-1.5 pr-2 font-medium">Cliente</th>
                  <th className="py-1.5 pr-2 font-medium">Cidade</th>
                  <th className="py-1.5 pr-2 font-medium">Status</th>
                  <th className="py-1.5 pr-2 font-medium">Hora</th>
                  <th className="py-1.5 pr-2 font-medium">Prova</th>
                  {pode_gerenciar && <th className="py-1.5 font-medium sr-only">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {ent.paradas.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-2 font-mono">{p.sequencia}</td>
                    <td className="py-2 pr-2">
                      <span className="block text-foreground">{p.parceiro_nome ?? "—"}</span>
                      <span className="block text-xs text-muted-foreground">{[p.numero_nf ? `NF ${p.numero_nf}` : null, p.numero_pedido ? `Pedido ${p.numero_pedido}` : null].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="py-2 pr-2">{[p.cidade, p.estado].filter(Boolean).join("/") || "—"}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${PARADA_COR[p.status]}`} aria-hidden="true" />
                      {PARADA_STATUS_LABEL[p.status]}
                      {p.status === "PENDENTE" && p.ocorrencia && <span className="block text-xs text-amber-400">com ocorrência</span>}
                    </td>
                    <td className="py-2 pr-2 font-mono">{p.entregue_em ? formatarHora(p.entregue_em) : p.finalizada_em ? formatarHora(p.finalizada_em) : "—"}</td>
                    <td className="py-2 pr-2">
                      {p.foto_canhoto_path && (
                        <button type="button" onClick={() => void verFoto(p.foto_canhoto_path)} className="text-primary hover:underline inline-flex items-center gap-1 text-xs font-medium">
                          <Camera size={12} aria-hidden="true" /> Ver canhoto
                        </button>
                      )}
                      {p.recebedor_nome && <span className="block text-xs text-muted-foreground">Recebido por {p.recebedor_nome}</span>}
                      {p.ocorrencia && (
                        <button type="button" onClick={() => void verFoto(p.ocorrencia?.foto_path)} className="block text-left text-xs font-medium text-amber-400 hover:underline"
                          title={p.ocorrencia.observacao ?? undefined}>
                          Ocorrência #{p.ocorrencia.numero} · {p.ocorrencia.motivo}
                        </button>
                      )}
                      {!p.foto_canhoto_path && !p.ocorrencia && <span className="text-muted-foreground">—</span>}
                    </td>
                    {pode_gerenciar && (
                      <td className="py-2 text-right">
                        {p.status !== "PENDENTE" && (ent.status === "EM_ROTA" || ent.status === "CONCLUIDA") && (
                          <button type="button" onClick={() => setAcao({ tipo: "estornar", parada: p })}
                            className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground" title="Estornar parada (volta a pendente)"
                            aria-label={`Estornar parada ${p.sequencia}`}>
                            <RotateCcw size={13} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {eventos.length > 0 && (
            <div>
              <button type="button" onClick={() => setVerEventos((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                <ChevronDown size={12} className={verEventos ? "rotate-180 transition-transform" : "transition-transform"} aria-hidden="true" />
                Histórico ({eventos.length})
              </button>
              {verEventos && (
                <ul className="mt-2 space-y-1 text-xs">
                  {eventos.map((ev, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="font-mono text-muted-foreground shrink-0">{formatarDiaHora(ev.ocorrido_em)}</span>
                      <span className="text-foreground">{ENTREGA_EVENTO_LABEL[ev.tipo] ?? ev.tipo}</span>
                      {ev.usuario && <span className="text-muted-foreground">· {ev.usuario}</span>}
                      {typeof ev.dados?.motivo === "string" && <span className="text-muted-foreground">· {ev.dados.motivo}</span>}
                      {ev.dados?.fora_de_ordem === true && <span className="text-amber-400">· fora da ordem</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <AlertDialog open={acao !== null} onOpenChange={(v) => !v && fechar()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {acao?.tipo === "reatribuir" && "Reatribuir a entrega"}
              {acao?.tipo === "cancelar" && `Cancelar a entrega da carga #${ent?.numero_carga ?? ""}?`}
              {acao?.tipo === "estornar" && `Estornar a parada ${acao.parada.sequencia} (${acao.parada.parceiro_nome ?? ""})?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {acao?.tipo === "reatribuir" && "O novo entregador recebe o alerta no coletor e precisa aceitar a carga. As paradas já registradas continuam como estão."}
              {acao?.tipo === "cancelar" && "Só é possível sem paradas registradas. A carga some do coletor do entregador."}
              {acao?.tipo === "estornar" && "A parada volta a ficar pendente no coletor. A foto e a ocorrência continuam no histórico."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {acao?.tipo === "reatribuir" && (
            <div>
              <label htmlFor="entrega-novo-usuario" className="block text-xs font-medium text-muted-foreground mb-1.5">Novo entregador</label>
              <SeletorBusca
                id="entrega-novo-usuario"
                value={novoUsuario}
                onChange={setNovoUsuario}
                options={(entregadores.data ?? []).filter((u) => u.id !== ent?.usuario_id).map((u) => ({ value: u.id, label: u.nome, description: u.login }))}
                vazio="Selecione…"
                searchPlaceholder="Nome ou login..."
              />
            </div>
          )}
          <Textarea rows={3} placeholder="Motivo" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo" />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executar.isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executar.isPending || motivo.trim().length < 3 || (acao?.tipo === "reatribuir" && !novoUsuario)}
              onClick={(e) => { e.preventDefault(); executar.mutate(); }}
              className={acao?.tipo === "cancelar" ? "bg-red-600 hover:bg-red-700" : undefined}
            >
              {executar.isPending && <Loader2 size={14} className="animate-spin" />}
              {acao?.tipo === "reatribuir" ? "Reatribuir" : acao?.tipo === "cancelar" ? "Cancelar entrega" : "Estornar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
