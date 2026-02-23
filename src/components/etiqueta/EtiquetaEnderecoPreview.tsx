import React from "react";
import { generateCode128, getTotalWidth } from "./generateCode128";
// Accepts both mock Endereco and real DB rows
interface EnderecoLike {
  id: string | number;
  codigo?: string;
  descricao?: string;
  setor?: string;
  setor_id?: string;
}

export type TamanhoEtiqueta = "100x40" | "50x20";
export type OrientacaoEtiqueta = "horizontal" | "vertical";

interface EtiquetaEnderecoPreviewProps {
  enderecos: EnderecoLike[];
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
  const quietZone = 8;
  const scale = (width - quietZone * 2) / totalBarWidth;

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
            x={quietZone + bar.x * scale}
            y={0}
            width={Math.max(bar.width * scale, 0.8)}
            height={height}
            fill="#000000"
          />
        ))}
    </svg>
  );
}

// ─── Barcode rotacionado 90° (vertical) ────────────────────────────────────
// svgW = comprimento do barcode (ao longo do eixo Y da etiqueta vertical, ou seja, a altura)
// svgH = largura/altura das barras (ao longo do eixo X, ou seja, a largura da etiqueta)
// Após rotate(90deg) no DOM: container ocupa width=svgH, height=svgW
function BarcodeV({ text, svgW, svgH }: { text: string; svgW: number; svgH: number }) {
  const bars = generateCode128(text);
  const totalBarWidth = getTotalWidth(bars);
  const quietZone = 8;
  const scale = (svgW - quietZone * 2) / totalBarWidth;

  return (
    <div
      style={{
        width: `${svgH}px`,
        height: `${svgW}px`,
        position: "relative",
        flexShrink: 0,
      }}
    >
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{
          display: "block",
          position: "absolute",
          top: 0,
          left: 0,
          transformOrigin: "0 0",
          // Rotaciona 90° e ajusta posição para ficar dentro do container
          transform: `rotate(90deg) translateX(0px) translateY(-${svgH}px)`,
        }}
      >
        {bars
          .filter((b) => b.isBar)
          .map((bar, i) => (
            <rect
              key={i}
              x={quietZone + bar.x * scale}
              y={0}
              width={Math.max(bar.width * scale, 0.8)}
              height={svgH}
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
    return { widthMm: 40, heightMm: 100, isVertical: true, is100x40: true, headerHeightMm: 8, codeFontSize: 22, setorFontSize: 11 };
  }
  if (!is100x40 && !isVertical) {
    return { widthMm: 50, heightMm: 20, isVertical: false, is100x40: false, headerHeightMm: 5, codeFontSize: 13, setorFontSize: 8 };
  }
  // 50x20 vertical → 20mm × 50mm
  return { widthMm: 20, heightMm: 50, isVertical: true, is100x40: false, headerHeightMm: 6, codeFontSize: 13, setorFontSize: 8 };
}

// ─── Layout Horizontal ──────────────────────────────────────────────────────
function EtiquetaHorizontal({ endereco, dim, isPrint }: { endereco: EnderecoLike; dim: EtiquetaDimensoes; isPrint: boolean }) {
  const label = endereco.codigo || endereco.descricao || "";
  const setor = endereco.setor || endereco.setor_id || "";
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
        <BarcodeH text={label} width={wPx - 6 * MM} height={barAreaH - 2} />
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
        {label}
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
          SETOR: {setor}
        </div>
      )}
    </div>
  );
}

// ─── Layout Vertical ────────────────────────────────────────────────────────
// Etiqueta física: widthMm (ex: 40mm) × heightMm (ex: 100mm)
// Layout: header topo → barcode rotacionado 90° centralizado → texto vertical
function EtiquetaVertical({ endereco, dim, isPrint }: { endereco: EnderecoLike; dim: EtiquetaDimensoes; isPrint: boolean }) {
  const label = endereco.codigo || endereco.descricao || "";
  const setor = endereco.setor || endereco.setor_id || "";
  const wPx = dim.widthMm * MM;   // ex: 40mm → ~151px
  const hPx = dim.heightMm * MM;  // ex: 100mm → ~378px
  const headerPx = dim.headerHeightMm * MM;

  // Margens internas laterais do barcode (quiet zone + padding)
  const marginSidePx = 5 * MM; // 5mm cada lado
  // O barcode vai ao longo da altura (Y), usando a largura disponível como altura das barras
  const barHeight = wPx - marginSidePx * 2; // altura das barras = largura disponível da etiqueta
  // O comprimento do barcode (ao longo do Y) = 65% da área útil
  const bodyH = hPx - headerPx;
  const barcodeLength = bodyH * 0.65;

  // Área de texto = resto
  const textAreaH = bodyH - barcodeLength;

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

      {/* Barcode rotacionado 90° — ocupa barcodeLength de altura no layout */}
      {/* BarcodeV: svgW = comprimento do barcode, svgH = altura das barras */}
      {/* O container real no DOM: width=svgH (=barHeight), height=svgW (=barcodeLength) */}
      <div style={{
        flex: "0 0 auto",
        height: `${barcodeLength}px`,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "2mm",
        paddingBottom: "1mm",
      }}>
        <BarcodeV
          text={label}
          svgW={barcodeLength - 3 * MM}
          svgH={barHeight}
        />
      </div>

      {/* Área de texto: código e setor na vertical */}
      <div style={{
        flex: 1,
        height: `${textAreaH}px`,
        width: "100%",
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: "2mm",
        gap: "2mm",
      }}>
        {/* Código na vertical: writing-mode vertical, rotacionado para ler de baixo pra cima */}
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
          whiteSpace: "nowrap",
        }}>
          {label}
        </div>

        {dim.is100x40 && (
          <div style={{
            writingMode: "vertical-rl" as const,
            textOrientation: "mixed" as const,
            transform: "rotate(180deg)",
            fontSize: `${dim.setorFontSize * 0.85}px`,
            fontWeight: 600,
            letterSpacing: "1px",
            color: "#666666",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}>
            {setor}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────
function EtiquetaSingle({ endereco, dim, isPrint }: { endereco: EnderecoLike; dim: EtiquetaDimensoes; isPrint: boolean }) {
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
