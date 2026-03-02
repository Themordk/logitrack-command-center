import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { QRCodeRenderer } from "./QRCodeRenderer";

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

// Fixed 203 DPI dimensions: 100mm x 40mm = 800px x 320px
const W_PX = 800;
const H_PX = 320;

function BarcodeHU({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128",
        width: 3,
        height: 120,
        margin: 16,
        displayValue: false,
        lineColor: "#000000",
        background: "#FFFFFF",
        flat: true,
      });
    } catch (e) {
      console.error("HU Barcode error:", e);
    }
  }, [value]);

  return <svg ref={svgRef} style={{ display: "block" }} />;
}

function EtiquetaHUSingle({ hu, isPrint }: { hu: HULike; isPrint: boolean }) {
  const label = hu.codigo_hu || "";

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${W_PX}px`,
        height: `${H_PX}px`,
        background: "#FFFFFF",
        overflow: "hidden",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        boxSizing: "border-box",
        boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          height: "56px",
          background: "#FFFFFF",
          borderBottom: "3px solid #000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: "16px",
          paddingRight: "16px",
          flexShrink: 0,
        }}
      >
        <span style={{ color: "#000000", fontSize: "14px", fontWeight: 900, letterSpacing: "2px", textTransform: "uppercase" }}>
          CORE LOGITRACK
        </span>
        <span style={{ color: "#000000", fontSize: "11px", fontWeight: 700 }}>HU</span>
      </div>

      {/* Barcode */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "12px 16px",
          background: "#FFFFFF",
        }}
      >
        {label ? (
          <BarcodeHU value={label} />
        ) : (
          <span style={{ color: "#CC0000", fontSize: "10px" }}>Código HU ausente</span>
        )}
      </div>

      {/* Code text */}
      <div
        style={{
          height: "36px",
          textAlign: "center",
          fontSize: "20px",
          fontWeight: 900,
          letterSpacing: "2px",
          color: "#000000",
          textTransform: "uppercase",
          lineHeight: "36px",
          flexShrink: 0,
          background: "#FFFFFF",
        }}
      >
        {label}
      </div>

      {/* Info */}
      <div
        style={{
          height: "28px",
          display: "flex",
          justifyContent: "center",
          gap: "32px",
          fontSize: "11px",
          fontWeight: 700,
          color: "#000000",
          alignItems: "center",
          flexShrink: 0,
          background: "#FFFFFF",
        }}
      >
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
