import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import { formatDateTime } from "@/utils/dateTime";
import type { EntidadeDocumento } from "../retornos.types";
import { contextoDocumento, executar, execucoesDocumento, invokeDispatcher, listarFluxos } from "../retornosService";
import { useCatalogoRetorno, usePermissaoRetorno } from "../useRetornos";
import { StatusRetornoBadge } from "./StatusRetornoBadge";
import { ExecucaoDetalheSheet } from "../execucoes/ExecucaoDetalheSheet";
import { reprocessarEExecutar } from "../execucoes/AcoesExecucaoDialogs";

interface Props { entidade: EntidadeDocumento; documentoId: string }

const irPara = (path: string) => { window.location.hash = path; };

/** Card "Retornos ao ERP" nos detalhes de documento. Só renderiza com READ. */
export function RetornosDocumentoCard(props: Props) {
  const { podeVer } = usePermissaoRetorno();
  const { tenantId, empresaId, empresaVersion } = useTenant();
  if (!podeVer || !tenantId || !empresaId) return null;
  return <TooltipProvider><Conteudo key={`${empresaId}-${empresaVersion}`} {...props} tenantId={tenantId} empresaId={empresaId} /></TooltipProvider>;
}

function Conteudo({ entidade, documentoId, tenantId, empresaId }: Props & { tenantId: string; empresaId: string }) {
  const qc = useQueryClient();
  const { podeEditar } = usePermissaoRetorno();
  const { data: catalogo } = useCatalogoRetorno();
  const [aberta, setAberta] = useState<string | null>(null);
  const [popAberto, setPopAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [reenviando, setReenviando] = useState(false);

  const chave = ["retorno-execucoes-documento", tenantId, empresaId, entidade, documentoId] as const;
  const execs = useQuery({ queryKey: chave, queryFn: () => execucoesDocumento(tenantId, empresaId, entidade, documentoId), refetchInterval: 15_000 });
  const ctx = useQuery({
    queryKey: ["retorno-contexto-documento", tenantId, empresaId, entidade, documentoId],
    queryFn: () => contextoDocumento(tenantId, empresaId, entidade, documentoId, null),
  });
  const fluxos = useQuery({
    queryKey: ["retorno-fluxos", tenantId, empresaId, false],
    queryFn: () => listarFluxos(tenantId, empresaId, false),
    enabled: podeEditar,
  });

  const statusIntegracao = (ctx.data?.documento as { status_integracao?: string | null } | undefined)?.status_integracao ?? null;

  const fluxosServem = useMemo(() => {
    const evEntidade = new Map((catalogo?.eventos ?? []).map((e) => [e.codigo, e.entidade]));
    return (fluxos.data ?? []).filter((f) => f.ativo && f.versao_publicada != null && f.evento && evEntidade.get(f.evento) === entidade);
  }, [fluxos.data, catalogo, entidade]);

  const lista = execs.data ?? [];
  const ultimaErro = lista[0]?.status === "erro" ? lista[0] : null;
  const recarregar = () => qc.invalidateQueries({ queryKey: chave });

  async function enviar(fluxoId: string) {
    setEnviando(true);
    try {
      const r = await executar(fluxoId, documentoId, "manual", false);
      if (r.status === "filtrado") { toast.warning("Documento barrado pelos filtros do fluxo."); return; }
      const d = await invokeDispatcher({ acao: "executar", execucao_id: r.execucao_id });
      if (d.status === "sucesso") toast.success("Enviado ao ERP.");
      else if (d.status === "erro") toast.error(d.erro || "O envio falhou.");
      else toast.info("Envio em processamento.");
      setPopAberto(false);
    } catch (e) {
      toast.error(parseError(e, "retorno-enviar").title);
    } finally {
      setEnviando(false);
      recarregar();
    }
  }

  async function reenviar(id: string) {
    setReenviando(true);
    try { await reprocessarEExecutar(id, null); toast.success("Reenvio solicitado."); }
    catch (e) { toast.error(parseError(e, "retorno-reprocessar").title); }
    finally { setReenviando(false); recarregar(); }
  }

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center gap-2">
        <History size={14} className="text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Retornos ao ERP</h3>
        <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-400 border-sky-500/30">
          Integração: {statusIntegracao || "—"}
        </Badge>
        <div className="ml-auto flex gap-2">
          {ultimaErro && (
            <Button size="sm" variant="outline" disabled={!podeEditar || reenviando} onClick={() => reenviar(ultimaErro.id)}>
              {reenviando ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reenviar
            </Button>
          )}
          <Popover open={popAberto} onOpenChange={setPopAberto}>
            <PopoverTrigger asChild>
              <Button size="sm" disabled={!podeEditar || enviando}>
                {enviando ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Enviar ao ERP
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              {fluxos.isLoading ? (
                <div className="text-xs text-muted-foreground p-2 flex gap-2"><Loader2 size={13} className="animate-spin" /> Carregando…</div>
              ) : fluxosServem.length === 0 ? (
                <div className="p-2 space-y-2 text-xs text-muted-foreground">
                  <p>Nenhum fluxo publicado para este tipo de documento.</p>
                  <Button size="sm" variant="link" className="px-0 h-auto" onClick={() => irPara("/config/integracao/retornos?aba=fluxos")}>Abrir Retornos ao ERP</Button>
                </div>
              ) : (
                <div className="flex flex-col">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 py-1">Escolha o fluxo</p>
                  {fluxosServem.map((f) => (
                    <button key={f.id} disabled={enviando} onClick={() => enviar(f.id)}
                      className="text-left text-xs px-2 py-1.5 rounded hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-foreground">
                      {f.nome} <span className="text-muted-foreground">v{f.versao_publicada}</span>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {execs.isLoading ? (
        <div className="p-4 space-y-2"><Skeleton className="h-6" /><Skeleton className="h-6" /></div>
      ) : execs.isError ? (
        <div className="m-4 rounded-lg border border-destructive/40 p-3 text-xs flex items-center gap-3">
          <span className="text-muted-foreground">Não foi possível carregar os retornos.</span>
          <Button size="sm" variant="outline" onClick={() => execs.refetch()}>Tentar novamente</Button>
        </div>
      ) : lista.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
          <Send size={15} aria-hidden /> Nenhum retorno enviado para este documento.
        </div>
      ) : (
        <table className="w-full text-xs">
          <thead className="bg-secondary/40 text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Data</th>
              <th className="text-left px-3 py-2 font-medium">Fluxo</th>
              <th className="text-left px-3 py-2 font-medium">Evento</th>
              <th className="text-left px-3 py-2 font-medium">Modo</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-left px-3 py-2 font-medium">Erro</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((e) => (
              <tr key={e.id} tabIndex={0} role="button" aria-label={`Abrir execução de ${e.fluxo_nome}`}
                onClick={() => setAberta(e.id)} onKeyDown={(k) => { if (k.key === "Enter") setAberta(e.id); }}
                className="border-t border-border/40 hover:bg-secondary/30 cursor-pointer focus-visible:outline-none focus-visible:bg-secondary/40">
                <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(e.created_at)}</td>
                <td className="px-3 py-2 text-foreground">{e.fluxo_nome}{e.lote_execucao_id ? " (lote)" : ""}</td>
                <td className="px-3 py-2 font-mono">{e.evento}</td>
                <td className="px-3 py-2">{e.modo}</td>
                <td className="px-3 py-2"><StatusRetornoBadge tipo="execucao" status={e.status} /></td>
                <td className="px-3 py-2 text-rose-400 truncate max-w-[280px]" title={e.erro ?? ""}>{e.erro ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ExecucaoDetalheSheet execucaoId={aberta} podeEditar={podeEditar}
        onFechar={() => { setAberta(null); recarregar(); }} onAbrirExecucao={setAberta} onNavigate={irPara} />
    </div>
  );
}
