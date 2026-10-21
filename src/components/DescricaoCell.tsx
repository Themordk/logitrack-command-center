import { cn } from "@/lib/utils";

/**
 * Célula padrão para textos longos em tabelas (ex.: descrição do produto).
 *
 * - Limita a largura (min/max) para a coluna não esticar a tabela.
 * - Quebra o texto em até `lines` linhas (padrão 2) e encerra com "…".
 * - Força quebra em "palavras" sem espaço (ex.: "ARGO/BRAVA/BRAVO/...").
 * - Exibe o texto completo no tooltip nativo (atributo `title`).
 */

export const DESCRICAO_MIN_WIDTH = 220;
export const DESCRICAO_MAX_WIDTH = 360;
export const DESCRICAO_LINES = 2;

const CLAMP_CLASS: Record<1 | 2 | 3, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
};

export interface DescricaoCellProps {
  text?: string | null;
  lines?: 1 | 2 | 3;
  minWidth?: number;
  maxWidth?: number;
  fallback?: string;
  className?: string;
}

export function DescricaoCell({
  text,
  lines = DESCRICAO_LINES,
  minWidth = DESCRICAO_MIN_WIDTH,
  maxWidth = DESCRICAO_MAX_WIDTH,
  fallback = "—",
  className,
}: DescricaoCellProps) {
  const valor = typeof text === "string" ? text.trim() : text == null ? "" : String(text);

  if (!valor) {
    return <span className="text-muted-foreground">{fallback}</span>;
  }

  return (
    <span
      data-testid="descricao-cell"
      title={valor}
      className={cn(
        "block whitespace-normal break-words [overflow-wrap:anywhere] leading-snug",
        CLAMP_CLASS[lines],
        className,
      )}
      style={{ minWidth, maxWidth }}
    >
      {valor}
    </span>
  );
}
