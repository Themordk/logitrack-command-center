import { useState, useRef } from "react";
import { Printer, X, Eye, Settings2, ChevronDown, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaEnderecoPreview, TamanhoEtiqueta, OrientacaoEtiqueta, EtiquetaOptions } from "./EtiquetaEnderecoPreview";
import { getPrintCSS, getTemplateFromSelection, validateLabel, type LabelData } from "./thermalEngine";

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
  }>;
}

type Saida = "preview" | "imprimir";

export function PrintEtiquetaEnderecoModal({ open, onClose, enderecos }: PrintEtiquetaEnderecoModalProps) {
  const [tamanho, setTamanho] = useState<TamanhoEtiqueta>("100x40");
  const [orientacao, setOrientacao] = useState<OrientacaoEtiqueta>("horizontal");
  const [saida, setSaida] = useState<Saida>("preview");
  const [showPreview, setShowPreview] = useState(false);
  const [incluirQRCode, setIncluirQRCode] = useState(false);
  const [incluirCurvaAcesso, setIncluirCurvaAcesso] = useState(false);
  const [incluirTipoEndereco, setIncluirTipoEndereco] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const plural = enderecos.length > 1;
  const etiquetaOptions: EtiquetaOptions = { incluirQRCode, incluirCurvaAcesso, incluirTipoEndereco };

  // Pre-validate all labels
  const template = getTemplateFromSelection(tamanho, orientacao);
  const validationErrors: string[] = [];
  enderecos.forEach((end) => {
    const data: LabelData = {
      barcodeValue: String(end.codigo_endereco || ""),
      displayText: end.descricao || "",
    };
    const result = validateLabel(data, template);
    if (!result.valid) {
      validationErrors.push(`${end.descricao || end.id}: ${result.errors.join(", ")}`);
    }
  });

  const hasErrors = validationErrors.length > 0;

  const handleGerar = () => {
    if (hasErrors) return;
    if (saida === "preview") setShowPreview(true);
    else triggerPrint();
  };

  const triggerPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;
    const css = getPrintCSS(template);
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
              {enderecos.length} {plural ? "etiquetas" : "etiqueta"} selecionada{plural ? "s" : ""} · Template: {template.id}
            </span>
          </div>

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
            <SelectField label="📐 Tamanho" value={tamanho} onChange={(v) => setTamanho(v as TamanhoEtiqueta)} options={[
              { value: "100x40", label: `100mm × 40mm – ${800}×${320}px (Industrial)` },
              { value: "50x20", label: `50mm × 20mm – ${400}×${160}px (Compacta)` },
            ]} />
            <SelectField label="🔄 Orientação" value={orientacao} onChange={(v) => setOrientacao(v as OrientacaoEtiqueta)} options={[
              { value: "horizontal", label: "Horizontal (Paisagem)" },
              { value: "vertical", label: "Vertical (Retrato)" },
            ]} />
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

            <div className="text-[10px] text-muted-foreground bg-secondary/50 rounded px-2 py-1.5">
              Otimizado para Elgin L42PRO · 203 DPI · Code128 · Dimensões fixas em pixels
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button
              onClick={handleGerar}
              disabled={hasErrors}
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
                <p className="text-xs text-muted-foreground">{template.id} · {template.widthPx}×{template.heightPx}px · 203 DPI</p>
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
              <EtiquetaEnderecoPreview enderecos={enderecos} tamanho={tamanho} orientacao={orientacao} isPrint={true} options={etiquetaOptions} />
            </div>
            <EtiquetaEnderecoPreview enderecos={enderecos} tamanho={tamanho} orientacao={orientacao} isPrint={false} options={etiquetaOptions} />
          </div>
        </div>
      )}
    </>
  );
}
