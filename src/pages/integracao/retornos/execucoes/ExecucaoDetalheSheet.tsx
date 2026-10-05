import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown, ChevronRight, Copy, ExternalLink, KeyRound, Layers, Loader2, RotateCcw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDateTime } from "@/utils/dateTime";
import { cn } from "@/lib/utils";
import { StatusRetornoBadge } from "../components/StatusRetornoBadge";
import { MODO_EXECUCAO_UI, TIPO_NO_UI } from "../retornosUi";
import { retornosKeys } from "../retornosKeys";
import { obterExecucao } from "../retornosService";
import { useCatalogoRetorno } from "../useRetornos";
import type { Catalogo, ExecucaoDetalhe, Passo } from "../retornos.types";
import { formatarDuracao } from "../editor/execucaoVisual";
import { nomeTipo } from "../editor/resumoNo";
import { ContextoTree } from "../editor/campos/ContextoTree";
import { CaminhoCanvas } from "./CaminhoCanvas";
import { DescartarDialog, ReprocessarDialog } from "./AcoesExecucaoDialogs";
import { PODE_DESCARTAR, PODE_REPROCESSAR, STATUS_FINAIS_DETALHE, erroAmigavel } from "./execucoesUtils";

interface Props {
  execucaoId: string | null;
  podeEditar: boolean;
  onFechar: () => void;
  onAbrirExecucao: (id: string) => void;
  onNavigate: (path: string) => void;
}

function formatar(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "string") { try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; } }
  return JSON.stringify(v, null, 2);
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button size="icon" variant="ghost" className="h-6 w-6" aria-label={`Copiar ${rotulo}`}
          onClick={async () => { try { await navigator.clipboard.writeText(texto); toast.success("Copiado."); } catch { toast.error("Não foi possível copiar."); } }}>
          <Copy size={13} />
        </Button>
      </TooltipTrigger>
      <TooltipContent className="text-xs">Copiar</TooltipContent>
    </Tooltip>
  );
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <BotaoCopiar texto={texto} rotulo={titulo} />
      </div>
      <pre className="max-h-64 overflow-auto rounded-lg bg-secondary/40 p-2 font-mono text-xs text-foreground whitespace-pre-wrap break-all">{texto}</pre>
    </div>
  );
}

function Headers({ headers }: { headers: Record<string, string> }) {
  const lista = Object.entries(headers ?? {});
  if (!lista.length) return null;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Headers</span>
        <BotaoCopiar texto={formatar(headers)} rotulo="headers" />
      </div>
      <div className="rounded-lg bg-secondary/40 p-2 font-mono text-xs space-y-0.5">
        {lista.map(([k, v]) => {
          const idem = /idempotency-key/i.test(k);
          return (
            <div key={k} className={cn("break-all", idem && "rounded bg-sky-500/15 text-sky-300 px-1 -mx-1 flex items-center gap-1")}>
              {idem && <KeyRound size={11} aria-label="Chave de idempotência" />}
              <span className="text-muted-foreground">{k}:</span> {v}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemPasso({ p, catalogo, nomeNo }: { p: Passo; catalogo?: Catalogo; nomeNo: string }) {
  const [aberto, setAberto] = useState(false);
  const Icone = TIPO_NO_UI[p.no_tipo]?.icone ?? AlertTriangle;
  const temDetalhe = !!(p.request || p.response || p.resultado != null);
  return (
    <li className="relative pl-6">
      <span className="absolute left-0 top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card">
        <Icone size={10} className="text-muted-foreground" aria-hidden />
      </span>
      <button type="button" onClick={() => setAberto((v) => !v)} disabled={!temDetalhe}
        aria-expanded={aberto}
        className="w-full text-left rounded-md px-2 py-1.5 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {temDetalhe ? (aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="w-[13px]" />}
          <span className="font-medium text-foreground">{nomeNo}</span>
          <span className="text-muted-foreground">{nomeTipo(p.no_tipo, catalogo)}</span>
          <StatusRetornoBadge tipo="passo" status={p.status} />
          <span className="text-muted-foreground">tentativa {p.tentativa}</span>
          {p.http_status != null && <span className="font-mono text-muted-foreground">HTTP {p.http_status}</span>}
          <span className="text-muted-foreground">{formatarDuracao(p.duracao_ms)}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{formatDateTime(p.created_at)}</span>
        </div>
        {p.erro && <p className="mt-1 ml-5 text-xs text-rose-400">{p.erro}</p>}
      </button>
      {aberto && (
        <div className="mt-2 ml-2 space-y-3 rounded-lg border border-border p-3">
          {p.request && (
            <>
              <Bloco titulo="Requisição" texto={`${p.request.metodo} ${p.request.url}`} />
              <Headers headers={p.request.headers} />
              <Bloco titulo="Corpo enviado" texto={formatar(p.request.corpo)} />
            </>
          )}
          {p.response && <Bloco titulo={`Resposta · ${p.response.status}`} texto={formatar(p.response.json ?? p.response.corpo)} />}
          <Bloco titulo="Resultado" texto={formatar(p.resultado)} />
        </div>
      )}
    </li>
  );
}

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className="text-xs text-foreground truncate">{children}</div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="card-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30"><h3 className="text-sm font-semibold">{titulo}</h3></div>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Corpo({ d, catalogo, podeEditar, onAbrirExecucao, onNavigate, onReprocessar, onDescartar }: {
  d: ExecucaoDetalhe; catalogo?: Catalogo; podeEditar: boolean; onAbrirExecucao: (id: string) => void;
  onNavigate: (p: string) => void; onReprocessar: () => void; onDescartar: () => void;
}) {
  const [contextoAberto, setContextoAberto] = useState(false);
  const nomeNo = (id: string) => {
    const n = d.definicao?.nos.find((x) => x.id === id);
    return n ? n.nome || nomeTipo(n.tipo, catalogo) : id;
  };
  const passos = [...(d.passos ?? [])].sort((a, b) => a.seq - b.seq);
  const amigavel = erroAmigavel(d);
  const abrirPasso = useCallback(() => undefined, []);

  return (
    <div className="space-y-3 p-4">
      {(d.erro || amigavel) && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 space-y-1">
          {amigavel && <p className="font-semibold flex items-center gap-1.5"><AlertTriangle size={13} /> {amigavel.texto}</p>}
          {d.erro && <p className={cn(amigavel && "text-rose-400/80")}>{d.erro}</p>}
          {amigavel?.irDestinos && (
            <Button size="sm" variant="outline" className="h-7 gap-1.5 mt-1"
              onClick={() => onNavigate("/config/integracao/retornos?aba=destinos")}>
              <Send size={13} /> Ir para Destinos
            </Button>
          )}
        </div>
      )}

      <div className="card-surface grid grid-cols-2 sm:grid-cols-4 gap-3 p-3">
        <Info rotulo="Fluxo">
          <button type="button" className="hover:underline inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={() => onNavigate(`/config/integracao/retornos/fluxo/${d.fluxo_id}`)}>
            {d.fluxo_nome} <ExternalLink size={11} aria-label="Abrir no editor" />
          </button>
        </Info>
        <Info rotulo="Versão">{d.fluxo_versao != null ? `v${d.fluxo_versao}` : "rascunho (teste)"}</Info>
        <Info rotulo="Documento"><span className="font-mono">{d.documento_numero || "—"}</span></Info>
        <Info rotulo="Evento">{d.evento}</Info>
        <Info rotulo="Modo">{MODO_EXECUCAO_UI[d.modo] ?? d.modo}</Info>
        <Info rotulo="Situação"><StatusRetornoBadge tipo="execucao" status={d.status} /></Info>
        <Info rotulo="Início">{d.iniciado_em ? formatDateTime(d.iniciado_em) : "—"}</Info>
        <Info rotulo="Fim">{d.finalizado_em ? formatDateTime(d.finalizado_em) : "—"}</Info>
        <Info rotulo="Duração">{formatarDuracao(d.duracao_ms)}</Info>
        <Info rotulo="Disparado por">{d.disparado_por || "—"}</Info>
        <Info rotulo="Criada em">{formatDateTime(d.created_at)}</Info>
        {d.status === "aguardando_retry" && <Info rotulo="Próxima tentativa">{d.processar_apos ? formatDateTime(d.processar_apos) : "—"}</Info>}
      </div>

      {d.membros_lote?.length > 0 && (
        <Secao titulo={`Documentos neste lote (${d.membros_lote.length})`}>
          <ul className="flex flex-wrap gap-2">
            {d.membros_lote.map((m) => (
              <li key={m.id}>
                <Button size="sm" variant="outline" className="h-7 gap-1.5 font-mono text-xs" onClick={() => onAbrirExecucao(m.id)}>
                  <Layers size={12} /> {m.documento_numero}
                </Button>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      {d.definicao?.nos?.length > 0 && (
        <Secao titulo="Caminho percorrido">
          <CaminhoCanvas detalhe={d} catalogo={catalogo} onAbrirPasso={abrirPasso} />
        </Secao>
      )}

      <Secao titulo={`Passos (${passos.length})`}>
        {passos.length ? (
          <ol className="relative space-y-1 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
            {passos.map((p) => <ItemPasso key={p.id} p={p} catalogo={catalogo} nomeNo={nomeNo(p.no_id)} />)}
          </ol>
        ) : <p className="text-xs text-muted-foreground">Nenhum passo registrado ainda.</p>}
      </Secao>

      <section className="card-surface overflow-hidden">
        <button type="button" onClick={() => setContextoAberto((v) => !v)} aria-expanded={contextoAberto}
          className="w-full px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {contextoAberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <h3 className="text-sm font-semibold">Contexto do documento</h3>
        </button>
        {contextoAberto && (
          <div className="p-3 max-h-96 overflow-auto">
            {d.contexto ? <ContextoTree contexto={d.contexto as unknown as Record<string, unknown>} /> : <p className="text-xs text-muted-foreground">Sem contexto.</p>}
          </div>
        )}
      </section>

      {podeEditar && (PODE_REPROCESSAR.includes(d.status) || PODE_DESCARTAR.includes(d.status) || d.status === "filtrado") && (
        <div className="flex justify-end gap-2 pt-1">
          {PODE_DESCARTAR.includes(d.status) && (
            <Button variant="outline" className="gap-1.5 border-rose-500/40 text-rose-400 hover:text-rose-300" onClick={onDescartar}>
              <Trash2 size={14} /> Descartar
            </Button>
          )}
          {(PODE_REPROCESSAR.includes(d.status) || d.status === "filtrado") && (
            <Button className="gap-1.5" onClick={onReprocessar}><RotateCcw size={14} /> Reprocessar</Button>
          )}
        </div>
      )}
    </div>
  );
}

export function ExecucaoDetalheSheet({ execucaoId, podeEditar, onFechar, onAbrirExecucao, onNavigate }: Props) {
  const qc = useQueryClient();
  const { data: catalogo } = useCatalogoRetorno();
  const [reprocAberto, setReprocAberto] = useState(false);
  const [descAberto, setDescAberto] = useState(false);
  const q = useQuery({
    queryKey: retornosKeys.execucao(execucaoId),
    queryFn: () => obterExecucao(execucaoId as string),
    enabled: !!execucaoId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (!s) return false;
      if (s === "aguardando_retry") return 15_000;
      return STATUS_FINAIS_DETALHE.includes(s) ? false : 3_000;
    },
  });

  const atualizar = () => {
    void qc.invalidateQueries({ queryKey: ["retorno-execucoes"] });
    void qc.invalidateQueries({ queryKey: ["retorno-config"] });
    void qc.invalidateQueries({ queryKey: retornosKeys.execucao(execucaoId) });
  };

  const d = q.data;
  return (
    <Sheet open={!!execucaoId} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[960px] p-0 flex flex-col">
        <SheetHeader className="px-4 py-3 border-b border-border">
          <SheetTitle className="text-sm flex items-center gap-2">
            Execução {d ? <span className="font-mono">{d.documento_numero}</span> : null}
            {d && !STATUS_FINAIS_DETALHE.includes(d.status) && <Loader2 size={13} className="animate-spin text-muted-foreground" aria-label="Acompanhando" />}
          </SheetTitle>
          <SheetDescription className="text-xs">{d ? `${d.fluxo_nome} · ${d.evento}` : "Carregando…"}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1">
          {q.isLoading && <div className="p-4 space-y-3"><Skeleton className="h-24" /><Skeleton className="h-[280px]" /><Skeleton className="h-40" /></div>}
          {q.isError && (
            <div className="m-4 card-surface border-destructive/40 p-4 flex items-center justify-between gap-2 text-xs">
              <span className="text-destructive flex items-center gap-1.5"><AlertTriangle size={13} /> Não foi possível carregar a execução.</span>
              <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Tentar novamente</Button>
            </div>
          )}
          {d && (
            <Corpo d={d} catalogo={catalogo} podeEditar={podeEditar} onAbrirExecucao={onAbrirExecucao} onNavigate={onNavigate}
              onReprocessar={() => setReprocAberto(true)} onDescartar={() => setDescAberto(true)} />
          )}
        </ScrollArea>
        {d && reprocAberto && (
          <ReprocessarDialog detalhe={d} catalogo={catalogo} aberto={reprocAberto} onFechar={() => setReprocAberto(false)}
            onConcluido={(r) => { setReprocAberto(false); atualizar(); if (r.id && r.id !== d.id) onAbrirExecucao(r.id); }} />
        )}
        {d && (
          <DescartarDialog execucaoIds={[d.id]} aberto={descAberto} onFechar={() => setDescAberto(false)}
            onConcluido={() => { setDescAberto(false); atualizar(); }} />
        )}
      </SheetContent>
    </Sheet>
  );
}
