import { useState, useRef, useEffect, useMemo } from "react";
import { Printer, X, Eye, Settings2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaHUPreview } from "./EtiquetaHUPreview";
import { getPrintCSS, getPrintCSSFromConfig, getTemplateFromConfig, TEMPLATES } from "./thermalEngine";
import { useEtiquetaTemplate } from "@/hooks/useEtiquetaTemplate";
import { useTenant } from "@/contexts/TenantContext";

interface PrintEtiquetaHUModalProps {
  open: boolean;
  onClose: () => void;
  hus: Array<{ id: string | number; codigo_hu?: string; tipo_hu?: string; tamanho?: string }>;
}

type Saida = "preview" | "imprimir";

export function PrintEtiquetaHUModal({ open, onClose, hus }: PrintEtiquetaHUModalProps) {
  const [saida, setSaida] = useState<Saida>("preview");
  const [showPreview, setShowPreview] = useState(false);
  const [duasColunas, setDuasColunas] = useState(false);
  const [intervaloColunasMm, setIntervaloColunasMm] = useState(3);
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const plural = hus.length > 1;
  const { empresaId } = useTenant();
  const { config, loading } = useEtiquetaTemplate("HU", empresaId);
  const template = config ? getTemplateFromConfig(config) : TEMPLATES.ARMAZEM_100x40_H;

  useEffect(() => {
    if (config && !defaultsApplied) {
      setDuasColunas(!!config.duas_colunas);
      setIntervaloColunasMm(config.intervalo_colunas_mm ?? 3);
      setDefaultsApplied(true);
    }
  }, [config, defaultsApplied]);

  const configOverride = useMemo(() => {
    if (!config) return undefined;
    return { ...config, duas_colunas: duasColunas, intervalo_colunas_mm: intervaloColunasMm };
  }, [config, duasColunas, intervaloColunasMm]);

  const handleGerar = () => {
    if (saida === "preview") setShowPreview(true);
    else triggerPrint();
  };

  const triggerPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const css = config
      ? getPrintCSSFromConfig(template.widthMm, template.heightMm, duasColunas, intervaloColunasMm)
      : getPrintCSS(template);
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas HU – CORE LogiTrack</title><style>${css}</style></head><body>${printContent.innerHTML}</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  };

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Printer size={18} className="text-primary" />
              Impressão de Etiquetas HU
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
            <Settings2 size={13} className="text-primary shrink-0" />
            <span className="text-xs text-primary font-medium">
              {hus.length} {plural ? "etiquetas" : "etiqueta"} · {template.widthMm}×{template.heightMm}mm
            </span>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Resolvendo template...
            </div>
          )}

          <div className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🖨️ Saída</label>
              <select
                value={saida}
                onChange={(e) => setSaida(e.target.value as Saida)}
                className="w-full bg-secondary text-foreground text-sm rounded-lg px-3 py-2.5 border border-border outline-none cursor-pointer focus:ring-2 focus:ring-primary/50"
              >
                <option value="preview">Visualizar (Preview)</option>
                <option value="imprimir">Imprimir Diretamente</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button onClick={handleGerar} disabled={loading} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
              {saida === "preview" ? <><Eye size={15} />Gerar Preview</> : <><Printer size={15} />Imprimir Agora</>}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <Eye size={18} className="text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Preview – {hus.length} {plural ? "etiquetas" : "etiqueta"}</p>
                <p className="text-xs text-muted-foreground">{template.widthMm}×{template.heightMm}mm · {template.widthPx}×{template.heightPx}px</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">← Voltar</button>
              <button onClick={() => { setShowPreview(false); onClose(); }} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors" title="Fechar"><X size={16} /></button>
              <button onClick={triggerPrint} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
                <Printer size={15} />Imprimir
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 flex flex-col items-center gap-6">
            <div ref={printRef} style={{ display: "none" }}>
              <EtiquetaHUPreview hus={hus} isPrint={true} config={config ?? undefined} />
            </div>
            <EtiquetaHUPreview hus={hus} isPrint={false} config={config ?? undefined} />
          </div>
        </div>
      )}
    </>
  );
}
