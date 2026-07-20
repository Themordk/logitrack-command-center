import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { getTemplateFromConfig } from "./thermalEngine";
import type { CampoEtiqueta } from "@/hooks/useEtiquetaTemplate";

interface HULike {
  id: string | number;
  codigo_hu?: string;
  tipo_hu?: string;
  tamanho?: string;
}

export interface EtiquetaTemplateOverride {
  tamanho: string;
  orientacao: "horizontal" | "vertical";
  com_cabecalho: boolean;
  com_logo: boolean;
  logo_url: string | null;
  campos: CampoEtiqueta[];
}

interface EtiquetaHUPreviewProps {
  hus: HULike[];
  isPrint?: boolean;
  config?: EtiquetaTemplateOverride;
}

const DEFAULT_W = 800;
const DEFAULT_H = 320;

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

function EtiquetaHUSingle({
  hu,
  isPrint,
  config,
}: {
  hu: HULike;
  isPrint: boolean;
  config?: EtiquetaTemplateOverride;
}) {
  const label = hu.codigo_hu || "";
  const spec = config ? getTemplateFromConfig(config) : null;
  const WPX = spec?.widthPx ?? DEFAULT_W;
  const HPX = spec?.heightPx ?? DEFAULT_H;
  const showHeader = config ? config.com_cabecalho !== false : true;
  const showLogo = config ? config.com_logo && !!config.logo_url : false;

  const campos = config
    ? (config.campos || []).filter((c) => c.ativo).sort((a, b) => a.ordem - b.ordem)
    : null;

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${WPX}px`,
        height: `${HPX}px`,
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
      {showHeader && (
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
          {showLogo && config?.logo_url ? (
            <img src={config.logo_url} alt="Logo" style={{ maxHeight: 40, maxWidth: 140, objectFit: "contain" }} />
          ) : (
            <span style={{ color: "#000000", fontSize: "14px", fontWeight: 900, letterSpacing: "2px", textTransform: "uppercase" }}>
              {config ? "" : "CORE LOGITRACK"}
            </span>
          )}
          <span style={{ color: "#000000", fontSize: "11px", fontWeight: 700 }}>HU</span>
        </div>
      )}

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
        {campos
          ? campos
              .filter((c) => c.chave !== "codigo_hu")
              .map((c) => {
                const val =
                  c.chave === "tipo_hu" ? hu.tipo_hu :
                  c.chave === "tamanho" ? hu.tamanho :
                  (hu as any)[c.chave];
                if (val == null || val === "") return null;
                return (
                  <span key={c.chave}>
                    {(c.label || c.chave).toUpperCase()}: {String(val)}
                  </span>
                );
              })
          : (
              <>
                {hu.tamanho && <span>TAM: {hu.tamanho}</span>}
                {hu.tipo_hu && <span>TIPO: {hu.tipo_hu}</span>}
              </>
            )}
      </div>
    </div>
  );
}

export function EtiquetaHUPreview({ hus, isPrint = false, config }: EtiquetaHUPreviewProps) {
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
          <EtiquetaHUSingle hu={hu} isPrint={isPrint} config={config} />
        </div>
      ))}
    </>
  );
}
