/**
 * Etiqueta Endereço Preview – Thermal Optimized
 * Fixed pixel dimensions for Elgin L42PRO 203 DPI
 * No responsive scaling, no CSS transforms on barcodes
 */
/**
 * @deprecated Desde a Fase 1 da refatoração do fluxo de impressão (2026-07),
 * este componente foi substituído por preview WYSIWYG baseado em ZPL via Labelary.
 * Não usar em novo código. O arquivo é mantido apenas para consulta histórica
 * e possível rollback. Será removido em fase futura junto com thermalEngine.ts.
 */
import React from "react";
import { BarcodeRenderer } from "./BarcodeRenderer";
import { QRCodeRenderer } from "./QRCodeRenderer";
import {
  type TemplateSpec,
  type LabelData,
  validateLabel,
  getTemplateFromSelection,
  getTemplateFromConfig,
} from "./thermalEngine";
import { Calendar } from "lucide-react";

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
export type DirecaoSeta = "CIMA" | "BAIXO" | "ESQUERDA" | "DIREITA" | "NENHUMA";

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
  usuario?: string;
  dataHora?: string;
  direcaoSeta?: DirecaoSeta;
  /** Override vindo do gerenciador de templates. Se presente, sobrescreve tamanho/orientacao. */
  config?: {
    tamanho: string;
    orientacao: "horizontal" | "vertical";
    com_cabecalho: boolean;
    com_logo: boolean;
    logo_url: string | null;
    campos: import("@/hooks/useEtiquetaTemplate").CampoEtiqueta[];
    largura_mm?: number;
    altura_mm?: number;
    duas_colunas?: boolean;
    intervalo_colunas_mm?: number;
    direcao_seta?: DirecaoSeta;
    escala_fonte?: number;
  };
}

// ─── Seta SVG grossa, sólida, preta ───
function ArrowSVG({
  direction,
  size = 50,
}: {
  direction: "CIMA" | "BAIXO" | "ESQUERDA" | "DIREITA";
  size?: number;
}) {
  const rotation = { CIMA: 0, DIREITA: 90, BAIXO: 180, ESQUERDA: 270 }[direction];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ display: "block" }}>
      <g transform={`rotate(${rotation} 50 50)`}>
        <polygon
          points="50,5 90,55 65,55 65,95 35,95 35,55 10,55"
          fill="#000000"
          stroke="none"
        />
      </g>
    </svg>
  );
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

/** Extrai `apto` / `nivel` de `displayText` (formato RR-PPP-NNN-AAA) quando não vierem em `data`. */
function parseFromDisplay(displayText: string): { apto?: string; nivel?: string } {
  if (!displayText) return {};
  const parts = displayText.split(/[-.]/);
  if (parts.length < 4) return {};
  return {
    nivel: parts[2]?.replace(/^N/i, ""),
    apto: parts[3]?.replace(/^A/i, ""),
  };
}

// ─── BIN Template (80x20 horizontal) ───
function TemplateBIN({
  data,
  template,
  isPrint,
  usuario,
  dataHora,
  fs,
}: {
  data: LabelData;
  template: TemplateSpec;
  isPrint: boolean;
  usuario?: string;
  dataHora?: string;
  fs: (n: number) => number;
}) {
  const { widthPx, heightPx, barcode } = template;
  const validation = validateLabel(data, template);
  const nivel = formatNivel(data.nivel);
  const apto = formatApto(data.apto);
  const nivelFont = nivel.length <= 3 ? 44 : nivel.length <= 4 ? 38 : 30;
  const aptoFont = apto.length <= 4 ? 40 : apto.length <= 5 ? 32 : 26;

  const headerH = 36;
  const bodyH = heightPx - headerH;
  const leftW = Math.round(widthPx * 0.55);
  const rightW = widthPx - leftW;
  const usuarioNome = (usuario || "—").toUpperCase();
  const dataHoraStr = dataHora || "";

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${widthPx}px`, height: `${heightPx}px`, background: "#FFFFFF",
        overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid",
        boxSizing: "border-box", boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Segoe UI', 'Arial', 'Helvetica', sans-serif",
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ height: `${headerH}px`, background: "#000000", color: "#FFFFFF", display: "flex", alignItems: "center", padding: "0 10px", flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1, minWidth: "70px" }}>
          <span style={{ fontSize: `${fs(11)}px`, fontWeight: 800, letterSpacing: "1px" }}>CORE</span>
          <span style={{ fontSize: `${fs(8)}px`, fontWeight: 600, letterSpacing: "0.5px", opacity: 0.9 }}>LogiTrack</span>
        </div>
        <div style={{ flex: 1, textAlign: "center", fontSize: `${fs(13)}px`, fontWeight: 800, letterSpacing: "2px", textTransform: "uppercase" }}>
          LOCALIZAÇÃO BIN
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15, minWidth: "115px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: `${fs(9)}px`, fontWeight: 600 }}>
            <Calendar size={9} strokeWidth={2.5} color="#FFFFFF" />
            <span>{dataHoraStr}</span>
          </div>
          <div style={{ fontSize: `${fs(8)}px`, fontWeight: 600, marginTop: "2px" }}>
            Usuário: <span style={{ fontWeight: 800 }}>{usuarioNome}</span>
          </div>
        </div>
      </div>
      <div style={{ height: `${bodyH}px`, display: "flex", flexDirection: "row", background: "#FFFFFF" }}>
        <div style={{ width: `${leftW}px`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 8px", borderRight: "2px solid #000000", gap: "2px" }}>
          <div style={{ fontSize: `${fs(9)}px`, fontWeight: 700, letterSpacing: "1px", color: "#000000", textTransform: "uppercase", lineHeight: 1 }}>
            CÓDIGO DE ENDEREÇO
          </div>
          {validation.valid ? (
            <>
              <BarcodeRenderer value={data.barcodeValue} moduleWidth={barcode.moduleWidth} height={barcode.height} margin={barcode.margin} maxWidth={leftW - 16} />
              <div style={{ fontSize: `${fs(11)}px`, fontWeight: 700, letterSpacing: "1.5px", color: "#000000", lineHeight: 1, fontFamily: "'Consolas', 'Menlo', monospace" }}>
                {data.barcodeValue}
              </div>
            </>
          ) : (
            <div style={{ color: "#CC0000", fontSize: `${fs(9)}px`, textAlign: "center" }}>{validation.errors.join(" | ")}</div>
          )}
        </div>
        <div style={{ width: `${rightW}px`, display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 6px 0 8px", borderBottom: "2px solid #000000" }}>
            <span style={{ fontSize: `${fs(10)}px`, fontWeight: 700, letterSpacing: "1px", color: "#000000", minWidth: "36px" }}>NÍVEL</span>
            <span style={{ flex: 1, textAlign: "center", fontSize: `${fs(nivelFont)}px`, fontWeight: 900, color: "#000000", lineHeight: 1, letterSpacing: "1px", whiteSpace: "nowrap", overflow: "hidden" }}>
              {nivel || "—"}
            </span>
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 6px 0 8px" }}>
            <span style={{ fontSize: `${fs(10)}px`, fontWeight: 700, letterSpacing: "1px", color: "#000000", minWidth: "36px" }}>APTO</span>
            <span style={{ flex: 1, textAlign: "center", fontSize: `${fs(aptoFont)}px`, fontWeight: 900, color: "#000000", lineHeight: 1, letterSpacing: "0.5px", whiteSpace: "nowrap", overflow: "hidden" }}>
              {apto || "—"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Horizontal Template (com suporte a seta direcional) ───
function TemplateHorizontal({
  data,
  template,
  isPrint,
  options,
  direcaoSeta,
  logoUrl,
  showHeader,
  fs,
}: {
  data: LabelData;
  template: TemplateSpec;
  isPrint: boolean;
  options: EtiquetaOptions;
  direcaoSeta: DirecaoSeta;
  logoUrl?: string | null;
  showHeader: boolean;
  fs: (n: number) => number;
}) {
  const { widthPx, heightPx, barcode, qrCode, quietZone } = template;
  const is100x40 = widthPx === 800;
  const hasQR = options.incluirQRCode && is100x40;
  const hasExtra = is100x40 && (options.incluirCurvaAcesso || options.incluirTipoEndereco);
  const hasArrow = direcaoSeta && direcaoSeta !== "NENHUMA";

  const arrowColW = hasArrow ? Math.round(heightPx * 0.55) : 0;
  const contentW = widthPx - arrowColW;

  const headerH = showHeader ? (is100x40 ? 56 : 40) : 0;
  const textH = is100x40 ? 36 : 24;
  const extraH = hasExtra ? 24 : 0;
  const codeTextH = is100x40 ? 24 : 0;
  const barcodeAreaH = heightPx - headerH - textH - extraH - codeTextH;

  const barcodeMaxW = contentW - quietZone.horizontal * 2 - (hasQR ? qrCode.size + 16 : 0);
  const validation = validateLabel(data, template);

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${widthPx}px`, height: `${heightPx}px`, background: "#FFFFFF",
        overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid",
        boxSizing: "border-box", boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: "flex", flexDirection: "row", position: "relative",
      }}
    >
      <div style={{ width: `${contentW}px`, height: "100%", display: "flex", flexDirection: "column", borderRight: hasArrow ? "2px solid #000000" : "none" }}>
        {showHeader && (
          <div style={{ height: `${headerH}px`, background: "#FFFFFF", borderBottom: "3px solid #000000", display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: `${quietZone.horizontal}px`, paddingRight: `${quietZone.horizontal}px`, flexShrink: 0 }}>
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" style={{ maxHeight: headerH - 16, maxWidth: contentW * 0.5, objectFit: "contain" }} />
            ) : (
              <span style={{ color: "#000000", fontSize: `${fs(is100x40 ? 14 : 10)}px`, fontWeight: 900, letterSpacing: "2px", textTransform: "uppercase" }}>CORE LOGITRACK</span>
            )}
            <span style={{ color: "#000000", fontSize: `${fs(is100x40 ? 11 : 8)}px`, fontWeight: 700 }}>WMS</span>
          </div>
        )}
        <div style={{ height: `${barcodeAreaH}px`, display: "flex", alignItems: "center", justifyContent: "center", paddingLeft: `${quietZone.horizontal}px`, paddingRight: `${quietZone.horizontal}px`, paddingTop: `${quietZone.vertical}px`, paddingBottom: `${quietZone.vertical}px`, gap: hasQR ? "16px" : "0", background: "#FFFFFF", flexShrink: 0 }}>
          {validation.valid ? (
            <>
              <BarcodeRenderer value={data.barcodeValue} moduleWidth={barcode.moduleWidth} height={barcode.height} margin={barcode.margin} maxWidth={barcodeMaxW} />
              {hasQR && <QRCodeRenderer value={data.barcodeValue} size={qrCode.size} margin={qrCode.margin} />}
            </>
          ) : (
            <div style={{ color: "#CC0000", fontSize: `${fs(10)}px`, textAlign: "center" }}>{validation.errors.join(" | ")}</div>
          )}
        </div>
        <div style={{ height: `${textH}px`, textAlign: "center", fontSize: `${fs(is100x40 ? 22 : 14)}px`, fontWeight: 900, letterSpacing: "2px", color: "#000000", textTransform: "uppercase", lineHeight: `${textH}px`, flexShrink: 0, background: "#FFFFFF" }}>
          {data.displayText}
        </div>
        {hasExtra && (
          <div style={{ height: `${extraH}px`, display: "flex", justifyContent: "center", gap: "24px", alignItems: "center", fontSize: `${fs(11)}px`, fontWeight: 700, color: "#000000", background: "#FFFFFF", flexShrink: 0 }}>
            {options.incluirTipoEndereco && data.tipoEndereco && (
              <span>{data.tipoEndereco === "PULMAO" ? "PULMÃO" : "PICKING"}</span>
            )}
            {options.incluirCurvaAcesso && data.curvaAcesso && <span>CURVA: {data.curvaAcesso}</span>}
          </div>
        )}
        {is100x40 && (
          <div style={{ height: `${codeTextH}px`, textAlign: "center", fontSize: `${fs(12)}px`, fontWeight: 700, letterSpacing: "1px", color: "#000000", lineHeight: `${codeTextH}px`, flexShrink: 0, background: "#FFFFFF" }}>
            CÓD: {data.barcodeValue}
          </div>
        )}
      </div>
      {hasArrow && (
        <div style={{ width: `${arrowColW}px`, height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#FFFFFF" }}>
          <ArrowSVG direction={direcaoSeta as any} size={Math.min(arrowColW - 16, heightPx - 24)} />
        </div>
      )}
    </div>
  );
}

// ─── Vertical Template redesenhada (WMS standard) ───
function TemplateVertical({
  data,
  template,
  isPrint,
  direcaoSeta,
  logoUrl,
  showHeader,
  fs,
}: {
  data: LabelData;
  template: TemplateSpec;
  isPrint: boolean;
  direcaoSeta: DirecaoSeta;
  logoUrl?: string | null;
  showHeader: boolean;
  fs: (n: number) => number;
}) {
  const { widthPx, heightPx, barcode, quietZone } = template;
  const parsed = parseFromDisplay(data.displayText);
  const aptoRaw = data.apto ?? parsed.apto;
  const nivelRaw = data.nivel ?? parsed.nivel;
  const apto = aptoRaw ? String(aptoRaw).replace(/^A/i, "").padStart(2, "0") : "";
  const nivel = nivelRaw ? String(nivelRaw).replace(/^N/i, "").padStart(2, "0") : "";
  const validation = validateLabel(data, template);
  const hasArrow = direcaoSeta && direcaoSeta !== "NENHUMA";

  const hasNumbers = !!apto || !!nivel;
  const isLarge = heightPx >= 700;
  const aptoFs = isLarge ? 96 : 56;
  const nivelFs = isLarge ? 60 : 34;
  const arrowSz = isLarge ? 90 : 56;
  const codeFs = isLarge ? 20 : 14;
  const headerH = showHeader ? (isLarge ? 46 : 30) : 0;

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${widthPx}px`, height: `${heightPx}px`, background: "#FFFFFF",
        overflow: "hidden", pageBreakInside: "avoid", breakInside: "avoid",
        boxSizing: "border-box", boxShadow: isPrint ? "none" : "0 2px 12px rgba(0,0,0,0.18)",
        fontFamily: "'Arial', 'Helvetica', sans-serif",
        display: "flex", flexDirection: "column", alignItems: "stretch",
        padding: `${quietZone.vertical}px ${quietZone.horizontal}px`,
      }}
    >
      {showHeader && (
        <div style={{ height: `${headerH}px`, borderBottom: "2px solid #000000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginBottom: 4 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" style={{ maxHeight: headerH - 6, maxWidth: widthPx - 20, objectFit: "contain" }} />
          ) : (
            <span style={{ color: "#000000", fontSize: `${fs(isLarge ? 14 : 10)}px`, fontWeight: 900, letterSpacing: "1.5px", textTransform: "uppercase" }}>CORE</span>
          )}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-around", gap: 2 }}>
        {hasNumbers && (
          <>
            {apto && (
              <div style={{ fontSize: `${fs(aptoFs)}px`, fontWeight: 900, color: "#000000", lineHeight: 1, letterSpacing: 2 }}>
                {apto}
              </div>
            )}
            {nivel && (
              <div style={{ fontSize: `${fs(nivelFs)}px`, fontWeight: 800, color: "#000000", lineHeight: 1, letterSpacing: 1 }}>
                {nivel}
              </div>
            )}
          </>
        )}
        {hasArrow && <ArrowSVG direction={direcaoSeta as any} size={arrowSz} />}
        <div style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {validation.valid ? (
            <BarcodeRenderer
              value={data.barcodeValue}
              moduleWidth={barcode.moduleWidth}
              height={isLarge ? 80 : 44}
              margin={4}
              maxWidth={widthPx - quietZone.horizontal * 2 - 4}
            />
          ) : (
            <div style={{ color: "#CC0000", fontSize: `${fs(9)}px` }}>ERR</div>
          )}
        </div>
        <div style={{ fontSize: `${fs(codeFs)}px`, fontWeight: 800, color: "#000000", letterSpacing: 1, textAlign: "center", whiteSpace: "nowrap" }}>
          {data.displayText}
        </div>
      </div>
    </div>
  );
}

// ─── Dispatcher ───
function EtiquetaSingle({
  endereco,
  template,
  isPrint,
  options,
  usuario,
  dataHora,
  direcaoSeta,
  logoUrl,
  showHeader,
  fs,
}: {
  endereco: EnderecoLike;
  template: TemplateSpec;
  isPrint: boolean;
  options: EtiquetaOptions;
  usuario?: string;
  dataHora?: string;
  direcaoSeta: DirecaoSeta;
  logoUrl?: string | null;
  showHeader: boolean;
  fs: (n: number) => number;
}) {
  const data = getLabelData(endereco);
  if (template.id === "BIN_80x20_H") {
    return <TemplateBIN data={data} template={template} isPrint={isPrint} usuario={usuario} dataHora={dataHora} fs={fs} />;
  }
  if (template.orientation === "vertical") {
    return <TemplateVertical data={data} template={template} isPrint={isPrint} direcaoSeta={direcaoSeta} logoUrl={logoUrl} showHeader={showHeader} fs={fs} />;
  }
  return <TemplateHorizontal data={data} template={template} isPrint={isPrint} options={options} direcaoSeta={direcaoSeta} logoUrl={logoUrl} showHeader={showHeader} fs={fs} />;
}

export function EtiquetaEnderecoPreview({
  enderecos,
  tamanho,
  orientacao,
  isPrint = false,
  options = {},
  usuario,
  dataHora,
  direcaoSeta,
  config,
}: EtiquetaEnderecoPreviewProps) {
  const effOrientacao = (config?.orientacao as OrientacaoEtiqueta) || orientacao;
  const template = config
    ? getTemplateFromConfig({
        tamanho: config.tamanho,
        orientacao: effOrientacao,
        largura_mm: config.largura_mm,
        altura_mm: config.altura_mm,
      })
    : getTemplateFromSelection(tamanho, orientacao);

  const effOptions: EtiquetaOptions = config
    ? (() => {
        const ativas = new Set((config.campos || []).filter((c) => c.ativo).map((c) => c.chave));
        return {
          incluirQRCode: ativas.has("qr_code") || options.incluirQRCode,
          incluirCurvaAcesso: ativas.has("curva_acesso"),
          incluirTipoEndereco: ativas.has("tipo_endereco"),
        };
      })()
    : options;

  const scale = config?.escala_fonte ?? 1;
  const fs = (n: number) => n * scale;
  const seta = (config?.direcao_seta ?? direcaoSeta ?? "NENHUMA") as DirecaoSeta;
  const logoUrl = config?.com_cabecalho && config?.com_logo ? config?.logo_url : null;
  const showHeader = config ? config.com_cabecalho !== false : true;
  const duasColunas = !!config?.duas_colunas;
  const intervaloMm = config?.intervalo_colunas_mm ?? 3;

  const items = enderecos.map((end, idx) => (
    <EtiquetaSingle
      key={end.id}
      endereco={end}
      template={template}
      isPrint={isPrint}
      options={effOptions}
      usuario={usuario}
      dataHora={dataHora}
      direcaoSeta={seta}
      logoUrl={logoUrl}
      showHeader={showHeader}
      fs={fs}
    />
  ));

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
