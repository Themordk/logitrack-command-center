import { useCallback, useEffect, useMemo } from "react";
import { Background, BackgroundVariant, ReactFlow, applyNodeChanges, useNodesState, type NodeChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Catalogo, ExecucaoDetalhe } from "../retornos.types";
import { paraRf, type FluxoEdge, type FluxoNode } from "../editor/definicaoRf";
import { FlowNode } from "../editor/FlowNode";
import { FlowEdge } from "../editor/FlowEdge";
import { EditorContext, type EditorContextValor } from "../editor/editorContext";
import { montarExecucaoVisual } from "../editor/execucaoVisual";

const nodeTypes = { fluxo: FlowNode };
const edgeTypes = { fluxo: FlowEdge };

interface Props { detalhe: ExecucaoDetalhe; catalogo?: Catalogo; onAbrirPasso: (noId: string) => void }

/** Desenho do fluxo da execução, somente leitura, com o caminho percorrido destacado. */
export function CaminhoCanvas({ detalhe, catalogo, onAbrirPasso }: Props) {
  const rf = useMemo(() => paraRf(detalhe.definicao, catalogo), [detalhe.definicao, catalogo]);
  const execucao = useMemo(() => montarExecucaoVisual(detalhe), [detalhe]);
  const [nodes, setNodes] = useNodesState<FluxoNode>(rf.nodes);
  useEffect(() => { setNodes(rf.nodes); }, [rf, setNodes]);
  const onNodesChange = useCallback((changes: NodeChange<FluxoNode>[]) => {
    const ok = changes.filter((c) => c.type === "dimensions" || c.type === "select");
    if (ok.length) setNodes((n) => applyNodeChanges(ok, n));
  }, [setNodes]);

  const ctx = useMemo<EditorContextValor>(() => ({
    catalogo, errosPorNo: new Map(), avisosPorNo: new Map(), desconectados: new Set(), editavel: false,
    saidasOcupadas: new Set(), limiteAtingido: false, renomeandoId: null, execucao, onAbrirPasso,
  }), [catalogo, execucao, onAbrirPasso]);

  return (
    <EditorContext.Provider value={ctx}>
      <div className="h-[280px] rounded-lg border border-border overflow-hidden retorno-canvas">
        <ReactFlow<FluxoNode, FluxoEdge>
          colorMode="dark"
          nodes={nodes}
          edges={rf.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.2}
          onNodeClick={(_, n) => onAbrirPasso(n.id)}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>
      </div>
    </EditorContext.Provider>
  );
}
