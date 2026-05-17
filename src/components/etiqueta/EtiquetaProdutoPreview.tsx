/**
 * Etiqueta Produto Preview – Thermal Optimized
 * EAN13/Code128 product labels for Elgin L42PRO 203 DPI
 */
import { BarcodeRenderer, BarcodeRendererVertical } from "./BarcodeRenderer";
import { QRCodeRenderer } from "./QRCodeRenderer";
import { type TemplateSpec, type LabelData, validateLabel, getTemplateFromSelection } from "./thermalEngine";

export type TamanhoEtiqueta = "100x40" | "50x20";
export type OrientacaoEtiqueta = "horizontal" | "vertical";

export interface EtiquetaProdutoItem {
  produto_id: string;
  sku: string;
  descricao: string;
  marca?: string | null;
  embalagem_id?: string;
  ean: string;
  embalagem?: string;
  fator?: number | null;
  altura?: number | null;
  largura?: number | null;
  comprimento?: number | null;
  peso_bruto?: number | null;
  peso_liquido?: number | null;
  m3?: number | null;
}

export interface EtiquetaProdutoOptions {
  incluirQRCode?: boolean;
  incluirMarca?: boolean;
  incluirAltura?: boolean;
  incluirLargura?: boolean;
  incluirComprimento?: boolean;
  incluirPesoBruto?: boolean;
  incluirPesoLiquido?: boolean;
  incluirM3?: boolean;
}

interface PreviewProps {
  items: EtiquetaProdutoItem[];
  tamanho: TamanhoEtiqueta;
  orientacao: OrientacaoEtiqueta;
  isPrint?: boolean;
  options?: EtiquetaProdutoOptions;
}

function getLabelData(item: EtiquetaProdutoItem): LabelData {
  return { barcodeValue: String(item.ean || ""), displayText: item.descricao || "" };
}

function buildExtraLines(item: EtiquetaProdutoItem, opt: EtiquetaProdutoOptions): string[] {
  const lines: string[] = [];
  if (opt.incluirMarca && item.marca) lines.push(`MARCA: ${item.marca}`);
  const dims: string[] = [];
  if (opt.incluirAltura && item.altura != null) dims.push(`A:${item.altura}`);
  if (opt.incluirLargura && item.largura != null) dims.push(`L:${item.largura}`);
  if (opt.incluirComprimento && item.comprimento != null) dims.push(`C:${item.comprimento}`);
  if (dims.length) lines.push(dims.join("  "));
  const pesos: string[] = [];
  if (opt.incluirPesoBruto && item.peso_bruto != null) pesos.push(`PB:${item.peso_bruto}`);
  if (opt.incluirPesoLiquido && item.peso_liquido != null) pesos.push(`PL:${item.peso_liquido}`);
  if (opt.incluirM3 && item.m3 != null) pesos.push(`M³:${item.m3}`);
  if (pesos.length) lines.push(pesos.join("  "));
  return lines;
}

function TemplateHorizontal({
  item, template, isPrint, options,
}: { item: EtiquetaProdutoItem; template: TemplateSpec; isPrint: boolean; options: EtiquetaProdutoOptions }) {
  const data = getLabelData(item);
  const { widthPx, heightPx, barcode, qrCode, quietZone } = template;
  const is100x40 = widthPx === 800;
  const hasQR = options.incluirQRCode && is100x40;
  const extraLines = is100x40 ? buildExtraLines(item, options) : [];

  const headerH = is100x40 ? 44 : 32;
  const descH = is100x40 ? 30 : 20;
  const defaultLineH = is100x40 ? 22 : 16;
  const extraLineH = 18;
  const extraTotalH = extraLines.length * extraLineH;
  const barcodeAreaH = heightPx - headerH - descH - defaultLineH - extraTotalH;
  const barcodeMaxW = widthPx - quietZone.horizontal * 2 - (hasQR ? qrCode.size + 16 : 0);
  const validation = validateLabel(data, template);

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${widthPx}px`, height: `${heightPx}px`, background: "#FFFFFF",
        overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid",
        boxSizing: "border-box", boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica', sans-serif", display: "flex", flexDirection: "column",
      }}
    >
      {/* Header */}
      <div style={{
        height: `${headerH}px`, background: "#FFFFFF", borderBottom: "2px solid #000000",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingLeft: `${quietZone.horizontal}px`, paddingRight: `${quietZone.horizontal}px`, flexShrink: 0,
      }}>
        <span style={{ color: "#000000", fontSize: is100x40 ? "13px" : "9px", fontWeight: 900, letterSpacing: "2px", textTransform: "uppercase" }}>
          CORE LOGITRACK
        </span>
        <span style={{ color: "#000000", fontSize: is100x40 ? "11px" : "8px", fontWeight: 700 }}>
          {item.sku}
        </span>
      </div>

      {/* Barcode area */}
      <div style={{
        height: `${barcodeAreaH}px`, display: "flex", alignItems: "center", justifyContent: "center",
        paddingLeft: `${quietZone.horizontal}px`, paddingRight: `${quietZone.horizontal}px`,
        paddingTop: `${quietZone.vertical}px`, paddingBottom: `${quietZone.vertical}px`,
        gap: hasQR ? "16px" : "0", background: "#FFFFFF", flexShrink: 0,
      }}>
        {validation.valid ? (
          <>
            <BarcodeRenderer
              value={data.barcodeValue}
              moduleWidth={barcode.moduleWidth}
              height={Math.max(40, barcodeAreaH - quietZone.vertical * 2 - 4)}
              margin={barcode.margin}
              maxWidth={barcodeMaxW}
            />
            {hasQR && <QRCodeRenderer value={data.barcodeValue} size={qrCode.size} margin={qrCode.margin} />}
          </>
        ) : (
          <div style={{ color: "#CC0000", fontSize: "10px", textAlign: "center" }}>
            {validation.errors.join(" | ")}
          </div>
        )}
      </div>

      {/* Descricao */}
      <div style={{
        height: `${descH}px`, textAlign: "center",
        fontSize: is100x40 ? "14px" : "10px", fontWeight: 800,
        color: "#000000", textTransform: "uppercase", lineHeight: `${descH}px`,
        flexShrink: 0, background: "#FFFFFF", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        paddingLeft: `${quietZone.horizontal}px`, paddingRight: `${quietZone.horizontal}px`,
      }}>
        {data.displayText}
      </div>

      {/* Default line: EAN + FATOR */}
      <div style={{
        height: `${defaultLineH}px`, textAlign: "center",
        fontSize: is100x40 ? "12px" : "9px", fontWeight: 700, color: "#000000",
        lineHeight: `${defaultLineH}px`, flexShrink: 0, background: "#FFFFFF",
      }}>
        EAN: {data.barcodeValue} {item.fator != null ? `· FATOR: ${item.fator}` : ""}
      </div>

      {/* Extra lines */}
      {extraLines.map((line, idx) => (
        <div key={idx} style={{
          height: `${extraLineH}px`, textAlign: "center",
          fontSize: "10px", fontWeight: 600, color: "#000000",
          lineHeight: `${extraLineH}px`, flexShrink: 0, background: "#FFFFFF",
        }}>
          {line}
        </div>
      ))}
    </div>
  );
}

function TemplateVertical({
  item, template, isPrint,
}: { item: EtiquetaProdutoItem; template: TemplateSpec; isPrint: boolean }) {
  const data = getLabelData(item);
  const { widthPx, heightPx, barcode, quietZone } = template;
  const is100x40 = heightPx === 800;
  const headerH = is100x40 ? 40 : 28;
  const validation = validateLabel(data, template);

  return (
    <div className="etiqueta-thermal" style={{
      width: `${widthPx}px`, height: `${heightPx}px`, background: "#FFFFFF",
      overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid", boxSizing: "border-box",
      boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
      fontFamily: "'Arial', 'Helvetica', sans-serif", display: "flex", flexDirection: "column", alignItems: "center",
    }}>
      <div style={{
        width: "100%", height: `${headerH}px`, background: "#FFFFFF",
        borderBottom: "2px solid #000000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <span style={{ color: "#000000", fontSize: is100x40 ? "11px" : "8px", fontWeight: 900, letterSpacing: "1px" }}>
          {item.sku}
        </span>
      </div>
      <div style={{
        flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
        padding: `${quietZone.vertical}px ${quietZone.horizontal}px`, background: "#FFFFFF",
      }}>
        {validation.valid ? (
          <BarcodeRendererVertical value={data.barcodeValue} moduleWidth={barcode.moduleWidth} height={barcode.height} margin={barcode.margin} />
        ) : (
          <div style={{ color: "#CC0000", fontSize: "8px" }}>ERR</div>
        )}
      </div>
      <div style={{
        width: "100%", padding: `4px ${quietZone.horizontal}px`,
        textAlign: "center", fontSize: is100x40 ? "10px" : "8px", fontWeight: 700,
        color: "#000000", background: "#FFFFFF", flexShrink: 0,
      }}>
        EAN: {data.barcodeValue}{item.fator != null ? ` · F:${item.fator}` : ""}
      </div>
    </div>
  );
}

export function EtiquetaProdutoPreview({
  items, tamanho, orientacao, isPrint = false, options = {},
}: PreviewProps) {
  const template = getTemplateFromSelection(tamanho, orientacao);
  return (
    <>
      {items.map((it, idx) => (
        <div
          key={`${it.embalagem_id || it.produto_id}-${idx}`}
          style={{
            pageBreakAfter: "always", breakAfter: "page",
            display: "flex", alignItems: "flex-start", justifyContent: "flex-start",
            marginBottom: isPrint ? "0" : idx < items.length - 1 ? "24px" : "0",
          }}
        >
          {template.orientation === "vertical" ? (
            <TemplateVertical item={it} template={template} isPrint={isPrint} />
          ) : (
            <TemplateHorizontal item={it} template={template} isPrint={isPrint} options={options} />
          )}
        </div>
      ))}
    </>
  );
}
