import { useState, useRef, useEffect, useMemo } from "react";
import { Printer, X, Eye, Settings2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaHUPreview, type HULike } from "./EtiquetaHUPreview";
import { getPrintCSS, getPrintCSSFromConfig, getTemplateFromConfig, TEMPLATES } from "./thermalEngine";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { parseError } from "@/lib/errorMapper";
import { toast } from "sonner";
import type { EtiquetaConfig } from "@/hooks/useEtiquetaTemplate";

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
  const printRef = useRef<HTMLDivElement>(null);
  const plural = hus.length > 1;
  const { tenantId, empresaId } = useTenant();

  const [templates, setTemplates] = useState<EtiquetaConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EtiquetaConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [husEnriquecidas, setHusEnriquecidas] = useState<HULike[]>([]);
  const [loadingDados, setLoadingDados] = useState(false);

  useEffect(() => {
    if (!open || hus.length === 0) return;
    let cancelled = false;
    async function loadDados() {
      setLoadingDados(true);
      try {
        let tid = tenantId;
        if (!tid) {
          const { data: tenantRow } = await supabase
            .from("usuario").select("tenant_id").limit(1).single();
          tid = (tenantRow as any)?.tenant_id ?? null;
        }
        if (!tid) { setHusEnriquecidas([]); return; }
        const huIds = hus.map((h) => h.id);
        const { data, error } = await (supabase as any).rpc("dados_etiqueta_hu", {
          p_tenant_id: tid, p_hu_ids: huIds,
        });
        if (cancelled) return;
        if (error) throw error;
        const parsed = typeof data === "string" ? JSON.parse(data) : data;
        const flat = Array.isArray(parsed) && Array.isArray(parsed[0]) ? parsed[0] : parsed;
        const rows: HULike[] = (flat || []).map((r: any) => ({
          id: r.hu_id, ...r,
          peso_bruto: r.peso_bruto != null ? Number(r.peso_bruto) : undefined,
          total_itens: r.total_itens != null ? Number(r.total_itens) : undefined,
          total_quantidade: r.total_quantidade != null ? Number(r.total_quantidade) : undefined,
        }));
        setHusEnriquecidas(rows);
      } catch (err: any) {
        console.error("Erro ao carregar dados HU:", err);
        if (!cancelled) {
          setHusEnriquecidas(hus.map((h) => ({
            id: h.id, codigo_hu: h.codigo_hu, tipo_hu: h.tipo_hu, tamanho: h.tamanho,
          })));
        }
      } finally {
        if (!cancelled) setLoadingDados(false);
      }
    }
    loadDados();
    return () => { cancelled = true; };
  }, [open, hus, tenantId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const { data, error } = await (supabase.rpc as any)(
          "listar_etiqueta_templates",
          { p_tipo: "HU", p_empresa_id: empresaId || null }
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

  const handleGerar = () => {
    if (saida === "preview") setShowPreview(true);
    else triggerPrint();
  };

  const triggerPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const css = selectedConfig
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
              <Loader2 size={12} className="animate-spin" /> Carregando templates...
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                📐 Template
              </label>
              <select
                value={selectedConfig?.id || ""}
                onChange={(e) => {
                  const t = templates.find((t) => t.id === e.target.value);
                  if (t) setSelectedConfig(t);
                }}
                disabled={templates.length === 0}
                className="w-full h-10 px-3 rounded-lg bg-secondary border border-border text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
              >
                {templates.length === 0 ? (
                  <option value="">Nenhum template cadastrado</option>
                ) : (
                  templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} — {t.largura_mm}×{t.altura_mm}mm{t.padrao ? " (Padrão)" : ""}
                    </option>
                  ))
                )}
              </select>
              {selectedConfig && (
                <div className="text-[10px] text-muted-foreground mt-1">
                  {selectedConfig.largura_mm}×{selectedConfig.altura_mm}mm ·{" "}
                  {selectedConfig.orientacao === "horizontal" ? "Paisagem" : "Retrato"} ·{" "}
                  {Math.round(Number(selectedConfig.largura_mm) * 8)}×{Math.round(Number(selectedConfig.altura_mm) * 8)}px
                </div>
              )}
            </div>

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

            <div className="border border-border/50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Opções de impressão</p>
              <div className="flex items-center gap-3 flex-wrap">
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
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button onClick={handleGerar} disabled={loading || !selectedConfig} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
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
              <EtiquetaHUPreview hus={hus} isPrint={true} config={configOverride} />
            </div>
            <EtiquetaHUPreview hus={hus} isPrint={false} config={configOverride} />
          </div>
        </div>
      )}
    </>
  );
}
