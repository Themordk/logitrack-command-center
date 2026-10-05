import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { GRUPO_NO_UI, TIPO_NO_UI } from "../retornosUi";
import { useEditorContext } from "./editorContext";
import { nomeTipo, resumoNo } from "./resumoNo";
import type { FluxoNode } from "./definicaoRf";

const ROTULO_SAIDA: Record<string, string> = { verdadeiro: "sim", falso: "não", sucesso: "sucesso", erro: "erro" };
const COR_HANDLE: Record<string, string> = {
  verdadeiro: "!border-emerald-400", sucesso: "!border-emerald-400",
  falso: "!border-rose-400", erro: "!border-rose-400",
};
const COR_ROTULO: Record<string, string> = {
  verdadeiro: "text-emerald-400", sucesso: "text-emerald-400", falso: "text-rose-400", erro: "text-rose-400",
};

function FlowNodeBase({ id, data, selected }: NodeProps<FluxoNode>) {
  const { catalogo, destinos, errosPorNo, avisosPorNo, desconectados } = useEditorContext();
  const ui = TIPO_NO_UI[data.tipo];
  const grupo = GRUPO_NO_UI[ui?.grupo ?? "acao"];
  const Icone = ui?.icone ?? AlertTriangle;
  const ehGatilho = data.tipo.startsWith("gatilho.");
  const saidas = catalogo?.nos.find((n) => n.tipo === data.tipo)?.saidas ?? (ehGatilho ? ["principal"] : ["principal"]);
  const erros = errosPorNo.get(id) ?? [];
  const avisos = avisosPorNo.get(id) ?? [];
  const tipoNome = nomeTipo(data.tipo, catalogo);
  const nome = data.nome || tipoNome;
  const resumo = resumoNo(data.tipo, data.config, catalogo, destinos);
  const mensagens = erros.length ? erros : avisos;

  return (
    <div className={cn("flex w-40 flex-col items-center gap-1.5", desconectados.has(id) && "opacity-60")}>
      <div
        aria-label={`${nome}, ${tipoNome}`}
        className={cn(
          "relative flex h-16 w-16 items-center justify-center bg-card border-2",
          ehGatilho ? "rounded-l-full rounded-r-xl" : "rounded-xl",
          erros.length ? "border-rose-500" : grupo.borda,
          selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        )}
      >
        <Icone size={26} className={grupo.icone} aria-hidden />
        {!ehGatilho && (
          <Handle type="target" id="entrada" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !bg-card !border-muted-foreground" />
        )}
        {saidas.map((s, i) => {
          const top = saidas.length === 2 ? (i === 0 ? "32%" : "68%") : "50%";
          return (
            <div key={s}>
              <Handle
                type="source" id={s} position={Position.Right} style={{ top }}
                className={cn("!h-2.5 !w-2.5 !border-2 !bg-card", COR_HANDLE[s] ?? "!border-muted-foreground")}
              />
              {saidas.length > 1 && (
                <span
                  className={cn("pointer-events-none absolute left-full ml-2 -translate-y-1/2 text-[10px]", COR_ROTULO[s] ?? "text-muted-foreground")}
                  style={{ top }}
                >
                  {ROTULO_SAIDA[s] ?? s}
                </span>
              )}
            </div>
          );
        })}
        {mensagens.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={erros.length ? `${erros.length} problemas neste nó` : `${avisos.length} avisos neste nó`}
                className={cn(
                  "nodrag absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  erros.length ? "border-rose-500/60 text-rose-400" : "border-amber-500/60 text-amber-400",
                )}
              >
                <AlertTriangle size={11} aria-hidden />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              <ul className="space-y-1">{mensagens.map((m, i) => <li key={i}>{m.mensagem}</li>)}</ul>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex w-full max-w-[160px] flex-col items-center text-center">
        <span className="w-full truncate text-xs font-semibold text-foreground">{nome}</span>
        <span className="w-full truncate text-[11px] text-muted-foreground">{resumo}</span>
      </div>
    </div>
  );
}

export const FlowNode = memo(FlowNodeBase);
