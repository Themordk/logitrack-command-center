/**
 * ZPL Generator — CORE LogiTrack
 *
 * Converte a configuração visual de um template de etiqueta em código ZPL
 * (Zebra Programming Language) com placeholders `{{campo}}`.
 *
 * O agente de impressão substitui os placeholders pelos valores reais no
 * momento da impressão. O ZPL gerado é determinístico: mesma configuração
 * produz o mesmo ZPL (sem timestamps ou dados reais).
 *
 * Referência: 203 DPI → 8 dots/mm.
 */
import type { EtiquetaConfig, TipoEtiquetaConfig, CampoEtiqueta } from "@/hooks/useEtiquetaTemplate";

const DOTS_PER_MM = 8;

function activeFields(config: EtiquetaConfig): CampoEtiqueta[] {
  return (config.campos || [])
    .filter((c) => c.ativo)
    .sort((a, b) => a.ordem - b.ordem);
}

function dims(config: EtiquetaConfig) {
  const largMm = config.largura_mm || 100;
  const altMm = config.altura_mm || 40;
  const largDots = Math.round(largMm * DOTS_PER_MM);
  const altDots = Math.round(altMm * DOTS_PER_MM);
  const escala = config.escala_fonte || 1;
  const fs = (n: number) => Math.max(8, Math.round(n * escala));
  const M = 16;
  return { largMm, altMm, largDots, altDots, escala, fs, M, areaUtil: largDots - M * 2 };
}

function zplHeader(largDots: number, altDots: number): string {
  return `^XA\n^CI28\n^PW${largDots}\n^LL${altDots}\n`;
}

function drawBlackHeader(largDots: number, areaUtil: number, M: number, fs: (n: number) => number, texto: string): { zpl: string; nextY: number } {
  const headerH = Math.max(46, fs(24) + 20);
  let zpl = `^FO0,0^GB${largDots},${headerH},${headerH}^FS\n`;
  zpl += `^CF0,${fs(22)}\n`;
  const textY = Math.round((headerH - fs(22)) / 2);
  zpl += `^FO${M},${textY}^FR^FB${areaUtil},1,0,C,0^FD${texto}^FS\n`;
  return { zpl, nextY: headerH + 6 };
}

function drawDivider(M: number, y: number, areaUtil: number): string {
  return `^FO${M},${y}^GB${areaUtil},1,1^FS\n`;
}

function drawGrid2Cols(
  campos: CampoEtiqueta[],
  startY: number,
  M: number,
  areaUtil: number,
  fs: (n: number) => number,
  altDots: number,
): { zpl: string; nextY: number } {
  if (campos.length === 0) return { zpl: "", nextY: startY };
  const colWidth = Math.floor(areaUtil / 2) - 4;
  const lineH = fs(12) + fs(18) + 10;
  let zpl = "";
  let y = startY;
  const metade = Math.ceil(campos.length / 2);
  for (let i = 0; i < metade; i++) {
    if (y + lineH > altDots - 4) break;
    const esq = campos[i];
    const dir = campos[i + metade];
    if (esq) {
      zpl += `^CF0,${fs(12)}\n`;
      zpl += `^FO${M},${y}^FB${colWidth},1,0,L,0^FD${esq.label.toUpperCase()}^FS\n`;
      zpl += `^CF0,${fs(18)}\n`;
      zpl += `^FO${M},${y + fs(12) + 2}^FB${colWidth},1,0,L,0^FD{{${esq.chave}}}^FS\n`;
    }
    if (dir) {
      const xDir = M + colWidth + 8;
      zpl += `^CF0,${fs(12)}\n`;
      zpl += `^FO${xDir},${y}^FB${colWidth},1,0,L,0^FD${dir.label.toUpperCase()}^FS\n`;
      zpl += `^CF0,${fs(18)}\n`;
      zpl += `^FO${xDir},${y + fs(12) + 2}^FB${colWidth},1,0,L,0^FD{{${dir.chave}}}^FS\n`;
    }
    y += lineH;
    zpl += drawDivider(M, y, areaUtil);
    y += 4;
  }
  return { zpl, nextY: y };
}

// ─── VOLUME ───
function gerarZplVolume(config: EtiquetaConfig): string {
  const { largDots, altDots, fs, M, areaUtil } = dims(config);
  const campos = activeFields(config).filter((c) => c.chave !== "codigo_volume");

  let zpl = zplHeader(largDots, altDots);
  let y = 0;

  if (config.com_cabecalho) {
    const h = drawBlackHeader(largDots, areaUtil, M, fs, "VOLUME DE EXPEDICAO");
    zpl += h.zpl;
    y = h.nextY;
  } else {
    y = 8;
  }

  const barcodeH = 80;
  zpl += `^BY3,3,${barcodeH}\n`;
  zpl += `^FO${M},${y}^BCN,${barcodeH},N,N,N^FD{{codigo_volume}}^FS\n`;
  y += barcodeH + 6;
  zpl += `^CF0,${fs(16)}\n`;
  zpl += `^FO${M},${y}^FB${areaUtil},1,0,C,0^FD{{codigo_volume}}^FS\n`;
  y += fs(16) + 8;
  zpl += drawDivider(M, y, areaUtil);
  y += 6;

  const grid = drawGrid2Cols(campos, y, M, areaUtil, fs, altDots);
  zpl += grid.zpl;

  zpl += "^XZ";
  return zpl;
}

// ─── HU ───
function gerarZplHU(config: EtiquetaConfig): string {
  const { largDots, altDots, fs, M, areaUtil } = dims(config);
  const campos = activeFields(config).filter((c) => c.chave !== "codigo_hu");

  let zpl = zplHeader(largDots, altDots);
  let y = 0;

  if (config.com_cabecalho) {
    const h = drawBlackHeader(largDots, areaUtil, M, fs, "HANDLING UNIT (HU)");
    zpl += h.zpl;
    y = h.nextY;
  } else {
    y = 8;
  }

  const barcodeH = 90;
  zpl += `^BY3,3,${barcodeH}\n`;
  zpl += `^FO${M},${y}^BCN,${barcodeH},N,N,N^FD{{codigo_hu}}^FS\n`;
  y += barcodeH + 6;
  zpl += `^CF0,${fs(20)}\n`;
  zpl += `^FO${M},${y}^FB${areaUtil},1,0,C,0^FD{{codigo_hu}}^FS\n`;
  y += fs(20) + 8;
  zpl += drawDivider(M, y, areaUtil);
  y += 6;

  const grid = drawGrid2Cols(campos, y, M, areaUtil, fs, altDots);
  zpl += grid.zpl;

  zpl += "^XZ";
  return zpl;
}

// ─── PRODUTO ───
function gerarZplProduto(config: EtiquetaConfig): string {
  const { largDots, altDots, fs, M, areaUtil } = dims(config);
  const campos = activeFields(config);
  const isSku = (c: CampoEtiqueta) => c.chave === "sku";
  const isEan = (c: CampoEtiqueta) => c.chave === "ean";
  const isDescricao = (c: CampoEtiqueta) => c.chave === "descricao";
  const extras = campos.filter((c) => !isSku(c) && !isEan(c) && !isDescricao(c));

  let zpl = zplHeader(largDots, altDots);
  let y = 8;

  // Header simples
  zpl += `^CF0,${fs(16)}\n`;
  zpl += `^FO${M},${y}^FDCORE LOGITRACK^FS\n`;
  zpl += `^FO${M},${y}^FB${areaUtil},1,0,R,0^FD{{sku}}^FS\n`;
  y += fs(16) + 6;
  zpl += drawDivider(M, y, areaUtil);
  y += 6;

  // Descrição
  zpl += `^CF0,${fs(22)}\n`;
  zpl += `^FO${M},${y}^FB${areaUtil},2,4,L,0^FD{{descricao}}^FS\n`;
  y += fs(22) * 2 + 10;

  // Campos extras
  zpl += `^CF0,${fs(14)}\n`;
  for (const c of extras) {
    if (y + fs(14) + 4 > altDots - 100) break;
    zpl += `^FO${M},${y}^FD${c.label}: {{${c.chave}}}^FS\n`;
    y += fs(14) + 4;
  }

  // Barcode EAN
  const barcodeH = Math.min(70, Math.max(40, altDots - y - fs(14) - 20));
  zpl += `^BY2,3,${barcodeH}\n`;
  zpl += `^FO${M},${y}^BCN,${barcodeH},N,N,N^FD{{ean}}^FS\n`;
  y += barcodeH + 4;
  zpl += `^CF0,${fs(14)}\n`;
  zpl += `^FO${M},${y}^FB${areaUtil},1,0,C,0^FD{{ean}}^FS\n`;

  zpl += "^XZ";
  return zpl;
}

// ─── ENDERECO ───
function setaChar(dir?: string): string {
  switch (dir) {
    case "CIMA": return "^";
    case "BAIXO": return "v";
    case "ESQUERDA": return "<";
    case "DIREITA": return ">";
    default: return "";
  }
}

function gerarZplEndereco(config: EtiquetaConfig): string {
  const { largDots, altDots, fs, M, areaUtil } = dims(config);
  const campos = activeFields(config).filter(
    (c) => c.chave !== "codigo_endereco" && c.chave !== "descricao",
  );

  let zpl = zplHeader(largDots, altDots);
  let y = 8;

  // Barcode grande no topo
  const barcodeH = Math.min(110, Math.round(altDots * 0.35));
  zpl += `^BY3,3,${barcodeH}\n`;
  zpl += `^FO${M},${y}^BCN,${barcodeH},N,N,N^FD{{codigo_endereco}}^FS\n`;
  y += barcodeH + 4;
  zpl += `^CF0,${fs(18)}\n`;
  zpl += `^FO${M},${y}^FB${areaUtil},1,0,C,0^FD{{codigo_endereco}}^FS\n`;
  y += fs(18) + 8;
  zpl += drawDivider(M, y, areaUtil);
  y += 6;

  // Descrição grande + seta direcional
  const seta = setaChar(config.direcao_seta);
  const setaW = seta ? 80 : 0;
  const descW = areaUtil - setaW;
  zpl += `^CF0,${fs(26)}\n`;
  zpl += `^FO${M},${y}^FB${descW},1,0,L,0^FD{{descricao}}^FS\n`;
  if (seta) {
    zpl += `^CF0,${fs(48)}\n`;
    zpl += `^FO${M + descW},${y - 6}^FB${setaW},1,0,C,0^FD${seta}^FS\n`;
  }
  y += fs(26) + 8;

  // Campos extras (curva, tipo, etc.)
  zpl += `^CF0,${fs(14)}\n`;
  for (const c of campos) {
    if (y + fs(14) + 4 > altDots - 4) break;
    zpl += `^FO${M},${y}^FD${c.label}: {{${c.chave}}}^FS\n`;
    y += fs(14) + 4;
  }

  zpl += "^XZ";
  return zpl;
}

// ─── Dispatcher ───
export function gerarZplTemplate(tipo: TipoEtiquetaConfig, config: EtiquetaConfig): string {
  switch (tipo) {
    case "VOLUME": return gerarZplVolume(config);
    case "HU": return gerarZplHU(config);
    case "PRODUTO": return gerarZplProduto(config);
    case "ENDERECO": return gerarZplEndereco(config);
    default: return "";
  }
}
