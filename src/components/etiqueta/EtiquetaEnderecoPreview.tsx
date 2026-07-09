/**
 * Etiqueta Endereço Preview – Thermal Optimized
 * Fixed pixel dimensions for Elgin L42PRO 203 DPI
 * No responsive scaling, no CSS transforms on barcodes
 */
import React from "react";
import { BarcodeRenderer, BarcodeRendererVertical } from "./BarcodeRenderer";
import { QRCodeRenderer } from "./QRCodeRenderer";
import { type TemplateSpec, type LabelData, validateLabel, getTemplateFromSelection } from "./thermalEngine";

interface EnderecoLike {
  id: string | number;
  codigo?: string;
  descricao?: string;
  codigo_endereco?: number | string | null;
  setor?: string;
  setor_id?: string;
  tipo_endereco?: string;
  curva_acesso?: string;
  nivel?: number | string | null;
  apto?: number | string | null;
}

export type TamanhoEtiqueta = "100x40" | "50x20" | "80x20";
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

function getLabelData(endereco: EnderecoLike): LabelData {
  return {
    barcodeValue: String(endereco.codigo_endereco || ""),
    displayText: endereco.descricao || String(endereco.codigo_endereco || ""),
    tipoEndereco: endereco.tipo_endereco,
    curvaAcesso: endereco.curva_acesso,
    nivel: endereco.nivel != null ? String(endereco.nivel) : undefined,
    apto: endereco.apto != null ? String(endereco.apto) : undefined,
  };
}

function formatNivel(v?: string) {
  if (!v) return "";
  const n = String(v).replace(/^N/i, "");
  return `N${n.length < 2 ? n.padStart(2, "0") : n}`;
}
function formatApto(v?: string) {
  if (!v) return "";
  const n = String(v).replace(/^P/i, "");
  return `P${n.length < 2 ? n.padStart(2, "0") : n}`;
}

// ─── BIN Template (80x20 horizontal) ───
function TemplateBIN({
  data, template, isPrint,
}: {
  data: LabelData; template: TemplateSpec; isPrint: boolean;
}) {
  const { widthPx, heightPx, barcode, quietZone } = template;
  const validation = validateLabel(data, template);
  const nivel = formatNivel(data.nivel);
  const apto = formatApto(data.apto);

  // Auto-fit font: shrink as text gets longer
  const nivelFont = nivel.length <= 3 ? 68 : nivel.length <= 4 ? 56 : 44;
  const aptoFont = apto.length <= 4 ? 56 : apto.length <= 5 ? 46 : 36;

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        background: "#FFFFFF",
        overflow: "hidden",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        boxSizing: "border-box",
        boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: "flex",
        flexDirection: "row",
        alignItems: "stretch",
      }}
    >
      {/* Barcode – ~65% */}
      <div
        style={{
          flex: "0 0 65%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `${quietZone.vertical}px ${quietZone.horizontal}px`,
          background: "#FFFFFF",
        }}
      >
        {validation.valid ? (
          <BarcodeRenderer
            value={data.barcodeValue}
            moduleWidth={barcode.moduleWidth}
            height={barcode.height}
            margin={barcode.margin}
            maxWidth={Math.floor(widthPx * 0.65) - quietZone.horizontal * 2}
          />
        ) : (
          <div style={{ color: "#CC0000", fontSize: "9px", textAlign: "center" }}>
            {validation.errors.join(" | ")}
          </div>
        )}
      </div>

      {/* Nivel + Apto – ~35% */}
      <div
        style={{
          flex: "0 0 35%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          padding: "4px 8px",
          background: "#FFFFFF",
          borderLeft: "2px solid #000000",
        }}
      >
        <div
          style={{
            fontSize: `${nivelFont}px`,
            fontWeight: 900,
            color: "#000000",
            lineHeight: 1,
            letterSpacing: "1px",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {nivel || "—"}
        </div>
        <div
          style={{
            fontSize: `${aptoFont}px`,
            fontWeight: 900,
            color: "#000000",
            lineHeight: 1,
            letterSpacing: "0.5px",
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {apto || "—"}
        </div>
      </div>
    </div>
  );
}

// ─── Horizontal Template ───
function TemplateHorizontal({
  data, template, isPrint, options,
}: {
  data: LabelData; template: TemplateSpec; isPrint: boolean; options: EtiquetaOptions;
}) {
  const { widthPx, heightPx, barcode, qrCode, quietZone } = template;
  const is100x40 = widthPx === 800;
  const hasQR = options.incluirQRCode && is100x40;
  const hasExtra = is100x40 && (options.incluirCurvaAcesso || options.incluirTipoEndereco);

  const headerH = is100x40 ? 56 : 40;
  const textH = is100x40 ? 36 : 24;
  const extraH = hasExtra ? 24 : 0;
  const codeTextH = is100x40 ? 24 : 0;
  const barcodeAreaH = heightPx - headerH - textH - extraH - codeTextH;

  const barcodeMaxW = widthPx - quietZone.horizontal * 2 - (hasQR ? qrCode.size + 16 : 0);

  const validation = validateLabel(data, template);

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        background: "#FFFFFF",
        overflow: "hidden",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        boxSizing: "border-box",
        boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      {/* Header – white bg for thermal */}
      <div
        style={{
          height: `${headerH}px`,
          background: "#FFFFFF",
          borderBottom: "3px solid #000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: `${quietZone.horizontal}px`,
          paddingRight: `${quietZone.horizontal}px`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#000000",
            fontSize: is100x40 ? "14px" : "10px",
            fontWeight: 900,
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}
        >
          CORE LOGITRACK
        </span>
        <span
          style={{
            color: "#000000",
            fontSize: is100x40 ? "11px" : "8px",
            fontWeight: 700,
          }}
        >
          WMS
        </span>
      </div>

      {/* Barcode area with quiet zone */}
      <div
        style={{
          height: `${barcodeAreaH}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingLeft: `${quietZone.horizontal}px`,
          paddingRight: `${quietZone.horizontal}px`,
          paddingTop: `${quietZone.vertical}px`,
          paddingBottom: `${quietZone.vertical}px`,
          gap: hasQR ? "16px" : "0",
          background: "#FFFFFF",
          flexShrink: 0,
        }}
      >
        {validation.valid ? (
          <>
            <BarcodeRenderer
              value={data.barcodeValue}
              moduleWidth={barcode.moduleWidth}
              height={barcode.height}
              margin={barcode.margin}
              maxWidth={barcodeMaxW}
            />
            {hasQR && (
              <QRCodeRenderer
                value={data.barcodeValue}
                size={qrCode.size}
                margin={qrCode.margin}
              />
            )}
          </>
        ) : (
          <div style={{ color: "#CC0000", fontSize: "10px", textAlign: "center" }}>
            {validation.errors.join(" | ")}
          </div>
        )}
      </div>

      {/* Display text (descricao) */}
      <div
        style={{
          height: `${textH}px`,
          textAlign: "center",
          fontSize: is100x40 ? "22px" : "14px",
          fontWeight: 900,
          letterSpacing: "2px",
          color: "#000000",
          textTransform: "uppercase",
          lineHeight: `${textH}px`,
          flexShrink: 0,
          background: "#FFFFFF",
        }}
      >
        {data.displayText}
      </div>

      {/* Extra info */}
      {hasExtra && (
        <div
          style={{
            height: `${extraH}px`,
            display: "flex",
            justifyContent: "center",
            gap: "24px",
            alignItems: "center",
            fontSize: "11px",
            fontWeight: 700,
            color: "#000000",
            background: "#FFFFFF",
            flexShrink: 0,
          }}
        >
          {options.incluirTipoEndereco && data.tipoEndereco && (
            <span>{data.tipoEndereco === "PULMAO" ? "PULMÃO" : "PICKING"}</span>
          )}
          {options.incluirCurvaAcesso && data.curvaAcesso && (
            <span>CURVA: {data.curvaAcesso}</span>
          )}
        </div>
      )}

      {/* Barcode value text */}
      {is100x40 && (
        <div
          style={{
            height: `${codeTextH}px`,
            textAlign: "center",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "1px",
            color: "#000000",
            lineHeight: `${codeTextH}px`,
            flexShrink: 0,
            background: "#FFFFFF",
          }}
        >
          CÓD: {data.barcodeValue}
        </div>
      )}
    </div>
  );
}

// ─── Vertical Template ───
function TemplateVertical({
  data, template, isPrint, options,
}: {
  data: LabelData; template: TemplateSpec; isPrint: boolean; options: EtiquetaOptions;
}) {
  const { widthPx, heightPx, barcode, quietZone } = template;
  const is100x40 = heightPx === 800;
  const headerH = is100x40 ? 48 : 32;

  const validation = validateLabel(data, template);

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${widthPx}px`,
        height: `${heightPx}px`,
        background: "#FFFFFF",
        overflow: "hidden",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        boxSizing: "border-box",
        boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* Header */}
      <div
        style={{
          width: "100%",
          height: `${headerH}px`,
          background: "#FFFFFF",
          borderBottom: "3px solid #000000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: "#000000",
            fontSize: is100x40 ? "12px" : "8px",
            fontWeight: 900,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
          }}
        >
          CORE
        </span>
      </div>

      {/* Barcode rotated */}
      <div
        style={{
          flex: 1,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: `${quietZone.vertical}px ${quietZone.horizontal}px`,
          background: "#FFFFFF",
        }}
      >
        {validation.valid ? (
          <BarcodeRendererVertical
            value={data.barcodeValue}
            moduleWidth={barcode.moduleWidth}
            height={barcode.height}
            margin={barcode.margin}
          />
        ) : (
          <div style={{ color: "#CC0000", fontSize: "8px", textAlign: "center" }}>
            ERR
          </div>
        )}
      </div>

      {/* Text area */}
      <div
        style={{
          width: "100%",
          padding: `${quietZone.vertical}px ${quietZone.horizontal}px`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          flexShrink: 0,
          background: "#FFFFFF",
        }}
      >
        <div
          style={{
            fontSize: is100x40 ? "18px" : "11px",
            fontWeight: 900,
            letterSpacing: "2px",
            color: "#000000",
            textTransform: "uppercase",
            textAlign: "center",
            lineHeight: 1.2,
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            transform: "rotate(180deg)",
            maxHeight: is100x40 ? "200px" : "100px",
            whiteSpace: "nowrap",
          }}
        >
          {data.displayText}
        </div>
        {is100x40 && (
          <div
            style={{
              fontSize: "10px",
              fontWeight: 700,
              color: "#000000",
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              transform: "rotate(180deg)",
              whiteSpace: "nowrap",
            }}
          >
            {data.barcodeValue}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Dispatcher ───
function EtiquetaSingle({
  endereco, template, isPrint, options,
}: {
  endereco: EnderecoLike; template: TemplateSpec; isPrint: boolean; options: EtiquetaOptions;
}) {
  const data = getLabelData(endereco);
  if (template.id === "BIN_80x20_H") {
    return <TemplateBIN data={data} template={template} isPrint={isPrint} />;
  }
  if (template.orientation === "vertical") {
    return <TemplateVertical data={data} template={template} isPrint={isPrint} options={options} />;
  }
  return <TemplateHorizontal data={data} template={template} isPrint={isPrint} options={options} />;
}

export function EtiquetaEnderecoPreview({
  enderecos, tamanho, orientacao, isPrint = false, options = {},
}: EtiquetaEnderecoPreviewProps) {
  const template = getTemplateFromSelection(tamanho, orientacao);

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
          <EtiquetaSingle
            endereco={end}
            template={template}
            isPrint={isPrint}
            options={options}
          />
        </div>
      ))}
    </>
  );
}
