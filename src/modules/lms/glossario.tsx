import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Fase 10.20 (P10): glossário único do LMS. Toda tela que mostra um destes termos
 * usa o mesmo nome e a mesma explicação, pelo <TermoAjuda termo="..."/> ou por
 * definicaoTermo(). Mudou a regra no banco? Mude o texto aqui, num lugar só.
 */
export const GLOSSARIO = {
  tempo_direto: {
    nome: "Tempo direto",
    texto: "Tempo em que o operador esteve executando tarefas, do início ao fim de cada uma, sem pausas e sem contar duas vezes tarefas feitas ao mesmo tempo.",
  },
  tempo_indireto: {
    nome: "Tempo indireto",
    texto: "Tempo em atividades que não são tarefas do sistema (reunião, limpeza, ajuda a um colega) apontadas no coletor, mais as interrupções de tarefa.",
  },
  tempo_disponivel: {
    nome: "Tempo disponível",
    texto: "Tempo em que o operador estava à disposição: sessão aberta no coletor (sem sessão, o turno), descontado o intervalo do turno.",
  },
  tempo_ocioso: {
    nome: "Tempo ocioso",
    texto: "Parte do tempo disponível que não foi direto nem indireto.",
  },
  tempo_padrao: {
    nome: "Tempo padrão",
    texto: "Quanto uma tarefa deve levar para um operador treinado, em ritmo normal: tempo por tarefa + tempo por unidade, mais a tolerância.",
  },
  pfd: {
    nome: "Tolerância (PFD)",
    texto: "Percentual somado ao tempo padrão para necessidades pessoais, fadiga e pequenas esperas. Costuma ficar entre 10% e 15%.",
  },
  horas_padrao: {
    nome: "Horas-padrão",
    texto: "Soma do tempo padrão das tarefas concluídas: quanto o trabalho feito deveria ter levado.",
  },
  performance: {
    nome: "Performance",
    texto: "Horas-padrão ÷ tempo direto. Mede o ritmo enquanto trabalha: 100% é o tempo padrão. Acima de 120% costuma indicar tempo padrão folgado.",
  },
  utilizacao: {
    nome: "Utilização",
    texto: "Tempo direto ÷ tempo disponível. Mede quanto do tempo à disposição foi gasto em tarefas.",
  },
  eficiencia: {
    nome: "Eficiência",
    texto: "Horas-padrão ÷ tempo disponível. Junta o ritmo e o uso do tempo (performance × utilização).",
  },
  uph: {
    nome: "UPH",
    texto: "Unidades por hora de tempo direto.",
  },
  inicio_real: {
    nome: "Início real",
    texto: "Percentual de tarefas em que o coletor registrou o início (bipe ou abertura). Abaixo do mínimo configurado, os números do dia ficam estimados.",
  },
  estimado: {
    nome: "Estimado",
    texto: "Número calculado com poucos inícios registrados ou de antes da captura de tempo: serve de referência, não para avaliar o operador.",
  },
  score: {
    nome: "Score das metas",
    texto: "Média ponderada do atingimento de cada meta do operador no período. Não é a performance: um operador pode ter performance alta e score baixo.",
  },
  faixa_performance: {
    nome: "Faixa de performance",
    texto: "Classificação da performance (por exemplo Abaixo, Na meta, Excelente) pelas faixas configuradas no LMS.",
  },
  atingimento: {
    nome: "Atingimento",
    texto: "Realizado ÷ alvo da meta, em percentual.",
  },
  calibrado: {
    nome: "Calibrado",
    texto: "Tempo padrão conferido com execuções reais (Sugerir pelo histórico) ou definido por estudo de tempos. \"Não calibrado\" = migrado ou digitado sem conferência.",
  },
} as const;

export type TermoLms = keyof typeof GLOSSARIO;

export function definicaoTermo(termo: TermoLms): string {
  return GLOSSARIO[termo].texto;
}

export function nomeTermo(termo: TermoLms): string {
  return GLOSSARIO[termo].nome;
}

/** Ícone de ajuda com a definição do glossário. Funciona com mouse, teclado e toque. */
export function TermoAjuda({ termo, className }: { termo: TermoLms; className?: string }) {
  const t = GLOSSARIO[termo];
  return (
    <TooltipProvider delayDuration={150}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={`O que é ${t.nome.toLowerCase()}`}
          className={cn("inline-flex align-middle text-muted-foreground/70 hover:text-foreground focus:outline-none focus-visible:text-foreground", className)}
          onClick={(e) => e.stopPropagation()}>
          <Info size={12} />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs leading-snug">
        <b>{t.nome}.</b> {t.texto}
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
}
