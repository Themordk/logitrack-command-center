import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { X } from "lucide-react";
import { corSaida, type FluxoEdge as FluxoEdgeT } from "./definicaoRf";
import { useEditorContext } from "./editorContext";

function FlowEdgeBase(props: EdgeProps<FluxoEdgeT>) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected, markerEnd, sourceHandleId, source, target } = props;
  const { editavel, execucao } = useEditorContext();
  const { deleteElements } = useReactFlow();
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const percorrida = execucao?.arestas.has(`${source}:${sourceHandleId ?? "principal"}->${target}`) ?? false;
  const cor = percorrida ? "hsl(var(--primary))" : selected ? "hsl(var(--primary))" : corSaida(sourceHandleId);
  const estilo = execucao
    ? { stroke: cor, strokeWidth: percorrida ? 3 : 1.25, opacity: percorrida ? 1 : 0.25 }
    : { stroke: cor, strokeWidth: selected ? 2 : 1.5 };
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={estilo} />
      {selected && editavel && (
        <EdgeLabelRenderer>
          <button
            type="button"
            aria-label="Remover ligação"
            onClick={() => deleteElements({ edges: [{ id }] })}
            className="nodrag nopan absolute flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, pointerEvents: "all" }}
          >
            <X size={12} aria-hidden />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const FlowEdge = memo(FlowEdgeBase);
