import { AlertTriangle, CheckCircle2, Clock, MinusCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { estadoIntegracao, VISUAL_ESTADO, type EstadoIntegracao } from "@/lib/integracaoStatus";

/**
 * Selo de integração com o ERP de uma onda ou recebimento (S1).
 * Lê movimento_*.integracao_resumo (pior caso dos documentos, calculado no banco) — nunca o status da onda.
 */
interface Props {
  resumo: string | null | undefined;
  className?: string;
  /** Força modo compacto (apenas ícone) independente do viewport. */
  compact?: boolean;
}

const ICONE: Record<EstadoIntegracao, typeof CheckCircle2> = {
  integrado: CheckCircle2,
  pendente: Clock,
  erro: AlertTriangle,
  ignorado: MinusCircle,
  nao_integra: MinusCircle,
};

export function ErpStatusBadge({ resumo, className, compact }: Props) {
  const isMobile = useIsMobile();
  const estado = estadoIntegracao(resumo);
  if (!estado || !erpBadgeApplies(estado)) return null;
  const v = VISUAL_ESTADO[estado];
  const Icon = ICONE[estado];
  const onlyIcon = compact || isMobile;
  return (
    <span
      title={`ERP: ${v.rotulo}`}
      aria-label={`ERP: ${v.rotulo}`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        v.classe,
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {!onlyIcon && <span>{v.rotulo}</span>}
    </span>
  );
}

/** "Não integra" (nenhuma regra rodou) não mostra selo, para não poluir clientes sem retorno. */
export function erpBadgeApplies(resumo: string | null | undefined) {
  const estado = estadoIntegracao(resumo);
  return !!estado && estado !== "nao_integra";
}

export type FiltroErp = "" | "integrado" | "pendente" | "erro" | "nao_enviado";

export const OPCOES_FILTRO_ERP: { valor: Exclude<FiltroErp, "">; rotulo: string }[] = [
  { valor: "erro", rotulo: "Erro no ERP" },
  { valor: "pendente", rotulo: "Aguardando envio" },
  { valor: "integrado", rotulo: "Integrado" },
  { valor: "nao_enviado", rotulo: "Não enviado" },
];

export function atendeFiltroErp(resumo: string | null | undefined, filtro: FiltroErp): boolean {
  if (!filtro) return true;
  const estado = estadoIntegracao(resumo) ?? "nao_integra";
  if (filtro === "nao_enviado") return estado === "nao_integra" || estado === "ignorado";
  return estado === filtro;
}
