import { cn } from "@/lib/utils";
import { toneDot, toneSubtle, type Tone } from "./tones";

interface StatusPillProps {
  tone: Tone;
  /** Rótulo em caixa de frase: "Em conferência", não "EM CONFERÊNCIA" nem "Em Conferência". */
  children: React.ReactNode;
  /** Ponto colorido antes do rótulo (padrão: sim). */
  dot?: boolean;
  className?: string;
  title?: string;
}

/**
 * Selo de status do design system. Toda tela mostra status com ele (ou com um
 * componente de domínio que o use por dentro), nunca com classes de cor soltas.
 */
export function StatusPill({ tone, children, dot = true, className, title }: StatusPillProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-caption font-medium",
        toneSubtle[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", toneDot[tone])} />}
      {children}
    </span>
  );
}
