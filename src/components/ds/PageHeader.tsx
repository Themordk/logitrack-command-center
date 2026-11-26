import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Nome da tela, curto e sem ícone: "Ondas de carregamento". */
  title: string;
  /** Uma linha de contexto útil (filtro ativo, armazém, atualização). Opcional. */
  description?: React.ReactNode;
  /** Ações da tela, à direita. No máximo UMA com variante primária. */
  actions?: React.ReactNode;
  /** Selos ou metadados ao lado do título (ex.: StatusPill). */
  meta?: React.ReactNode;
  className?: string;
}

/**
 * Cabeçalho padrão de toda tela web: título, contexto e ações.
 * Substitui os <h1> soltos (havia 8 estilos diferentes em 26/11/2026).
 */
export function PageHeader({ title, description, actions, meta, className }: PageHeaderProps) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="truncate text-heading text-foreground">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 text-body-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
