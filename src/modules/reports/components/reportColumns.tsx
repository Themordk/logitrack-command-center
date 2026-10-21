import {
  DescricaoCell,
  DESCRICAO_LINES,
  DESCRICAO_MAX_WIDTH,
  DESCRICAO_MIN_WIDTH,
} from "@/components/DescricaoCell";
import type { ReportColumn } from "./ReportTable";
import type { ExportColumn } from "../utils/exporters";

/** Largura (mm) da coluna de descrição no PDF paisagem A4. */
export const DESCRICAO_PDF_WIDTH_MM = 75;

interface ColTextoLongoOpts {
  key?: string;
  label?: string;
  minWidth?: number;
  maxWidth?: number;
  lines?: 1 | 2 | 3;
}

/**
 * Coluna padrão para textos longos (descrição do produto, parceiro...).
 * Quebra em até 2 linhas, largura limitada e texto completo no tooltip.
 */
export function colTextoLongo({
  key = "descricao",
  label = "Descrição",
  minWidth = DESCRICAO_MIN_WIDTH,
  maxWidth = DESCRICAO_MAX_WIDTH,
  lines = DESCRICAO_LINES,
}: ColTextoLongoOpts = {}): ReportColumn {
  return {
    key,
    label,
    width: `${minWidth}px`,
    maxWidth: `${maxWidth}px`,
    wrap: true,
    render: (v) => <DescricaoCell text={v} lines={lines} minWidth={minWidth} maxWidth={maxWidth} />,
  };
}

/** Coluna padrão de descrição do produto nos relatórios. */
export const colDescricaoProduto = (opts: ColTextoLongoOpts = {}): ReportColumn =>
  colTextoLongo({ key: "descricao", label: "Descrição", ...opts });

/** Coluna de descrição para exportação (PDF com largura fixa e quebra de linha). */
export const exportColDescricao = (key = "descricao", label = "Descrição"): ExportColumn => ({
  key,
  label,
  width: DESCRICAO_PDF_WIDTH_MM,
});
