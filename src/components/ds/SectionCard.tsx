import { cn } from "@/lib/utils";

interface SectionCardProps {
  title?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Conteúdo encosta nas bordas (tabelas). Padrão: com respiro de 16px. */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Bloco de conteúdo da página: borda, fundo de cartão, sem sombra.
 * Sombra é só para o que flutua (menu, popover, diálogo).
 */
export function SectionCard({ title, description, actions, flush, className, children }: SectionCardProps) {
  return (
    <section className={cn("rounded-lg border border-border bg-card", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="truncate text-heading-sm text-foreground">{title}</h2>}
            {description && <p className="mt-0.5 text-body-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && "p-4")}>{children}</div>
    </section>
  );
}
