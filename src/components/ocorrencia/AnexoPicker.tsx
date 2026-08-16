import { useEffect, useState } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { ANEXO_ACCEPT, formatBytes, isImagem, validarAnexo } from "@/lib/ocorrenciaAnexos";

interface Props {
  file: File | null;
  onChange: (file: File | null) => void;
  label?: string;
  disabled?: boolean;
}

/** Seletor de 1 arquivo com preview compacto, usado nos modais/diálogos de ocorrência. */
export function AnexoPicker({ file, onChange, label = "Anexar evidência (opcional)", disabled }: Props) {
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !isImagem(file.type)) { setPreview(null); return; }
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, [file]);

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const erro = validarAnexo(f);
    if (erro) { toast.error(erro); return; }
    onChange(f);
  };

  return (
    <div>
      <label className="block text-[10px] uppercase font-medium text-muted-foreground mb-1">Evidência</label>
      {!file ? (
        <label className="flex items-center gap-2 px-3 py-3 rounded-md border border-dashed border-border bg-secondary/40 text-xs text-muted-foreground cursor-pointer hover:border-primary hover:text-foreground transition-colors">
          <Paperclip size={14} />
          {label}
          <input type="file" accept={ANEXO_ACCEPT} className="hidden" onChange={handle} disabled={disabled} />
        </label>
      ) : (
        <div className="flex items-center gap-3 p-2 rounded-md border border-border bg-secondary/40">
          {preview ? (
            <img src={preview} alt={file.name} className="h-12 w-12 rounded object-cover border border-border" />
          ) : (
            <FileText size={20} className="text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground truncate">{file.name}</p>
            <p className="text-[10px] text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-secondary"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
