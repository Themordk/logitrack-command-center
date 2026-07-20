/**
 * Etiqueta Volume de Expedição – 100x40mm (800x320px @ 203 DPI)
 * Layout B/W, otimizado para impressão térmica (Elgin L42PRO)
 */
import React from "react";
import { BarcodeRenderer } from "./BarcodeRenderer";
import { Building2, MapPin, Calendar, Package, AlertTriangle } from "lucide-react";
import { getTemplateFromConfig } from "./thermalEngine";
import type { CampoEtiqueta } from "@/hooks/useEtiquetaTemplate";

export interface VolumeLike {
  id: string;
  codigo_volume: string;
  parceiro_nome?: string | null;
  destino_carga?: string | null;
  created_at?: string | null;
  numero_onda?: number | null;
  numero_volume?: number | null;
  total_volumes_movimento?: number | null;
  peso?: number | string | null;
  nota_fiscal?: string | null;
  pedido?: string | null;
  transportadora?: string | null;
  observacao?: string | null;
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

interface EtiquetaVolumePreviewProps {
  volumes: VolumeLike[];
  isPrint?: boolean;
  usuario?: string;
  dataHora?: string;
  config?: EtiquetaTemplateOverride;
}

function formatDataHora(v?: string | null): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(v);
  }
}

const CAMPO_LABEL: Record<string, string> = {
  codigo_volume: "CÓDIGO", parceiro_nome: "RAZÃO SOCIAL", destino_carga: "DESTINO",
  numero_onda: "ONDA", numero_volume: "VOLUME", total_volumes: "TOTAL",
  data_hora: "DATA/HORA", usuario: "USUÁRIO", peso: "PESO",
  nota_fiscal: "NF", pedido: "PEDIDO", transportadora: "TRANSPORTADORA", observacao: "OBS",
};

function getCampoValor(chave: string, volume: VolumeLike, usuario?: string, dataHora?: string): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (chave) {
    case "codigo_volume": return volume.codigo_volume || "—";
    case "parceiro_nome": return (volume.parceiro_nome || "—").toUpperCase();
    case "destino_carga": return (volume.destino_carga || "—").toUpperCase();
    case "numero_onda": return volume.numero_onda != null ? String(volume.numero_onda) : "—";
    case "numero_volume": return volume.numero_volume != null ? pad(volume.numero_volume) : "—";
    case "total_volumes": return volume.total_volumes_movimento != null ? pad(volume.total_volumes_movimento) : "—";
    case "data_hora": return formatDataHora(volume.created_at || dataHora);
    case "usuario": return (usuario || "—").toUpperCase();
    case "peso": return volume.peso != null ? String(volume.peso) : "—";
    case "nota_fiscal": return volume.nota_fiscal || "—";
    case "pedido": return volume.pedido || "—";
    case "transportadora": return (volume.transportadora || "—").toUpperCase();
    case "observacao": return volume.observacao || "—";
    default: return "—";
  }
}

function TemplateVolumeDefault({ volume, isPrint, usuario, dataHora }: { volume: VolumeLike; isPrint: boolean; usuario?: string; dataHora?: string }) {
  const WPX = 800; const HPX = 320;
  const codigo = volume.codigo_volume;
  const criadoEm = formatDataHora(volume.created_at || dataHora);
  const total = volume.total_volumes_movimento ?? 0;
  const seq = volume.numero_volume ?? 0;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="etiqueta-thermal" style={{
      width: `${WPX}px`, height: `${HPX}px`, background: "#FFFFFF", color: "#000000",
      fontFamily: "Arial, Helvetica, sans-serif",
      border: isPrint ? "none" : "1px solid #D1D5DB", borderRadius: isPrint ? 0 : "10px",
      overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box",
    }}>
      <div style={{ background: "#000", color: "#FFF", height: 60, display: "flex", alignItems: "center", padding: "0 16px", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 28, height: 28, background: "#FFF", color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16 }}>C</div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
            <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: 0.5 }}>CORE</span>
            <span style={{ fontSize: 9, opacity: 0.85 }}>LogiTrack</span>
          </div>
        </div>
        <div style={{ width: 1, height: 36, background: "#FFF", opacity: 0.4 }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{ fontWeight: 900, fontSize: 20, letterSpacing: 1 }}>VOLUME DE EXPEDIÇÃO</div>
          <div style={{ fontSize: 9, letterSpacing: 2, opacity: 0.85 }}>IDENTIFICAÇÃO DE VOLUME</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 11, gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Calendar size={11} /><span>{criadoEm}</span>
          </div>
          <div>Usuário: <b>{usuario || "—"}</b></div>
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", padding: "10px 14px", gap: 10 }}>
        <div style={{ flex: 1.5, display: "flex", flexDirection: "column", gap: 6, borderRight: "1px dashed #000", paddingRight: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, borderBottom: "1px solid #000", paddingBottom: 6 }}>
            <Building2 size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>RAZÃO SOCIAL</div>
              <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1, wordBreak: "break-word" }}>{(volume.parceiro_nome || "—").toUpperCase()}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, borderBottom: "1px solid #000", paddingBottom: 6 }}>
            <MapPin size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>DESTINO</div>
              <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1, wordBreak: "break-word" }}>{(volume.destino_carga || "—").toUpperCase()}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <Calendar size={16} />
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1 }}>DATA / HORA</div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>{criadoEm}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Package size={16} />
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textAlign: "center" }}>VOLUME / TOTAL</div>
                <div style={{ fontSize: 18, fontWeight: 900, textAlign: "center" }}>{seq > 0 ? pad(seq) : "—"} / {total > 0 ? pad(total) : "—"}</div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <div style={{ background: "#000", color: "#FFF", padding: "2px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3 }}>CÓDIGO DO VOLUME</div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1, fontFamily: "monospace" }}>{codigo}</div>
          <BarcodeRenderer value={codigo} moduleWidth={2} height={70} margin={0} />
          <div style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: 1 }}>— {codigo} —</div>
        </div>
      </div>
      <div style={{ borderTop: "1px dashed #000", height: 46, display: "flex", alignItems: "center", padding: "0 14px", gap: 12 }}>
        <AlertTriangle size={22} />
        <div style={{ flex: 1, fontSize: 10, lineHeight: 1.2 }}>
          <b>ATENÇÃO</b> · Conferir volume e destino no recebimento.<br />
          Em caso de divergência, comunicar imediatamente.
        </div>
        <div style={{ textAlign: "right", fontSize: 9, fontWeight: 700 }}>
          CORE LogiTrack WMS<br />
          <span style={{ fontWeight: 400 }}>www.corelogitrack.com.br</span>
        </div>
      </div>
    </div>
  );
}

function TemplateVolumeConfig({ volume, isPrint, usuario, dataHora, config }: { volume: VolumeLike; isPrint: boolean; usuario?: string; dataHora?: string; config: EtiquetaTemplateOverride }) {
  const spec = getTemplateFromConfig(config);
  const { widthPx: WPX, heightPx: HPX } = spec;
  const codigo = volume.codigo_volume;
  const scale = config.escala_fonte ?? 1;
  const fs = (n: number) => n * scale;

  const campos = (config.campos || []).filter((c) => c.ativo).sort((a, b) => a.ordem - b.ordem);
  const showHeader = config.com_cabecalho !== false;
  const headerH = showHeader ? 52 : 0;
  const barcodeAreaH = 110;
  const bodyH = HPX - headerH - barcodeAreaH;

  return (
    <div className="etiqueta-thermal" style={{
      width: `${WPX}px`, height: `${HPX}px`, background: "#FFFFFF", color: "#000000",
      fontFamily: "Arial, Helvetica, sans-serif",
      border: isPrint ? "none" : "1px solid #D1D5DB", borderRadius: isPrint ? 0 : "10px",
      overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box",
    }}>
      {showHeader && (
        <div style={{ background: "#000", color: "#FFF", height: headerH, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}>
          {config.com_logo && config.logo_url ? (
            <img src={config.logo_url} alt="Logo" style={{ maxHeight: 36, maxWidth: 120, objectFit: "contain", background: "#FFF", padding: 2 }} />
          ) : null}
          <div style={{ flex: 1, textAlign: "center", fontWeight: 900, fontSize: `${fs(18)}px`, letterSpacing: 2 }}>VOLUME DE EXPEDIÇÃO</div>
        </div>
      )}
      <div style={{ height: barcodeAreaH, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4, background: "#FFFFFF", flexShrink: 0 }}>
        <BarcodeRenderer value={codigo} moduleWidth={3} height={72} margin={4} maxWidth={WPX - 40} />
        <div style={{ fontSize: `${fs(14)}px`, fontFamily: "monospace", fontWeight: 800, letterSpacing: 1 }}>{codigo}</div>
      </div>
      <div style={{ height: bodyH, padding: "6px 14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 14px", alignContent: "start", overflow: "hidden", background: "#FFFFFF" }}>
        {campos.filter((c) => c.chave !== "codigo_volume").map((c) => {
          const val = getCampoValor(c.chave, volume, usuario, dataHora);
          const label = CAMPO_LABEL[c.chave] || c.label?.toUpperCase() || c.chave.toUpperCase();
          return (
            <div key={c.chave} style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, borderBottom: "1px dotted #999", paddingBottom: 2 }}>
              <span style={{ fontSize: `${fs(8)}px`, fontWeight: 700, letterSpacing: 0.5, color: "#333" }}>{label}</span>
              <span style={{ fontSize: `${fs(11)}px`, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EtiquetaVolumePreview({ volumes, isPrint = false, usuario, dataHora, config }: EtiquetaVolumePreviewProps) {
  const duasColunas = !!config?.duas_colunas;
  const intervaloMm = config?.intervalo_colunas_mm ?? 3;
  const elements = volumes.map((v) =>
    config ? (
      <TemplateVolumeConfig key={v.id} volume={v} isPrint={isPrint} usuario={usuario} dataHora={dataHora} config={config} />
    ) : (
      <TemplateVolumeDefault key={v.id} volume={v} isPrint={isPrint} usuario={usuario} dataHora={dataHora} />
    )
  );

  if (duasColunas) {
    const rows: React.ReactNode[] = [];
    for (let i = 0; i < elements.length; i += 2) {
      rows.push(
        <div key={`row-${i}`} className="etiqueta-row" style={{ display: "flex", flexDirection: "row", gap: `${intervaloMm}mm`, marginBottom: isPrint ? 0 : 16, justifyContent: "center" }}>
          {elements.slice(i, i + 2)}
        </div>
      );
    }
    return <div style={{ display: "flex", flexDirection: "column", gap: isPrint ? 0 : 16, alignItems: "center" }}>{rows}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isPrint ? 0 : 16, alignItems: "center" }}>
      {elements}
    </div>
  );
}
