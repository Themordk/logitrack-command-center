import { Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  operadores: string[];
}

/**
 * Renderiza nome do(s) operador(es) com tarefas pendentes do movimento.
 * - 0 → linha com texto "Não atribuída" cinza.
 * - 1 → ícone + nome.
 * - >1 → primeiro nome + "+N", tooltip lista todos.
 */
export function OperadoresAtribuidos({ operadores }: Props) {
  if (!operadores || operadores.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground/70 italic mt-0.5 flex items-center gap-1">
        <Users size={11} className="opacity-50" />
        Não atribuída
      </p>
    );
  }

  if (operadores.length === 1) {
    return (
      <p className="text-[11px] text-foreground/80 mt-0.5 flex items-center gap-1 truncate">
        <Users size={11} className="text-primary shrink-0" />
        <span className="truncate">{operadores[0]}</span>
      </p>
    );
  }

  const restantes = operadores.length - 1;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="text-[11px] text-foreground/80 mt-0.5 flex items-center gap-1 truncate cursor-help">
            <Users size={11} className="text-primary shrink-0" />
            <span className="truncate">{operadores[0]}</span>
            <span className="text-[10px] px-1 rounded bg-primary/15 text-primary">+{restantes}</span>
          </p>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <ul className="text-xs space-y-0.5">
            {operadores.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
