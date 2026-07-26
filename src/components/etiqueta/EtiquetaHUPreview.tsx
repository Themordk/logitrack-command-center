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

function EtiquetaHUSingle({ hu, isPrint, config }: { hu: HULike; isPrint: boolean; config?: EtiquetaTemplateOverride }) {
  const label = hu.codigo_hu || "";
  const spec = config ? getTemplateFromConfig(config) : null;
  const WPX = spec?.widthPx ?? DEFAULT_W;
  const HPX = spec?.heightPx ?? DEFAULT_H;
  const showHeader = config ? config.com_cabecalho !== false : true;
  const showLogo = config ? config.com_logo && !!config.logo_url : false;
  const scale = config?.escala_fonte ?? 1;
  const fs = (n: number) => Math.max(7, n * scale);

  const isCompact = HPX <= 400;

  // Build a set of active field keys from template (if any)
  const activeKeys = config
    ? new Set((config.campos || []).filter((c) => c.ativo).map((c) => c.chave))
    : null;
  const isFieldActive = (key: string) => (activeKeys ? activeKeys.has(key) : true);

  const showParceiro = !isCompact && isFieldActive("parceiro_nome") && hasValue(hu.parceiro_nome);
  const showMov = !isCompact && isFieldActive("numero_movimento") && hasValue(hu.numero_movimento);
  const showNF = !isCompact && isFieldActive("numero_nota") && hasValue(hu.numero_nota);
  const showData = !isCompact && isFieldActive("data_entrada") && hasValue(hu.data_entrada);
  const hasContextZone = showParceiro || showMov || showNF || showData;

  const showTipo = isFieldActive("tipo_hu") && (hasValue(hu.tipo_hu) || hasValue(hu.tamanho));
  const showLote = !isCompact && isFieldActive("lote_principal") && hasValue(hu.lote_principal);
  const showValidade = !isCompact && isFieldActive("validade_proxima") && hasValue(hu.validade_proxima);
  const showQtd = !isCompact && (isFieldActive("total_quantidade") || isFieldActive("total_itens")) && hasValue(hu.total_quantidade);
  const showPeso = !isCompact && isFieldActive("peso_bruto") && hasValue(hu.peso_bruto);

  const barcodeHeight = hasContextZone ? 70 : (isCompact ? 90 : 120);

  const cellStyle: React.CSSProperties = {
    display: "flex", flexDirection: "column", alignItems: "flex-start",
    padding: "0 8px", flex: 1, minWidth: 0,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: `${fs(8)}px`, fontWeight: 700, color: "#555555",
    letterSpacing: "1px", textTransform: "uppercase", lineHeight: 1.1,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: `${fs(11)}px`, fontWeight: 800, color: "#000000",
    lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%",
  };

  return (
    <div className="etiqueta-thermal" style={{
      width: `${WPX}px`, height: `${HPX}px`, background: "#FFFFFF",
      overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid", boxSizing: "border-box",
      boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
      fontFamily: "'Arial', 'Helvetica', sans-serif", display: "flex", flexDirection: "column",
    }}>
      {/* Zona 1 — Cabeçalho */}
      {showHeader && (
        <div style={{
          height: isCompact ? "40px" : "48px", background: "#FFFFFF",
          borderBottom: "3px solid #000000", display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 14px", flexShrink: 0,
        }}>
          {showLogo && config?.logo_url ? (
            <img src={config.logo_url} alt="Logo" style={{ maxHeight: 34, maxWidth: 140, objectFit: "contain" }} />
          ) : (
            <span style={{ color: "#000000", fontSize: `${fs(13)}px`, fontWeight: 900, letterSpacing: "2px", textTransform: "uppercase" }}>
              {config ? "" : "CORE LOGITRACK"}
            </span>
          )}
          <span style={{ color: "#000000", fontSize: `${fs(12)}px`, fontWeight: 900, letterSpacing: "1px" }}>HU</span>
        </div>
      )}

      {/* Zona 2 — Contexto (fornecedor + refs) */}
      {hasContextZone && (
        <div style={{
          padding: "6px 14px", borderBottom: "1px dashed #999999",
          background: "#FFFFFF", flexShrink: 0,
        }}>
          {showParceiro && (
            <div style={{ marginBottom: showMov || showNF || showData ? 4 : 0 }}>
              <div style={labelStyle}>Fornecedor</div>
              <div style={{ ...valueStyle, fontSize: `${fs(13)}px` }}>{hu.parceiro_nome}</div>
            </div>
          )}
          {(showMov || showNF || showData) && (
            <div style={{ display: "flex", gap: 6, marginLeft: -8 }}>
              {showMov && (
                <div style={cellStyle}>
                  <div style={labelStyle}>Mov</div>
                  <div style={valueStyle}>{hu.numero_movimento}</div>
                </div>
              )}
              {showNF && (
                <div style={cellStyle}>
                  <div style={labelStyle}>NF</div>
                  <div style={valueStyle}>{hu.numero_nota}</div>
                </div>
              )}
              {showData && (
                <div style={cellStyle}>
                  <div style={labelStyle}>Entrada</div>
                  <div style={valueStyle}>{hu.data_entrada}</div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Zona 3 — Barcode + código legível (SEMPRE) */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: "6px 12px", background: "#FFFFFF", minHeight: 0,
      }}>
        {label ? (
          <>
            <BarcodeHU value={label} barHeight={barcodeHeight} />
            <div style={{
              marginTop: 4, fontSize: `${fs(18)}px`, fontWeight: 900,
              letterSpacing: "2px", color: "#000000", textTransform: "uppercase",
              textAlign: "center",
            }}>
              {label}
            </div>
          </>
        ) : (
          <span style={{ color: "#CC0000", fontSize: `${fs(10)}px` }}>Código HU ausente</span>
        )}
      </div>

      {/* Zona 4 — Rodapé */}
      <div style={{
        borderTop: "1px solid #000000", background: "#FFFFFF",
        padding: "4px 8px", flexShrink: 0,
        display: "flex", flexWrap: "wrap", rowGap: 2,
      }}>
        {showTipo && (
          <div style={cellStyle}>
            <div style={labelStyle}>Tipo</div>
            <div style={valueStyle}>
              {[hu.tipo_hu, hu.tamanho].filter(Boolean).join(" ")}
            </div>
          </div>
        )}
        {showLote && (
          <div style={cellStyle}>
            <div style={labelStyle}>Lote</div>
            <div style={valueStyle}>{hu.lote_principal}</div>
          </div>
        )}
        {showValidade && (
          <div style={cellStyle}>
            <div style={labelStyle}>Validade</div>
            <div style={valueStyle}>{hu.validade_proxima}</div>
          </div>
        )}
        {showQtd && (
          <div style={cellStyle}>
            <div style={labelStyle}>Qtd</div>
            <div style={valueStyle}>
              {hu.total_itens ? `${hu.total_itens} SKU · ` : ""}{hu.total_quantidade} un
            </div>
          </div>
        )}
        {showPeso && (
          <div style={cellStyle}>
            <div style={labelStyle}>Peso</div>
            <div style={valueStyle}>{hu.peso_bruto} kg</div>
          </div>
        )}
      </div>
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
