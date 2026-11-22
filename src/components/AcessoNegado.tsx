import { ShieldOff } from "lucide-react";

interface AcessoNegadoProps {
  onNavigate: (path: string) => void;
  /** Primeira tela liberada do menu; sem ela, o botão não aparece. */
  destino?: string;
}

/** Tela mostrada quando o perfil não tem Visualizar no módulo da rota (link direto ou favorito). */
export function AcessoNegado({ onNavigate, destino }: AcessoNegadoProps) {
  return (
    <div className="flex flex-1 items-center justify-center py-16 animate-fade-in">
      <div className="card-surface max-w-md w-full p-8 flex flex-col items-center text-center gap-3">
        <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
          <ShieldOff size={22} className="text-muted-foreground" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Você não tem acesso a esta tela</h1>
        <p className="text-sm text-muted-foreground">
          O seu perfil de acesso não libera esta tela, ou o menu dela foi ocultado. Se precisar dela, peça ao
          administrador para ajustar o seu perfil em Configurações › Perfis de Acesso.
        </p>
        {destino && (
          <button
            onClick={() => onNavigate(destino)}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            {destino === "/" ? "Ir para o Dashboard" : "Ir para uma tela liberada"}
          </button>
        )}
      </div>
    </div>
  );
}
