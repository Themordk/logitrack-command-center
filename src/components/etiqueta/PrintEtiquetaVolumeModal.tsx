import { useRef, useMemo, useState, useEffect } from "react";
import { Printer, X, Eye, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaVolumePreview, type VolumeLike } from "./EtiquetaVolumePreview";
import { getPrintCSS, getPrintCSSFromConfig, getTemplateFromConfig, TEMPLATES } from "./thermalEngine";
import { useTenant } from "@/contexts/TenantContext";
import { formatDateTime } from "@/utils/dateTime";
import { supabase } from "@/integrations/supabase/client";
import { parseError } from "@/lib/errorMapper";
import { toast } from "sonner";
import type { EtiquetaConfig } from "@/hooks/useEtiquetaTemplate";

interface PrintEtiquetaVolumeModalProps {
  open: boolean;
  onClose: () => void;
  volumes: VolumeLike[];
}

export function PrintEtiquetaVolumeModal({ open, onClose, volumes }: PrintEtiquetaVolumeModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const { usuarioNome, empresaId } = useTenant();
  const dataHora = useMemo(() => formatDateTime(new Date()), [open]);
  const [duasColunas, setDuasColunas] = useState(false);
  const [intervaloColunasMm, setIntervaloColunasMm] = useState(3);

  const [templates, setTemplates] = useState<EtiquetaConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EtiquetaConfig | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await (supabase.rpc as any)(
          "listar_etiqueta_templates",
          { p_tipo: "VOLUME", p_empresa_id: empresaId || null }
        );
        if (cancelled) return;
        if (error) throw error;
        const parsed: EtiquetaConfig[] = (data || []).map((row: any) => ({
          ...row,
          campos: typeof row.campos === "string" ? JSON.parse(row.campos) : row.campos,
        }));
        setTemplates(parsed);
        const padrao = parsed.find((t) => t.padrao) || parsed[0] || null;
        setSelectedConfig(padrao);
      } catch (err: any) {
        if (!cancelled) toast.error(parseError(err, "carregar templates").title);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, empresaId]);

  useEffect(() => {
    if (selectedConfig) {
      setDuasColunas(!!selectedConfig.duas_colunas);
      setIntervaloColunasMm(selectedConfig.intervalo_colunas_mm ?? 3);
    }
  }, [selectedConfig]);

  const template = selectedConfig ? getTemplateFromConfig(selectedConfig) : TEMPLATES.ARMAZEM_100x40_H;

  const configOverride = useMemo(() => {
    if (!selectedConfig) return undefined;
    return { ...selectedConfig, duas_colunas: duasColunas, intervalo_colunas_mm: intervaloColunasMm };
  }, [selectedConfig, duasColunas, intervaloColunasMm]);

  const triggerPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const css = selectedConfig
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">📐 Template:</span>
            <select
              value={selectedConfig?.id || ""}
              onChange={(e) => {
                const t = templates.find((t) => t.id === e.target.value);
                if (t) setSelectedConfig(t);
              }}
              disabled={templates.length === 0}
              className="h-8 px-2 rounded-md bg-secondary border border-border text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            >
              {templates.length === 0 ? (
                <option value="">Nenhum template</option>
              ) : (
                templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} — {t.largura_mm}×{t.altura_mm}mm{t.padrao ? " (Padrão)" : ""}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="w-px h-5 bg-border" />
          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Opções:</span>
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
          <button onClick={triggerPrint} disabled={loading || !selectedConfig} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
            <Printer size={15} /> Imprimir {volumes.length} etiqueta{plural ? "s" : ""}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
