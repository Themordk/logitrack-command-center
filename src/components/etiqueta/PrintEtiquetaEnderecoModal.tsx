import { useState, useRef } from "react";
import { Printer, X, Eye, Settings2, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EtiquetaEnderecoPreview, TamanhoEtiqueta, OrientacaoEtiqueta } from "./EtiquetaEnderecoPreview";
import type { Endereco } from "@/data/mockData";
import { cn } from "@/lib/utils";

interface PrintEtiquetaEnderecoModalProps {
  open: boolean;
  onClose: () => void;
  enderecos: Endereco[];
}

type Saida = "preview" | "imprimir";

export function PrintEtiquetaEnderecoModal({
  open,
  onClose,
  enderecos,
}: PrintEtiquetaEnderecoModalProps) {
  const [tamanho, setTamanho] = useState<TamanhoEtiqueta>("100x40");
  const [orientacao, setOrientacao] = useState<OrientacaoEtiqueta>("horizontal");
  const [saida, setSaida] = useState<Saida>("preview");
  const [showPreview, setShowPreview] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const plural = enderecos.length > 1;

  const handleGerar = () => {
    if (saida === "preview") {
      setShowPreview(true);
    } else {
      triggerPrint();
    }
  };

  const triggerPrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Etiquetas CORE LogiTrack</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page {
      size: ${tamanho === "100x40"
        ? orientacao === "horizontal" ? "100mm 40mm" : "40mm 100mm"
        : orientacao === "horizontal" ? "50mm 20mm" : "20mm 50mm"};
      margin: 0;
    }
    body {
      background: white;
      font-family: Arial, Helvetica, sans-serif;
    }
    .etiqueta-core {
      page-break-after: always;
      break-after: page;
    }
  </style>
</head>
<body>
  ${printContent.innerHTML}
</body>
</html>`;

    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
    }, 500);
  };

  const SelectField = ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-secondary text-foreground text-sm rounded-lg px-3 py-2.5 pr-8 border border-border outline-none cursor-pointer focus:ring-2 focus:ring-primary/50 transition-all"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );

  return (
    <>
      {/* Config Modal */}
      <Dialog open={open && !showPreview} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md bg-card border-border">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Printer size={18} className="text-primary" />
              Impressão de Etiquetas – Padrão CORE
            </DialogTitle>
          </DialogHeader>

          {/* Info badge */}
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
            <Settings2 size={13} className="text-primary shrink-0" />
            <span className="text-xs text-primary font-medium">
              {enderecos.length} {plural ? "etiquetas" : "etiqueta"} selecionada{plural ? "s" : ""}
            </span>
          </div>

          <div className="space-y-4">
            <SelectField
              label="📐 Tamanho"
              value={tamanho}
              onChange={(v) => setTamanho(v as TamanhoEtiqueta)}
              options={[
                { value: "100x40", label: "100mm × 40mm (Padrão Industrial)" },
                { value: "50x20", label: "50mm × 20mm (Compacta)" },
              ]}
            />

            <SelectField
              label="🔄 Orientação"
              value={orientacao}
              onChange={(v) => setOrientacao(v as OrientacaoEtiqueta)}
              options={[
                { value: "horizontal", label: "Horizontal (Paisagem)" },
                { value: "vertical", label: "Vertical (Retrato)" },
              ]}
            />

            <SelectField
              label="🖨️ Saída"
              value={saida}
              onChange={(v) => setSaida(v as Saida)}
              options={[
                { value: "preview", label: "Visualizar (Preview)" },
                { value: "imprimir", label: "Imprimir Diretamente" },
              ]}
            />

            {/* Future fields – disabled */}
            <div className="border border-border/50 rounded-lg p-3 space-y-2">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                Campos Opcionais (em breve)
              </p>
              {[
                "Incluir QR Code",
                "Incluir Curva de Acesso",
                "Incluir Tipo (Picking/Pulmão)",
                "Incluir Logotipo CORE",
              ].map((item) => (
                <label key={item} className="flex items-center gap-2 opacity-40 cursor-not-allowed select-none">
                  <input type="checkbox" disabled className="w-3.5 h-3.5" />
                  <span className="text-xs text-muted-foreground">{item}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleGerar}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
            >
              {saida === "preview" ? (
                <>
                  <Eye size={15} />
                  Gerar Preview
                </>
              ) : (
                <>
                  <Printer size={15} />
                  Imprimir Agora
                </>
              )}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview fullscreen modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90">
          {/* Preview toolbar */}
          <div className="flex items-center justify-between px-6 py-4 bg-card border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <Eye size={18} className="text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Preview – {enderecos.length} {plural ? "etiquetas" : "etiqueta"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tamanho} · {orientacao === "horizontal" ? "Horizontal" : "Vertical"} · Padrão CORE
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                ← Voltar
              </button>
              <button
                onClick={() => { setShowPreview(false); onClose(); }}
                className="p-2 rounded-lg hover:bg-secondary text-muted-foreground transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
              <button
                onClick={triggerPrint}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
              >
                <Printer size={15} />
                Imprimir
              </button>
            </div>
          </div>

          {/* Preview area */}
          <div className="flex-1 overflow-auto p-8 flex flex-col items-center gap-6">
            {/* Hidden print target */}
            <div ref={printRef} style={{ display: "none" }}>
              <EtiquetaEnderecoPreview
                enderecos={enderecos}
                tamanho={tamanho}
                orientacao={orientacao}
                isPrint={true}
              />
            </div>

            {/* Visual preview */}
            <EtiquetaEnderecoPreview
              enderecos={enderecos}
              tamanho={tamanho}
              orientacao={orientacao}
              isPrint={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
