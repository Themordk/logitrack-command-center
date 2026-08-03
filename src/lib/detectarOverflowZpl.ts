export interface OverflowInfo {
  /** true se o ZPL desenha além da altura configurada */
  overflow: boolean;
  /** Y máximo detectado no ZPL, em mm */
  yMaxMm: number;
  /** Altura configurada do template, em mm */
  alturaMm: number;
  /** Quanto passou da altura (yMaxMm - alturaMm), em mm; 0 se não passou */
  excessoMm: number;
}

/** Margem de segurança (dots) para altura visual típica de um elemento renderizado. */
const MARGEM_DOTS = 40;

/**
 * Detecta se o ZPL desenha elementos em Y além da altura configurada
 * do template. Usa parsing por regex dos comandos ^FO e ^FT (field origin
 * e field typeset), somando uma margem de segurança para altura visual
 * dos elementos (fonte + linha).
 */
export function detectarOverflowZpl(
  zpl: string,
  alturaMm: number,
  dpmm: number = 8,
): OverflowInfo {
  if (!zpl || !zpl.trim() || alturaMm <= 0) {
    return { overflow: false, yMaxMm: 0, alturaMm, excessoMm: 0 };
  }

  let yMaxDots = 0;
  const regexes = [/\^FO\s*(\d+)\s*,\s*(\d+)/g, /\^FT\s*(\d+)\s*,\s*(\d+)/g];

  for (const re of regexes) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(zpl)) !== null) {
      const y = Number(match[2]);
      if (Number.isFinite(y) && y > yMaxDots) yMaxDots = y;
    }
  }

  const totalDots = yMaxDots + MARGEM_DOTS;
  const yMaxMm = totalDots / dpmm;
  const alturaDots = alturaMm * dpmm;

  return {
    overflow: totalDots > alturaDots,
    yMaxMm,
    alturaMm,
    excessoMm: Math.max(0, yMaxMm - alturaMm),
  };
}
