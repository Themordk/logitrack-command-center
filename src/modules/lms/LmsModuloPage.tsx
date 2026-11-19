import { Gauge, Target, SlidersHorizontal, Activity, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/contexts/PermissionsContext";
import { LmsGate } from "./LmsGate";
import { LMS_ROTAS, useLmsAcesso, type LmsArea } from "./lmsAcesso";
import { LmsConfiguracaoPage } from "./configuracao/LmsConfiguracaoPage";
import { LmsMetasPage } from "./metas/LmsMetasPage";

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

const CONTEUDO: Record<AreaWeb, { titulo: string; resumo: string; itens: string[] }> = {
  acompanhamento: {
    titulo: "Acompanhamento das metas",
    resumo: "Onde supervisores e gerentes vão ver se a operação está batendo as metas e quem precisa de apoio.",
    itens: [
      "Painel do turno com projeção até o fim do turno",
      "Atingimento de metas por período, armazém, turno e equipe",
      "Ficha do operador e fila de acompanhamento (coaching)",
      "Fechamento do período",
    ],
  },
  metas: {
    titulo: "Cadastro de metas",
    resumo: "Metas por armazém, turno, equipe ou operador, com métrica, período e vigência.",
    itens: [
      "Metas de performance, eficiência, utilização, UPH, volume e qualidade",
      "Meta mais baixa nas primeiras semanas para novatos",
      "Cadastro em lote, modelos e cópia do período anterior",
      "Aprovação pelo gerente",
    ],
  },
  configuracao: {
    titulo: "Regras de tempos e movimentos",
    resumo: "Um painel único com as regras do LMS, em cascata da empresa para os armazéns e tipos de tarefa.",
    itens: [
      "Tempo padrão por tipo de tarefa (fixo + por unidade + tolerâncias)",
      "Faixas de classificação, tempo de trânsito, ociosidade e qualidade do dado",
      "Vigência das regras: mudar hoje não altera o passado",
      "Sugestão de tempo padrão a partir das execuções reais",
    ],
  },
};

export function LmsModuloPage({ area, onNavigate }: Props) {
  const { rotasVisiveis } = useLmsAcesso();
  const { can } = usePermissions();
  const conteudo = CONTEUDO[area];
  const podeRelatorio = can("web.relatorios.produtividade", "READ");

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
        {area === "configuracao" ? <LmsConfiguracaoPage /> : area === "metas" ? <LmsMetasPage /> : (
        <section className="rounded-lg border border-border bg-card p-5 space-y-4" data-testid={`lms-area-${area}`}>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{conteudo.titulo}</h2>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Em construção</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{conteudo.resumo}</p>
          </div>
          <ul className="space-y-1.5">
            {conteudo.itens.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </li>
            ))}
          </ul>
          {area === "acompanhamento" && podeRelatorio && (
            <button
              type="button"
              onClick={() => onNavigate("/relatorios/produtividade")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Enquanto isso, abrir o relatório Produtividade Operacional <ArrowRight size={14} />
            </button>
          )}
        </section>
        )}
      </LmsGate>
    </div>
  );
}
