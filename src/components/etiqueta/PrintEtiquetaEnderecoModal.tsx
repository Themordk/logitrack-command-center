import { useState, useRef, useMemo, useEffect } from "react";
import { Printer, X, Eye, Settings2, ChevronDown, AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaEnderecoPreview, TamanhoEtiqueta, OrientacaoEtiqueta, EtiquetaOptions } from "./EtiquetaEnderecoPreview";
import { getPrintCSS, getPrintCSSFromConfig, getTemplateFromConfig, getTemplateFromSelection, validateLabel, type LabelData } from "./thermalEngine";
import { useTenant } from "@/contexts/TenantContext";
import { formatDateTime } from "@/utils/dateTime";
import { supabase } from "@/integrations/supabase/client";
import { parseError } from "@/lib/errorMapper";
import { toast } from "sonner";
import type { EtiquetaConfig } from "@/hooks/useEtiquetaTemplate";

interface PrintEtiquetaEnderecoModalProps {
  open: boolean;
  onClose: () => void;
  enderecos: Array<{
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
  }>;
}

type Saida = "preview" | "imprimir";

export function PrintEtiquetaEnderecoModal({ open, onClose, enderecos }: PrintEtiquetaEnderecoModalProps) {
  const [saida, setSaida] = useState<Saida>("preview");
  const [showPreview, setShowPreview] = useState(false);
  const [incluirQRCode, setIncluirQRCode] = useState(false);
  const [incluirCurvaAcesso, setIncluirCurvaAcesso] = useState(false);
  const [incluirTipoEndereco, setIncluirTipoEndereco] = useState(false);
  const [direcaoSeta, setDirecaoSeta] = useState<"CIMA" | "BAIXO" | "ESQUERDA" | "DIREITA" | "NENHUMA">("NENHUMA");
  const [duasColunas, setDuasColunas] = useState(false);
  const [intervaloColunasMm, setIntervaloColunasMm] = useState(3);
  const printRef = useRef<HTMLDivElement>(null);
  const { usuarioNome, empresaId, armazemId } = useTenant();
  const dataHora = useMemo(() => formatDateTime(new Date()), [open, showPreview]);

  // Lista de templates + selecionado
  const [templates, setTemplates] = useState<EtiquetaConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<EtiquetaConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoadingConfig(true);
      try {
        const { data, error } = await (supabase.rpc as any)(
          "listar_etiqueta_templates",
          { p_tipo: "ENDERECO", p_empresa_id: empresaId || null }
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
        if (!cancelled) setLoadingConfig(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [open, empresaId]);

  // Ao trocar template selecionado, reinicializar controles de impressão
  useEffect(() => {
    if (selectedConfig) {
      setDirecaoSeta((selectedConfig.direcao_seta as any) || "NENHUMA");
      setDuasColunas(!!selectedConfig.duas_colunas);
      setIntervaloColunasMm(selectedConfig.intervalo_colunas_mm ?? 3);
    }
  }, [selectedConfig]);

  const tamanho: TamanhoEtiqueta = (selectedConfig?.tamanho as TamanhoEtiqueta) || "100x40";
  const orientacao: OrientacaoEtiqueta = (selectedConfig?.orientacao as OrientacaoEtiqueta) || "horizontal";

  const plural = enderecos.length > 1;
  const etiquetaOptions: EtiquetaOptions = { incluirQRCode, incluirCurvaAcesso, incluirTipoEndereco };

  const configOverride = useMemo(() => {
    if (!selectedConfig) return undefined;
    return {
      ...selectedConfig,
      direcao_seta: direcaoSeta,
      duas_colunas: duasColunas,
      intervalo_colunas_mm: intervaloColunasMm,
    };
  }, [selectedConfig, direcaoSeta, duasColunas, intervaloColunasMm]);

  const template = selectedConfig ? getTemplateFromConfig(selectedConfig) : getTemplateFromSelection(tamanho, orientacao);

  const validationErrors: string[] = [];
  enderecos.forEach((end) => {
    const data: LabelData = {
      barcodeValue: String(end.codigo_endereco || ""),
      displayText: end.descricao || String(end.codigo_endereco || ""),
    };
    const result = validateLabel(data, template);
    if (!result.valid) {
      validationErrors.push(`${end.descricao || end.id}: ${result.errors.join(", ")}`);
    }
  });
  const hasErrors = validationErrors.length > 0;

  const handleGerar = async () => {
    if (hasErrors) return;
    if (saida === "preview") setShowPreview(true);
    else await enviarParaImpressora();
  };

  const enviarParaImpressora = async () => {
    if (!armazemId) {
      toast.error("Selecione um armazém antes de imprimir");
      return;
    }
    let successCount = 0;
    let errorCount = 0;
    for (const end of enderecos) {
      try {
        const { data, error } = await (supabase.rpc as any)("solicitar_impressao", {
          p_armazem_id: armazemId,
          p_tipo_etiqueta: "ENDERECO",
          p_dados: {
            codigo_endereco: end.codigo_endereco != null ? String(end.codigo_endereco) : "",
            descricao: end.descricao || "",
            tipo_endereco: end.tipo_endereco || "",
            curva_acesso: end.curva_acesso || "",
            direcao_seta: direcaoSeta || "NENHUMA",
          },

          p_origem: "PAINEL_ADMINISTRATIVO",
          p_documento_origem_id: String(end.id),
          p_tipo_documento_origem: "endereco",
          p_prioridade: 5,
        });
        if (error) throw error;
        const result = typeof data === "string" ? JSON.parse(data) : data;
        if (result?.success) successCount++;
        else errorCount++;
      } catch (err) {
        console.warn("[Impressão Endereço]", err);
        errorCount++;
      }
    }
    if (successCount > 0) toast.success(`${successCount} etiqueta(s) enviada(s) para impressão`);
    if (errorCount > 0) toast.error(`${errorCount} etiqueta(s) falharam. Verifique se há impressora configurada.`);
    if (successCount > 0) onClose();
  };


  const triggerPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    let css: string;
    if (selectedConfig) {
      const spec = getTemplateFromConfig(selectedConfig);
      css = getPrintCSSFromConfig(spec.widthMm, spec.heightMm, duasColunas, intervaloColunasMm);
    } else {
      css = getPrintCSS(template);
    }
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Etiquetas CORE LogiTrack</title><style>${css}</style></head><body>${printContent.innerHTML}</body></html>`;
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.focus(); win.print(); }, 500);
  };

  const SelectField = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</label>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none bg-secondary text-foreground text-sm rounded-lg px-3 py-2.5 pr-8 border border-border outline-none cursor-pointer focus:ring-2 focus:ring-primary/50 transition-all">
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );

  const CheckboxField = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5 accent-primary" />
      <span className="text-xs text-foreground">{label}</span>
    </label>
  );

  return (
    <>
      <Dialog open={open && !showPreview} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Printer size={18} className="text-primary" />
              Impressão de Etiquetas – Padrão CORE
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
            <Settings2 size={13} className="text-primary shrink-0" />
            <span className="text-xs text-primary font-medium">
              {enderecos.length} {plural ? "etiquetas" : "etiqueta"} selecionada{plural ? "s" : ""}
            </span>
          </div>

          {loadingConfig && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 size={12} className="animate-spin" /> Carregando templates...
            </div>
          )}

          {hasErrors && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
              <div className="text-xs text-destructive">
                <p className="font-semibold mb-1">Validação falhou – impressão bloqueada:</p>
                {validationErrors.slice(0, 3).map((e, i) => <p key={i}>• {e}</p>)}
                {validationErrors.length > 3 && <p>...e mais {validationErrors.length - 3}</p>}
              </div>
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

            <SelectField label="🖨️ Saída" value={saida} onChange={(v) => setSaida(v as Saida)} options={[
              { value: "preview", label: "Visualizar (Preview)" },
              { value: "imprimir", label: "Imprimir Diretamente" },
            ]} />

            <div className="border border-border/50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Campos Opcionais</p>
              <CheckboxField label="Incluir QR Code" checked={incluirQRCode} onChange={setIncluirQRCode} />
              <CheckboxField label="Incluir Curva de Acesso" checked={incluirCurvaAcesso} onChange={setIncluirCurvaAcesso} />
              <CheckboxField label="Incluir Tipo (Picking/Pulmão)" checked={incluirTipoEndereco} onChange={setIncluirTipoEndereco} />
            </div>

            <div className="border border-border/50 rounded-lg p-3 space-y-3">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Opções de impressão</p>

              <SelectField
                label="Seta Direcional"
                value={direcaoSeta}
                onChange={(v) => setDirecaoSeta(v as any)}
                options={[
                  { value: "NENHUMA", label: "Nenhuma" },
                  { value: "CIMA", label: "↑ Para cima" },
                  { value: "BAIXO", label: "↓ Para baixo" },
                  { value: "ESQUERDA", label: "← Para esquerda" },
                  { value: "DIREITA", label: "→ Para direita" },
                ]}
              />

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

            <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5">
              Otimizado para Elgin L42PRO · 203 DPI · Code128 · Dimensões fixas em pixels
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button
              onClick={handleGerar}
              disabled={hasErrors || !selectedConfig}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
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
                <p className="text-sm font-semibold text-foreground">Preview – {enderecos.length} {plural ? "etiquetas" : "etiqueta"}</p>
                <p className="text-xs text-muted-foreground">{template.widthMm}×{template.heightMm}mm · {template.widthPx}×{template.heightPx}px · 203 DPI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPreview(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">← Voltar</button>
              <button onClick={() => { setShowPreview(false); onClose(); }} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors" title="Fechar"><X size={16} /></button>
              <button onClick={triggerPrint} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"><Printer size={15} />Imprimir</button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-8 flex flex-col items-center gap-6">
            <div ref={printRef} style={{ display: "none" }}>
              <EtiquetaEnderecoPreview enderecos={enderecos} tamanho={tamanho} orientacao={orientacao} isPrint={true} options={etiquetaOptions} usuario={usuarioNome ?? undefined} dataHora={dataHora} direcaoSeta={direcaoSeta} config={configOverride} />
            </div>
            <EtiquetaEnderecoPreview enderecos={enderecos} tamanho={tamanho} orientacao={orientacao} isPrint={false} options={etiquetaOptions} usuario={usuarioNome ?? undefined} dataHora={dataHora} direcaoSeta={direcaoSeta} config={configOverride} />
          </div>
        </div>
      )}
    </>
  );
}
