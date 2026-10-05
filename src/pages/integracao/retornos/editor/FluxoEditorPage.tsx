import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ReactFlowProvider, useEdgesState, useNodesState, useReactFlow, type OnBeforeDelete } from "@xyflow/react";
import { AlertTriangle, ArrowLeft, Eye, Info, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { parseError } from "@/lib/errorMapper";
import { retornosKeys } from "../retornosKeys";
import { listarDestinos, obterFluxo } from "../retornosService";
import { useCatalogoRetorno, usePermissaoRetorno } from "../useRetornos";
import type { Aviso, Catalogo, Destino, FluxoCompleto } from "../retornos.types";
import { deRf, paraRf, type FluxoEdge, type FluxoNode } from "./definicaoRf";
import { EditorContext, type EditorContextValor } from "./editorContext";
import { EditorTopBar } from "./EditorTopBar";
import { FlowCanvas } from "./FlowCanvas";
import { NoConfigSheet } from "./NoConfigSheet";
import { useAutosaveFluxo } from "./useAutosaveFluxo";

interface Props {
  onNavigate: (path: string) => void;
  fluxoId: string;
}

const VOLTAR = "/config/integracao/retornos?aba=fluxos";

function useTelaGrande() {
  const [grande, setGrande] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const h = (e: MediaQueryListEvent) => setGrande(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return grande;
}

function emCampoDeTexto(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return !!el.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']");
}

function enterValeNoCanvas(alvo: EventTarget | null) {
  const el = alvo as HTMLElement | null;
  if (el?.closest?.("button, a, [role='button'], [role='tab']")) return false;
  if (document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']")) return false;
  const ativo = document.activeElement;
  return !ativo || ativo === document.body || !!ativo.closest(".react-flow");
}

export function FluxoEditorPage({ onNavigate, fluxoId }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [recarga, setRecarga] = useState(0);
  const { loading: permissoesCarregando } = usePermissions();

  // Troca de empresa com o editor aberto → volta para a lista.
  const empresaInicial = useRef({ empresaId, empresaVersion });
  useEffect(() => {
    const ini = empresaInicial.current;
    if (ini.empresaId && (ini.empresaId !== empresaId || ini.empresaVersion !== empresaVersion)) onNavigate(VOLTAR);
  }, [empresaId, empresaVersion, onNavigate]);

  const fluxoQ = useQuery({
    queryKey: retornosKeys.fluxo(fluxoId),
    queryFn: () => obterFluxo(fluxoId),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const catalogoQ = useCatalogoRetorno();
  const destinosQ = useQuery({
    queryKey: retornosKeys.destinos(tenantId, empresaId),
    queryFn: () => listarDestinos(tenantId as string, empresaId as string),
    enabled: !!tenantId && !!empresaId,
  });

  if (!empresaId || !tenantId) {
    return <div className="card-surface p-6 text-sm text-muted-foreground">Selecione uma empresa para continuar.</div>;
  }

  if (permissoesCarregando || fluxoQ.isLoading || catalogoQ.isLoading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="flex-1 min-h-[520px] w-full rounded-xl" />
      </div>
    );
  }

  const erro = fluxoQ.error ?? catalogoQ.error;
  if (erro || !fluxoQ.data) {
    const pe = parseError(erro, "Abrir fluxo");
    const naoEncontrado = pe.errorCode === "RETORNO_FLUXO_NAO_ENCONTRADO";
    return (
      <div className="card-surface border-destructive/40 flex flex-col items-center gap-3 p-8 text-center">
        <AlertTriangle size={15} className="text-rose-400" aria-hidden />
        <p className="text-sm text-foreground">{naoEncontrado ? "Fluxo não encontrado." : pe.title}</p>
        <div className="flex gap-2">
          {!naoEncontrado && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { void fluxoQ.refetch(); void catalogoQ.refetch(); }}>
              <RotateCcw size={13} /> Tentar novamente
            </Button>
          )}
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onNavigate(VOLTAR)}><ArrowLeft size={13} /> Voltar</Button>
        </div>
      </div>
    );
  }

  const recarregar = async () => {
    await fluxoQ.refetch();
    setRecarga((r) => r + 1);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <ReactFlowProvider key={recarga}>
        <EditorConteudo
          fluxo={fluxoQ.data}
          catalogo={catalogoQ.data}
          destinos={destinosQ.data}
          tenantId={tenantId}
          empresaId={empresaId}
          onNavigate={onNavigate}
          onRecarregar={recarregar}
        />
      </ReactFlowProvider>
    </TooltipProvider>
  );
}

interface ConteudoProps {
  fluxo: FluxoCompleto;
  catalogo?: Catalogo;
  destinos?: Destino[];
  tenantId: string;
  empresaId: string;
  onNavigate: (path: string) => void;
  onRecarregar: () => Promise<void>;
}

function EditorConteudo({ fluxo: inicial, catalogo, destinos, tenantId, empresaId, onNavigate, onRecarregar }: ConteudoProps) {
  const { podeEditar } = usePermissaoRetorno();
  const telaGrande = useTelaGrande();
  const podeSalvar = podeEditar && inicial.status !== "arquivado";
  const podeInteragir = podeSalvar && telaGrande;
  const somenteLeitura = !podeInteragir;
  const motivoLeitura = !podeEditar
    ? "Modo somente leitura — você pode ver, mas não alterar este fluxo."
    : inicial.status === "arquivado"
      ? "Fluxo arquivado. Desarquive na lista para editar."
      : !telaGrande ? "Abra em uma tela de computador para editar este fluxo." : null;

  const rfInicial = useMemo(() => paraRf(inicial.definicao_rascunho, catalogo), [inicial, catalogo]);
  const [nodes, setNodes, onNodesChange] = useNodesState<FluxoNode>(rfInicial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FluxoEdge>(rfInicial.edges);
  const [nome, setNome] = useState(inicial.nome);
  const [noAberto, setNoAberto] = useState<string | null>(null);
  const [voltando, setVoltando] = useState(false);
  const [sairSemSalvar, setSairSemSalvar] = useState(false);
  const { fitView } = useReactFlow();

  const nodesRef = useRef(nodes); nodesRef.current = nodes;
  const edgesRef = useRef(edges); edgesRef.current = edges;
  const nomeRef = useRef(nome); nomeRef.current = nome;

  const auto = useAutosaveFluxo({
    tenantId, empresaId, inicial, habilitado: podeSalvar,
    obterPayload: () => ({ nome: nomeRef.current, definicao: deRf(nodesRef.current, edgesRef.current) }),
  });
  const { agendar, salvarAgora } = auto;
  const fluxo = auto.ultimoSalvo;

  const chaveAviso = `retorno-editor-aviso-rascunho-${inicial.id}`;
  const [avisoRascunho, setAvisoRascunho] = useState(
    () => podeSalvar && (inicial.status === "publicado" || inicial.status === "pausado") && sessionStorage.getItem(chaveAviso) !== "1",
  );

  const ctx = useMemo<EditorContextValor>(() => {
    const v = fluxo.validacao_rascunho;
    const agrupar = (lista: Aviso[] | undefined) => {
      const m = new Map<string, Aviso[]>();
      (lista ?? []).forEach((a) => { if (a.no_id) m.set(a.no_id, [...(m.get(a.no_id) ?? []), a]); });
      return m;
    };
    const desconectados = new Set(
      [...(v?.erros ?? []), ...(v?.avisos ?? [])].filter((a) => a.codigo === "NO_DESCONECTADO" && a.no_id).map((a) => a.no_id as string),
    );
    return { catalogo, destinos, errosPorNo: agrupar(v?.erros), avisosPorNo: agrupar(v?.avisos), desconectados, editavel: !somenteLeitura };
  }, [fluxo.validacao_rascunho, catalogo, destinos, somenteLeitura]);

  // Tela encolheu com alteração pendente: grava antes de travar a edição.
  useEffect(() => {
    if (!telaGrande && podeSalvar && auto.temPendencia()) void salvarAgora();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telaGrande]);

  const onBeforeDelete: OnBeforeDelete<FluxoNode, FluxoEdge> = useCallback(async ({ nodes: ns, edges: es }) => {
    if (somenteLeitura) return false;
    const gatilhos = new Set(ns.filter((n) => n.data.tipo.startsWith("gatilho.")).map((n) => n.id));
    if (gatilhos.size) {
      toast.info("O gatilho não pode ser excluído.");
      const outros = ns.filter((n) => !gatilhos.has(n.id));
      const arestas = es.filter((e) => e.selected || (!gatilhos.has(e.source) && !gatilhos.has(e.target)));
      if (!outros.length && !arestas.length) return false;
      return { nodes: outros, edges: arestas };
    }
    return true;
  }, [somenteLeitura]);

  const onDelete = useCallback(({ nodes: ns, edges: es }: { nodes: FluxoNode[]; edges: FluxoEdge[] }) => {
    if (ns.length) {
      const ids = new Set(ns.map((n) => n.id));
      setNodes((atual) => atual.map((n) => {
        const ref = n.data.config.corpo_de;
        if (typeof ref === "string" && ids.has(ref)) {
          const { corpo_de: _r, ...resto } = n.data.config;
          return { ...n, data: { ...n.data, config: resto } };
        }
        return n;
      }));
      if (noAberto && ids.has(noAberto)) setNoAberto(null);
    }
    if (ns.length || es.length) agendar();
  }, [setNodes, agendar, noAberto]);

  const selecionarNo = useCallback((id: string) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    setEdges((es) => es.map((e) => ({ ...e, selected: false })));
    setTimeout(() => { void fitView({ nodes: [{ id }], duration: 300, maxZoom: 1.2 }); }, 0);
  }, [setNodes, setEdges, fitView]);

  // Atalhos: Ctrl+S salva, Enter abre o nó selecionado.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // Deixa o Sheet aplicar o JSON antes de gravar.
        if (podeSalvar) setTimeout(() => { void salvarAgora(); }, 0);
        return;
      }
      if (emCampoDeTexto(e.target)) return;
      if (e.key === "Enter" && !noAberto && !somenteLeitura && enterValeNoCanvas(e.target)) {
        const sel = nodesRef.current.filter((n) => n.selected);
        if (sel.length === 1) { e.preventDefault(); setNoAberto(sel[0].id); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [somenteLeitura, podeSalvar, salvarAgora, noAberto]);

  const atualizarNo = (id: string, patch: Partial<FluxoNode["data"]>) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    agendar();
  };

  const voltar = async () => {
    if (somenteLeitura || !auto.temPendencia()) { onNavigate(VOLTAR); return; }
    setVoltando(true);
    const ok = await salvarAgora();
    setVoltando(false);
    if (ok) onNavigate(VOLTAR);
    else setSairSemSalvar(true);
  };

  const noSelecionado = noAberto ? nodes.find((n) => n.id === noAberto) ?? null : null;

  return (
    <EditorContext.Provider value={ctx}>
      <div className="flex flex-col flex-1 min-h-0 gap-3 overflow-hidden">
        <EditorTopBar
          nome={nome}
          fluxo={fluxo}
          somenteLeitura={somenteLeitura}
          estado={auto.estado}
          voltando={voltando}
          salvoEm={auto.salvoEm}
          onRenomear={(n) => { setNome(n); agendar(); }}
          onVoltar={() => { void voltar(); }}
          onExecucoes={() => onNavigate(`/config/integracao/retornos?aba=execucoes&fluxo=${inicial.id}`)}
          onTentarDeNovo={() => { agendar(); void salvarAgora(); }}
        />

        {motivoLeitura && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
            <Eye size={13} aria-hidden /> {motivoLeitura}
          </div>
        )}
        {avisoRascunho && (
          <div className="flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-400">
            <Info size={13} aria-hidden />
            <span className="flex-1">
              Você está editando o rascunho. A versão publicada (v{inicial.versao_publicada}) continua rodando até você publicar de novo.
            </span>
            <button
              type="button"
              aria-label="Fechar aviso"
              onClick={() => { sessionStorage.setItem(chaveAviso, "1"); setAvisoRascunho(false); }}
              className="rounded p-0.5 hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X size={13} />
            </button>
          </div>
        )}

        <FlowCanvas
          nodes={nodes}
          edges={edges}
          editavel={!somenteLeitura}
          validacao={fluxo.validacao_rascunho}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeDragStop={agendar}
          onBeforeDelete={onBeforeDelete}
          onDelete={onDelete}
          onAbrirNo={setNoAberto}
          onSelecionarNo={selecionarNo}
        />
      </div>

      <NoConfigSheet
        no={noSelecionado}
        catalogo={catalogo}
        somenteLeitura={somenteLeitura}
        onFechar={() => setNoAberto(null)}
        onRenomear={(n) => noSelecionado && atualizarNo(noSelecionado.id, { nome: n || undefined })}
        onAplicarConfig={(cfg) => noSelecionado && atualizarNo(noSelecionado.id, { config: cfg })}
      />

      <AlertDialog open={auto.conflito}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Este fluxo foi alterado em outro lugar</AlertDialogTitle>
            <AlertDialogDescription>Outra aba ou outra pessoa salvou este fluxo depois que você o abriu.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { auto.descartarConflito(); void onRecarregar(); }}>Recarregar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void auto.manterMinhaVersao(); }}>Manter a minha versão</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={sairSemSalvar} onOpenChange={setSairSemSalvar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Existem alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>Se sair agora, as últimas alterações deste fluxo serão perdidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Ficar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { auto.descartarConflito(); onNavigate(VOLTAR); }}>Sair sem salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </EditorContext.Provider>
  );
}
