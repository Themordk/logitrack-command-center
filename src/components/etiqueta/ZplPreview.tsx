import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { useLabelaryPreview } from "@/hooks/useLabelaryPreview";

export interface ZplPreviewProps {
  zpl: string;
  larguraMm: number;
  alturaMm: number;
  dados?: Record<string, string | number | null | undefined>;
  /** Escala de exibição em px por mm. Padrão 4 (100mm = 400px). */
  escalaPx?: number;
  /** Máximo de largura em px do container. Padrão 800. */
  maxLarguraPx?: number;
  /** Mostra ou não a legenda de dimensões abaixo. Padrão true. */
  mostrarLegenda?: boolean;
}

/**
 * Preview WYSIWYG da etiqueta: renderiza o PNG produzido pelo Labelary
 * a partir do próprio ZPL que será enviado à impressora.
 */
export function ZplPreview({
  zpl,
  larguraMm,
  alturaMm,
  dados,
  escalaPx = 4,
  maxLarguraPx = 800,
  mostrarLegenda = true,
}: ZplPreviewProps) {
  const { url, loading, error } = useLabelaryPreview({ zpl, larguraMm, alturaMm, dados });

  const larg = larguraMm > 0 ? larguraMm : 100;
  const alt = alturaMm > 0 ? alturaMm : 40;
  const widthPx = Math.min(larg * escalaPx, maxLarguraPx);
  const minHeightPx = Math.min(alt * escalaPx, 600);

  return (
    <div className="w-full">
      <div
        className="flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded-lg border border-border p-3 mx-auto max-w-full"
        style={{ width: `${widthPx}px`, minHeight: `${minHeightPx}px` }}
      >
        {loading && !url ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" />
            Renderizando preview térmica...
          </div>
        ) : error ? (
          <div className="text-center px-2">
            <AlertTriangle size={20} className="mx-auto mb-1.5 text-destructive" />
            <p className="text-sm text-destructive break-words">{error}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Verifique se o ZPL está bem formado (deve começar com ^XA e terminar com ^XZ).
            </p>
          </div>
        ) : url ? (
          <img
            src={url}
            alt="Preview térmica"
            className="max-w-full max-h-full object-contain"
            style={{ imageRendering: "pixelated" }}
          />
        ) : (
          <div className="text-center text-muted-foreground">
            <Printer size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">Aguardando ZPL...</p>
          </div>
        )}
      </div>

      {mostrarLegenda && (
        <p className="text-[10px] text-muted-foreground text-center italic mt-2">
          {larg}mm × {alt}mm — Preview via Labelary
        </p>
      )}
    </div>
  );
}
