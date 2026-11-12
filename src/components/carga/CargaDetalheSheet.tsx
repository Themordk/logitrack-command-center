import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, CheckCircle2, GripVertical, Loader2, Lock, PackagePlus, Printer, Save, Send, Trash2, Undo2, XCircle,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { parseError } from "@/lib/errorMapper";
import { cargaService, type CargaDetalhe, type CargaDocumento, type RpcResposta } from "@/lib/cargaService";
import { UNIDADE_EMBARQUE_LABEL, formatarNumero, moverItem } from "@/lib/cargaExibicao";
import { imprimirRomaneio } from "@/lib/romaneioPdf";
import { abrirJanelaImpressao } from "@/modules/reports/utils/exporters";
import { CargaStatusBadge } from "@/components/carga/CargaStatusBadge";
import { CapacidadeVeiculo } from "@/components/carga/CapacidadeVeiculo";
import type { BoxOpcao, VeiculoOpcao } from "@/hooks/useCargaCadastros";

interface Props {
  cargaId: string | null;
  onClose: () => void;
  tenantId: string;
  empresaId: string;
  usuarioId: string;
  podeEditar: boolean;
  veiculos: VeiculoOpcao[];
  boxes: BoxOpcao[];
}

const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60";
const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

function mostrarErro(err: unknown, contexto: string) {
  const p = parseError(err, contexto);
  toast.error(p.title, { description: p.instruction || p.details });
}

function mostrarAvisos(r: RpcResposta<unknown>) {
  for (const a of r.avisos ?? []) toast.warning(a.mensagem);
}

export function CargaDetalheSheet({ cargaId, onClose, tenantId, empresaId, usuarioId, podeEditar, veiculos, boxes }: Props) {
  const qc = useQueryClient();
  const detalhe = useQuery({
    queryKey: ["carga", tenantId, cargaId],
    enabled: !!cargaId,
    queryFn: () => cargaService.obter(tenantId, cargaId as string),
    // Torre de controle: acompanha o carregamento em tempo quase real.
    refetchInterval: (q) => (q.state.data?.status === "EM_CARREGAMENTO" || q.state.data?.status === "LIBERADA" ? 15_000 : false),
  });
  const carga = detalhe.data;

  const [ordem, setOrdem] = useState<CargaDocumento[]>([]);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [cab, setCab] = useState({ veiculoId: "", boxId: "", motorista: "", observacao: "" });
  const [confirmar, setConfirmar] = useState<null | "liberar" | "fechar" | "cancelar">(null);
  const [motivo, setMotivo] = useState("");
  const [adicionarAberto, setAdicionarAberto] = useState(false);
  const [paraAdicionar, setParaAdicionar] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!carga) return;
    setOrdem(carga.documentos);
    setCab({
      veiculoId: carga.veiculo?.id ?? "", boxId: carga.box?.id ?? "",
      motorista: carga.motorista ?? "", observacao: carga.observacao ?? "",
    });
  }, [carga]);

  const ordemAlterada = useMemo(
    () => !!carga && ordem.map((d) => d.carga_documento_id).join() !== carga.documentos.map((d) => d.carga_documento_id).join(),
    [ordem, carga],
  );
  const cabAlterado = !!carga && (
    cab.veiculoId !== (carga.veiculo?.id ?? "") || cab.boxId !== (carga.box?.id ?? "")
    || cab.motorista !== (carga.motorista ?? "") || cab.observacao !== (carga.observacao ?? ""));

  const atualizar = (dados?: CargaDetalhe) => {
    if (dados) qc.setQueryData(["carga", tenantId, cargaId], dados);
    void qc.invalidateQueries({ queryKey: ["cargas", tenantId, empresaId] });
    void qc.invalidateQueries({ queryKey: ["carga-sugestao", tenantId, empresaId] });
  };

  const sugestao = useQuery({
    queryKey: ["carga-sugestao", tenantId, empresaId],
    enabled: adicionarAberto,
    queryFn: () => cargaService.sugerir(tenantId, empresaId),
  });

  const salvarCab = useMutation({
    mutationFn: () => cargaService.montar({
      tenantId, empresaId, usuarioId, cargaId,
      veiculoId: cab.veiculoId || null, boxId: cab.boxId || null,
      motorista: cab.motorista, observacao: cab.observacao,
    }),
    onSuccess: (r) => { toast.success(r.mensagem ?? "Carga atualizada."); mostrarAvisos(r); atualizar(r.dados); },
    onError: (e) => mostrarErro(e, "carga-cabecalho"),
  });

  const adicionar = useMutation({
    mutationFn: () => cargaService.montar({ tenantId, empresaId, usuarioId, cargaId, ondas: [...paraAdicionar] }),
    onSuccess: (r) => {
      toast.success(r.mensagem ?? "Ondas adicionadas."); mostrarAvisos(r); atualizar(r.dados);
      setParaAdicionar(new Set()); setAdicionarAberto(false);
    },
    onError: (e) => mostrarErro(e, "carga-adicionar-ondas"),
  });

  const salvarOrdem = useMutation({
    mutationFn: () => cargaService.reordenar(tenantId, usuarioId, cargaId as string, ordem.map((d) => d.carga_documento_id)),
    onSuccess: (r) => { toast.success(r.mensagem ?? "Ordem salva."); atualizar(r.dados); },
    onError: (e) => mostrarErro(e, "carga-reordenar"),
  });

  const removerOnda = useMutation({
    mutationFn: (movimentoSaidaId: string) => cargaService.removerOnda(tenantId, usuarioId, cargaId as string, movimentoSaidaId),
    onSuccess: (r) => { toast.success(r.mensagem ?? "Onda retirada."); atualizar(r.dados); },
    onError: (e) => mostrarErro(e, "carga-remover-onda"),
  });

  const acao = useMutation({
    mutationFn: async (tipo: "liberar" | "fechar" | "cancelar") => {
      if (tipo === "liberar") return cargaService.liberar(tenantId, usuarioId, cargaId as string);
      if (tipo === "fechar") return cargaService.fechar(tenantId, cargaId as string, usuarioId);
      return cargaService.cancelar(tenantId, usuarioId, cargaId as string, motivo.trim());
    },
    onSuccess: (r) => { toast.success(r.mensagem ?? "Pronto."); atualizar(r.dados); setConfirmar(null); setMotivo(""); },
    onError: (e) => mostrarErro(e, "carga-acao"),
  });

  const imprimir = async () => {
    if (!cargaId) return;
    const janela = abrirJanelaImpressao(); // reservada no clique para não ser bloqueada
    try {
      const r = await cargaService.romaneio(tenantId, cargaId);
      imprimirRomaneio(r, janela);
    } catch (e) {
      janela?.close();
      mostrarErro(e, "carga-romaneio");
    }
  };

  const ocupado = salvarCab.isPending || adicionar.isPending || salvarOrdem.isPending || removerOnda.isPending || acao.isPending;
  const pendentes = carga ? carga.progresso.total - carga.progresso.embarcadas : 0;
  const podeReordenar = podeEditar && !!carga?.acoes.reordenar;
  const veiculoSel = veiculos.find((v) => v.id === cab.veiculoId) ?? null;

  const ondasDisponiveis = (sugestao.data?.ondas ?? []).filter((o) => !carga?.ondas.some((c) => c.movimento_saida_id === o.movimento_saida_id));

  return (
    <Sheet open={!!cargaId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl !p-0 flex flex-col gap-0 bg-card">
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0 text-left">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2">
                Carga <span className="font-mono">#{carga?.numero_carga ?? "…"}</span>
                {carga && <CargaStatusBadge status={carga.status} />}
              </SheetTitle>
              {carga && (
                <p className="text-xs text-muted-foreground mt-1">
                  Montada por {carga.montada_por_nome ?? "—"} em {dataHora(carga.created_at)}
                  {carga.unidade_embarque && <> · Embarque por <b className="text-foreground">{UNIDADE_EMBARQUE_LABEL[carga.unidade_embarque]}</b></>}
                </p>
              )}
            </div>
            {carga && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={imprimir} disabled={carga.documentos.length === 0}>
                  <Printer size={14} /> Romaneio
                </Button>
                {podeEditar && carga.acoes.liberar && (
                  <Button size="sm" onClick={() => setConfirmar("liberar")} disabled={ocupado || cabAlterado || ordemAlterada}>
                    <Send size={14} /> Liberar para embarque
                  </Button>
                )}
                {podeEditar && carga.acoes.fechar && (
                  <Button size="sm" variant="secondary" onClick={() => setConfirmar("fechar")} disabled={ocupado || pendentes > 0}
                    title={pendentes > 0 ? `Faltam ${pendentes} unidade(s) para embarcar` : undefined}>
                    <Lock size={14} /> Fechar carga
                  </Button>
                )}
                {podeEditar && carga.acoes.cancelar && (
                  <Button size="sm" variant="outline" className="text-red-400 border-red-500/40 hover:bg-red-500/10"
                    onClick={() => setConfirmar("cancelar")} disabled={ocupado}>
                    <XCircle size={14} /> Cancelar
                  </Button>
                )}
              </div>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {detalhe.isLoading || !carga ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {carga.status === "CANCELADA" && carga.motivo_cancelamento && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  Cancelada em {dataHora(carga.cancelada_em)}: {carga.motivo_cancelamento}
                </div>
              )}

              {/* Progresso do embarque */}
              {carga.progresso.total > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="font-medium text-foreground">Embarque</span>
                    <span className="font-mono text-foreground">{carga.progresso.embarcadas} / {carga.progresso.total} unidades</span>
                  </div>
                  <div className="h-2 rounded-full bg-secondary overflow-hidden" role="progressbar" aria-label="Unidades embarcadas"
                    aria-valuemin={0} aria-valuemax={carga.progresso.total} aria-valuenow={carga.progresso.embarcadas}>
                    <div className="h-full bg-green-500 transition-all" style={{ width: `${(carga.progresso.embarcadas / carga.progresso.total) * 100}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {carga.fechada_em ? `Fechada em ${dataHora(carga.fechada_em)} por ${carga.fechada_por_nome ?? "—"}.`
                      : carga.iniciada_em ? `Carregamento iniciado em ${dataHora(carga.iniciada_em)}.` : "Aguardando o primeiro bip no coletor."}
                  </p>
                </div>
              )}

              {/* Cabeçalho */}
              <section className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div>
                    <label htmlFor="carga-veiculo" className="block text-xs font-medium text-muted-foreground mb-1.5">Veículo *</label>
                    <select id="carga-veiculo" className={inputClass} value={cab.veiculoId} disabled={!podeEditar || !carga.acoes.editar}
                      onChange={(e) => setCab((c) => ({ ...c, veiculoId: e.target.value }))}>
                      <option value="">Selecione…</option>
                      {veiculos.map((v) => <option key={v.id} value={v.id}>{v.descricao}{v.placa ? ` — ${v.placa}` : ""}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="carga-box" className="block text-xs font-medium text-muted-foreground mb-1.5">Box / doca</label>
                    <select id="carga-box" className={inputClass} value={cab.boxId} disabled={!podeEditar || !carga.acoes.editar}
                      onChange={(e) => setCab((c) => ({ ...c, boxId: e.target.value }))}>
                      <option value="">Sem box</option>
                      {boxes.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="carga-motorista" className="block text-xs font-medium text-muted-foreground mb-1.5">Motorista</label>
                    <input id="carga-motorista" className={inputClass} value={cab.motorista} disabled={!podeEditar || !carga.acoes.editar}
                      maxLength={120} onChange={(e) => setCab((c) => ({ ...c, motorista: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Capacidade do veículo</p>
                    <CapacidadeVeiculo medidas={[
                      { rotulo: "Peso", usado: carga.peso_total, limite: veiculoSel?.peso_total ?? carga.veiculo?.peso_total, unidade: "kg" },
                      { rotulo: "Volume", usado: carga.m3_total, limite: veiculoSel?.m3 ?? carga.veiculo?.m3, unidade: "m³", casas: 2 },
                      { rotulo: "Paletes / HUs", usado: carga.pallets_total, limite: veiculoSel?.total_pallet ?? carga.veiculo?.total_pallet, unidade: "un" },
                    ]} />
                  </div>
                  <div>
                    <label htmlFor="carga-obs" className="block text-xs font-medium text-muted-foreground mb-1.5">Observação</label>
                    <Textarea id="carga-obs" rows={2} value={cab.observacao} disabled={!podeEditar || !carga.acoes.editar} maxLength={500}
                      onChange={(e) => setCab((c) => ({ ...c, observacao: e.target.value }))} />
                  </div>
                </div>
              </section>
              {podeEditar && carga.acoes.editar && cabAlterado && (
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setCab({ veiculoId: carga.veiculo?.id ?? "", boxId: carga.box?.id ?? "", motorista: carga.motorista ?? "", observacao: carga.observacao ?? "" })}>
                    <Undo2 size={14} /> Desfazer
                  </Button>
                  <Button size="sm" onClick={() => salvarCab.mutate()} disabled={ocupado}>
                    {salvarCab.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar dados
                  </Button>
                </div>
              )}

              <Separator />

              {/* Ondas */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-foreground">Ondas ({carga.ondas.length})</h3>
                  {podeEditar && carga.acoes.editar && (
                    <Button variant="outline" size="sm" onClick={() => setAdicionarAberto((v) => !v)}>
                      <PackagePlus size={14} /> Adicionar ondas
                    </Button>
                  )}
                </div>
                {adicionarAberto && (
                  <div className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    {sugestao.isLoading ? (
                      <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
                    ) : ondasDisponiveis.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2">Nenhuma outra onda aguardando embarque.</p>
                    ) : (
                      <>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {ondasDisponiveis.map((o) => (
                            <label key={o.movimento_saida_id} className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-secondary/40 cursor-pointer text-sm">
                              <Checkbox checked={paraAdicionar.has(o.movimento_saida_id)} onCheckedChange={(v) => setParaAdicionar((s) => {
                                const n = new Set(s); if (v) n.add(o.movimento_saida_id); else n.delete(o.movimento_saida_id); return n;
                              })} />
                              <span className="font-mono font-semibold">#{o.numero_onda}</span>
                              <span className="text-muted-foreground truncate flex-1">{o.grupo_rotulo}</span>
                              <span className="text-xs text-muted-foreground">{o.documentos} ped.</span>
                            </label>
                          ))}
                        </div>
                        <div className="flex justify-end mt-2">
                          <Button size="sm" disabled={paraAdicionar.size === 0 || ocupado} onClick={() => adicionar.mutate()}>
                            {adicionar.isPending && <Loader2 size={14} className="animate-spin" />} Adicionar {paraAdicionar.size || ""}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {carga.ondas.map((o) => (
                    <span key={o.movimento_saida_id} className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full border border-border bg-secondary/30 text-sm">
                      <span className="font-mono font-semibold">#{o.numero_onda}</span>
                      <span className="text-xs text-muted-foreground">{o.documentos} ped.</span>
                      {podeEditar && carga.acoes.editar && (
                        <button type="button" onClick={() => removerOnda.mutate(o.movimento_saida_id)} disabled={ocupado}
                          className="p-1 rounded-full text-muted-foreground hover:text-red-400 hover:bg-red-500/10" aria-label={`Retirar onda ${o.numero_onda} da carga`}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </section>

              {/* Ordem de embarque */}
              <section>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold text-foreground">Ordem de embarque ({ordem.length} pedidos)</h3>
                  {podeReordenar && ordemAlterada && (
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setOrdem(carga.documentos)}><Undo2 size={14} /> Desfazer</Button>
                      <Button size="sm" onClick={() => salvarOrdem.mutate()} disabled={ocupado}>
                        {salvarOrdem.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar ordem
                      </Button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  O primeiro da lista é o primeiro a subir no veículo (normalmente a última entrega). Arraste ou use as setas.
                </p>
                <ol className="space-y-1.5">
                  {ordem.map((d, idx) => {
                    const completo = d.unidades_total > 0 && d.unidades_embarcadas === d.unidades_total;
                    return (
                      <li
                        key={d.carga_documento_id}
                        draggable={podeReordenar}
                        onDragStart={() => setArrastando(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { if (arrastando !== null) setOrdem((o) => moverItem(o, arrastando, idx)); setArrastando(null); }}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${completo ? "border-green-500/30 bg-green-500/5" : "border-border bg-secondary/20"} ${podeReordenar ? "cursor-grab active:cursor-grabbing" : ""}`}
                      >
                        {podeReordenar && <GripVertical size={14} className="text-muted-foreground/50 shrink-0" aria-hidden="true" />}
                        <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-foreground truncate">
                            <span className="font-mono font-semibold">Pedido {d.numero_pedido ?? d.codigo_erp ?? "—"}</span>
                            <span className="text-muted-foreground"> · {d.parceiro ?? "—"}</span>
                          </p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[d.cidade, d.uf].filter(Boolean).join("/") || "—"} · Onda #{d.numero_onda}
                          </p>
                        </div>
                        {d.unidades_total > 0 && (
                          <span className={`text-xs font-mono shrink-0 inline-flex items-center gap-1 ${completo ? "text-green-400" : "text-muted-foreground"}`}>
                            {completo && <CheckCircle2 size={12} aria-hidden="true" />}{d.unidades_embarcadas}/{d.unidades_total}
                          </span>
                        )}
                        {podeReordenar && (
                          <div className="flex flex-col shrink-0">
                            <button type="button" className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === 0}
                              onClick={() => setOrdem((o) => moverItem(o, idx, idx - 1))} aria-label={`Subir pedido ${d.numero_pedido ?? ""}`}>
                              <ArrowUp size={14} />
                            </button>
                            <button type="button" className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={idx === ordem.length - 1}
                              onClick={() => setOrdem((o) => moverItem(o, idx, idx + 1))} aria-label={`Descer pedido ${d.numero_pedido ?? ""}`}>
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {ordem.length === 0 && (
                  <p className="text-sm text-muted-foreground py-6 text-center">Nenhum pedido nesta carga.</p>
                )}
              </section>
            </>
          )}
        </div>

        <AlertDialog open={confirmar !== null} onOpenChange={(v) => !v && setConfirmar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirmar === "liberar" && `Liberar a carga #${carga?.numero_carga} para o embarque?`}
                {confirmar === "fechar" && `Fechar a carga #${carga?.numero_carga}?`}
                {confirmar === "cancelar" && `Cancelar a carga #${carga?.numero_carga}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmar === "liberar" && "O coletor passa a mostrar a carga e as unidades a bipar seguem a ordem atual. Ainda dá para reordenar o que não foi bipado."}
                {confirmar === "fechar" && "As ondas desta carga ficam concluídas e o ERP recebe o aviso de saída expedida. Depois disso a carga não muda mais."}
                {confirmar === "cancelar" && "As tarefas de embarque são canceladas e as ondas voltam para a montagem. Informe o motivo."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {confirmar === "cancelar" && (
              <Textarea autoFocus rows={3} placeholder="Motivo do cancelamento" value={motivo} maxLength={300}
                onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo do cancelamento" />
            )}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={acao.isPending}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                disabled={acao.isPending || (confirmar === "cancelar" && motivo.trim().length < 3)}
                onClick={(e) => { e.preventDefault(); if (confirmar) acao.mutate(confirmar); }}
                className={confirmar === "cancelar" ? "bg-red-600 hover:bg-red-700" : undefined}
              >
                {acao.isPending && <Loader2 size={14} className="animate-spin" />}
                {confirmar === "liberar" ? "Liberar" : confirmar === "fechar" ? "Fechar carga" : "Cancelar carga"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
