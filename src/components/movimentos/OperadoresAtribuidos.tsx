import { Users } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  operadores: string[];
}

/** Quantos nomes aparecem direto no card; o restante fica no tooltip. */
export const NOMES_VISIVEIS = 2;

/**
 * Operadores que participaram do movimento (com tarefa agora ou que já executaram).
 * - 0 → "Não atribuída" cinza.
 * - até 2 → nomes separados por vírgula.
 * - mais de 2 → 2 primeiros + "+N"; passando o mouse, o tooltip lista todos.
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

  const visiveis = operadores.slice(0, NOMES_VISIVEIS).join(", ");
  const restantes = operadores.length - NOMES_VISIVEIS;
  const linha = (
    <p
      className={`text-[11px] text-foreground/80 mt-0.5 flex items-center gap-1 min-w-0${restantes > 0 ? " cursor-help" : ""}`}
      aria-label={`Operadores: ${operadores.join(", ")}`}
    >
      <Users size={11} className="text-primary shrink-0" />
      <span className="truncate">{visiveis}</span>
      {restantes > 0 && (
        <span className="text-[10px] px-1 rounded bg-primary/15 text-primary shrink-0">+{restantes}</span>
      )}
    </p>
  );

  if (restantes <= 0) {
    return <div title={operadores.join(", ")}>{linha}</div>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{linha}</TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-[11px] text-muted-foreground mb-1">Participantes ({operadores.length})</p>
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
