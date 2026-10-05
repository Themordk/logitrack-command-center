import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow,
  type OnBeforeDelete, type OnEdgesChange, type OnNodesChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { TIPO_NO_UI } from "../retornosUi";
import type { GrupoNo, Validacao } from "../retornos.types";
import type { FluxoEdge, FluxoNode } from "./definicaoRf";
import { FlowEdge } from "./FlowEdge";
import { FlowNode } from "./FlowNode";
import { ValidacaoBadge } from "./ValidacaoBadge";

const nodeTypes = { fluxo: FlowNode };
const edgeTypes = { fluxo: FlowEdge };

const COR_GRUPO_MINIMAPA: Record<GrupoNo, string> = {
  gatilho: "hsl(var(--primary))",
  logica: "rgb(245 158 11)",
  dados: "rgb(139 92 246)",
  acao: "rgb(16 185 129)",
};

interface Props {
  nodes: FluxoNode[];
  edges: FluxoEdge[];
  editavel: boolean;
  validacao: Validacao | null | undefined;
  onNodesChange: OnNodesChange<FluxoNode>;
  onEdgesChange: OnEdgesChange<FluxoEdge>;
  onNodeDragStop: () => void;
  onBeforeDelete: OnBeforeDelete<FluxoNode, FluxoEdge>;
  onDelete: (p: { nodes: FluxoNode[]; edges: FluxoEdge[] }) => void;
  onAbrirNo: (id: string) => void;
  onSelecionarNo: (id: string) => void;
}

export function FlowCanvas(p: Props) {
  return (
    <div className="relative flex-1 min-h-[520px] rounded-xl border border-border overflow-hidden retorno-canvas">
      <ReactFlow<FluxoNode, FluxoEdge>
        className="h-full w-full"
        colorMode="dark"
        nodes={p.nodes}
        edges={p.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={p.onNodesChange}
        onEdgesChange={p.onEdgesChange}
        onNodeDragStop={p.editavel ? p.onNodeDragStop : undefined}
        onBeforeDelete={p.onBeforeDelete}
        onDelete={p.onDelete}
        onNodeDoubleClick={(_, n) => p.onAbrirNo(n.id)}
        nodesDraggable={p.editavel}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={p.editavel ? ["Delete", "Backspace"] : null}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.75}
        panOnDrag
        selectionKeyCode="Shift"
        zoomOnDoubleClick={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
        <Controls showInteractive={false} position="bottom-left" />
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={(n) => COR_GRUPO_MINIMAPA[TIPO_NO_UI[(n as FluxoNode).data.tipo]?.grupo ?? "acao"]}
        />
        <Panel position="top-center">
          <ValidacaoBadge
            validacao={p.validacao}
            totalNos={p.nodes.length}
            nomeDoNo={(id) => { const n = p.nodes.find((x) => x.id === id); return n ? n.data.nome || n.data.tipo : undefined; }}
            onSelecionarNo={p.onSelecionarNo}
          />
        </Panel>
      </ReactFlow>
    </div>
  );
}
