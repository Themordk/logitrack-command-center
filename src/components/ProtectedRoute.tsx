import { ReactNode } from "react";
import { usePermissions } from "@/contexts/PermissionsContext";

interface ProtectedRouteProps {
  modulo: string;
  acao?: string;
  children: ReactNode;
  onNavigate?: (path: string) => void;
}

export function ProtectedRoute({ modulo, acao = "READ", children, onNavigate }: ProtectedRouteProps) {
  const { can, loading } = usePermissions();

  if (loading) return null;

  if (!can(modulo, acao)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">🔒</span>
        </div>
        <h2 className="text-lg font-semibold text-foreground mb-2">Acesso Restrito</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          Você não tem permissão para acessar esta funcionalidade. Contate o administrador do sistema.
        </p>
        {onNavigate && (
          <button
            onClick={() => onNavigate("/")}
            className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Voltar ao Dashboard
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
