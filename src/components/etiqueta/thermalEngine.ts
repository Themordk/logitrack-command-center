/**
 * Thermal Label Engine – CORE LogiTrack
 * Optimized for Elgin L42PRO 203 DPI thermal printers
 * 
 * Architecture:
 *   Template (visual) → Data → Engine (rendering)
 *   Prepared for future ZPL/EPL migration
 */

// ─── Constants ───
export const DPI = 203;
export const MM_TO_PX = 8; // 1mm ≈ 8px at 203 DPI

export type TemplateId =
  | "ARMAZEM_100x40_H"
  | "ARMAZEM_100x40_V"
  | "LOJA_50x20_H"
  | "LOJA_50x20_V"
  | "BIN_80x20_H";

export interface TemplateSpec {
  id: TemplateId;
  widthMm: number;
  heightMm: number;
  widthPx: number;
  heightPx: number;
  orientation: "horizontal" | "vertical";
  barcode: {
    moduleWidth: number;
    height: number;
    margin: number;
  };
  qrCode: {
    size: number;
    margin: number;
  };
  quietZone: {
    horizontal: number;
    vertical: number;
  };
}

export const TEMPLATES: Record<TemplateId, TemplateSpec> = {
  ARMAZEM_100x40_H: {
    id: "ARMAZEM_100x40_H",
    widthMm: 100, heightMm: 40,
    widthPx: 800, heightPx: 320,
    orientation: "horizontal",
    barcode: { moduleWidth: 3, height: 120, margin: 16 },
    qrCode: { size: 96, margin: 2 },
    quietZone: { horizontal: 16, vertical: 12 },
  },
  ARMAZEM_100x40_V: {
    id: "ARMAZEM_100x40_V",
    widthMm: 40, heightMm: 100,
    widthPx: 320, heightPx: 800,
    orientation: "vertical",
    barcode: { moduleWidth: 3, height: 120, margin: 16 },
    qrCode: { size: 96, margin: 2 },
    quietZone: { horizontal: 16, vertical: 12 },
  },
  LOJA_50x20_H: {
    id: "LOJA_50x20_H",
    widthMm: 50, heightMm: 20,
    widthPx: 400, heightPx: 160,
    orientation: "horizontal",
    barcode: { moduleWidth: 2, height: 60, margin: 10 },
    qrCode: { size: 48, margin: 2 },
    quietZone: { horizontal: 12, vertical: 10 },
  },
  LOJA_50x20_V: {
    id: "LOJA_50x20_V",
    widthMm: 20, heightMm: 50,
    widthPx: 160, heightPx: 400,
    orientation: "vertical",
    barcode: { moduleWidth: 2, height: 60, margin: 10 },
    qrCode: { size: 48, margin: 2 },
    quietZone: { horizontal: 12, vertical: 10 },
  },
  BIN_80x20_H: {
    id: "BIN_80x20_H",
    widthMm: 80, heightMm: 20,
    widthPx: 640, heightPx: 160,
    orientation: "horizontal",
    barcode: { moduleWidth: 2, height: 64, margin: 4 },
    qrCode: { size: 0, margin: 0 },
    quietZone: { horizontal: 16, vertical: 16 },
  },
};

// ─── Label Data ───
export interface LabelData {
  barcodeValue: string;    // codigo_endereco
  displayText: string;     // descricao (R01-P02-N03-A04)
  tipoEndereco?: string;
  curvaAcesso?: string;
  nivel?: string;
  apto?: string;
}

// ─── Validation ───
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLabel(data: LabelData, template: TemplateSpec): ValidationResult {
  const errors: string[] = [];

  if (!data.barcodeValue || data.barcodeValue.trim() === "") {
    errors.push("Código de barras vazio – campo codigo_endereco ausente");
  }

  if (!data.displayText || data.displayText.trim() === "") {
    errors.push("Texto de exibição vazio – campo descricao ausente");
  }

  // Validate barcode value contains only Code128-compatible chars
  if (data.barcodeValue && !/^[\x20-\x7E]+$/.test(data.barcodeValue)) {
    errors.push("Código de barras contém caracteres inválidos para Code128");
  }

  // Validate template dimensions are DPI-compatible
  const expectedWPx = template.widthMm * MM_TO_PX;
  const expectedHPx = template.heightMm * MM_TO_PX;
  if (template.widthPx !== expectedWPx || template.heightPx !== expectedHPx) {
    errors.push(`Dimensões do template incompatíveis com ${DPI} DPI`);
  }

  // Validate quiet zone
  if (template.quietZone.horizontal < 12) {
    errors.push("Quiet zone horizontal < 12px");
  }
  if (template.quietZone.vertical < 10) {
    errors.push("Quiet zone vertical < 10px");
  }

  return { valid: errors.length === 0, errors };
}

// ─── Print CSS ───
export function getPrintCSS(template: TemplateSpec): string {
  return `
    @media print {
      @page {
        size: ${template.widthMm}mm ${template.heightMm}mm;
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
        zoom: 1 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      * {
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        -webkit-font-smoothing: none;
      }
      .etiqueta-thermal {
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: white; }
    .etiqueta-thermal {
      page-break-after: always;
      break-after: page;
    }
  `;
}

export function getTemplateFromSelection(
  tamanho: "100x40" | "50x20" | "80x20",
  orientacao: "horizontal" | "vertical"
): TemplateSpec {
  if (tamanho === "80x20") return TEMPLATES.BIN_80x20_H;
  if (tamanho === "100x40" && orientacao === "horizontal") return TEMPLATES.ARMAZEM_100x40_H;
  if (tamanho === "100x40" && orientacao === "vertical") return TEMPLATES.ARMAZEM_100x40_V;
  if (tamanho === "50x20" && orientacao === "horizontal") return TEMPLATES.LOJA_50x20_H;
  return TEMPLATES.LOJA_50x20_V;
}

// ─── Config-aware helpers ───

export type TipoEtiqueta = "ENDERECO" | "HU" | "PRODUTO" | "VOLUME";

export interface EtiquetaConfigLike {
  tamanho: string;
  orientacao: "horizontal" | "vertical";
  largura_mm?: number;
  altura_mm?: number;
}

/**
 * Converte uma config de template (vinda do banco) em um TemplateSpec.
 * Se `largura_mm`/`altura_mm` presentes → dimensões customizadas.
 * Caso contrário → fallback para preset via `getTemplateFromSelection`.
 */
export function getTemplateFromConfig(config: EtiquetaConfigLike): TemplateSpec {
  if (config.largura_mm && config.altura_mm && config.largura_mm > 0 && config.altura_mm > 0) {
    const widthMm = config.largura_mm;
    const heightMm = config.altura_mm;
    const widthPx = Math.round(widthMm * MM_TO_PX);
    const heightPx = Math.round(heightMm * MM_TO_PX);
    const isSmall = widthMm <= 50 || heightMm <= 25;
    const isVertical = heightMm > widthMm;
    return {
      id: `CUSTOM_${widthMm}x${heightMm}` as TemplateId,
      widthMm,
      heightMm,
      widthPx,
      heightPx,
      orientation: isVertical ? "vertical" : "horizontal",
      barcode: {
        moduleWidth: isSmall ? 2 : 3,
        height: isSmall ? 60 : Math.min(120, Math.round(heightPx * 0.15)),
        margin: isSmall ? 10 : 16,
      },
      qrCode: {
        size: isSmall ? 48 : 96,
        margin: 2,
      },
      quietZone: {
        horizontal: isSmall ? 12 : 16,
        vertical: isSmall ? 10 : 12,
      },
    };
  }
  const tamanho = (config.tamanho as "100x40" | "50x20" | "80x20") || "100x40";
  return getTemplateFromSelection(tamanho, config.orientacao || "horizontal");
}

/**
 * CSS de impressão para dimensões customizadas, com suporte opcional a impressão
 * em rolo de duas colunas (linhas com dois rótulos lado a lado + gap horizontal).
 */
export function getPrintCSSFromConfig(
  widthMm: number,
  heightMm: number,
  duasColunas: boolean = false,
  intervaloColunasMm: number = 3
): string {
  const pageWidth = duasColunas ? widthMm * 2 + intervaloColunasMm : widthMm;
  return `
    @media print {
      @page {
        size: ${pageWidth}mm ${heightMm}mm;
        margin: 0;
      }
      html, body {
        margin: 0;
        padding: 0;
        zoom: 1 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      * {
        image-rendering: pixelated;
        image-rendering: -moz-crisp-edges;
        -webkit-font-smoothing: none;
      }
      .etiqueta-thermal {
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      ${duasColunas ? `
      .etiqueta-row {
        display: flex;
        flex-direction: row;
        gap: ${intervaloColunasMm}mm;
        justify-content: flex-start;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .etiqueta-row .etiqueta-thermal {
        page-break-after: auto;
        break-after: auto;
        flex-shrink: 0;
      }
      ` : ""}
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: white; }
    .etiqueta-thermal {
      page-break-after: always;
      break-after: page;
    }
    .etiqueta-row {
      display: flex;
      flex-direction: row;
      gap: ${intervaloColunasMm}mm;
      justify-content: flex-start;
    }
    .etiqueta-row .etiqueta-thermal {
      flex-shrink: 0;
    }

  `;
}

