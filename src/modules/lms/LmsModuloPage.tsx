import { Gauge, Target, SlidersHorizontal, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { LmsGate } from "./LmsGate";
import { LMS_ROTAS, useLmsAcesso, type LmsArea } from "./lmsAcesso";
import { LmsConfiguracaoPage } from "./configuracao/LmsConfiguracaoPage";
import { LmsMetasPage } from "./metas/LmsMetasPage";
import { LmsAcompanhamentoPage } from "./acompanhamento/LmsAcompanhamentoPage";

type AreaWeb = Exclude<LmsArea, "coletor" | "atividades">;

interface Props {
  area: AreaWeb;
  onNavigate: (path: string) => void;
}

const ICONE: Record<AreaWeb, JSX.Element> = {
  acompanhamento: <Gauge size={16} />,
  metas: <Target size={16} />,
  configuracao: <SlidersHorizontal size={16} />,
};

export function LmsModuloPage({ area, onNavigate }: Props) {
  const { rotasVisiveis } = useLmsAcesso();

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
          <Activity size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">Produtividade (LMS)</h1>
          <p className="text-xs text-muted-foreground">Configuração, metas e acompanhamento da produtividade da operação</p>
        </div>
      </div>

      <nav className="flex gap-1 border-b border-border" aria-label="Áreas do módulo LMS">
        {LMS_ROTAS.filter((r) => rotasVisiveis.some((v) => v.path === r.path)).map((r) => (
          <button
            key={r.path}
            type="button"
            onClick={() => onNavigate(r.path)}
            aria-current={r.area === area ? "page" : undefined}
            className={cn(
              "flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              r.area === area
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {ICONE[r.area]}
            {r.label}
          </button>
        ))}
      </nav>

      <LmsGate area={area} onNavigate={onNavigate}>
        {area === "configuracao" ? <LmsConfiguracaoPage onNavigate={onNavigate} />
          : area === "metas" ? <LmsMetasPage />
          : <LmsAcompanhamentoPage onNavigate={onNavigate} />}
      </LmsGate>
    </div>
  );
}
