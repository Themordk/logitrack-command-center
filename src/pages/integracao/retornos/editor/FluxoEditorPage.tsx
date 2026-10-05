import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ReactFlowProvider, useEdgesState, useNodesState, useReactFlow,
  type Connection, type IsValidConnection, type OnBeforeDelete, type OnConnectEnd,
} from "@xyflow/react";
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
import type { Aviso, Catalogo, Destino, DocumentoRecente, FluxoCompleto, TipoNo } from "../retornos.types";
import { criarEdge, deRf, layoutAutomatico, paraRf, type FluxoEdge, type FluxoNode } from "./definicaoRf";
import { AdicionarNoPopover } from "./AdicionarNoPopover";
import { NodePalette, MIME_NO } from "./NodePalette";
import { NoContextMenu, type MenuContexto } from "./NoContextMenu";
import { alinhar, criarNo, ehGatilho, nomeUnico, posicaoLivre } from "./novoNo";
import { motivoBloqueio, saidasDoTipo, saidasLivres } from "./regrasConexao";
import { useHistoricoFluxo, type Instantaneo } from "./useHistoricoFluxo";
import { EditorContext, type EditorContextValor } from "./editorContext";
import { EditorTopBar } from "./EditorTopBar";
import { FlowCanvas } from "./FlowCanvas";
import { NodeConfigDialog } from "./NodeConfigDialog";
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
  const { fitView, screenToFlowPosition, deleteElements } = useReactFlow<FluxoNode, FluxoEdge>();
  const historico = useHistoricoFluxo();
  const [amostra, setAmostra] = useState<DocumentoRecente | null>(null);
  const [menu, setMenu] = useState<MenuContexto | null>(null);
  const [adicionarEm, setAdicionarEm] = useState<{ x: number; y: number; de?: string; saida?: string } | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const renomeandoRef = useRef<string | null>(null); renomeandoRef.current = renomeandoId;
  const maxNos = catalogo?.limites.max_nos ?? Infinity;
  const limiteAtingido = nodes.length >= maxNos;

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
    const saidasOcupadas = new Set(edges.map((e) => `${e.source}:${e.sourceHandle ?? "principal"}`));
    return {
      catalogo, destinos, errosPorNo: agrupar(v?.erros), avisosPorNo: agrupar(v?.avisos), desconectados, editavel: !somenteLeitura,
      saidasOcupadas, limiteAtingido, renomeandoId,
      onAdicionarNoRamo: (de, saida, tipo) => adicionarRef.current(tipo, { de, saida }),
      onConcluirRenomear: (id, n) => concluirRenomearRef.current(id, n),
    };
  }, [fluxo.validacao_rascunho, catalogo, destinos, somenteLeitura, edges, limiteAtingido, renomeandoId]);

  // Tela encolheu com alteração pendente: grava antes de travar a edição.
  useEffect(() => {
    if (!telaGrande && podeSalvar && auto.temPendencia()) void salvarAgora();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telaGrande]);

  // ---------- Histórico e ação única de alteração ----------
  const instantaneo = useCallback((): Instantaneo => ({
    definicao: deRf(nodesRef.current, edgesRef.current),
    selecionados: nodesRef.current.filter((n) => n.selected).map((n) => n.id),
  }), []);

  const restaurar = useCallback((s: Instantaneo | null) => {
    if (!s) return;
    const rf = paraRf(s.definicao, catalogo);
    const sel = new Set(s.selecionados);
    const ns = rf.nodes.map((n) => ({ ...n, selected: sel.has(n.id) }));
    nodesRef.current = ns; edgesRef.current = rf.edges;
    setNodes(ns); setEdges(rf.edges);
    setNoAberto((a) => (a && ns.some((n) => n.id === a) ? a : null));
    agendar();
  }, [catalogo, setNodes, setEdges, agendar]);

  const desfazer = useCallback(() => restaurar(historico.desfazer(instantaneo())), [historico, instantaneo, restaurar]);
  const refazer = useCallback(() => restaurar(historico.refazer(instantaneo())), [historico, instantaneo, restaurar]);

  type Estado = { nodes: FluxoNode[]; edges: FluxoEdge[] };
  /** Toda alteração da definição passa por aqui: histórico → nodes/edges → salvamento. */
  const aplicar = useCallback((acao: (atual: Estado) => Estado | null) => {
    if (somenteLeitura) return;
    const r = acao({ nodes: nodesRef.current, edges: edgesRef.current });
    if (!r) return;
    historico.registrar(instantaneo());
    nodesRef.current = r.nodes; edgesRef.current = r.edges;
    setNodes(r.nodes); setEdges(r.edges);
    agendar();
  }, [somenteLeitura, historico, instantaneo, setNodes, setEdges, agendar]);

  /** Liga de→para substituindo a ligação que já ocupava a saída. */
  const ligar = (ns: FluxoNode[], es: FluxoEdge[], de: string, saida: string, para: string) => {
    const substituida = es.some((e) => e.source === de && (e.sourceHandle ?? "principal") === saida);
    const edges2 = [...es.filter((e) => !(e.source === de && (e.sourceHandle ?? "principal") === saida)), criarEdge(de, para, saida)];
    const origem = ns.find((n) => n.id === de);
    const nodes2 = ns.map((n) =>
      n.id === para && n.data.tipo === "acao.http" && origem?.data.tipo === "dados.payload" && !n.data.config.corpo_de
        ? { ...n, data: { ...n.data, config: { ...n.data.config, corpo_de: de } } }
        : n);
    return { nodes: nodes2, edges: edges2, substituida };
  };

  const adicionar = useCallback((tipo: TipoNo, opts: { pos?: { x: number; y: number }; de?: string; saida?: string } = {}) => {
    aplicar(({ nodes: ns, edges: es }) => {
      if (ns.length >= maxNos) { toast.info(`Limite de ${maxNos} nós atingido.`); return null; }
      if (ehGatilho(tipo) && ns.some((n) => ehGatilho(n.data.tipo))) { toast.info("O fluxo só pode ter um gatilho."); return null; }
      const origem = opts.de ? ns.find((n) => n.id === opts.de) : undefined;
      let pos = opts.pos;
      if (!pos && origem) {
        const saidas = saidasDoTipo(origem, catalogo);
        const i = saidas.indexOf(opts.saida ?? "principal");
        const dy = saidas.length === 2 ? (i === 0 ? -80 : 80) : 0;
        pos = posicaoLivre(origem.position.x + 280, origem.position.y + dy, ns);
      }
      const novo = criarNo(tipo, pos ?? { x: 0, y: 0 }, ns, catalogo);
      let nodes2 = [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), novo];
      let edges2 = es.map((e) => (e.selected ? { ...e, selected: false } : e));
      if (origem && opts.saida && !ehGatilho(tipo)) {
        const r = ligar(nodes2, edges2, origem.id, opts.saida, novo.id);
        nodes2 = r.nodes; edges2 = r.edges;
      }
      return { nodes: nodes2, edges: edges2 };
    });
  }, [aplicar, maxNos, catalogo]);
  const adicionarRef = useRef(adicionar); adicionarRef.current = adicionar;

  const centroVisivel = () => {
    const el = document.querySelector(".retorno-canvas");
    const r = el?.getBoundingClientRect();
    const p = screenToFlowPosition(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 });
    return { x: alinhar(p.x - 80), y: alinhar(p.y - 32) };
  };

  const adicionarPelaPaleta = (tipo: TipoNo) => {
    const sel = nodesRef.current.filter((n) => n.selected);
    if (sel.length === 1 && !ehGatilho(tipo)) {
      const livre = saidasLivres(sel[0], edgesRef.current, catalogo)[0];
      const pos = posicaoLivre(sel[0].position.x + 280, sel[0].position.y, nodesRef.current);
      adicionar(tipo, { pos, de: livre ? sel[0].id : undefined, saida: livre });
    } else {
      adicionar(tipo, { pos: posicaoLivre(centroVisivel().x, centroVisivel().y, nodesRef.current) });
    }
  };

  const onDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(MIME_NO)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);
  const onDrop = useCallback((e: DragEvent) => {
    const tipo = e.dataTransfer.getData(MIME_NO) as TipoNo;
    if (!tipo) return;
    e.preventDefault();
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    adicionar(tipo, { pos: { x: alinhar(p.x - 80), y: alinhar(p.y - 32) } });
  }, [screenToFlowPosition, adicionar]);

  // ---------- Conexões ----------
  const isValidConnection: IsValidConnection<FluxoEdge> = useCallback(
    (c) => motivoBloqueio(c, nodesRef.current, edgesRef.current, catalogo) === null,
    [catalogo],
  );
  const onConnect = useCallback((c: Connection) => {
    let substituida = false;
    aplicar(({ nodes: ns, edges: es }) => {
      if (motivoBloqueio(c, ns, es, catalogo) !== null) return null;
      const r = ligar(ns, es, c.source, c.sourceHandle ?? "principal", c.target);
      substituida = r.substituida;
      return { nodes: r.nodes, edges: r.edges };
    });
    if (substituida) toast.info("Ligação substituída.");
  }, [aplicar, catalogo]);
  const onConnectEnd: OnConnectEnd<FluxoNode> = useCallback((ev, st) => {
    if (st.isValid || !st.fromNode || !st.fromHandle || st.fromHandle.type !== "source") return;
    const saida = st.fromHandle.id ?? "principal";
    const alvoNo = st.toNode ?? null;
    const el = ev.target as HTMLElement | null;
    if (alvoNo) {
      const motivo = motivoBloqueio({ source: st.fromNode.id, target: alvoNo.id, sourceHandle: saida }, nodesRef.current, edgesRef.current, catalogo);
      if (motivo) toast.info(motivo);
      return;
    }
    if (el?.closest?.(".react-flow__node")) {
      const id = el.closest(".react-flow__node")?.getAttribute("data-id");
      const motivo = id ? motivoBloqueio({ source: st.fromNode.id, target: id, sourceHandle: saida }, nodesRef.current, edgesRef.current, catalogo) : null;
      if (motivo) toast.info(motivo);
      return;
    }
    const pt = "changedTouches" in ev ? ev.changedTouches[0] : ev;
    setAdicionarEm({ x: pt.clientX, y: pt.clientY, de: st.fromNode.id, saida });
  }, [catalogo]);

  // ---------- Ações de nó ----------
  const duplicar = useCallback((id: string) => {
    aplicar(({ nodes: ns, edges: es }) => {
      const o = ns.find((n) => n.id === id);
      if (!o || ehGatilho(o.data.tipo) || ns.length >= maxNos) return null;
      const base = criarNo(o.data.tipo, { x: o.position.x + 40, y: o.position.y + 40 }, ns, catalogo);
      const copia: FluxoNode = {
        ...base,
        data: {
          ...base.data,
          nome: nomeUnico(`${o.data.nome || base.data.nome} (cópia)`, ns),
          config: structuredClone(o.data.config),
          extra: structuredClone(o.data.extra),
        },
      };
      return { nodes: [...ns.map((n) => ({ ...n, selected: false })), copia], edges: es };
    });
  }, [aplicar, maxNos, catalogo]);

  const desligarEntradas = useCallback((id: string) => {
    aplicar(({ nodes: ns, edges: es }) => (es.some((e) => e.target === id) ? { nodes: ns, edges: es.filter((e) => e.target !== id) } : null));
  }, [aplicar]);

  const concluirRenomear = (id: string, novo: string | null) => {
    if (renomeandoRef.current !== id) return;
    renomeandoRef.current = null;
    setRenomeandoId(null);
    if (novo === null) return;
    const t = novo.trim();
    aplicar(({ nodes: ns, edges: es }) => {
      const n = ns.find((x) => x.id === id);
      if (!n || (n.data.nome ?? "") === t) return null;
      return { nodes: ns.map((x) => (x.id === id ? { ...x, data: { ...x.data, nome: t || undefined } } : x)), edges: es };
    });
  };
  const concluirRenomearRef = useRef(concluirRenomear); concluirRenomearRef.current = concluirRenomear;

  const organizar = () => {
    aplicar(({ nodes: ns, edges: es }) => {
      const pos = layoutAutomatico(deRf(ns, es));
      return { nodes: ns.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })), edges: es };
    });
    setTimeout(() => { void fitView({ padding: 0.2, maxZoom: 1, duration: 300 }); }, 0);
  };

  const onNodeContextMenu = useCallback((e: ReactMouseEvent, n: FluxoNode) => {
    e.preventDefault();
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === n.id })));
    setMenu({ tipo: "no", x: e.clientX, y: e.clientY, noId: n.id, gatilho: ehGatilho(n.data.tipo) });
  }, [setNodes]);
  const onPaneContextMenu = useCallback((e: ReactMouseEvent | MouseEvent) => {
    e.preventDefault();
    setMenu({ tipo: "canvas", x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const fechar = () => setMenu(null);
    window.addEventListener("wheel", fechar, { passive: true });
    return () => window.removeEventListener("wheel", fechar);
  }, [menu]);

  const onBeforeDelete: OnBeforeDelete<FluxoNode, FluxoEdge> = useCallback(async ({ nodes: ns, edges: es }) => {
    if (somenteLeitura) return false;
    const gatilhos = new Set(ns.filter((n) => n.data.tipo.startsWith("gatilho.")).map((n) => n.id));
    if (gatilhos.size) {
      toast.info("O gatilho não pode ser excluído.");
      const outros = ns.filter((n) => !gatilhos.has(n.id));
      const arestas = es.filter((e) => e.selected || (!gatilhos.has(e.source) && !gatilhos.has(e.target)));
      if (!outros.length && !arestas.length) return false;
      historico.registrar(instantaneo());
      return { nodes: outros, edges: arestas };
    }
    historico.registrar(instantaneo());
    return true;
  }, [somenteLeitura, historico, instantaneo]);

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
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (!somenteLeitura && !noAberto && !document.querySelector("[role='dialog'][data-state='open'], [role='alertdialog'][data-state='open']")) {
        if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); desfazer(); return; }
        if (mod && ((k === "z" && e.shiftKey) || k === "y")) { e.preventDefault(); refazer(); return; }
        const sel = nodesRef.current.filter((n) => n.selected);
        if (mod && k === "d") { e.preventDefault(); if (sel.length === 1) duplicar(sel[0].id); return; }
        if (e.key === "F2" && sel.length === 1) { e.preventDefault(); setRenomeandoId(sel[0].id); return; }
      }
      if (e.key === "Enter" && !noAberto && enterValeNoCanvas(e.target)) {
        const sel = nodesRef.current.filter((n) => n.selected);
        if (sel.length === 1) { e.preventDefault(); setNoAberto(sel[0].id); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [somenteLeitura, podeSalvar, salvarAgora, noAberto, desfazer, refazer, duplicar]);

  const atualizarNo = (id: string, patch: Partial<FluxoNode["data"]>) => {
    aplicar(({ nodes: ns, edges: es }) => ({ nodes: ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)), edges: es }));
  };

  const voltar = async () => {
    if (!podeSalvar || !auto.temPendencia()) { onNavigate(VOLTAR); return; }
    setVoltando(true);
    const ok = await salvarAgora();
    setVoltando(false);
    if (ok) onNavigate(VOLTAR);
    else setSairSemSalvar(true);
  };

  const gatilhoNo = nodes.find((n) => ehGatilho(n.data.tipo));
  const eventoAmostra = !gatilhoNo ? null : gatilhoNo.data.tipo === "gatilho.manual"
    ? `manual.${(gatilhoNo.data.config.entidade as string) ?? "documento_saida"}`
    : ((gatilhoNo.data.config.evento as string | null) ?? null);
  // Trocar o evento descarta a amostra (ela é de outro evento).
  useEffect(() => { setAmostra(null); }, [eventoAmostra]);

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

        <div className="flex flex-1 min-h-0 gap-3">
        {!somenteLeitura && (
          <NodePalette
            catalogo={catalogo}
            totalNos={nodes.length}
            temGatilho={nodes.some((n) => ehGatilho(n.data.tipo))}
            onAdicionar={adicionarPelaPaleta}
          />
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
          onNodeDragStart={() => historico.registrar(instantaneo())}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onConnectEnd={onConnectEnd}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeContextMenu={onNodeContextMenu}
          onPaneContextMenu={onPaneContextMenu}
          onMoveStart={() => setMenu(null)}
          podeDesfazer={historico.podeDesfazer}
          podeRefazer={historico.podeRefazer}
          onDesfazer={desfazer}
          onRefazer={refazer}
        />
        </div>
      </div>

      {!somenteLeitura && (
        <>
          <NoContextMenu
            menu={menu}
            limiteAtingido={limiteAtingido}
            onFechar={() => setMenu(null)}
            onAbrir={setNoAberto}
            onRenomear={(id) => setTimeout(() => setRenomeandoId(id), 0)}
            onDuplicar={duplicar}
            onDesligarEntradas={desligarEntradas}
            onExcluir={(id) => { void deleteElements({ nodes: [{ id }] }); }}
            onAdicionarAqui={(x, y) => setTimeout(() => setAdicionarEm({ x, y }), 0)}
            onOrganizar={organizar}
            onAjustar={() => { void fitView({ padding: 0.2, maxZoom: 1, duration: 300 }); }}
          />
          <AdicionarNoPopover
            open={!!adicionarEm}
            onOpenChange={(v) => { if (!v) setAdicionarEm(null); }}
            titulo={adicionarEm?.saida ? `Adicionar ao ramo ${({ verdadeiro: "sim", falso: "não" } as Record<string, string>)[adicionarEm.saida] ?? adicionarEm.saida}` : "Adicionar nó"}
            catalogo={catalogo}
            limiteAtingido={limiteAtingido}
            onEscolher={(tipo) => {
              if (!adicionarEm) return;
              const p = screenToFlowPosition({ x: adicionarEm.x, y: adicionarEm.y });
              adicionar(tipo, { pos: { x: alinhar(p.x), y: alinhar(p.y - 32) }, de: adicionarEm.de, saida: adicionarEm.saida });
            }}
          >
            <span aria-hidden className="pointer-events-none fixed h-0 w-0" style={{ left: adicionarEm?.x ?? 0, top: adicionarEm?.y ?? 0 }} />
          </AdicionarNoPopover>
        </>
      )}

      <NodeConfigDialog
        no={noSelecionado}
        nos={nodes}
        catalogo={catalogo}
        destinos={destinos}
        avisos={[...(fluxo.validacao_rascunho?.erros ?? []), ...(fluxo.validacao_rascunho?.avisos ?? [])].filter((a) => !a.no_id || a.no_id === noSelecionado?.id)}
        evento={eventoAmostra}
        tenantId={tenantId}
        empresaId={empresaId}
        fluxoId={fluxoId}
        somenteLeitura={somenteLeitura}
        amostra={amostra}
        onDefinirAmostra={setAmostra}
        onFechar={() => setNoAberto(null)}
        onRenomear={(n) => noSelecionado && atualizarNo(noSelecionado.id, { nome: n || undefined })}
        onAlterar={(cfg, tipo) => noSelecionado && atualizarNo(noSelecionado.id, tipo ? { config: cfg, tipo } : { config: cfg })}
        onAbrirNo={setNoAberto}
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
