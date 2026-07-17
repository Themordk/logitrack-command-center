/**
 * Etiqueta Volume de Expedição – 100x40mm (800x320px @ 203 DPI)
 * Layout B/W, otimizado para impressão térmica (Elgin L42PRO)
 */
import { BarcodeRenderer } from "./BarcodeRenderer";
import { Building2, MapPin, Calendar, Package, AlertTriangle } from "lucide-react";

export interface VolumeLike {
  id: string;
  codigo_volume: string;
  parceiro_nome?: string | null;
  destino_carga?: string | null;
  created_at?: string | null;
  numero_onda?: number | null;
  numero_volume?: number | null;
  total_volumes_movimento?: number | null;
}

interface EtiquetaVolumePreviewProps {
  volumes: VolumeLike[];
  isPrint?: boolean;
  usuario?: string;
  dataHora?: string;
}

function formatDataHora(v?: string | null): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return String(v);
  }
}

function TemplateVolume({
  volume,
  isPrint,
  usuario,
  dataHora,
}: {
  volume: VolumeLike;
  isPrint: boolean;
  usuario?: string;
  dataHora?: string;
}) {
  const WPX = 800;
  const HPX = 320;
  const codigo = volume.codigo_volume;
  const criadoEm = formatDataHora(volume.created_at || dataHora);
  const total = volume.total_volumes_movimento ?? 0;
  const seq = volume.numero_volume ?? 0;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div
      className="etiqueta-thermal"
      style={{
        width: `${WPX}px`,
        height: `${HPX}px`,
        background: "#FFFFFF",
        color: "#000000",
        fontFamily: "Arial, Helvetica, sans-serif",
        border: isPrint ? "none" : "1px solid #D1D5DB",
        borderRadius: isPrint ? 0 : "10px",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxSizing: "border-box",
      }}
    >
      {/* Header preto */}
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
            <Calendar size={11} />
            <span>{criadoEm}</span>
          </div>
          <div>Usuário: <b>{usuario || "—"}</b></div>
        </div>
      </div>

      {/* Corpo */}
      <div style={{ flex: 1, display: "flex", padding: "10px 14px", gap: 10 }}>
        {/* Coluna esquerda */}
        <div style={{ flex: 1.5, display: "flex", flexDirection: "column", gap: 6, borderRight: "1px dashed #000", paddingRight: 12 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, borderBottom: "1px solid #000", paddingBottom: 6 }}>
            <Building2 size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>RAZÃO SOCIAL</div>
              <div style={{ fontSize: 18, fontWeight: 900, lineHeight: 1.1, wordBreak: "break-word" }}>
                {(volume.parceiro_nome || "—").toUpperCase()}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, borderBottom: "1px solid #000", paddingBottom: 6 }}>
            <MapPin size={18} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>DESTINO</div>
              <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1, wordBreak: "break-word" }}>
                {(volume.destino_carga || "—").toUpperCase()}
              </div>
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
                <div style={{ fontSize: 18, fontWeight: 900, textAlign: "center" }}>
                  {seq > 0 ? pad(seq) : "—"} / {total > 0 ? pad(total) : "—"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Coluna direita */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <div style={{ background: "#000", color: "#FFF", padding: "2px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 1, borderRadius: 3 }}>
            CÓDIGO DO VOLUME
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 1, fontFamily: "monospace" }}>{codigo}</div>
          <BarcodeRenderer value={codigo} moduleWidth={2} height={70} margin={0} />
          <div style={{ fontSize: 10, fontFamily: "monospace", letterSpacing: 1 }}>— {codigo} —</div>
        </div>
      </div>

      {/* Rodapé */}
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

export function EtiquetaVolumePreview({ volumes, isPrint = false, usuario, dataHora }: EtiquetaVolumePreviewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: isPrint ? 0 : 16, alignItems: "center" }}>
      {volumes.map((v) => (
        <TemplateVolume key={v.id} volume={v} isPrint={isPrint} usuario={usuario} dataHora={dataHora} />
      ))}
    </div>
  );
}
