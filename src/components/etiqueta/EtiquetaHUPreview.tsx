/**
 * @deprecated Preview HTML legado. O ZPL do template é a única fonte de verdade;
 * use ZplPreview (Labelary) nos modais de impressão. Mantido apenas para
 * compatibilidade temporária e será removido.
 */
import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { getTemplateFromConfig } from "./thermalEngine";
import type { CampoEtiqueta } from "@/hooks/useEtiquetaTemplate";

export interface HULike {
  id: string | number;
  codigo_hu?: string;
  tipo_hu?: string;
  tamanho?: string;
  peso_bruto?: number;
  numero_movimento?: string;
  data_entrada?: string;
  parceiro_nome?: string;
  numero_nota?: string;
  lote_principal?: string;
  validade_proxima?: string;
  total_itens?: number;
  total_quantidade?: number;
}

export interface EtiquetaTemplateOverride {
  tamanho: string;
  orientacao: "horizontal" | "vertical";
  com_cabecalho: boolean;
  com_logo: boolean;
  logo_url: string | null;
  campos: CampoEtiqueta[];
  largura_mm?: number;
  altura_mm?: number;
  duas_colunas?: boolean;
  intervalo_colunas_mm?: number;
  escala_fonte?: number;
}

interface EtiquetaHUPreviewProps {
  hus: HULike[];
  isPrint?: boolean;
  config?: EtiquetaTemplateOverride;
}

const DEFAULT_W = 800;
const DEFAULT_H = 560;

function BarcodeHU({ value, barHeight }: { value: string; barHeight?: number }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: "CODE128", width: 3, height: barHeight ?? 120, margin: 8,
        displayValue: false, lineColor: "#000000", background: "#FFFFFF", flat: true,
      });
    } catch (e) { console.error("HU Barcode error:", e); }
  }, [value, barHeight]);
  return <svg ref={svgRef} style={{ display: "block" }} />;
}

function hasValue(v: any): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return v > 0;
  return true;
}

const BORDER = "1px solid #000000";
const BORDER_THICK = "2px solid #000000";

const cellBase: React.CSSProperties = {
  padding: "4px 10px",
  background: "#FFFFFF",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  minWidth: 0,
  overflow: "hidden",
};

const labelText = (size: number): React.CSSProperties => ({
  fontSize: `${size}px`,
  fontWeight: 700,
  color: "#555555",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  lineHeight: 1,
  whiteSpace: "nowrap",
});

const valueText = (size: number): React.CSSProperties => ({
  fontSize: `${size}px`,
  fontWeight: 900,
  color: "#000000",
  lineHeight: 1.2,
  overflow: "hidden",
  textOverflow: "ellipsis",
});

function EtiquetaHUSingle({ hu, isPrint, config }: { hu: HULike; isPrint: boolean; config?: EtiquetaTemplateOverride }) {
  const label = hu.codigo_hu || "";
  const spec = config ? getTemplateFromConfig(config) : null;
  const WPX = spec?.widthPx ?? DEFAULT_W;
  const HPX = spec?.heightPx ?? DEFAULT_H;
  const scale = config?.escala_fonte ?? 1;
  const fs = (n: number) => Math.max(7, Math.round(n * scale));

  const isCompact = HPX <= 400;

  const activeKeys = config
    ? new Set((config.campos || []).filter((c) => c.ativo).map((c) => c.chave))
    : null;
  const isActive = (key: string) => (activeKeys ? activeKeys.has(key) : true);

  const showParceiro = !isCompact && isActive("parceiro_nome") && hasValue(hu.parceiro_nome);
  const showMov = !isCompact && isActive("numero_movimento") && hasValue(hu.numero_movimento);
  const showNF = !isCompact && isActive("numero_nota") && hasValue(hu.numero_nota);
  const showData = !isCompact && isActive("data_entrada") && hasValue(hu.data_entrada);
  const showLote = !isCompact && isActive("lote_principal") && hasValue(hu.lote_principal);
  const showValidade = !isCompact && isActive("validade_proxima") && hasValue(hu.validade_proxima);
  const showQtd = !isCompact && (isActive("total_quantidade") || isActive("total_itens")) && hasValue(hu.total_quantidade);
  const showPeso = !isCompact && isActive("peso_bruto") && hasValue(hu.peso_bruto);
  const showTipo = isActive("tipo_hu") && (hasValue(hu.tipo_hu) || hasValue(hu.tamanho));

  const hasRow3 = showValidade || showQtd;
  const hasRow4 = showParceiro || showMov || showData;
  const hasRow5 = showLote || showNF;

  const barcodeH = isCompact ? 90 : (hasRow3 || hasRow4 || hasRow5 ? 70 : 110);

  const itens = (hu as any).itens;
  const firstItem = Array.isArray(itens) && itens.length > 0 ? itens[0] : null;
  const produtoDesc = firstItem?.descricao || "";
  const produtoSku = firstItem?.sku || "";
  const showProduto = !isCompact && hasValue(produtoDesc);

  return (
    <div className="etiqueta-thermal" style={{
      width: `${WPX}px`, height: `${HPX}px`, background: "#FFFFFF",
      overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid",
      boxSizing: "border-box", border: BORDER_THICK,
      fontFamily: "'Arial', 'Helvetica', sans-serif",
      display: "flex", flexDirection: "column",
      boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
    }}>

      {/* LINHA 1: Nº MOV + PALETE barcode */}
      <div style={{ display: "flex", borderBottom: BORDER, flexShrink: 0 }}>
        {showMov && (
          <div style={{ ...cellBase, borderRight: BORDER, width: "90px", flexShrink: 0 }}>
            <span style={labelText(fs(8))}>Nº MOV:</span>
            <span style={{ ...valueText(fs(22)), letterSpacing: "1px" }}>{hu.numero_movimento}</span>
          </div>
        )}
        <div style={{ ...cellBase, flex: 1, alignItems: "center", flexDirection: "row", gap: "8px", justifyContent: "flex-start" }}>
          <div style={{ flexShrink: 0 }}>
            <span style={labelText(fs(8))}>PALETE:</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
            <BarcodeHU value={label} barHeight={isCompact ? 36 : 42} />
          </div>
        </div>
      </div>

      {/* LINHA 2: PRODUTO */}
      {showProduto && (
        <div style={{ ...cellBase, borderBottom: BORDER, flexShrink: 0, minHeight: "44px" }}>
          <span style={labelText(fs(8))}>PRODUTO: {produtoSku}</span>
          <span style={{
            ...valueText(fs(16)),
            whiteSpace: "normal",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as any,
            overflow: "hidden",
            lineHeight: 1.15,
            marginTop: "2px",
          }}>{produtoDesc}</span>
        </div>
      )}

      {/* LINHA 3: VALIDADE + QUANTIDADE */}
      {hasRow3 && (
        <div style={{ display: "flex", borderBottom: BORDER, flexShrink: 0 }}>
          {showValidade && (
            <div style={{ ...cellBase, flex: 1, borderRight: showQtd ? BORDER : "none", padding: "5px 10px" }}>
              <span style={labelText(fs(8))}>DATA DE VALIDADE:</span>
              <span style={valueText(fs(18))}>{hu.validade_proxima}</span>
            </div>
          )}
          {showQtd && (
            <div style={{ ...cellBase, flex: 1, padding: "5px 10px" }}>
              <span style={labelText(fs(8))}>QUANTIDADE:</span>
              <span style={valueText(fs(18))}>
                {hu.total_quantidade}{hu.total_itens ? ` (${hu.total_itens} SKU)` : ""}
              </span>
            </div>
          )}
        </div>
      )}

      {/* LINHA 4: FORNECEDOR + CARGA + RECEBIMENTO */}
      {hasRow4 && (
        <div style={{ display: "flex", borderBottom: BORDER, flexShrink: 0 }}>
          {showParceiro && (
            <div style={{ ...cellBase, flex: 2, borderRight: (showMov || showData) ? BORDER : "none", padding: "5px 10px" }}>
              <span style={labelText(fs(8))}>FORNECEDOR:</span>
              <span style={{ ...valueText(fs(11)), whiteSpace: "nowrap" }}>{hu.parceiro_nome}</span>
            </div>
          )}
          {showMov && (
            <div style={{ ...cellBase, flex: 1, borderRight: showData ? BORDER : "none", padding: "5px 10px" }}>
              <span style={labelText(fs(8))}>CARGA:</span>
              <span style={valueText(fs(13))}>{hu.numero_movimento}</span>
            </div>
          )}
          {showData && (
            <div style={{ ...cellBase, flex: 1, padding: "5px 10px" }}>
              <span style={labelText(fs(8))}>RECEBIMENTO:</span>
              <span style={valueText(fs(13))}>{hu.data_entrada}</span>
            </div>
          )}
        </div>
      )}

      {/* LINHA 5: LOTE + NF */}
      {hasRow5 && (
        <div style={{ display: "flex", borderBottom: BORDER, flexShrink: 0 }}>
          {showLote && (
            <div style={{ ...cellBase, flex: 1, borderRight: showNF ? BORDER : "none", padding: "5px 10px" }}>
              <span style={labelText(fs(8))}>Nº LOTE:</span>
              <span style={valueText(fs(13))}>{hu.lote_principal}</span>
            </div>
          )}
          {showNF && (
            <div style={{ ...cellBase, flex: 1, padding: "5px 10px" }}>
              <span style={labelText(fs(8))}>Nº NOTA FISCAL:</span>
              <span style={valueText(fs(13))}>{hu.numero_nota}</span>
            </div>
          )}
        </div>
      )}

      {/* LINHA 6: BARCODE PRINCIPAL */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "4px 16px", background: "#FFFFFF",
        borderBottom: (showTipo || showPeso) ? BORDER : "none", minHeight: 0,
      }}>
        {label ? (
          <>
            <BarcodeHU value={label} barHeight={barcodeH} />
            <div style={{
              marginTop: 2, fontSize: `${fs(14)}px`, fontWeight: 900,
              letterSpacing: "2px", color: "#000000",
              textAlign: "center",
            }}>
              {label}
            </div>
          </>
        ) : (
          <span style={{ color: "#CC0000", fontSize: `${fs(10)}px` }}>Código HU ausente</span>
        )}
      </div>

      {/* LINHA 7: TIPO + PESO */}
      {(showTipo || showPeso) && (
        <div style={{ display: "flex", flexShrink: 0, background: "#FFFFFF", minHeight: "26px" }}>
          {showTipo && (
            <div style={{ ...cellBase, flex: 1, borderRight: showPeso ? BORDER : "none", padding: "3px 10px", flexDirection: "row", gap: "6px", alignItems: "center" }}>
              <span style={labelText(fs(8))}>TIPO:</span>
              <span style={valueText(fs(11))}>
                {[hu.tipo_hu, hu.tamanho].filter(Boolean).join(" ")}
              </span>
            </div>
          )}
          {showPeso && (
            <div style={{ ...cellBase, flex: 1, padding: "3px 10px", flexDirection: "row", gap: "6px", alignItems: "center" }}>
              <span style={labelText(fs(8))}>PESO:</span>
              <span style={valueText(fs(11))}>{hu.peso_bruto} kg</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function EtiquetaHUPreview({ hus, isPrint = false, config }: EtiquetaHUPreviewProps) {
  const duasColunas = !!config?.duas_colunas;
  const intervaloMm = config?.intervalo_colunas_mm ?? 3;
  const items = hus.map((hu) => <EtiquetaHUSingle key={hu.id} hu={hu} isPrint={isPrint} config={config} />);

  if (duasColunas) {
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < items.length; i += 2) {
      rows.push(
        <div key={`row-${i}`} className="etiqueta-row" style={{ display: "flex", flexDirection: "row", gap: `${intervaloMm}mm`, marginBottom: isPrint ? 0 : 16 }}>
          {items.slice(i, i + 2)}
        </div>
      );
    }
    return <>{rows}</>;
  }

  return (
    <>
      {items.map((el, idx) => (
        <div key={idx} style={{ pageBreakAfter: "always", breakAfter: "page", display: "flex", alignItems: "flex-start", justifyContent: "flex-start", marginBottom: isPrint ? "0" : idx < items.length - 1 ? "24px" : "0" }}>
          {el}
        </div>
      ))}
    </>
  );
}
