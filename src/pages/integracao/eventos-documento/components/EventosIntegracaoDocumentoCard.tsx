import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpDown, CornerDownRight, History, Info, Link2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { parseError } from "@/lib/errorMapper";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import { usePermissaoRetorno } from "../../retornos/useRetornos";
import { ExecucaoDetalheSheet } from "../../retornos/execucoes/ExecucaoDetalheSheet";
import type { DirecaoEvento, EntidadeDocumentoEvento, EventoComNivel, EventoDocumento, FiltrosEventos, OrdemEventos } from "../eventosDocumento.types";
import { eventosDocumentoKeys } from "../eventosDocumentoKeys";
import { CATEGORIA_ICONE, DIRECAO_UI, agruparEventos, lerOrdemSalva, origemTexto, salvarOrdem, ultimoRetornoComErroId } from "../eventosDocumentoUi";
import { useEventosDocumento } from "../useEventosDocumento";
import { RetornoAcoesDocumento } from "./RetornoAcoesDocumento";
import { EventoIntegracaoDetalheSheet } from "./EventoIntegracaoDetalheSheet";
import { SituacaoEventoBadge } from "./SituacaoEventoBadge";

interface Props { entidade: EntidadeDocumentoEvento; documentoId: string }

const irPara = (path: string) => { window.location.hash = path; };

/** Card "Eventos de integração" nos detalhes de documento de saída/entrada. */
export function EventosIntegracaoDocumentoCard(props: Props) {
  const { can } = usePermissions();
  const { podeVer } = usePermissaoRetorno();
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const moduloDoc = props.entidade === "documento_saida" ? "web.atividades.saidas" : "web.atividades.entradas";
  if (!tenantId || !empresaId) return null;
  if (!can(moduloDoc, "READ") && !podeVer) return null;
  return (
    <TooltipProvider>
      <Conteudo key={`${empresaId}-${empresaVersion}`} {...props} tenantId={tenantId} empresaId={empresaId} />
    </TooltipProvider>
  );
}

const CHIPS: { valor: DirecaoEvento | null; rotulo: string; campo: "total" | "erp_wms" | "wms" | "wms_erp" }[] = [
  { valor: null, rotulo: "Todos", campo: "total" },
  { valor: "ERP_WMS", rotulo: "ERP → WMS", campo: "erp_wms" },
  { valor: "WMS", rotulo: "WMS", campo: "wms" },
  { valor: "WMS_ERP", rotulo: "WMS → ERP", campo: "wms_erp" },
];

function Conteudo({ entidade, documentoId, tenantId, empresaId }: Props & { tenantId: string; empresaId: string }) {
  const qc = useQueryClient();
  const { podeVer: podeVerRetornos, podeEditar } = usePermissaoRetorno();
  const [direcao, setDirecao] = useState<DirecaoEvento | null>(null);
  const [somenteProblemas, setSomenteProblemas] = useState(false);
  const [ordem, setOrdem] = useState<OrdemEventos>(() => lerOrdemSalva());
  const [aberto, setAberto] = useState<EventoDocumento | null>(null);
  const [execAberta, setExecAberta] = useState<string | null>(null);

  const filtros: FiltrosEventos = useMemo(() => ({ direcao, somenteProblemas, ordem }), [direcao, somenteProblemas, ordem]);
  const q = useEventosDocumento({ tenantId, empresaId, entidade, documentoId, filtros });

  const paginas = q.data?.pages ?? [];
  const primeira = paginas[0];
  const resumo = primeira?.resumo;
  const documento = primeira?.documento;
  const eventos = useMemo(() => paginas.flatMap((p) => p.eventos), [paginas]);
  const linhas = useMemo(() => agruparEventos(eventos), [eventos]);
  const ultimoErro = useMemo(() => ultimoRetornoComErroId(eventos), [eventos]);
  const totalFiltrado = paginas[paginas.length - 1]?.total_filtrado ?? 0;
  const restantes = Math.max(0, totalFiltrado - eventos.length);

  const erroInfo = q.isError ? parseError(q.error, "doc-eventos-listar") : null;
  if (erroInfo?.errorCode === "DOC_EVENTOS_SEM_PERMISSAO") return null;

  const recarregar = () => {
    qc.invalidateQueries({ queryKey: eventosDocumentoKeys.listaBase(tenantId, empresaId, entidade, documentoId) });
    qc.invalidateQueries({ queryKey: ["retorno-execucoes"] });
  };

  const alternarOrdem = () => {
    const nova: OrdemEventos = ordem === "asc" ? "desc" : "asc";
    setOrdem(nova);
    salvarOrdem(nova);
  };
  const limparFiltros = () => { setDirecao(null); setSomenteProblemas(false); };

  const abrir = (ev: EventoDocumento) => {
    if (!ev.tem_detalhe) return;
    if (ev.fonte === "retorno_execucao" && podeVerRetornos) setExecAberta(ev.id);
    else setAberto(ev);
  };
  const abrirRetorno = (id: string) => {
    if (podeVerRetornos) { setAberto(null); setExecAberta(id); }
  };

  return (
    <div className="card-surface overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex flex-wrap items-center gap-2">
        <History size={14} className="text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Eventos de integração</h3>
        <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-400 border-sky-500/30">
          Integração: {documento?.status_integracao || "—"}
        </Badge>
        {resumo && <span className="text-[11px] text-muted-foreground">{resumo.total.toLocaleString("pt-BR")} eventos</span>}
        {resumo && resumo.problemas > 0 && (
          <Badge variant="outline" className="text-[10px] gap-1 bg-rose-500/15 text-rose-400 border-rose-500/30">
            <AlertTriangle size={11} aria-hidden /> {resumo.problemas.toLocaleString("pt-BR")} com problema
          </Badge>
        )}
        <div className="ml-auto">
          <RetornoAcoesDocumento entidade={entidade} documentoId={documentoId} numeroDoc={documento?.numero}
            ultimoRetornoComErroId={ultimoErro} onAposAcao={recarregar} />
        </div>
      </div>

      <div className="px-4 py-2 border-b border-border/60 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por direção">
          {CHIPS.map((c) => {
            const ativo = direcao === c.valor;
            return (
              <button key={c.rotulo} type="button" aria-pressed={ativo} onClick={() => setDirecao(c.valor)}
                className={cn("text-xs px-2.5 py-1 rounded-md border border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo ? "bg-secondary text-foreground border-border" : "text-muted-foreground hover:text-foreground")}>
                {c.rotulo} ({(resumo?.[c.campo] ?? 0).toLocaleString("pt-BR")})
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Toggle size="sm" pressed={somenteProblemas} onPressedChange={setSomenteProblemas}
            disabled={!resumo || resumo.problemas === 0} aria-label="Somente problemas" className="text-xs gap-1 h-8">
            <AlertTriangle size={13} aria-hidden /> Somente problemas
          </Toggle>
          <Button size="sm" variant="ghost" className="text-xs h-8" onClick={alternarOrdem}>
            <ArrowUpDown size={13} aria-hidden /> {ordem === "asc" ? "Mais antigos primeiro" : "Mais recentes primeiro"}
          </Button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="p-4 space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-7" />)}</div>
      ) : erroInfo ? (
        <div className="m-4 rounded-lg border border-destructive/40 p-3 text-xs flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground">{erroInfo.title}</span>
          <Button size="sm" variant="outline" onClick={() => q.refetch()}>Tentar novamente</Button>
        </div>
      ) : resumo && resumo.total === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
          <History size={15} aria-hidden />
          <span className="text-foreground">Nenhum evento de integração registrado para este documento.</span>
          <span>Documentos importados antes do registro de integração podem não ter histórico.</span>
        </div>
      ) : linhas.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-1.5">
          <span>Nenhum evento para os filtros selecionados.</span>
          <Button size="sm" variant="link" className="h-auto px-0 text-xs" onClick={limparFiltros}>Limpar filtros</Button>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Data/hora</th>
                  <th className="text-left px-3 py-2 font-medium">Direção</th>
                  <th className="text-left px-3 py-2 font-medium">Evento</th>
                  <th className="text-left px-3 py-2 font-medium">Origem</th>
                  <th className="text-left px-3 py-2 font-medium">Situação</th>
                  <th className="text-left px-3 py-2 font-medium">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => <LinhaTabela key={`${l.evento.fonte}-${l.evento.id}`} linha={l} onAbrir={abrir} />)}
              </tbody>
            </table>
          </div>
          <ul className="md:hidden divide-y divide-border/40">
            {linhas.map((l) => <CartaoMovel key={`${l.evento.fonte}-${l.evento.id}`} linha={l} onAbrir={abrir} />)}
          </ul>
          {q.hasNextPage && (
            <div className="p-3 flex justify-center border-t border-border/40">
              <Button size="sm" variant="outline" disabled={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
                {q.isFetchingNextPage && <Loader2 size={13} className="animate-spin" />}
                Carregar mais ({restantes.toLocaleString("pt-BR")} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      <EventoIntegracaoDetalheSheet evento={aberto} tenantId={tenantId} empresaId={empresaId} entidade={entidade}
        documentoId={documentoId} onFechar={() => setAberto(null)} onAbrirRetorno={podeVerRetornos ? abrirRetorno : undefined} />
      {podeVerRetornos && (
        <ExecucaoDetalheSheet execucaoId={execAberta} podeEditar={podeEditar}
          onFechar={() => { setExecAberta(null); recarregar(); }} onAbrirExecucao={setExecAberta} onNavigate={irPara} />
      )}
    </div>
  );
}

function corMensagem(ev: EventoDocumento) {
  if (ev.problema) return "text-rose-400";
  if (ev.situacao === "filtrado") return "text-muted-foreground";
  return "text-foreground";
}

function propsInterativas(ev: EventoDocumento, onAbrir: (e: EventoDocumento) => void) {
  if (!ev.tem_detalhe) return {};
  return {
    tabIndex: 0,
    role: "button" as const,
    "aria-label": `Abrir detalhe: ${ev.titulo}`,
    onClick: () => onAbrir(ev),
    onKeyDown: (k: React.KeyboardEvent) => { if (k.key === "Enter") onAbrir(ev); },
  };
}

function Indicadores({ ev }: { ev: EventoDocumento }) {
  return (
    <>
      {ev.sintetico && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-muted-foreground" aria-label="Evento reconstruído"><Info size={13} /></span>
          </TooltipTrigger>
          <TooltipContent>Reconstruído a partir do estado do documento (registro anterior ao log de integração)</TooltipContent>
        </Tooltip>
      )}
      {ev.vinculo === "codigo_erp" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex text-muted-foreground" aria-label="Vinculado pelo código ERP"><Link2 size={13} /></span>
          </TooltipTrigger>
          <TooltipContent>Vinculado pelo código ERP do documento</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}

function LinhaTabela({ linha, onAbrir }: { linha: EventoComNivel; onAbrir: (e: EventoDocumento) => void }) {
  const ev = linha.evento;
  const dir = DIRECAO_UI[ev.direcao];
  const DirIcone = dir.icone;
  const CatIcone = CATEGORIA_ICONE[ev.categoria] ?? History;
  const origem = origemTexto(ev);
  return (
    <tr {...propsInterativas(ev, onAbrir)}
      className={cn("border-t border-border/40 align-top",
        ev.tem_detalhe && "cursor-pointer hover:bg-secondary/30 focus-visible:outline-none focus-visible:bg-secondary/40",
        ev.problema && "bg-rose-500/5 border-l-2 border-l-rose-500/60")}>
      <td className="px-3 py-2 whitespace-nowrap">{ev.ocorrido_em ? formatDateTime(ev.ocorrido_em) : "—"}</td>
      <td className={cn("px-3 py-2 whitespace-nowrap", dir.texto)}>
        <span className="inline-flex items-center gap-1"><DirIcone size={13} aria-hidden /> {dir.rotulo}</span>
      </td>
      <td className={cn("px-3 py-2", linha.filho && "pl-8")}>
        <div className="flex items-center gap-1.5">
          {linha.filho && <CornerDownRight size={13} className="text-muted-foreground shrink-0" aria-hidden />}
          <CatIcone size={13} className="text-muted-foreground shrink-0" aria-hidden />
          <span className="text-foreground">{ev.titulo}</span>
          <Indicadores ev={ev} />
        </div>
        {ev.codigo && <div className="font-mono text-[11px] text-muted-foreground mt-0.5 break-all">{ev.codigo}</div>}
      </td>
      <td className="px-3 py-2">{origem}{ev.ator_nome ? ` · ${ev.ator_nome}` : ""}</td>
      <td className="px-3 py-2"><SituacaoEventoBadge fonte={ev.fonte} situacao={ev.situacao} /></td>
      <td className={cn("px-3 py-2 max-w-[320px] truncate", corMensagem(ev))} title={ev.mensagem ?? ""}>{ev.mensagem ?? ""}</td>
    </tr>
  );
}

function CartaoMovel({ linha, onAbrir }: { linha: EventoComNivel; onAbrir: (e: EventoDocumento) => void }) {
  const ev = linha.evento;
  const dir = DIRECAO_UI[ev.direcao];
  const DirIcone = dir.icone;
  return (
    <li {...propsInterativas(ev, onAbrir)}
      className={cn("px-4 py-2.5 space-y-1 text-xs",
        linha.filho && "pl-8",
        ev.tem_detalhe && "cursor-pointer focus-visible:outline-none focus-visible:bg-secondary/40",
        ev.problema && "bg-rose-500/5 border-l-2 border-l-rose-500/60")}>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {linha.filho && <CornerDownRight size={13} aria-hidden />}
        <DirIcone size={13} className={dir.texto} aria-label={dir.rotulo} />
        <span>{ev.ocorrido_em ? formatDateTime(ev.ocorrido_em) : "—"}</span>
      </div>
      <div className="flex items-center gap-1.5 text-foreground break-words">{ev.titulo} <Indicadores ev={ev} /></div>
      <div className="flex flex-wrap items-center gap-2">
        <SituacaoEventoBadge fonte={ev.fonte} situacao={ev.situacao} />
        <span className="text-muted-foreground">{origemTexto(ev)}{ev.ator_nome ? ` · ${ev.ator_nome}` : ""}</span>
      </div>
      {ev.mensagem && <p className={cn("text-[11px] break-words", corMensagem(ev))}>{ev.mensagem}</p>}
    </li>
  );
}
