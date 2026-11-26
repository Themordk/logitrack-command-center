import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PageSectionProps {
  /** Nome da seção, curto e em caixa de frase: "Nível de serviço". */
  title: string;
  /** Uma linha opcional dizendo o que a seção responde. */
  description?: React.ReactNode;
  /** Informação curta à direita do título (ex.: "8 avaliados"). */
  meta?: React.ReactNode;
  /** Permite recolher a seção (padrão: sim). */
  collapsible?: boolean;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Agrupa cartões de uma mesma pergunta dentro de uma página (dashboards, painéis).
 * Sem ícone e sem cor no título: a hierarquia vem do tamanho e do espaço.
 */
export function PageSection({
  title,
  description,
  meta,
  collapsible = true,
  defaultOpen = true,
  className,
  children,
}: PageSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const cabecalho = (
    <div className="flex min-w-0 items-baseline gap-3">
      <h2 className="truncate text-heading-sm text-foreground">{title}</h2>
      {meta && <span className="shrink-0 text-caption text-muted-foreground">{meta}</span>}
    </div>
  );

  if (!collapsible) {
    return (
      <section className={cn("space-y-3", className)}>
        <div>
          {cabecalho}
          {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
      </section>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section className={cn("space-y-3", className)}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {cabecalho}
            {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
          </div>
          <CollapsibleTrigger
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-caption text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={open ? `Recolher ${title}` : `Mostrar ${title}`}
          >
            {open ? "Recolher" : "Mostrar"}
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden="true" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="space-y-3">{children}</CollapsibleContent>
      </section>
    </Collapsible>
  );
}
