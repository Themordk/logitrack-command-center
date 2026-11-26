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
    texto: "Tempo gasto em algo que não virou tarefa concluída, contado uma vez só e fora do tempo das tarefas: atividade apontada no coletor (reunião, limpeza, carregar bateria), trecho trabalhado numa tarefa que depois foi cancelada e tarefa esquecida aberta. Sair da etapa ou ter a tarefa devolvida não gera indireto.",
  },
  indireto_apontado: {
    nome: "Atividade apontada",
    texto: "Indireto registrado pelo operador no coletor (reunião, limpeza, carregar bateria...). Só conta o tempo que não coincide com tarefas.",
  },
  indireto_cancelada: {
    nome: "Tarefa cancelada",
    texto: "Indireto do trecho trabalhado numa tarefa que depois foi cancelada ou estornada (até o teto do ciclo do tipo, a partir do início do turno). Tarefas canceladas ao mesmo tempo contam uma vez.",
  },
  indireto_esquecida: {
    nome: "Tarefa esquecida aberta",
    texto: "Indireto de uma tarefa que ficou aberta muito além do normal (acima de 4 h ou de 30 × o tempo padrão e 30 min). O tempo dela sai do direto e o tempo padrão dela não entra no desempenho.",
  },
  entre_tarefas: {
    nome: "Entre tarefas",
    texto: "Intervalos curtos (até 30 min) entre o fim de uma atividade e o início da próxima: deslocamento até o próximo endereço, preparar o equipamento, esperar a próxima tarefa. Não é indireto e não entra na utilização.",
  },
  tempo_disponivel: {
    nome: "Tempo disponível",
    texto: "Tempo em que o operador estava à disposição: sessão aberta no coletor (sem sessão, o turno), descontado o intervalo do turno.",
  },
  tempo_ocioso: {
    nome: "Tempo ocioso",
    texto: "Parte do tempo disponível que não foi direto, indireto nem intervalo curto entre tarefas: pausas longas e tempo parado sem tarefa.",
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
  tempo_entre_tarefas: {
    nome: "Tempo entre tarefas",
    texto: "Minutos, em média, entre o fim de uma atividade (tarefa ou apontamento) e o início da próxima. Pausas acima de 30 min, como intervalo e almoço, não contam.",
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
    texto: "Tempo padrão conferido com execuções reais (Sugerir pelo histórico) ou definido por estudo de tempos. \"Manual\" = digitado pelo gestor, ainda sem conferência com o histórico; \"Não revisado\" = veio do cadastro antigo e ninguém conferiu.",
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
