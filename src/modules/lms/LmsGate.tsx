import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { useLmsAcesso, type LmsAcao, type LmsArea } from "./lmsAcesso";

interface Props {
  area: LmsArea;
  acao?: LmsAcao;
  children: ReactNode;
  onNavigate?: (path: string) => void;
  /** Para onde o botão leva quando não há acesso (ex.: "/coletor/home" no coletor). */
  voltarPara?: string;
}

/** Envolve rotas e trechos do módulo LMS. A trava real é no banco (fn_lms_acesso). */
export function LmsGate({ area, acao = "READ", children, onNavigate, voltarPara }: Props) {
  const { pode, carregando, rotaInicial } = useLmsAcesso();
  if (carregando) return null;
  if (pode(area, acao)) return <>{children}</>;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center animate-fade-in" data-testid="lms-sem-acesso">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
        <Lock size={24} className="text-destructive" />
      </div>
      <h2 className="text-lg font-semibold text-foreground mb-2">Acesso restrito</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Seu perfil não tem acesso a esta área do módulo de Produtividade (LMS). Fale com o administrador do sistema.
      </p>
      {onNavigate && (
        <button
          onClick={() => onNavigate(voltarPara ?? rotaInicial ?? "/")}
          className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {voltarPara ? "Voltar" : rotaInicial ? "Ir para o que posso ver" : "Voltar ao Dashboard"}
        </button>
      )}
    </div>
  );
}
