/**
 * Fluxo de Expedição · F6.6 — acompanhamento do carregamento (aba Cargas › olho).
 * Mostra quem carregou e quando (resumo por operador e data/hora por volume), a situação de cada volume
 * e os eventos de rastreabilidade (veículo, volumes gerados no embarque, códigos digitados).
 * Atualiza sozinho a cada 10 s enquanto a carga está liberada ou em carregamento.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Keyboard, Loader2, Package, RefreshCcw, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cargaService } from "@/lib/cargaService";
import { parseError } from "@/lib/errorMapper";
import { CargaStatusBadge } from "@/components/carga/CargaStatusBadge";

interface Props {
  cargaId: string | null;
  tenantId: string;
  onClose: () => void;
}

const dataHora = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "—";

const EVENTO_LABEL: Record<string, string> = {
  VEICULO_CONFIRMADO: "Veículo confirmado pelo QR",
  VEICULO_DIVERGENTE: "Tentativa com veículo errado",
  VEICULO_CODIGO_INVALIDO: "Etiqueta de veículo não reconhecida",
  VOLUMES_GERADOS: "Volumes gerados no embarque",
  VOLUME_DIGITADO: "Código de volume digitado",
};
const EVENTO_ALERTA = new Set(["VEICULO_DIVERGENTE", "VEICULO_CODIGO_INVALIDO", "VOLUME_DIGITADO"]);

const th = "px-3 py-2 text-left text-[11px] font-medium text-muted-foreground uppercase bg-secondary whitespace-nowrap";
const pilula = (ativo: boolean) => `px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
  ativo ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"}`;

export function CargaAcompanhamentoSheet({ cargaId, tenantId, onClose }: Props) {
  const [filtro, setFiltro] = useState<"todos" | "PENDENTE" | "EMBARCADA">("todos");

  const q = useQuery({
    queryKey: ["carga-acompanhamento", tenantId, cargaId],
    enabled: !!cargaId && !!tenantId,
    queryFn: () => cargaService.acompanhamento(tenantId, cargaId as string),
    refetchInterval: (query) => {
      const st = query.state.data?.carga.status;
      return st === "LIBERADA" || st === "EM_CARREGAMENTO" ? 10_000 : false;
    },
  });
  const d = q.data;
  const volumes = useMemo(() => (d?.volumes ?? []).filter((v) => filtro === "todos" || v.status === filtro), [d, filtro]);
  const pct = d && d.totais.total > 0 ? Math.round((d.totais.embarcados / d.totais.total) * 100) : 0;

  const marcos: { rotulo: string; quando: string | null | undefined; quem?: string | null }[] = d ? [
    { rotulo: "Liberada para o coletor", quando: d.carga.liberada_em, quem: d.carga.liberada_por_nome },
    { rotulo: "Veículo confirmado", quando: d.carga.veiculo_confirmado_em, quem: d.carga.veiculo_confirmado_por_nome },
    { rotulo: "Início do carregamento", quando: d.carga.iniciada_em, quem: d.operadores[0]?.nome },
    { rotulo: "Última leitura", quando: d.carga.ultima_leitura_em },
    { rotulo: "Carga fechada", quando: d.carga.fechada_em, quem: d.carga.fechada_por_nome },
  ] : [];

  return (
    <Sheet open={!!cargaId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl !p-0 flex flex-col gap-0 bg-card">
        <SheetHeader className="px-6 py-4 border-b border-border shrink-0 text-left">
          <div className="flex items-center justify-between gap-3 pr-8">
            <SheetTitle className="flex items-center gap-2">
              Acompanhamento da carga <span className="font-mono">#{d?.carga.numero_carga ?? "…"}</span>
              {d && <CargaStatusBadge status={d.carga.status} />}
            </SheetTitle>
            <button type="button" onClick={() => void q.refetch()} disabled={q.isFetching}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
              <RefreshCcw size={12} className={q.isFetching ? "animate-spin" : ""} /> Atualizar
            </button>
          </div>
          {d && (d.carga.status === "LIBERADA" || d.carga.status === "EM_CARREGAMENTO") && (
            <p className="text-[11px] text-muted-foreground">Atualiza sozinho a cada 10 segundos.</p>
          )}
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {q.isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : q.isError || !d ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {parseError(q.error, "carga-acompanhamento").title}
            </div>
          ) : (
            <>
              {/* Progresso */}
              <section className="rounded-lg border border-border p-4 space-y-2" aria-label="Progresso do carregamento">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">Volumes carregados</span>
                  <span className="font-mono text-sm text-foreground">{d.totais.embarcados}/{d.totais.total} ({pct}%)</span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden" role="progressbar" aria-valuemin={0}
                  aria-valuemax={d.totais.total} aria-valuenow={d.totais.embarcados} aria-label="Volumes carregados">
                  <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {d.totais.pendentes} aguardando carregar
                  {d.totais.pedidos_sem_volume > 0 && <span className="text-yellow-400"> · {d.totais.pedidos_sem_volume} pedido(s) ainda sem volume (gerados no embarque)</span>}
                </p>
              </section>

              {/* Marcos */}
              <section aria-label="Marcos do carregamento">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Marcos</h3>
                <ol className="grid gap-2 sm:grid-cols-2">
                  {marcos.map((m) => (
                    <li key={m.rotulo} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${m.quando ? "border-border" : "border-dashed border-border/60"}`}>
                      {m.quando ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 shrink-0" aria-hidden="true" />
                        : <Clock size={14} className="text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />}
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{m.rotulo}</p>
                        <p className="text-sm text-foreground">{m.quando ? dataHora(m.quando) : "Ainda não"}</p>
                        {m.quando && m.quem && <p className="text-[11px] text-muted-foreground truncate">por {m.quem}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {/* Operadores */}
              <section aria-label="Operadores do carregamento">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Users size={13} aria-hidden="true" /> Quem carregou
                </h3>
                {d.operadores.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">Nenhum volume carregado ainda.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr>
                        <th className={th}>Operador</th><th className={`${th} text-center`}>Volumes</th>
                        <th className={th}>Primeira leitura</th><th className={th}>Última leitura</th>
                      </tr></thead>
                      <tbody>
                        {d.operadores.map((o) => (
                          <tr key={o.usuario_id ?? "?"} className="border-t border-border/50">
                            <td className="px-3 py-2 text-foreground">{o.nome ?? "—"}</td>
                            <td className="px-3 py-2 text-center font-mono text-foreground">{o.volumes}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{dataHora(o.primeira_leitura)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{dataHora(o.ultima_leitura)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Volumes */}
              <section aria-label="Volumes da carga">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Package size={13} aria-hidden="true" /> Volumes de expedição
                  </h3>
                  <div className="flex gap-1.5" role="group" aria-label="Filtrar volumes">
                    {([["todos", `Todos (${d.totais.total})`], ["PENDENTE", `Aguardando (${d.totais.pendentes})`], ["EMBARCADA", `Carregados (${d.totais.embarcados})`]] as const)
                      .map(([k, r]) => (
                        <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(k)} className={pilula(filtro === k)}>{r}</button>
                      ))}
                  </div>
                </div>
                {volumes.length === 0 ? (
                  <p className="text-sm text-muted-foreground rounded-lg border border-dashed border-border px-3 py-4 text-center">Nenhum volume nesta situação.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-auto max-h-[420px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-10"><tr>
                        <th className={`${th} text-center`}>Ordem</th><th className={th}>Volume</th><th className={th}>Pedido</th>
                        <th className={th}>Cliente</th><th className={th}>Situação</th><th className={th}>Carregado em</th><th className={th}>Por</th>
                      </tr></thead>
                      <tbody>
                        {volumes.map((v) => (
                          <tr key={v.id} className="border-t border-border/50">
                            <td className="px-3 py-2 text-center text-xs text-muted-foreground">{v.sequencia}</td>
                            <td className="px-3 py-2">
                              <span className="font-mono text-xs text-foreground whitespace-nowrap">{v.codigo}</span>
                              {v.descricao && <span className="block text-[11px] text-muted-foreground whitespace-nowrap">{v.descricao}</span>}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-foreground">{v.numero_pedido ?? "—"}</td>
                            <td className="px-3 py-2 text-xs text-foreground max-w-[180px] truncate" title={v.parceiro ?? undefined}>{v.parceiro ?? "—"}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {v.status === "EMBARCADA" ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border bg-green-500/15 text-green-400 border-green-500/30">
                                  <CheckCircle2 size={10} aria-hidden="true" /> CARREGADO
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                                  <Clock size={10} aria-hidden="true" /> AGUARDANDO
                                </span>
                              )}
                              {v.digitado && (
                                <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-border text-muted-foreground" title="Código digitado (etiqueta ilegível)">
                                  <Keyboard size={10} aria-hidden="true" /> digitado
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{dataHora(v.embarcada_em)}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{v.embarcada_por_nome ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Eventos */}
              {d.eventos.length > 0 && (
                <section aria-label="Eventos de rastreabilidade">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ocorrências do embarque</h3>
                  <ul className="space-y-1.5">
                    {d.eventos.map((e, i) => (
                      <li key={`${e.created_at}-${i}`} className="flex items-start gap-2 text-xs">
                        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${EVENTO_ALERTA.has(e.tipo) ? "bg-yellow-400" : "bg-green-400"}`} aria-hidden="true" />
                        <span className="text-muted-foreground whitespace-nowrap">{dataHora(e.created_at)}</span>
                        <span className="text-foreground">
                          {EVENTO_LABEL[e.tipo] ?? e.tipo}
                          {e.tipo === "VOLUMES_GERADOS" && typeof e.dados.quantidade === "number" ? ` (${e.dados.quantidade})` : ""}
                          {e.tipo === "VOLUME_DIGITADO" && typeof e.dados.codigo === "string" ? ` (${e.dados.codigo})` : ""}
                          {e.usuario_nome ? <span className="text-muted-foreground"> · {e.usuario_nome}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
