import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity, AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, Filter, Layers, Loader2,
  RefreshCw, RotateCcw, Search, Trash2, X, XCircle, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { useRefreshCooldown } from "@/hooks/useRefreshCooldown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime, formatTime } from "@/utils/dateTime";
import { cn } from "@/lib/utils";
import { parseError } from "@/lib/errorMapper";
import { relativeTime } from "../../StatusBar";
import { StatusRetornoBadge } from "../components/StatusRetornoBadge";
import { MODO_EXECUCAO_UI, STATUS_EXECUCAO_UI } from "../retornosUi";
import { retornosKeys } from "../retornosKeys";
import { listarExecucoes, listarFluxos } from "../retornosService";
import { usePermissaoRetorno, useRetornoConfig } from "../useRetornos";
import type { ExecucaoResumo, ModoExecucao, StatusExecucao, StatusPasso } from "../retornos.types";
import { formatarDuracao } from "../editor/execucaoVisual";
import { DescartarDialog, reprocessarEExecutar } from "./AcoesExecucaoDialogs";
import { ExecucaoDetalheSheet } from "./ExecucaoDetalheSheet";
import {
  PERIODOS, PODE_DESCARTAR, PODE_REPROCESSAR, STATUS_FILTRAVEIS, STATUS_PADRAO, STATUS_PENDENTES,
  lerFiltros, paraFiltrosApi, urlFiltros, type FiltrosTela, type Periodo,
} from "./execucoesUtils";

const POR_PAGINA = 50;
const TODOS = "__todos";

const COR_PONTO: Record<StatusPasso, string> = {
  sucesso: "bg-emerald-400", erro: "bg-rose-400", retry: "bg-amber-400", simulado: "bg-sky-400", filtrado: "bg-zinc-400",
};

interface Props { params: URLSearchParams; onNavigate: (path: string) => void }

function Tile({ icone: Icon, valor, rotulo, classe, ativo, onClick }: {
  icone: LucideIcon; valor: number; rotulo: string; classe: string; ativo: boolean; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={cn("rounded-lg border px-3 py-2 flex items-center gap-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        classe, ativo && "ring-1 ring-current")}>
      <Icon size={15} aria-hidden />
      <div>
        <div className="text-lg font-bold leading-none">{valor.toLocaleString("pt-BR")}</div>
        <div className="text-[10px] uppercase tracking-wide opacity-80 mt-0.5">{rotulo} · 24 h</div>
      </div>
    </button>
  );
}

function Caminho({ e }: { e: ExecucaoResumo }) {
  if (!e.caminho?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-0.5">
      {e.caminho.map((c, i) => {
        const nomeNo = (e.definicao?.nos as Array<{ id: string; nome?: string }> | undefined)?.find((n) => n.id === c.no_id)?.nome;
        return (
          <Tooltip key={`${c.no_id}-${i}`}>
            <TooltipTrigger asChild>
              <span className={cn("inline-block h-2 w-2 rounded-full", COR_PONTO[c.status] ?? "bg-zinc-400")} aria-label={`${c.no_id}: ${c.status}`} />
            </TooltipTrigger>
            <TooltipContent className="text-xs">{nomeNo ?? c.no_id} · {c.status}{c.saida ? ` → ${c.saida}` : ""}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function BotaoIcone({ rotulo, icone: Icon, classe, onClick, disabled }: { rotulo: string; icone: LucideIcon; classe?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className={cn("h-7 w-7", classe)} aria-label={rotulo} onClick={onClick} disabled={disabled}><Icon size={14} /></Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">{rotulo}</TooltipContent>
    </Tooltip>
  );
}

export function ExecucoesTab({ params, onNavigate }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const { podeEditar } = usePermissaoRetorno();
  const qc = useQueryClient();
  const filtros = useMemo(() => lerFiltros(params), [params]);
  const execucaoAberta = params.get("execucao");

  const ir = (f: Partial<FiltrosTela>, execucao: string | null = null) =>
    onNavigate(urlFiltros({ ...filtros, pagina: 1, ...f }, execucao));

  // Busca com debounce
  const [busca, setBusca] = useState(filtros.busca);
  useEffect(() => { setBusca(filtros.busca); }, [filtros.busca]);
  useEffect(() => {
    if (busca === filtros.busca) return;
    const t = window.setTimeout(() => ir({ busca }), 400);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  // Instante de referência do período: muda só quando o filtro muda.
  const chaveFiltros = urlFiltros(filtros);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const agora = useMemo(() => Date.now(), [chaveFiltros]);
  const filtrosApi = useMemo(() => paraFiltrosApi(filtros, agora), [filtros, agora]);

  const config = useRetornoConfig();
  const fluxos = useQuery({
    queryKey: retornosKeys.fluxos(tenantId, empresaId, false),
    queryFn: () => listarFluxos(tenantId as string, empresaId as string, false),
    enabled: !!tenantId && !!empresaId,
  });
  const lista = useQuery({
    queryKey: [...retornosKeys.execucoes(tenantId, empresaId, filtrosApi, filtros.pagina), empresaVersion],
    queryFn: () => listarExecucoes(tenantId as string, empresaId as string, filtrosApi, POR_PAGINA, (filtros.pagina - 1) * POR_PAGINA),
    enabled: !!tenantId && !!empresaId,
    refetchInterval: 15_000,
    placeholderData: keepPreviousData,
  });
  const { refresh, state: estadoRefresh, secondsLeft } = useRefreshCooldown(async () => {
    await Promise.all([lista.refetch(), config.refetch()]);
  });

  const itens = lista.data?.itens ?? [];
  const total = lista.data?.total ?? 0;
  const inicio = total ? (filtros.pagina - 1) * POR_PAGINA + 1 : 0;
  const fim = Math.min(filtros.pagina * POR_PAGINA, total);

  // Seleção múltipla
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  useEffect(() => { setSelecionadas(new Set()); }, [chaveFiltros]);
  const selecionaveis = itens.filter((e) => PODE_REPROCESSAR.includes(e.status) || PODE_DESCARTAR.includes(e.status));
  const todasMarcadas = selecionaveis.length > 0 && selecionaveis.every((e) => selecionadas.has(e.id));
  const selItens = itens.filter((e) => selecionadas.has(e.id));
  const paraReprocessar = selItens.filter((e) => e.status === "erro" || e.status === "descartado");
  const paraDescartar = selItens.filter((e) => PODE_DESCARTAR.includes(e.status));
  const [lote, setLote] = useState<{ feito: number; total: number } | null>(null);
  const [descartarIds, setDescartarIds] = useState<string[]>([]);

  const atualizarTudo = () => {
    void qc.invalidateQueries({ queryKey: ["retorno-execucoes"] });
    void qc.invalidateQueries({ queryKey: ["retorno-config"] });
    void qc.invalidateQueries({ queryKey: ["retorno-execucao"] });
  };

  const reprocessarUma = async (e: ExecucaoResumo) => {
    if (e.status === "sucesso") { ir({}, e.id); return; } // exige escolher o nó: abre o detalhe
    try {
      await reprocessarEExecutar(e.id, null);
      toast.success("Reprocessamento iniciado.");
    } catch (err) {
      toast.error(parseError(err, "reprocessar execução").title);
    }
    atualizarTudo();
  };

  // Limpa fluxo/execução da URL quando empresa muda
  useEffect(() => {
    if (params.get("fluxo") || params.get("execucao")) {
      onNavigate(urlFiltros({ ...filtros, pagina: 1 }, null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaVersion]);

  const reprocessarSelecionadas = async () => {
    const alvo = paraReprocessar;
    setLote({ feito: 0, total: alvo.length });
    let ok = 0; let falhas = 0;
    for (const e of alvo) {
      try { await reprocessarEExecutar(e.id, null); ok++; } catch { falhas++; }
      setLote((l) => (l ? { ...l, feito: l.feito + 1 } : l));
    }
    setLote(null);
    setSelecionadas(new Set());
    const ignoradas = selItens.length - alvo.length;
    toast[falhas ? "warning" : "success"](
      `${ok} reprocessada(s)${falhas ? `, ${falhas} falhou(aram)` : ""}${ignoradas ? ` · ${ignoradas} ignorada(s) (abra o detalhe para escolher o nó)` : ""}.`,
    );
    atualizarTudo();
  };

  const c24 = config.data?.execucoes_24h ?? {};
  const n = (s: StatusExecucao) => c24[s] ?? 0;
  const igual = (a: StatusExecucao[], b: StatusExecucao[]) => a.length === b.length && a.every((s) => b.includes(s));
  const tiles: { chave: string; icone: LucideIcon; rotulo: string; valor: number; classe: string; status: StatusExecucao[] }[] = [
    { chave: "sucesso", icone: CheckCircle2, rotulo: "Sucesso", valor: n("sucesso"), classe: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", status: ["sucesso"] },
    { chave: "erro", icone: XCircle, rotulo: "Erro", valor: n("erro"), classe: "bg-rose-500/15 text-rose-400 border-rose-500/30", status: ["erro"] },
    { chave: "pend", icone: Clock, rotulo: "Pendentes", valor: STATUS_PENDENTES.reduce((s, k) => s + n(k), 0), classe: "bg-sky-500/15 text-sky-400 border-sky-500/30", status: STATUS_PENDENTES },
    { chave: "filt", icone: Filter, rotulo: "Filtradas", valor: n("filtrado"), classe: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30", status: ["filtrado"] },
  ];

  const alternarStatus = (s: StatusExecucao) => {
    const novo = filtros.status.includes(s) ? filtros.status.filter((x) => x !== s) : [...filtros.status, s];
    ir({ status: novo.length ? novo : STATUS_PADRAO });
  };
  const rotuloSituacao = igual(filtros.status, STATUS_PADRAO)
    ? "Situação (todas menos Filtrado)"
    : filtros.status.length === 1 ? STATUS_EXECUCAO_UI[filtros.status[0]].rotulo : `Situação (${filtros.status.length})`;

  const filtrosAtivos = !!(filtros.fluxo || filtros.modo || filtros.busca || filtros.periodo !== "7d" || !igual(filtros.status, STATUS_PADRAO));
  const classeCampo = "h-8 text-xs bg-secondary/40 border-border";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {config.isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
          : tiles.map((t) => (
            <Tile key={t.chave} icone={t.icone} valor={t.valor} rotulo={t.rotulo} classe={t.classe}
              ativo={igual(filtros.status, t.status)} onClick={() => ir({ status: t.status })} />
          ))}
      </div>

      <section className="card-surface overflow-hidden flex flex-col">
        <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Execuções</h3>
          <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => void refresh()} disabled={estadoRefresh !== "idle"}>
            <RefreshCw size={13} className={cn(estadoRefresh === "loading" && "animate-spin")} />
            {estadoRefresh === "cooldown" ? `Atualizar (${secondsLeft}s)` : "Atualizar"}
          </Button>
        </div>

        <div className="px-4 py-2.5 border-b border-border flex flex-wrap items-center gap-2">
          <Select value={filtros.fluxo || TODOS} onValueChange={(v) => ir({ fluxo: v === TODOS ? "" : v })}>
            <SelectTrigger className={cn(classeCampo, "w-52")} aria-label="Fluxo"><SelectValue placeholder="Fluxo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Fluxo (todos)</SelectItem>
              {(fluxos.data ?? []).map((f) => <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn(classeCampo, "w-56 justify-between font-normal")} aria-label="Situação">
                <span className="truncate">{rotuloSituacao}</span><ChevronRight size={13} className="rotate-90" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2 space-y-1">
              {STATUS_FILTRAVEIS.map((s) => (
                <label key={s} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-secondary/40 cursor-pointer">
                  <Checkbox checked={filtros.status.includes(s)} onCheckedChange={() => alternarStatus(s)} />
                  <StatusRetornoBadge tipo="execucao" status={s} />
                </label>
              ))}
            </PopoverContent>
          </Popover>

          <Select value={filtros.modo || TODOS} onValueChange={(v) => ir({ modo: v === TODOS ? "" : (v as ModoExecucao) })}>
            <SelectTrigger className={cn(classeCampo, "w-36")} aria-label="Modo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Modo (todos)</SelectItem>
              {(Object.keys(MODO_EXECUCAO_UI) as ModoExecucao[]).map((m) => <SelectItem key={m} value={m}>{MODO_EXECUCAO_UI[m]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filtros.periodo} onValueChange={(v) => ir({ periodo: v as Periodo })}>
            <SelectTrigger className={cn(classeCampo, "w-36")} aria-label="Período"><SelectValue /></SelectTrigger>
            <SelectContent>{PERIODOS.map((p) => <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>)}</SelectContent>
          </Select>
          {filtros.periodo === "personalizado" && (
            <>
              <Input type="date" aria-label="De" className={cn(classeCampo, "w-36")} value={filtros.de} onChange={(e) => ir({ de: e.target.value })} />
              <Input type="date" aria-label="Até" className={cn(classeCampo, "w-36")} value={filtros.ate} onChange={(e) => ir({ ate: e.target.value })} />
            </>
          )}

          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input aria-label="Buscar por número do documento" placeholder="Nº do documento" value={busca}
              onChange={(e) => setBusca(e.target.value)} className={cn(classeCampo, "w-44 pl-8")} />
          </div>

          {filtrosAtivos && (
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => onNavigate(urlFiltros(lerFiltros(new URLSearchParams())))}>
              <X size={13} /> Limpar filtros
            </Button>
          )}
        </div>

        {podeEditar && selecionadas.size > 0 && (
          <div className="px-4 py-2 border-b border-border bg-primary/10 flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium">{selecionadas.size} selecionada(s)</span>
            {lote ? (
              <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 size={13} className="animate-spin" /> Reprocessando {lote.feito} de {lote.total}…</span>
            ) : (
              <>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-sky-400" disabled={!paraReprocessar.length} onClick={() => void reprocessarSelecionadas()}>
                  <RotateCcw size={13} /> Reprocessar selecionadas ({paraReprocessar.length})
                </Button>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 text-rose-400" disabled={!paraDescartar.length} onClick={() => setDescartarIds(paraDescartar.map((e) => e.id))}>
                  <Trash2 size={13} /> Descartar selecionadas ({paraDescartar.length})
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setSelecionadas(new Set())}>Limpar seleção</Button>
              </>
            )}
          </div>
        )}

        {lista.isError ? (
          <div className="m-4 card-surface border-destructive/40 p-4 flex items-center justify-between gap-2 text-xs">
            <span className="text-destructive flex items-center gap-1.5"><AlertTriangle size={13} /> Não foi possível carregar as execuções.</span>
            <Button size="sm" variant="outline" onClick={() => void lista.refetch()}>Tentar novamente</Button>
          </div>
        ) : lista.isLoading ? (
          <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
        ) : !itens.length ? (
          <div className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center"><Activity size={15} className="text-muted-foreground" aria-hidden /></div>
            <p className="text-sm text-muted-foreground">Nenhuma execução com estes filtros.</p>
            {filtrosAtivos && <Button size="sm" variant="outline" onClick={() => onNavigate(urlFiltros(lerFiltros(new URLSearchParams())))}>Limpar filtros</Button>}
          </div>
        ) : (
          <div className="overflow-auto max-h-[calc(100vh-420px)] min-h-[240px]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10 bg-secondary/40 backdrop-blur text-muted-foreground">
                <tr className="text-left">
                  {podeEditar && (
                    <th className="px-3 py-2 w-8">
                      <Checkbox aria-label="Selecionar todas" checked={todasMarcadas} disabled={!selecionaveis.length}
                        onCheckedChange={(v) => setSelecionadas(v ? new Set(selecionaveis.map((e) => e.id)) : new Set())} />
                    </th>
                  )}
                  <th className="px-3 py-2 font-medium">Quando</th>
                  <th className="px-3 py-2 font-medium">Fluxo</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Evento</th>
                  <th className="px-3 py-2 font-medium">Modo</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                  <th className="px-3 py-2 font-medium">Caminho</th>
                  <th className="px-3 py-2 font-medium text-right">Duração</th>
                  <th className="px-3 py-2 font-medium">Erro</th>
                  <th className="px-3 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((e) => {
                  const selecionavel = PODE_REPROCESSAR.includes(e.status) || PODE_DESCARTAR.includes(e.status);
                  const ehLote = e.modo === "lote" || /documento\(s\)/.test(e.documento_numero ?? "");
                  return (
                    <tr key={e.id} className={cn("border-t border-border/40 hover:bg-secondary/30", execucaoAberta === e.id && "bg-secondary/40")}>
                      {podeEditar && (
                        <td className="px-3 py-2">
                          <Checkbox aria-label={`Selecionar ${e.documento_numero}`} disabled={!selecionavel} checked={selecionadas.has(e.id)}
                            onCheckedChange={(v) => setSelecionadas((s) => { const nn = new Set(s); if (v) nn.add(e.id); else nn.delete(e.id); return nn; })} />
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="text-foreground">{formatDateTime(e.created_at)}</div>
                        <div className="text-[10px] text-muted-foreground">{relativeTime(e.created_at)}</div>
                      </td>
                      <td className="px-3 py-2 max-w-[180px] truncate" title={e.fluxo_nome}>{e.fluxo_nome}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {ehLote
                          ? <span className="inline-flex items-center gap-1"><Layers size={12} className="text-violet-400" aria-hidden />{e.documento_numero}</span>
                          : <span className="font-mono">{e.documento_numero || "—"}</span>}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{e.evento}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{MODO_EXECUCAO_UI[e.modo] ?? e.modo}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {e.status === "pendente" ? (
                          <Tooltip>
                            <TooltipTrigger asChild><span><StatusRetornoBadge tipo="execucao" status={e.status} /></span></TooltipTrigger>
                            <TooltipContent className="text-xs">Aguardando a execução anterior deste documento neste fluxo</TooltipContent>
                          </Tooltip>
                        ) : <StatusRetornoBadge tipo="execucao" status={e.status} />}
                        {e.status === "aguardando_retry" && e.processar_apos && (
                          <div className="text-[10px] text-amber-400 mt-0.5">próxima às {formatTime(e.processar_apos)}</div>
                        )}
                      </td>
                      <td className="px-3 py-2"><Caminho e={e} /></td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{formatarDuracao(e.duracao_ms)}</td>
                      <td className="px-3 py-2 max-w-[220px]">
                        {e.erro ? (
                          <Tooltip>
                            <TooltipTrigger asChild><span className="block truncate text-rose-400">{e.erro}</span></TooltipTrigger>
                            <TooltipContent className="max-w-sm text-xs whitespace-pre-wrap">{e.erro}</TooltipContent>
                          </Tooltip>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          <BotaoIcone rotulo="Ver detalhe" icone={Eye} onClick={() => ir({ pagina: filtros.pagina }, e.id)} />
                          {e.status === "aguardando_retry" && podeEditar && (
                            <BotaoIcone rotulo="Tentar agora" icone={RotateCcw} classe="text-amber-400" onClick={() => void reprocessarUma(e)} />
                          )}
                          {podeEditar && PODE_REPROCESSAR.includes(e.status) && e.status !== "aguardando_retry" && (
                            <BotaoIcone rotulo="Reprocessar" icone={RotateCcw} classe="text-sky-400" onClick={() => void reprocessarUma(e)} />
                          )}
                          {podeEditar && PODE_DESCARTAR.includes(e.status) && (
                            <BotaoIcone rotulo="Descartar" icone={Trash2} classe="text-rose-400" onClick={() => setDescartarIds([e.id])} />
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > 0 && (
          <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>{inicio.toLocaleString("pt-BR")}–{fim.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}</span>
            <div className="flex gap-1">
              <BotaoIcone rotulo="Página anterior" icone={ChevronLeft} disabled={filtros.pagina <= 1} onClick={() => ir({ pagina: filtros.pagina - 1 })} />
              <BotaoIcone rotulo="Próxima página" icone={ChevronRight} disabled={fim >= total} onClick={() => ir({ pagina: filtros.pagina + 1 })} />
            </div>
          </div>
        )}
      </section>

      <DescartarDialog execucaoIds={descartarIds} aberto={descartarIds.length > 0} onFechar={() => setDescartarIds([])}
        onConcluido={() => { setDescartarIds([]); setSelecionadas(new Set()); atualizarTudo(); }} />

      <ExecucaoDetalheSheet
        execucaoId={execucaoAberta}
        podeEditar={podeEditar}
        onFechar={() => onNavigate(urlFiltros(filtros))}
        onAbrirExecucao={(id) => onNavigate(urlFiltros(filtros, id))}
        onNavigate={onNavigate}
      />
    </div>
  );
}
