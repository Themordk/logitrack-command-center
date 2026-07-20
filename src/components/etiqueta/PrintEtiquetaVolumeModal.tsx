import { useRef, useMemo, useState, useEffect } from "react";
import { Printer, X, Eye, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaVolumePreview, type VolumeLike } from "./EtiquetaVolumePreview";
import { getPrintCSS, getPrintCSSFromConfig, getTemplateFromConfig, TEMPLATES } from "./thermalEngine";
import { useTenant } from "@/contexts/TenantContext";
import { formatDateTime } from "@/utils/dateTime";
import { useEtiquetaTemplate } from "@/hooks/useEtiquetaTemplate";

interface PrintEtiquetaVolumeModalProps {
  open: boolean;
  onClose: () => void;
  volumes: VolumeLike[];
}

export function PrintEtiquetaVolumeModal({ open, onClose, volumes }: PrintEtiquetaVolumeModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { usuarioNome, empresaId } = useTenant();
  const dataHora = useMemo(() => formatDateTime(new Date()), [open]);
  const { config, loading } = useEtiquetaTemplate("VOLUME", empresaId);
  const [duasColunas, setDuasColunas] = useState(false);
  const [intervaloColunasMm, setIntervaloColunasMm] = useState(3);
  const [defaultsApplied, setDefaultsApplied] = useState(false);

  useEffect(() => {
    if (config && !defaultsApplied) {
      setDuasColunas(!!config.duas_colunas);
      setIntervaloColunasMm(config.intervalo_colunas_mm ?? 3);
      setDefaultsApplied(true);
    }
  }, [config, defaultsApplied]);

  const template = config ? getTemplateFromConfig(config) : TEMPLATES.ARMAZEM_100x40_H;

  const configOverride = useMemo(() => {
    if (!config) return undefined;
    return { ...config, duas_colunas: duasColunas, intervalo_colunas_mm: intervaloColunasMm };
  }, [config, duasColunas, intervaloColunasMm]);

  const triggerPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const css = config
      ? getPrintCSSFromConfig(template.widthMm, template.heightMm, duasColunas, intervaloColunasMm)
      : getPrintCSS(template);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas Volume – CORE LogiTrack</title><style>${css}</style></head><body>${printContent.innerHTML}</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  };

  const plural = volumes.length > 1;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] bg-card border-border flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Eye size={18} className="text-primary" />
            Preview — {volumes.length} volume{plural ? "s" : ""} · {template.widthMm}×{template.heightMm}mm
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-border shrink-0 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Opções de impressão:</span>
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={duasColunas}
              onChange={(e) => setDuasColunas(e.target.checked)}
              className="w-3.5 h-3.5 accent-primary"
            />
            Impressão em 2 colunas
          </label>
          {duasColunas && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Intervalo:</span>
              <input
                type="number" min={0} max={20} step={1}
                value={intervaloColunasMm}
                onChange={(e) => setIntervaloColunasMm(Number(e.target.value) || 0)}
                className="w-16 h-7 px-2 text-xs rounded bg-secondary border border-border text-foreground outline-none"
              />
              <span className="text-[10px] text-muted-foreground">mm</span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-8 flex flex-col items-center gap-6 bg-black/40">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 size={16} className="animate-spin" /> Carregando template...
            </div>
          ) : (
            <>
              <div ref={printRef} style={{ display: "none" }}>
                <EtiquetaVolumePreview volumes={volumes} isPrint usuario={usuarioNome ?? undefined} dataHora={dataHora} config={configOverride} />
              </div>
              <EtiquetaVolumePreview volumes={volumes} isPrint={false} usuario={usuarioNome ?? undefined} dataHora={dataHora} config={configOverride} />
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X size={14} className="inline mr-1" /> Fechar
          </button>
          <button onClick={triggerPrint} disabled={loading} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            <Printer size={15} /> Imprimir {volumes.length} etiqueta{plural ? "s" : ""}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
