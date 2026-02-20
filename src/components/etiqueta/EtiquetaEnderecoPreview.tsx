import React from "react";
import { generateCode128, getTotalWidth } from "./generateCode128";
import type { Endereco } from "@/data/mockData";

export type TamanhoEtiqueta = "100x40" | "50x20";
export type OrientacaoEtiqueta = "horizontal" | "vertical";

interface EtiquetaEnderecoPreviewProps {
  enderecos: Endereco[];
  tamanho: TamanhoEtiqueta;
  orientacao: OrientacaoEtiqueta;
  isPrint?: boolean;
}

// mm to px at 96dpi (1mm = 3.7795px)
const MM = 3.7795;

function BarcodesvG({ text, width, height }: { text: string; width: number; height: number }) {
  const bars = generateCode128(text);
  const totalBarWidth = getTotalWidth(bars);
  const scale = (width - 10) / totalBarWidth; // leave 5px margin each side

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
    >
      {bars
        .filter((b) => b.isBar)
        .map((bar, i) => (
          <rect
            key={i}
            x={5 + bar.x * scale}
            y={0}
            width={Math.max(bar.width * scale, 1)}
            height={height}
            fill="#000000"
          />
        ))}
    </svg>
  );
}

interface EtiquetaDimensoes {
  widthMm: number;
  heightMm: number;
  barHeight: number;
  codeFontSize: number;
  setorFontSize: number;
  headerHeight: number;
}

function getDimensoes(tamanho: TamanhoEtiqueta, orientacao: OrientacaoEtiqueta): EtiquetaDimensoes {
  const is100x40 = tamanho === "100x40";

  if (is100x40 && orientacao === "horizontal") {
    return { widthMm: 100, heightMm: 40, barHeight: 76, codeFontSize: 20, setorFontSize: 12, headerHeight: 8 };
  }
  if (is100x40 && orientacao === "vertical") {
    return { widthMm: 40, heightMm: 100, barHeight: 80, codeFontSize: 16, setorFontSize: 11, headerHeight: 8 };
  }
  if (tamanho === "50x20" && orientacao === "horizontal") {
    return { widthMm: 50, heightMm: 20, barHeight: 32, codeFontSize: 12, setorFontSize: 8, headerHeight: 5 };
  }
  // 50x20 vertical
  return { widthMm: 20, heightMm: 50, barHeight: 36, codeFontSize: 10, setorFontSize: 7, headerHeight: 5 };
}

function EtiquetaSingle({
  endereco,
  dim,
  isPrint,
}: {
  endereco: Endereco;
  dim: EtiquetaDimensoes;
  isPrint: boolean;
}) {
  const wPx = dim.widthMm * MM;
  const hPx = dim.heightMm * MM;
  const headerPx = dim.headerHeight * MM;
  const barcodeAreaH = dim.barHeight;
  const bottomPad = 4;
  const is100x40h = dim.widthMm >= 80;

  return (
    <div
      className="etiqueta-core"
      style={{
        width: `${dim.widthMm}mm`,
        height: `${dim.heightMm}mm`,
        background: "#ffffff",
        position: "relative",
        overflow: "hidden",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        boxSizing: "border-box",
        boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica Neue', sans-serif",
      }}
    >
      {/* Header bar – CORE color */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: `${dim.headerHeight}mm`,
          background: "#1e3a5f",
          display: "flex",
          alignItems: "center",
          paddingLeft: "2mm",
          paddingRight: "2mm",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            color: "#ffffff",
            fontSize: `${dim.setorFontSize * 0.85}px`,
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
          }}
        >
          CORE LogiTrack
        </span>
        {is100x40h && (
          <span
            style={{
              color: "#7eb8f7",
              fontSize: `${dim.setorFontSize * 0.75}px`,
              fontWeight: 500,
              letterSpacing: "0.5px",
            }}
          >
            WMS
          </span>
        )}
      </div>

      {/* Barcode */}
      <div
        style={{
          position: "absolute",
          top: `${dim.headerHeight}mm`,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: `${barcodeAreaH}px`,
          paddingLeft: "3mm",
          paddingRight: "3mm",
          paddingTop: "1mm",
        }}
      >
        <BarcodesvG
          text={endereco.codigo}
          width={wPx - 6 * MM}
          height={barcodeAreaH - 4}
        />
      </div>

      {/* Código textual */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: `${(dim.setorFontSize + bottomPad + (is100x40h ? 14 : 0))}px`,
          textAlign: "center",
          fontSize: `${dim.codeFontSize}px`,
          fontWeight: 800,
          letterSpacing: "1px",
          color: "#000000",
          textTransform: "uppercase",
          lineHeight: 1.1,
        }}
      >
        {endereco.codigo}
      </div>

      {/* Setor */}
      {is100x40h && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: `${bottomPad + 2}px`,
            textAlign: "center",
            fontSize: `${dim.setorFontSize}px`,
            fontWeight: 600,
            letterSpacing: "1px",
            color: "#444444",
            textTransform: "uppercase",
          }}
        >
          SETOR: {endereco.setor}
        </div>
      )}

      {/* Future fields (disabled) – placeholder structure */}
      {/* QR Code, Curva, Tipo – reserved for future activation */}
    </div>
  );
}

export function EtiquetaEnderecoPreview({
  enderecos,
  tamanho,
  orientacao,
  isPrint = false,
}: EtiquetaEnderecoPreviewProps) {
  const dim = getDimensoes(tamanho, orientacao);

  return (
    <>
      {enderecos.map((end, idx) => (
        <div
          key={end.id}
          style={{
            pageBreakAfter: "always",
            breakAfter: "page",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            padding: isPrint ? "0" : "0",
            marginBottom: isPrint ? "0" : idx < enderecos.length - 1 ? "24px" : "0",
          }}
        >
          <EtiquetaSingle endereco={end} dim={dim} isPrint={isPrint} />
        </div>
      ))}
    </>
  );
}
