import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, Archive, ArchiveRestore, CheckCircle2, Clock, Copy, Filter, MoreHorizontal, Pause, Play,
  Plus, Search, SquarePen, Activity, Workflow, XCircle, Zap,
} from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useDebounce } from "@/hooks/useDebounce";
import { parseError } from "@/lib/errorMapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { relativeTime } from "../../StatusBar";
import { StatusRetornoBadge } from "../components/StatusRetornoBadge";
import { retornosKeys } from "../retornosKeys";
import { arquivarFluxo, ativarFluxo, listarFluxos, listarProvedoresErp, listarMapa, obterFluxo, salvarFluxo, salvarMapa } from "../retornosService";
import { usePermissaoRetorno } from "../useRetornos";
import type { FluxoResumo } from "../retornos.types";
import { descreverModo } from "./fluxosUtils";
import { NovoFluxoDialog } from "./NovoFluxoDialog";

type FiltroSituacao = "todos" | "ativos" | "pausados" | "rascunhos";
type Confirmacao = { tipo: "pausar" | "arquivar" | "desarquivar"; fluxo: FluxoResumo } | null;

interface Props { onNavigate: (path: string) => void }

export function FluxosTab({ onNavigate }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const { podeEditar } = usePermissaoRetorno();
  const qc = useQueryClient();

  const [busca, setBusca] = useState("");
  const buscaDeb = useDebounce(busca, 300);
  const [situacao, setSituacao] = useState<FiltroSituacao>("todos");
  const [arquivados, setArquivados] = useState(false);
  const [novoAberto, setNovoAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState<Confirmacao>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  const fluxosQ = useQuery({
    queryKey: [...retornosKeys.fluxos(tenantId, empresaId, arquivados), empresaVersion],
    queryFn: () => listarFluxos(tenantId as string, empresaId as string, arquivados),
    enabled: !!tenantId && !!empresaId,
  });
  const provQ = useQuery({ queryKey: ["retorno-provedores-erp"], queryFn: listarProvedoresErp, staleTime: 10 * 60 * 1000 });
  const nomeErp = (id: string | null) => (id ? provQ.data?.find((p) => p.id === id)?.nome ?? "ERP" : null);

  const lista = useMemo(() => {
    const termo = buscaDeb.trim().toLowerCase();
    return (fluxosQ.data ?? []).filter((f) => {
      if (termo && !f.nome.toLowerCase().includes(termo)) return false;
      if (situacao === "ativos") return f.status === "publicado";
      if (situacao === "pausados") return f.status === "pausado";
      if (situacao === "rascunhos") return f.status === "rascunho";
      return true;
    });
  }, [fluxosQ.data, buscaDeb, situacao]);

  const abrir = (id: string) => onNavigate(`/config/integracao/retornos/fluxo/${id}`);

  async function executarAcao(fluxo: FluxoResumo, acao: () => Promise<unknown>, ok: string, ctx: string) {
    setOcupado(fluxo.id);
    try {
      await acao();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["retorno-fluxos"] }),
        qc.invalidateQueries({ queryKey: ["retorno-config"] }),
      ]);
      toast.success(ok);
    } catch (e) {
      toast.error(parseError(e, ctx).title);
    } finally {
      setOcupado(null);
    }
  }

  const ativar = (f: FluxoResumo, ativo: boolean) =>
    executarAcao(f, () => ativarFluxo(f.id, ativo), ativo ? "Fluxo ativado." : "Fluxo pausado.", ativo ? "Ativar fluxo" : "Pausar fluxo");
  const arquivar = (f: FluxoResumo, arq: boolean) =>
    executarAcao(f, () => arquivarFluxo(f.id, arq), arq ? "Fluxo arquivado." : "Fluxo desarquivado.", "Arquivar fluxo");

  async function duplicar(f: FluxoResumo) {
    setOcupado(f.id);
    try {
      const completo = await obterFluxo(f.id);
      const copia = await salvarFluxo(tenantId as string, empresaId as string, {
        nome: `${completo.nome} (cópia)`,
        descricao: completo.descricao,
        erp_provedor_id: completo.erp_provedor_id,
        definicao: completo.definicao_rascunho,
      });
      let deparaOk = true;
      try {
        const mapa = await listarMapa(tenantId as string, empresaId as string, f.id);
        const proprios = mapa.filter((i) => i.fluxo_id === f.id);
        const porDominio = new Map<string, { valor_wms: string; valor_erp: string }[]>();
        proprios.forEach((i) => {
          const l = porDominio.get(i.dominio) ?? [];
          l.push({ valor_wms: i.valor_wms, valor_erp: i.valor_erp });
          porDominio.set(i.dominio, l);
        });
        for (const [dominio, itens] of porDominio) {
          await salvarMapa(tenantId as string, empresaId as string, copia.id, dominio, itens);
        }
        if (porDominio.size > 0) await qc.invalidateQueries({ queryKey: ["retorno-mapa"] });
      } catch (e) {
        deparaOk = false;
        toast.warning("Fluxo duplicado, mas o de-para não foi copiado.", { description: parseError(e, "Copiar de-para").title });
      }
      await qc.invalidateQueries({ queryKey: ["retorno-fluxos"] });
      if (deparaOk) toast.success("Fluxo duplicado.");
      abrir(copia.id);
    } catch (e) {
      toast.error(parseError(e, "Duplicar fluxo").title);
    } finally {
      setOcupado(null);
    }
  }

  function confirmar() {
    if (!confirmacao) return;
    const { tipo, fluxo } = confirmacao;
    setConfirmacao(null);
    if (tipo === "pausar") ativar(fluxo, false);
    else arquivar(fluxo, tipo === "arquivar");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="card-surface p-3 flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Label htmlFor="fluxos-busca" className="sr-only">Buscar fluxo</Label>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="fluxos-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome…"
            className="h-10 rounded-lg bg-secondary/40 pl-9" />
        </div>
        <div className="w-40">
          <Label htmlFor="fluxos-situacao" className="sr-only">Situação</Label>
          <Select value={situacao} onValueChange={(v) => setSituacao(v as FiltroSituacao)}>
            <SelectTrigger id="fluxos-situacao" className="h-10 rounded-lg bg-secondary/40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ativos">Ativos</SelectItem>
              <SelectItem value="pausados">Pausados</SelectItem>
              <SelectItem value="rascunhos">Rascunhos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2 h-10">
          <Switch id="fluxos-arquivados" checked={arquivados} onCheckedChange={setArquivados} />
          <Label htmlFor="fluxos-arquivados" className="text-xs text-muted-foreground">Mostrar arquivados</Label>
        </div>
        {podeEditar && (
          <Button onClick={() => setNovoAberto(true)} className="h-10"><Plus size={14} /> Novo fluxo</Button>
        )}
      </div>

      {fluxosQ.isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : fluxosQ.isError ? (
        <div className="card-surface border-destructive/40 px-4 py-3 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-2 text-destructive"><AlertTriangle size={13} /> Não foi possível carregar os fluxos.</span>
          <Button size="sm" variant="outline" onClick={() => fluxosQ.refetch()}>Tentar novamente</Button>
        </div>
      ) : (fluxosQ.data ?? []).length === 0 ? (
        <div className="card-surface flex flex-col items-center justify-center text-center gap-3 py-16 px-6">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
            <Workflow size={15} className="text-muted-foreground" aria-hidden />
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            Nenhum fluxo de retorno. Crie um fluxo para enviar ao ERP o status e os itens de cada etapa do WMS.
          </p>
          {podeEditar && <Button size="sm" onClick={() => setNovoAberto(true)}><Plus size={14} /> Novo fluxo</Button>}
        </div>
      ) : lista.length === 0 ? (
        <div className="card-surface py-10 text-center text-sm text-muted-foreground">Nenhum fluxo corresponde aos filtros.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {lista.map((f) => {
            const ex = f.execucoes_24h ?? {};
            const pend = (ex.pendente ?? 0) + (ex.aguardando_retry ?? 0) + (ex.executando ?? 0) + (ex.agrupando ?? 0) + (ex.agrupado ?? 0);
            const contadores = [
              { n: ex.sucesso ?? 0, icone: CheckCircle2, cls: "text-emerald-400", rotulo: "sucesso" },
              { n: ex.erro ?? 0, icone: XCircle, cls: "text-rose-400", rotulo: "erro" },
              { n: ex.filtrado ?? 0, icone: Filter, cls: "text-zinc-400", rotulo: "filtrado" },
              { n: pend, icone: Clock, cls: "text-sky-400", rotulo: "pendentes" },
            ].filter((c) => c.n > 0);
            const publicado = f.versao_publicada != null;
            const erp = nomeErp(f.erp_provedor_id);
            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                onClick={() => abrir(f.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(f.id); } }}
                className={`card-surface p-4 flex flex-col gap-3 cursor-pointer transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${ocupado === f.id ? "opacity-60 pointer-events-none" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex flex-col gap-1.5">
                    <h3 className="font-semibold text-sm text-foreground truncate" title={f.nome}>{f.nome}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusRetornoBadge tipo="fluxo" status={f.status} />
                      {f.alteracoes_nao_publicadas && (
                        <Badge variant="outline" className="gap-1 text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30">
                          <SquarePen size={11} aria-hidden /> Alterações não publicadas
                        </Badge>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Ações do fluxo">
                        <MoreHorizontal size={15} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenuItem onClick={() => abrir(f.id)}><SquarePen size={14} /> Abrir editor</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onNavigate(`/config/integracao/retornos?aba=execucoes&fluxo=${f.id}`)}>
                        <Activity size={14} /> Ver execuções
                      </DropdownMenuItem>
                      {publicado && !f.arquivado_em && (
                        f.ativo ? (
                          <DropdownMenuItem disabled={!podeEditar} onClick={() => setConfirmacao({ tipo: "pausar", fluxo: f })}>
                            <Pause size={14} /> Pausar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem disabled={!podeEditar} onClick={() => ativar(f, true)}>
                            <Play size={14} /> Ativar
                          </DropdownMenuItem>
                        )
                      )}
                      <DropdownMenuItem disabled={!podeEditar} onClick={() => duplicar(f)}><Copy size={14} /> Duplicar</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {f.arquivado_em ? (
                        <DropdownMenuItem disabled={!podeEditar} onClick={() => setConfirmacao({ tipo: "desarquivar", fluxo: f })}>
                          <ArchiveRestore size={14} /> Desarquivar
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem disabled={!podeEditar} onClick={() => setConfirmacao({ tipo: "arquivar", fluxo: f })}>
                          <Archive size={14} /> Arquivar
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Zap size={13} className="shrink-0 text-primary" aria-hidden />
                    <span className="text-foreground truncate">{f.evento_nome ?? (f.modo_ativacao === "manual" ? "Manualmente, pelo documento" : "Sem gatilho")}</span>
                    <span>·</span>
                    <span className="truncate">{descreverModo(f)}</span>
                  </div>
                  {erp && (
                    <div>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wide bg-secondary/40">{erp}</Badge>
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-2 border-t border-border/40 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {contadores.map((c) => (
                    <span key={c.rotulo} className={`flex items-center gap-1 ${c.cls}`} title={`${c.n} ${c.rotulo} em 24 h`}>
                      <c.icone size={12} aria-hidden /> {c.n.toLocaleString("pt-BR")}
                      <span className="sr-only"> {c.rotulo}</span>
                    </span>
                  ))}
                  <span className="ml-auto">Último envio {relativeTime(f.ultima_execucao_em)}</span>
                  {publicado && <span className="font-mono text-foreground">v{f.versao_publicada}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <NovoFluxoDialog open={novoAberto} onOpenChange={setNovoAberto} onCriado={abrir} />

      <AlertDialog open={!!confirmacao} onOpenChange={(o) => { if (!o) setConfirmacao(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.tipo === "pausar" ? "Pausar fluxo?" : confirmacao?.tipo === "arquivar" ? "Arquivar fluxo?" : "Desarquivar fluxo?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.tipo === "pausar"
                ? "Os eventos que acontecerem enquanto o fluxo estiver pausado não serão enviados ao ERP."
                : confirmacao?.tipo === "arquivar"
                  ? "O fluxo deixa de rodar e sai da lista. Você pode desarquivá-lo depois em “Mostrar arquivados”."
                  : "O fluxo volta para a lista. Ele continua pausado até você ativá-lo."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar}>
              {confirmacao?.tipo === "pausar" ? "Pausar" : confirmacao?.tipo === "arquivar" ? "Arquivar" : "Desarquivar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
