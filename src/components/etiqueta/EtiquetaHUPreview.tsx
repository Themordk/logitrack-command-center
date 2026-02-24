import React from "react";
import { generateCode128, getTotalWidth } from "./generateCode128";

interface HULike {
  id: string | number;
  codigo_hu?: string;
  tipo_hu?: string;
  tamanho?: string;
}

interface EtiquetaHUPreviewProps {
  hus: HULike[];
  isPrint?: boolean;
}

const MM = 3.7795;

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

function EtiquetaHUSingle({ hu, isPrint }: { hu: HULike; isPrint: boolean }) {
  const label = hu.codigo_hu || "";
  const wMm = 100;
  const hMm = 40;
  const wPx = wMm * MM;
  const hPx = hMm * MM;
  const headerPx = 7 * MM;
  const footerInfoH = 36;
  const barAreaH = hPx - headerPx - footerInfoH - 14;

  return (
    <div
      className="etiqueta-core"
      style={{
        width: `${wMm}mm`,
        height: `${hMm}mm`,
        background: "#ffffff",
        overflow: "hidden",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        boxSizing: "border-box",
        boxShadow: isPrint ? "none" : "0 2px 14px rgba(0,0,0,0.20)",
        fontFamily: "'Arial Black', 'Arial', 'Helvetica Neue', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{
        height: `7mm`,
        background: "#0F2A44",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "3mm",
        paddingRight: "3mm",
        flexShrink: 0,
      }}>
        <span style={{ color: "#ffffff", fontSize: "10px", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>
          CORE LOGITRACK
        </span>
        <span style={{ color: "#7eb8f7", fontSize: "8px", fontWeight: 500, letterSpacing: "0.5px" }}>HU</span>
      </div>

      {/* Barcode */}
      <div style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingLeft: "3mm",
        paddingRight: "3mm",
        paddingTop: "1mm",
        paddingBottom: "0.5mm",
      }}>
        <BarcodeH text={label} width={wPx - 6 * MM} height={barAreaH} />
      </div>

      {/* Código */}
      <div style={{
        textAlign: "center",
        fontSize: "18px",
        fontWeight: 900,
        letterSpacing: "1px",
        color: "#000000",
        textTransform: "uppercase",
        lineHeight: 1.1,
        paddingBottom: "0.5mm",
        flexShrink: 0,
      }}>
        {label}
      </div>

      {/* Info */}
      <div style={{
        display: "flex",
        justifyContent: "center",
        gap: "4mm",
        fontSize: "12px",
        fontWeight: 600,
        color: "#444444",
        paddingBottom: "1.5mm",
        flexShrink: 0,
      }}>
        {hu.tamanho && <span>TAM: {hu.tamanho}</span>}
        {hu.tipo_hu && <span>TIPO: {hu.tipo_hu}</span>}
      </div>
    </div>
  );
}

export function EtiquetaHUPreview({ hus, isPrint = false }: EtiquetaHUPreviewProps) {
  return (
    <>
      {hus.map((hu, idx) => (
        <div
          key={hu.id}
          style={{
            pageBreakAfter: "always",
            breakAfter: "page",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            marginBottom: isPrint ? "0" : idx < hus.length - 1 ? "24px" : "0",
          }}
        >
          <EtiquetaHUSingle hu={hu} isPrint={isPrint} />
        </div>
      ))}
    </>
  );
}
