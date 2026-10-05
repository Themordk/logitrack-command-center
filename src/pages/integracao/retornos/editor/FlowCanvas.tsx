import type { DragEvent, MouseEvent as ReactMouseEvent } from "react";
import {
  Background, BackgroundVariant, ConnectionLineType, Controls, MiniMap, Panel, ReactFlow, getBezierPath,
  type ConnectionLineComponentProps, type IsValidConnection, type OnBeforeDelete, type OnConnect, type OnConnectEnd,
  type OnEdgesChange, type OnNodesChange,
} from "@xyflow/react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { corSaida } from "./definicaoRf";
import "@xyflow/react/dist/style.css";
import { TIPO_NO_UI } from "../retornosUi";
import type { GrupoNo, Validacao } from "../retornos.types";
import type { FluxoEdge, FluxoNode } from "./definicaoRf";
import { FlowEdge } from "./FlowEdge";
import { FlowNode } from "./FlowNode";
import { ValidacaoBadge } from "./ValidacaoBadge";

function LinhaConexao({ fromX, fromY, toX, toY, fromPosition, toPosition, fromHandle }: ConnectionLineComponentProps<FluxoNode>) {
  const [path] = getBezierPath({ sourceX: fromX, sourceY: fromY, targetX: toX, targetY: toY, sourcePosition: fromPosition, targetPosition: toPosition });
  return <path d={path} fill="none" stroke={corSaida(fromHandle?.id)} strokeWidth={1.5} />;
}

const mac = typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
const MOD = mac ? "⌘" : "Ctrl+";

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
  onNodeDragStart: () => void;
  onConnect: OnConnect;
  isValidConnection: IsValidConnection<FluxoEdge>;
  onConnectEnd: OnConnectEnd<FluxoNode>;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onNodeContextMenu: (e: ReactMouseEvent, n: FluxoNode) => void;
  onPaneContextMenu: (e: ReactMouseEvent | MouseEvent) => void;
  onMoveStart: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  onDesfazer: () => void;
  onRefazer: () => void;
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
        onNodeDragStart={p.editavel ? p.onNodeDragStart : undefined}
        onConnect={p.editavel ? p.onConnect : undefined}
        isValidConnection={p.isValidConnection}
        onConnectEnd={p.editavel ? p.onConnectEnd : undefined}
        onDragOver={p.editavel ? p.onDragOver : undefined}
        onDrop={p.editavel ? p.onDrop : undefined}
        onNodeContextMenu={p.editavel ? p.onNodeContextMenu : undefined}
        onPaneContextMenu={p.editavel ? p.onPaneContextMenu : undefined}
        onMoveStart={p.onMoveStart}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineComponent={LinhaConexao}
        onBeforeDelete={p.onBeforeDelete}
        onDelete={p.onDelete}
        onNodeDoubleClick={(_, n) => p.onAbrirNo(n.id)}
        nodesDraggable={p.editavel}
        nodesConnectable={p.editavel}
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
        {p.editavel && (
          <Panel position="top-left" className="flex gap-1 rounded-lg border border-border bg-card/90 p-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Desfazer" disabled={!p.podeDesfazer} onClick={p.onDesfazer}><Undo2 size={14} /></Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Desfazer ({MOD}Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Refazer" disabled={!p.podeRefazer} onClick={p.onRefazer}><Redo2 size={14} /></Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Refazer ({mac ? "⌘⇧Z" : "Ctrl+Shift+Z"})</TooltipContent>
            </Tooltip>
          </Panel>
        )}
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
