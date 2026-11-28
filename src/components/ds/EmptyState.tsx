import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  /** O que aconteceu, direto: "Nenhuma onda liberada". */
  title: string;
  /** O que vai aparecer aqui ou por que está vazio: "As ondas aparecem quando o gestor libera a separação." */
  description?: string;
  /** Próximo passo possível (um botão), se houver. */
  action?: React.ReactNode;
  /** Ícone discreto opcional (cinza, 20px). Sem ilustração, sem emoji. */
  icon?: LucideIcon;
  className?: string;
}

/** Estado vazio padrão de listas, tabelas e painéis. */
export function EmptyState({ title, description, action, icon: Icon, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {Icon && <Icon className="mb-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />}
      <p className="text-body font-medium text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-sm text-body-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
