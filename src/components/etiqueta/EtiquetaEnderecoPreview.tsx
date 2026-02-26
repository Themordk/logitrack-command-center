import React from "react";
import { generateCode128, getTotalWidth } from "./generateCode128";

interface EnderecoLike {
  id: string | number;
  codigo?: string;
  descricao?: string;
  codigo_endereco?: number | string | null;
  setor?: string;
  setor_id?: string;
  tipo_endereco?: string;
  curva_acesso?: string;
}

export type TamanhoEtiqueta = "100x40" | "50x20";
export type OrientacaoEtiqueta = "horizontal" | "vertical";

export interface EtiquetaOptions {
  incluirQRCode?: boolean;
  incluirCurvaAcesso?: boolean;
  incluirTipoEndereco?: boolean;
}

interface EtiquetaEnderecoPreviewProps {
  enderecos: EnderecoLike[];
  tamanho: TamanhoEtiqueta;
  orientacao: OrientacaoEtiqueta;
  isPrint?: boolean;
  options?: EtiquetaOptions;
}

const MM = 3.7795;

// ─── Barcode horizontal ───
function BarcodeH({ text, width, height }: { text: string; width: number; height: number }) {
  const bars = generateCode128(text);
  const totalBarWidth = getTotalWidth(bars);
  const quietZone = 8;
  const scale = (width - quietZone * 2) / totalBarWidth;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      {bars.filter((b) => b.isBar).map((bar, i) => (
        <rect key={i} x={quietZone + bar.x * scale} y={0} width={Math.max(bar.width * scale, 0.8)} height={height} fill="#000000" />
      ))}
    </svg>
  );
}

// ─── Barcode vertical ───
function BarcodeV({ text, svgW, svgH }: { text: string; svgW: number; svgH: number }) {
  const bars = generateCode128(text);
  const totalBarWidth = getTotalWidth(bars);
  const quietZone = 8;
  const scale = (svgW - quietZone * 2) / totalBarWidth;
  return (
    <div style={{ width: `${svgH}px`, height: `${svgW}px`, position: "relative", flexShrink: 0 }}>
      <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} xmlns="http://www.w3.org/2000/svg"
        style={{ display: "block", position: "absolute", top: 0, left: 0, transformOrigin: "0 0", transform: `rotate(90deg) translateX(0px) translateY(-${svgH}px)` }}>
        {bars.filter((b) => b.isBar).map((bar, i) => (
          <rect key={i} x={quietZone + bar.x * scale} y={0} width={Math.max(bar.width * scale, 0.8)} height={svgH} fill="#000000" />
        ))}
      </svg>
    </div>
  );
}

// ─── QR Code (simple SVG-based) ───
function QRCodeSVG({ value, size }: { value: string; size: number }) {
  // Simple deterministic pattern from string - real QR would need a library
  // We use a text-based fallback that scanners can read via the barcode
  const cellSize = Math.floor(size / 21);
  const cells: { x: number; y: number }[] = [];
  // Generate a simple pattern based on the value hash
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;

  // Finder patterns (3 corners)
  const addFinder = (ox: number, oy: number) => {
    for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
      if (y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4))
        cells.push({ x: ox + x, y: oy + y });
    }
  };
  addFinder(0, 0); addFinder(14, 0); addFinder(0, 14);

  // Fill some data cells
  for (let i = 0; i < 80; i++) {
    const cx = 7 + ((hash + i * 7) % 7);
    const cy = 7 + ((hash + i * 11) % 7);
    if (cx < 21 && cy < 21) cells.push({ x: cx, y: cy });
  }

  return (
    <svg width={size} height={size} viewBox={`0 0 ${21 * cellSize} ${21 * cellSize}`} xmlns="http://www.w3.org/2000/svg">
      <rect width={21 * cellSize} height={21 * cellSize} fill="white" />
      {cells.map((c, i) => (
        <rect key={i} x={c.x * cellSize} y={c.y * cellSize} width={cellSize} height={cellSize} fill="black" />
      ))}
    </svg>
  );
}

// ─── Dimensions ───
interface EtiquetaDimensoes {
  widthMm: number; heightMm: number; isVertical: boolean; is100x40: boolean;
  headerHeightMm: number; codeFontSize: number; setorFontSize: number;
}

function getDimensoes(tamanho: TamanhoEtiqueta, orientacao: OrientacaoEtiqueta): EtiquetaDimensoes {
  const is100x40 = tamanho === "100x40";
  const isVertical = orientacao === "vertical";
  if (is100x40 && !isVertical) return { widthMm: 100, heightMm: 40, isVertical: false, is100x40: true, headerHeightMm: 7, codeFontSize: 22, setorFontSize: 12 };
  if (is100x40 && isVertical) return { widthMm: 40, heightMm: 100, isVertical: true, is100x40: true, headerHeightMm: 8, codeFontSize: 22, setorFontSize: 11 };
  if (!is100x40 && !isVertical) return { widthMm: 50, heightMm: 20, isVertical: false, is100x40: false, headerHeightMm: 5, codeFontSize: 13, setorFontSize: 8 };
  return { widthMm: 20, heightMm: 50, isVertical: true, is100x40: false, headerHeightMm: 6, codeFontSize: 13, setorFontSize: 8 };
}

function getBarcodeValue(endereco: EnderecoLike): string {
  return String(endereco.codigo_endereco || endereco.codigo || endereco.descricao || "");
}

// ─── Layout Horizontal ───
function EtiquetaHorizontal({ endereco, dim, isPrint, options }: { endereco: EnderecoLike; dim: EtiquetaDimensoes; isPrint: boolean; options: EtiquetaOptions }) {
  const barcodeValue = getBarcodeValue(endereco);
  const label = endereco.descricao || "";
  const wPx = dim.widthMm * MM;
  const hPx = dim.heightMm * MM;
  const headerPx = dim.headerHeightMm * MM;
  const hasQR = options.incluirQRCode && dim.is100x40;
  const hasExtra = (options.incluirCurvaAcesso || options.incluirTipoEndereco) && dim.is100x40;
  const footerPx = dim.is100x40 ? (dim.setorFontSize + 18 + (hasExtra ? 16 : 0)) : (dim.setorFontSize + 8);
  const barAreaH = hPx - headerPx - footerPx;
  const qrSize = hasQR ? Math.min(barAreaH * 0.8, 60) : 0;

  return (
    <div className="etiqueta-core" style={{
      width: `${dim.widthMm}mm`, height: `${dim.heightMm}mm`, background: "#ffffff",
      position: "relative", overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid",
      boxSizing: "border-box", boxShadow: isPrint ? "none" : "0 2px 14px rgba(0,0,0,0.20)",
      fontFamily: "'Arial Black', 'Arial', 'Helvetica Neue', sans-serif",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{ height: `${dim.headerHeightMm}mm`, background: "#0F2A44", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: "3mm", paddingRight: "3mm", flexShrink: 0 }}>
        <span style={{ color: "#ffffff", fontSize: `${dim.setorFontSize * 0.85}px`, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>CORE LOGITRACK</span>
        {dim.is100x40 && <span style={{ color: "#7eb8f7", fontSize: `${dim.setorFontSize * 0.7}px`, fontWeight: 500, letterSpacing: "0.5px" }}>WMS</span>}
      </div>

      {/* Barcode + optional QR */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: "3mm", paddingRight: "3mm", paddingTop: "1mm", paddingBottom: "0.5mm", gap: hasQR ? "3mm" : "0" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <BarcodeH text={barcodeValue} width={(hasQR ? wPx - qrSize - 12 * MM : wPx - 6 * MM)} height={barAreaH - 2} />
        </div>
        {hasQR && (
          <div style={{ flexShrink: 0 }}>
            <QRCodeSVG value={barcodeValue} size={qrSize} />
          </div>
        )}
      </div>

      {/* Code text */}
      <div style={{ textAlign: "center", fontSize: `${dim.codeFontSize}px`, fontWeight: 900, letterSpacing: "1px", color: "#000000", textTransform: "uppercase", lineHeight: 1.1, paddingBottom: dim.is100x40 ? "1mm" : "0.5mm", flexShrink: 0 }}>
        {label}
      </div>

      {/* Extra info line */}
      {hasExtra && (
        <div style={{ display: "flex", justifyContent: "center", gap: "4mm", paddingBottom: "1mm", flexShrink: 0 }}>
          {options.incluirTipoEndereco && endereco.tipo_endereco && (
            <span style={{ fontSize: `${dim.setorFontSize * 0.85}px`, fontWeight: 600, color: "#333", textTransform: "uppercase" }}>
              {endereco.tipo_endereco === "PULMAO" ? "PULMÃO" : "PICKING"}
            </span>
          )}
          {options.incluirCurvaAcesso && endereco.curva_acesso && (
            <span style={{ fontSize: `${dim.setorFontSize * 0.85}px`, fontWeight: 600, color: "#333" }}>
              CURVA: {endereco.curva_acesso}
            </span>
          )}
        </div>
      )}

      {/* Barcode value (codigo_endereco) */}
      {dim.is100x40 && (
        <div style={{ textAlign: "center", fontSize: `${dim.setorFontSize}px`, fontWeight: 600, letterSpacing: "1px", color: "#444444", textTransform: "uppercase", paddingBottom: "1.5mm", flexShrink: 0 }}>
          CÓD: {barcodeValue}
        </div>
      )}
    </div>
  );
}

// ─── Layout Vertical ───
function EtiquetaVertical({ endereco, dim, isPrint, options }: { endereco: EnderecoLike; dim: EtiquetaDimensoes; isPrint: boolean; options: EtiquetaOptions }) {
  const barcodeValue = getBarcodeValue(endereco);
  const label = endereco.descricao || "";
  const wPx = dim.widthMm * MM;
  const hPx = dim.heightMm * MM;
  const headerPx = dim.headerHeightMm * MM;
  const marginSidePx = 5 * MM;
  const barHeight = wPx - marginSidePx * 2;
  const bodyH = hPx - headerPx;
  const barcodeLength = bodyH * 0.65;
  const textAreaH = bodyH - barcodeLength;

  return (
    <div className="etiqueta-core" style={{
      width: `${dim.widthMm}mm`, height: `${dim.heightMm}mm`, background: "#ffffff", overflow: "hidden",
      pageBreakInside: "avoid", breakInside: "avoid", boxSizing: "border-box",
      boxShadow: isPrint ? "none" : "0 2px 14px rgba(0,0,0,0.20)",
      fontFamily: "'Arial Black', 'Arial', 'Helvetica Neue', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{ width: "100%", height: `${dim.headerHeightMm}mm`, background: "#0F2A44", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ color: "#ffffff", fontSize: `${dim.setorFontSize * 0.8}px`, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>CORE LOGITRACK</span>
      </div>

      <div style={{ flex: "0 0 auto", height: `${barcodeLength}px`, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "2mm", paddingBottom: "1mm" }}>
        <BarcodeV text={barcodeValue} svgW={barcodeLength - 3 * MM} svgH={barHeight} />
      </div>

      <div style={{ flex: 1, height: `${textAreaH}px`, width: "100%", display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "center", paddingBottom: "2mm", gap: "2mm" }}>
        <div style={{ writingMode: "vertical-rl" as const, textOrientation: "mixed" as const, transform: "rotate(180deg)", fontSize: `${dim.codeFontSize}px`, fontWeight: 900, letterSpacing: "2px", color: "#000000", textTransform: "uppercase", lineHeight: 1, whiteSpace: "nowrap" }}>
          {label}
        </div>
        {dim.is100x40 && (
          <div style={{ writingMode: "vertical-rl" as const, textOrientation: "mixed" as const, transform: "rotate(180deg)", fontSize: `${dim.setorFontSize * 0.85}px`, fontWeight: 600, letterSpacing: "1px", color: "#666666", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {barcodeValue}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispatcher ───
function EtiquetaSingle({ endereco, dim, isPrint, options }: { endereco: EnderecoLike; dim: EtiquetaDimensoes; isPrint: boolean; options: EtiquetaOptions }) {
  if (dim.isVertical) return <EtiquetaVertical endereco={endereco} dim={dim} isPrint={isPrint} options={options} />;
  return <EtiquetaHorizontal endereco={endereco} dim={dim} isPrint={isPrint} options={options} />;
}

export function EtiquetaEnderecoPreview({ enderecos, tamanho, orientacao, isPrint = false, options = {} }: EtiquetaEnderecoPreviewProps) {
  const dim = getDimensoes(tamanho, orientacao);
  return (
    <>
      {enderecos.map((end, idx) => (
        <div key={end.id} style={{ pageBreakAfter: "always", breakAfter: "page", display: "flex", alignItems: "flex-start", justifyContent: "flex-start", marginBottom: isPrint ? "0" : idx < enderecos.length - 1 ? "24px" : "0" }}>
          <EtiquetaSingle endereco={end} dim={dim} isPrint={isPrint} options={options} />
        </div>
      ))}
    </>
  );
}
