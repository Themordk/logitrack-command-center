/** Painel de detalhe do volume (A19): documento, NF, logística, etiqueta, impressões, embarque e ocorrências. */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, Link2, Loader2, PackagePlus, Printer, RefreshCcw, Ruler, Send, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { parseError } from "@/lib/errorMapper";
import { volumesService, VolumeRpcError, type DetalheVolume, type VolumeLinha } from "@/lib/volumesService";
import {
  ORIGEM_IMPRESSAO, STATUS_IMPRESSAO, STATUS_VOLUME, cidadeUf, identificacaoVolume, textoNf,
} from "@/lib/volumesExibicao";

export interface PermissoesVolume { imprimir: boolean; editar: boolean; criar: boolean; cancelar: boolean }

interface Props {
  volumeId: string | null;
  onClose: () => void;
  permissoes: PermissoesVolume;
  onImprimir: (volumes: VolumeLinha[]) => void;
  onCancelar: (v: { id: string; codigo_volume: string; numero_pedido: number | null }) => void;
  onAcrescentar: (alvo: { movimentoSaidaId: string; documentoSaidaId: string; numeroPedido: number | null; atuais: number }) => void;
  onVincular: (alvo: { volumeId: string; codigoVolume: string; pedidos: DetalheVolume["pedidos_da_onda"] }) => void;
  onMedidas: (ids: string[]) => void;
}

const dataHora = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");
const dataPura = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("pt-BR") : "—");
const num = (v: unknown, casas = 3) => (v == null || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas }));

function Campo({ rotulo, valor, mono }: { rotulo: string; valor: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={`text-sm text-foreground break-words ${mono ? "font-mono text-xs" : ""}`}>{valor || "—"}</div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{titulo}</h3>
      {children}
    </section>
  );
}

const Selo = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>{children}</span>
);

const botao = "flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed";

export function VolumeDetalheSheet({ volumeId, onClose, permissoes, onImprimir, onCancelar, onAcrescentar, onVincular, onMedidas }: Props) {
  const qc = useQueryClient();
  const [reenviando, setReenviando] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["volume-detalhe", volumeId],
    enabled: !!volumeId,
    queryFn: () => volumesService.detalhe(volumeId!),
  });
  const d = q.data;
  const v = d?.volume;
  const cancelado = !!d?.cancelamento;
  const status = (v?.status ?? "ABERTO") as keyof typeof STATUS_VOLUME;
  const nf = d?.conferencia_nf;
  const etiqueta = d?.etiqueta ?? null;

  const reenviar = async (jobId: string) => {
    setReenviando(jobId);
    try {
      const r = await volumesService.reenviarJob(jobId);
      toast.success(r.mensagem ?? "Etiqueta reenviada.");
      await qc.invalidateQueries({ queryKey: ["volume-detalhe", volumeId] });
      void qc.invalidateQueries({ queryKey: ["volumes"] });
    } catch (e) {
      if (e instanceof VolumeRpcError) toast.error(e.message);
      else toast.error(parseError(e, "reenviar-job").title);
    } finally { setReenviando(null); }
  };

  return (
    <Sheet open={!!volumeId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{v?.codigo_volume ?? "Volume"}</span>
            {v && <Selo cls={STATUS_VOLUME[status]?.cls ?? ""}>{STATUS_VOLUME[status]?.label ?? status}</Selo>}
            {v && !cancelado && <span className="text-sm text-muted-foreground font-normal">Volume {identificacaoVolume(v)}</span>}
          </SheetTitle>
          <SheetDescription>
            {v ? `Onda ${v.numero_onda ?? "—"} · pedido ${v.numero_pedido ?? "sem pedido"}` : "Carregando..."}
          </SheetDescription>
        </SheetHeader>

        {q.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {q.error instanceof VolumeRpcError ? q.error.message : parseError(q.error, "volume-detalhe").title}
          </div>
        ) : d && v ? (
          <div className="mt-4 space-y-5">
            {/* Ações */}
            {!cancelado && (
              <div className="flex flex-wrap gap-2">
                <button type="button" className={botao} disabled={!permissoes.imprimir} onClick={() => onImprimir([v])}>
                  <Printer size={14} /> {(v.etiqueta_impressoes ?? 0) > 0 ? "Reimprimir" : "Imprimir"}
                </button>
                <button type="button" className={botao} disabled={!permissoes.editar || v.status === "EXPEDIDO"} onClick={() => onMedidas([v.id])}>
                  <Ruler size={14} /> Peso e cubagem
                </button>
                {v.documento_saida_id ? (
                  <button type="button" className={botao} disabled={!permissoes.criar || !v.movimento_saida_id}
                    onClick={() => onAcrescentar({ movimentoSaidaId: v.movimento_saida_id!, documentoSaidaId: v.documento_saida_id!, numeroPedido: v.numero_pedido, atuais: d.volumes_do_pedido.length })}>
                    <PackagePlus size={14} /> Acrescentar volume ao pedido
                  </button>
                ) : (
                  <button type="button" className={botao} disabled={!permissoes.editar}
                    onClick={() => onVincular({ volumeId: v.id, codigoVolume: v.codigo_volume, pedidos: d.pedidos_da_onda })}>
                    <Link2 size={14} /> Ligar a um pedido
                  </button>
                )}
                <button type="button" className={`${botao} text-destructive border-destructive/40 hover:bg-destructive/10`}
                  disabled={!permissoes.cancelar || v.status === "EXPEDIDO" || v.embarque_status === "EMBARCADA"}
                  title={v.embarque_status ? "Volumes numa carga não podem ser cancelados" : undefined}
                  onClick={() => onCancelar({ id: v.id, codigo_volume: v.codigo_volume, numero_pedido: v.numero_pedido })}>
                  <XCircle size={14} /> Cancelar volume
                </button>
              </div>
            )}

            {cancelado && d.cancelamento && (
              <div className="rounded-lg border border-gray-500/30 bg-gray-500/10 p-3 text-sm space-y-1">
                <div className="font-medium text-foreground">Cancelado em {dataHora(d.cancelamento.cancelado_em)} por {d.cancelamento.cancelado_por_nome ?? "—"}</div>
                <div className="text-muted-foreground">Motivo: {d.cancelamento.motivo}</div>
                {d.cancelamento.status_anterior && <div className="text-xs text-muted-foreground">Status antes do cancelamento: {d.cancelamento.status_anterior}</div>}
              </div>
            )}

            {!cancelado && !v.documento_saida_id && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm text-yellow-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                Volume sem pedido: a etiqueta sai sem cliente e sem NF. Use “Ligar a um pedido”.
              </div>
            )}
            {nf?.divergente && (
              <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>O pedido tem {nf.wms_volumes} volume(s) e a NF {nf.nota_fiscal ?? ""} informa {nf.nf_qtd_volumes}. Regra do tipo de saída: {nf.regra === "BLOQUEAR" ? "bloquear o fechamento da carga" : nf.regra === "AVISAR" ? "avisar" : "ignorar"}.</span>
              </div>
            )}

            <Secao titulo="Documento">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo rotulo="Pedido" valor={v.numero_pedido} mono />
                <Campo rotulo="Cliente" valor={v.parceiro_nome} />
                <Campo rotulo="Cidade / UF" valor={cidadeUf(v.parceiro_cidade, v.parceiro_uf)} />
                <Campo rotulo="Nota fiscal" valor={textoNf(v.nf_numero, v.nf_serie) || (v.documento_saida_id ? "Sem NF autorizada" : "—")} mono />
                <Campo rotulo="Emissão da NF" valor={dataPura(v.nf_data_emissao as string | null)} />
                <Campo rotulo="Volumes (NF / WMS)" valor={
                  v.nf_qtd_volumes != null ? (
                    <span className={nf?.divergente ? "text-red-400 font-medium" : ""}>{v.nf_qtd_volumes} / {v.total_volumes_pedido ?? "—"}</span>
                  ) : `— / ${v.total_volumes_pedido ?? "—"}`} />
                <div className="col-span-2 sm:col-span-3"><Campo rotulo="Chave de acesso" valor={v.nf_chave as string | null} mono /></div>
              </div>
            </Secao>

            <Separator />
            <Secao titulo="Logística">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Campo rotulo="Onda" valor={v.numero_onda} mono />
                <Campo rotulo="Destino da onda" valor={v.destino_carga} />
                <Campo rotulo="Carga" valor={v.numero_carga ? `#${v.numero_carga}` : "Fora de carga"} />
                <Campo rotulo="Embarque" valor={v.embarque_status === "EMBARCADA" ? `Embarcado em ${dataHora(v.embarcada_em)}${v.embarcada_por_nome ? ` por ${v.embarcada_por_nome}` : ""}` : v.embarque_status ? "Aguardando bipagem" : "—"} />
                <Campo rotulo="Peso bruto" valor={v.peso_bruto != null ? `${num(v.peso_bruto)} kg` : "—"} />
                <Campo rotulo="Cubagem" valor={v.m3 != null ? `${num(v.m3, 4)} m³` : "—"} />
                <Campo rotulo="Criado em" valor={dataHora(v.created_at)} />
                <Campo rotulo="Criado por" valor={v.criado_por_nome} />
              </div>
            </Secao>

            {d.volumes_do_pedido.length > 0 && (
              <>
                <Separator />
                <Secao titulo={`Volumes do ${v.documento_saida_id ? "pedido" : "volume sem pedido"} (${d.volumes_do_pedido.length})`}>
                  <div className="flex flex-wrap gap-1.5">
                    {d.volumes_do_pedido.map((x) => (
                      <span key={x.id} className={`font-mono text-[11px] px-2 py-0.5 rounded border ${x.id === v.id ? "border-primary/50 text-primary" : "border-border text-muted-foreground"}`}>
                        {String(x.numero_volume ?? "?").padStart(2, "0")} · {x.codigo_volume}
                      </span>
                    ))}
                  </div>
                </Secao>
              </>
            )}

            {etiqueta && (
              <>
                <Separator />
                <Secao titulo="Dados da etiqueta (como sai na impressão)">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {Object.entries(etiqueta).map(([k, val]) => (
                      <div key={k} className="flex justify-between gap-2 border-b border-border/40 py-0.5">
                        <span className="font-mono text-muted-foreground">{k}</span>
                        <span className="text-foreground text-right truncate" title={String(val)}>{String(val)}</span>
                      </div>
                    ))}
                  </div>
                </Secao>
              </>
            )}

            <Separator />
            <Secao titulo={`Impressões (${d.impressoes.length})`}>
              {d.impressoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma etiqueta foi enviada para impressão.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead><tr className="text-left text-muted-foreground border-b border-border">
                      <th className="py-1.5 pr-2 font-medium">Quando</th><th className="py-1.5 pr-2 font-medium">Origem</th>
                      <th className="py-1.5 pr-2 font-medium">Status</th><th className="py-1.5 pr-2 font-medium">Impressora</th>
                      <th className="py-1.5 pr-2 font-medium">Por</th><th className="py-1.5 font-medium sr-only">Ação</th>
                    </tr></thead>
                    <tbody>
                      {d.impressoes.map((i) => (
                        <tr key={i.id} className="border-b border-border/40 align-top">
                          <td className="py-1.5 pr-2 whitespace-nowrap">{dataHora(i.criado_em)}{i.quantidade_copias && i.quantidade_copias > 1 ? ` · ${i.quantidade_copias} cópias` : ""}</td>
                          <td className="py-1.5 pr-2">
                            {ORIGEM_IMPRESSAO[i.origem ?? ""] ?? i.origem ?? "—"}
                            {i.motivo && <div className="text-muted-foreground">Motivo: {i.motivo}</div>}
                          </td>
                          <td className="py-1.5 pr-2">
                            <Selo cls={STATUS_IMPRESSAO[i.status]?.cls ?? ""}>{STATUS_IMPRESSAO[i.status]?.label ?? i.status}</Selo>
                            {i.erro_mensagem && i.status !== "IMPRESSO" && <div className="text-muted-foreground mt-0.5">{i.erro_mensagem}</div>}
                            {i.nota_fiscal && <div className="text-muted-foreground mt-0.5">NF {i.nota_fiscal}</div>}
                          </td>
                          <td className="py-1.5 pr-2">{i.impressora_nome ?? "—"}</td>
                          <td className="py-1.5 pr-2">{i.solicitado_por_nome ?? "Sistema"}</td>
                          <td className="py-1.5 text-right">
                            {!cancelado && ["ERRO", "CANCELADO", "PENDENTE"].includes(i.status) && permissoes.editar && (
                              <button type="button" onClick={() => void reenviar(i.id)} disabled={reenviando === i.id}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-border hover:bg-secondary disabled:opacity-40"
                                aria-label={`Reenviar impressão de ${dataHora(i.criado_em)}`}>
                                {reenviando === i.id ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Reenviar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Secao>

            <Separator />
            <Secao titulo="Embarque">
              {d.embarque.length === 0 ? (
                <p className="text-sm text-muted-foreground">O volume ainda não entrou em nenhuma carga.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {d.embarque.map((e) => (
                    <li key={`${e.carga_id}-${e.incluida_em}`} className="flex items-center gap-2">
                      {e.unidade_status === "EMBARCADA" ? <CheckCircle2 size={14} className="text-green-400" aria-hidden="true" /> : <RefreshCcw size={14} className="text-muted-foreground" aria-hidden="true" />}
                      <span>Carga #{e.numero_carga} ({e.carga_status.toLowerCase().replace("_", " ")}) · {e.unidade_status === "EMBARCADA" ? `embarcado em ${dataHora(e.embarcada_em)}${e.embarcada_por_nome ? ` por ${e.embarcada_por_nome}` : ""}` : e.unidade_status === "CANCELADA" ? "removido da carga" : "aguardando bipagem"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            {d.ocorrencias.length > 0 && (
              <>
                <Separator />
                <Secao titulo="Ocorrências da expedição deste pedido">
                  <ul className="space-y-2 text-xs">
                    {d.ocorrencias.map((o) => (
                      <li key={o.id} className="rounded border border-border/60 p-2">
                        <div className="flex justify-between gap-2 text-muted-foreground">
                          <span>#{o.numero ?? "—"} · {o.status} · {o.prioridade}</span><span>{dataHora(o.criado_em)}</span>
                        </div>
                        <div className="text-foreground mt-0.5">{o.observacao}</div>
                      </li>
                    ))}
                  </ul>
                </Secao>
              </>
            )}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
