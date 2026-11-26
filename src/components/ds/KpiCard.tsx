import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toneDot, toneText, type Tone } from "./tones";

interface KpiCardProps {
  /** O que é medido, em caixa de frase: "Pedidos conferidos hoje". */
  label: string;
  /** Valor já formatado em pt-BR ("1.284", "97,2"). */
  value: string | number;
  unit?: string;
  /** Comparação com o período anterior. `bomQuando` define se subir é bom. */
  delta?: { valor: string; direcao: "subiu" | "caiu" | "igual"; bomQuando?: "subir" | "cair" };
  /** Linha de contexto: meta, período, base de cálculo. */
  context?: React.ReactNode;
  /**
   * Só informe quando o número está FORA do esperado (warning/danger) ou quando
   * cumprir a meta é a notícia (success). Sem tom = número neutro, que é o normal.
   */
  tone?: Exclude<Tone, "info" | "neutral">;
  onClick?: () => void;
  className?: string;
}

/**
 * Cartão de indicador do design system. Sem ícone decorativo, sem barra de
 * progresso fictícia, sem cor quando está tudo bem: o número é o protagonista.
 */
export function KpiCard({ label, value, unit, delta, context, tone, onClick, className }: KpiCardProps) {
  const Comp = onClick ? "button" : "div";
  const bom =
    delta && delta.direcao !== "igual"
      ? (delta.bomQuando ?? "subir") === (delta.direcao === "subiu" ? "subir" : "cair")
      : null;
  const DeltaIcon = delta?.direcao === "subiu" ? ArrowUpRight : delta?.direcao === "caiu" ? ArrowDownRight : Minus;

  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border border-border bg-card p-4 text-left",
        onClick && "transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {tone && <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", toneDot[tone])} />}
        <p className="truncate text-body-sm text-muted-foreground">{label}</p>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("text-metric tabular-nums", tone ? toneText[tone] : "text-foreground")}>{value}</span>
        {unit && <span className="text-body-sm text-muted-foreground">{unit}</span>}
      </div>
      {(delta || context) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium tabular-nums",
                bom === null ? "text-muted-foreground" : bom ? "text-success" : "text-danger",
              )}
            >
              <DeltaIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {delta.valor}
            </span>
          )}
          {context && <span className="truncate">{context}</span>}
        </div>
      )}
    </Comp>
  );
}
