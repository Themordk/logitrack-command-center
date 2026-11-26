import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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
  /** Ajuda ao lado do rótulo (ex.: <TermoAjuda/> do glossário). */
  help?: React.ReactNode;
  /** Explicação curta mostrada ao passar o mouse (como o número é calculado). */
  hint?: string;
  /** Primeira carga: mostra o esqueleto no lugar do número. */
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * Cartão de indicador do design system. Sem ícone decorativo, sem barra de
 * progresso fictícia, sem cor quando está tudo bem: o número é o protagonista.
 */
export function KpiCard({ label, value, unit, delta, context, tone, help, hint, loading, onClick, className }: KpiCardProps) {
  // Com ajuda (que já é um botão), o cartão vira um div clicável: botão dentro de botão é HTML inválido.
  const comoBotaoNativo = !!onClick && !help;
  const Comp = comoBotaoNativo ? "button" : "div";
  const aoTeclar = (e: React.KeyboardEvent) => {
    if (!onClick || comoBotaoNativo || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };
  const bom =
    delta && delta.direcao !== "igual"
      ? (delta.bomQuando ?? "subir") === (delta.direcao === "subiu" ? "subir" : "cair")
      : null;
  const DeltaIcon = delta?.direcao === "subiu" ? ArrowUpRight : delta?.direcao === "caiu" ? ArrowDownRight : Minus;

  return (
    <Comp
      type={comoBotaoNativo ? "button" : undefined}
      role={onClick && !comoBotaoNativo ? "button" : undefined}
      tabIndex={onClick && !comoBotaoNativo ? 0 : undefined}
      onKeyDown={aoTeclar}
      onClick={onClick}
      title={hint}
      className={cn(
        "w-full rounded-lg border border-border bg-card p-4 text-left",
        onClick && "cursor-pointer transition-colors hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        {tone && !loading && <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneDot[tone])} />}
        <p className="truncate text-body-sm text-muted-foreground">{label}</p>
        {help && <span className="shrink-0">{help}</span>}
      </div>
      {loading ? (
        <div className="mt-2 space-y-2" aria-busy="true">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ) : (
        <>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className={cn("text-metric tabular-nums", tone ? toneText[tone] : "text-foreground")}>{value}</span>
            {unit && value !== "—" && <span className="text-body-sm text-muted-foreground">{unit}</span>}
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
              {context && <span className="min-w-0">{context}</span>}
            </div>
          )}
        </>
      )}
    </Comp>
  );
}
