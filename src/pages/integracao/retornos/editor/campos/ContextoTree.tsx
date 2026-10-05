import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MIME_CAMINHO, MIME_LISTA } from "./painelContext";

function tipoDe(v: unknown): string {
  if (v === null) return "nulo";
  if (Array.isArray(v)) return `lista (${v.length})`;
  if (typeof v === "object") return "objeto";
  if (typeof v === "number") return "número";
  if (typeof v === "boolean") return "sim/não";
  return "texto";
}

function valorCurto(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v === "" ? '""' : `"${v}"`;
  return String(v);
}

function Ramo({ chave, valor, caminho, nivel, abertoInicial }: { chave: string; valor: unknown; caminho: string; nivel: number; abertoInicial: boolean }) {
  const [aberto, setAberto] = useState(abertoInicial);
  const composto = valor !== null && typeof valor === "object";
  const pad = { paddingLeft: nivel * 12 };

  if (!composto) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(MIME_CAMINHO, caminho); e.dataTransfer.setData("text/plain", caminho); }}
            onClick={() => { void navigator.clipboard?.writeText(caminho); toast.info(`Caminho copiado: ${caminho}`); }}
            className="flex w-full items-baseline gap-1.5 rounded px-1 py-0.5 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-grab"
            style={pad}
          >
            <span className="text-foreground">{chave}</span>
            <span className="text-[10px] text-muted-foreground">{tipoDe(valor)}</span>
            <span className="truncate text-sky-400">{valorCurto(valor)}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" className="font-mono text-xs">{caminho}</TooltipContent>
      </Tooltip>
    );
  }

  const entradas = Array.isArray(valor) ? valor.map((v, i) => [String(i), v] as const) : Object.entries(valor as Record<string, unknown>);
  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        draggable={Array.isArray(valor)}
        onDragStart={(e) => {
          if (!Array.isArray(valor)) return;
          e.dataTransfer.setData(MIME_CAMINHO, caminho); e.dataTransfer.setData(MIME_LISTA, "1"); e.dataTransfer.setData("text/plain", caminho);
        }}
        className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        style={pad}
      >
        {aberto ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        <span className="text-foreground">{chave}</span>
        <span className="text-[10px] text-muted-foreground">{tipoDe(valor)}</span>
      </button>
      {aberto && entradas.map(([k, v], i) => (
        <Ramo
          key={k}
          chave={k}
          valor={v}
          caminho={caminho ? `${caminho}.${k}` : k}
          nivel={nivel + 1}
          abertoInicial={Array.isArray(valor) ? i === 0 : false}
        />
      ))}
    </div>
  );
}

export function ContextoTree({ contexto }: { contexto: Record<string, unknown> }) {
  return (
    <div className="font-mono text-xs" role="tree" aria-label="Contexto do documento de amostra">
      {Object.entries(contexto).map(([k, v]) => <Ramo key={k} chave={k} valor={v} caminho={k} nivel={0} abertoInicial={false} />)}
    </div>
  );
}
