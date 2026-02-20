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

// ─── Barcode horizontal (normal) ───────────────────────────────────────────
function BarcodeH({ text, width, height }: { text: string; width: number; height: number }) {
  const bars = generateCode128(text);
  const totalBarWidth = getTotalWidth(bars);
  const scale = (width - 10) / totalBarWidth;

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

// ─── Barcode rotacionado 90° (vertical) ────────────────────────────────────
// bars são desenhados horizontalmente depois o SVG é girado via transform
function BarcodeV({ text, barcodeW, barcodeH }: { text: string; barcodeW: number; barcodeH: number }) {
  const bars = generateCode128(text);
  const totalBarWidth = getTotalWidth(bars);
  // barcodeW = comprimento do barcode (ao longo da etiqueta vertical)
  // barcodeH = altura das barras (através da largura da etiqueta)
  const scale = (barcodeW - 10) / totalBarWidth;

  return (
    // Container com tamanho final APÓS rotação
    <div
      style={{
        width: `${barcodeH}px`,
        height: `${barcodeW}px`,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <svg
        width={barcodeW}
        height={barcodeH}
        viewBox={`0 0 ${barcodeW} ${barcodeH}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: "block",
          transformOrigin: "top left",
          transform: `rotate(90deg) translateY(-${barcodeH}px)`,
          position: "absolute",
          top: 0,
          left: 0,
        }}
      >
        {bars
          .filter((b) => b.isBar)
          .map((bar, i) => (
            <rect
              key={i}
              x={5 + bar.x * scale}
              y={0}
              width={Math.max(bar.width * scale, 1)}
              height={barcodeH}
              fill="#000000"
            />
          ))}
      </svg>
    </div>
  );
}

// ─── Dimensões ──────────────────────────────────────────────────────────────
interface EtiquetaDimensoes {
  widthMm: number;
  heightMm: number;
  /** Modo de layout real (independente de tamanho) */
  isVertical: boolean;
  is100x40: boolean;
  headerHeightMm: number;
  codeFontSize: number;
  setorFontSize: number;
}

function getDimensoes(tamanho: TamanhoEtiqueta, orientacao: OrientacaoEtiqueta): EtiquetaDimensoes {
  const is100x40 = tamanho === "100x40";
  const isVertical = orientacao === "vertical";

  if (is100x40 && !isVertical) {
    return { widthMm: 100, heightMm: 40, isVertical: false, is100x40: true, headerHeightMm: 7, codeFontSize: 22, setorFontSize: 12 };
  }
  if (is100x40 && isVertical) {
    // etiqueta física 40mm × 100mm
    return { widthMm: 40, heightMm: 100, isVertical: true, is100x40: true, headerHeightMm: 8, codeFontSize: 22, setorFontSize: 11 };
  }
  if (!is100x40 && !isVertical) {
    return { widthMm: 50, heightMm: 20, isVertical: false, is100x40: false, headerHeightMm: 5, codeFontSize: 13, setorFontSize: 8 };
  }
  // 50x20 vertical → 20mm × 50mm
  return { widthMm: 20, heightMm: 50, isVertical: true, is100x40: false, headerHeightMm: 6, codeFontSize: 13, setorFontSize: 8 };
}

// ─── Layout Horizontal ──────────────────────────────────────────────────────
function EtiquetaHorizontal({ endereco, dim, isPrint }: { endereco: Endereco; dim: EtiquetaDimensoes; isPrint: boolean }) {
  const wPx = dim.widthMm * MM;
  const hPx = dim.heightMm * MM;
  const headerPx = dim.headerHeightMm * MM;
  const footerPx = dim.is100x40 ? (dim.setorFontSize + 18) : (dim.setorFontSize + 8);
  const barAreaH = hPx - headerPx - footerPx;

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
        boxShadow: isPrint ? "none" : "0 2px 14px rgba(0,0,0,0.20)",
        fontFamily: "'Arial Black', 'Arial', 'Helvetica Neue', sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header CORE */}
      <div style={{
        height: `${dim.headerHeightMm}mm`,
        background: "#0F2A44",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        paddingLeft: "3mm",
        paddingRight: "3mm",
        flexShrink: 0,
      }}>
        <span style={{ color: "#ffffff", fontSize: `${dim.setorFontSize * 0.85}px`, fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase" }}>
          CORE LOGITRACK
        </span>
        {dim.is100x40 && (
          <span style={{ color: "#7eb8f7", fontSize: `${dim.setorFontSize * 0.7}px`, fontWeight: 500, letterSpacing: "0.5px" }}>WMS</span>
        )}
      </div>

      {/* Barcode area */}
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
        <BarcodeH text={endereco.codigo} width={wPx - 6 * MM} height={barAreaH - 2} />
      </div>

      {/* Código textual */}
      <div style={{
        textAlign: "center",
        fontSize: `${dim.codeFontSize}px`,
        fontWeight: 900,
        letterSpacing: "1px",
        color: "#000000",
        textTransform: "uppercase",
        lineHeight: 1.1,
        paddingBottom: dim.is100x40 ? "1mm" : "0.5mm",
        flexShrink: 0,
      }}>
        {endereco.codigo}
      </div>

      {/* Setor (só 100x40) */}
      {dim.is100x40 && (
        <div style={{
          textAlign: "center",
          fontSize: `${dim.setorFontSize}px`,
          fontWeight: 600,
          letterSpacing: "1px",
          color: "#444444",
          textTransform: "uppercase",
          paddingBottom: "1.5mm",
          flexShrink: 0,
        }}>
          SETOR: {endereco.setor}
        </div>
      )}
    </div>
  );
}

// ─── Layout Vertical redesenhado ────────────────────────────────────────────
function EtiquetaVertical({ endereco, dim, isPrint }: { endereco: Endereco; dim: EtiquetaDimensoes; isPrint: boolean }) {
  const wPx = dim.widthMm * MM;   // largura física da etiqueta (ex: 40mm)
  const hPx = dim.heightMm * MM;  // altura física da etiqueta  (ex: 100mm)
  const headerPx = dim.headerHeightMm * MM;

  // Barcode: ocupa 65% da altura restante
  const bodyH = hPx - headerPx;
  const barcodeLen = bodyH * 0.65;     // comprimento do barcode ao longo da etiqueta
  const barcodeBarH = wPx - 10 * MM;  // altura das barras = largura da etiqueta - margens laterais

  // Espaço para o texto = resto
  const textAreaH = bodyH - barcodeLen;

  return (
    <div
      className="etiqueta-core"
      style={{
        width: `${dim.widthMm}mm`,
        height: `${dim.heightMm}mm`,
        background: "#ffffff",
        overflow: "hidden",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        boxSizing: "border-box",
        boxShadow: isPrint ? "none" : "0 2px 14px rgba(0,0,0,0.20)",
        fontFamily: "'Arial Black', 'Arial', 'Helvetica Neue', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Header CORE */}
      <div style={{
        width: "100%",
        height: `${dim.headerHeightMm}mm`,
        background: "#0F2A44",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{
          color: "#ffffff",
          fontSize: `${dim.setorFontSize * 0.8}px`,
          fontWeight: 700,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
        }}>
          CORE LOGITRACK
        </span>
      </div>

      {/* Barcode rotacionado 90° */}
      <div style={{
        flex: "0 0 auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: `${barcodeLen}px`,
        width: "100%",
        paddingTop: "2mm",
        paddingBottom: "1mm",
      }}>
        <BarcodeV
          text={endereco.codigo}
          barcodeW={barcodeLen - 4 * MM}
          barcodeH={barcodeBarH}
        />
      </div>

      {/* Código textual vertical + setor */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        paddingBottom: "2mm",
        gap: "1mm",
      }}>
        <div style={{
          writingMode: "vertical-rl" as const,
          textOrientation: "mixed" as const,
          transform: "rotate(180deg)",
          fontSize: `${dim.codeFontSize}px`,
          fontWeight: 900,
          letterSpacing: "2px",
          color: "#000000",
          textTransform: "uppercase",
          lineHeight: 1,
          textAlign: "center",
        }}>
          {endereco.codigo}
        </div>

        {dim.is100x40 && (
          <div style={{
            writingMode: "vertical-rl" as const,
            textOrientation: "mixed" as const,
            transform: "rotate(180deg)",
            fontSize: `${dim.setorFontSize * 0.85}px`,
            fontWeight: 600,
            letterSpacing: "1px",
            color: "#555555",
            textTransform: "uppercase",
          }}>
            {endereco.setor}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────
function EtiquetaSingle({ endereco, dim, isPrint }: { endereco: Endereco; dim: EtiquetaDimensoes; isPrint: boolean }) {
  if (dim.isVertical) {
    return <EtiquetaVertical endereco={endereco} dim={dim} isPrint={isPrint} />;
  }
  return <EtiquetaHorizontal endereco={endereco} dim={dim} isPrint={isPrint} />;
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
            marginBottom: isPrint ? "0" : idx < enderecos.length - 1 ? "24px" : "0",
          }}
        >
          <EtiquetaSingle endereco={end} dim={dim} isPrint={isPrint} />
        </div>
      ))}
    </>
  );
}

