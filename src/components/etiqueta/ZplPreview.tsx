import { useEffect } from "react";
import { AlertTriangle, Loader2, Printer } from "lucide-react";
import { useLabelaryPreview } from "@/hooks/useLabelaryPreview";
import { detectarOverflowZpl, type OverflowInfo } from "@/lib/detectarOverflowZpl";

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
  /** Nível de zoom. 'fit' respeita maxLarguraPx. Números são multiplicadores. */
  zoom?: "fit" | 1.5 | 2;
  /** Callback disparado quando a detecção de overflow muda. */
  onOverflow?: (info: OverflowInfo | null) => void;
}

const DESK_MAT_BG =
  "repeating-linear-gradient(45deg, hsl(var(--muted)) 0px, hsl(var(--muted)) 6px, hsl(var(--secondary)) 6px, hsl(var(--secondary)) 12px)";

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
  zoom = "fit",
  onOverflow,
}: ZplPreviewProps) {
  const { url, loading, error } = useLabelaryPreview({ zpl, larguraMm, alturaMm, dados });

  const larg = larguraMm > 0 ? larguraMm : 100;
  const alt = alturaMm > 0 ? alturaMm : 40;

  const fator = zoom === "fit" ? 1 : zoom;
  const widthPx =
    zoom === "fit" ? Math.min(larg * escalaPx, maxLarguraPx) : larg * escalaPx * fator;
  const minHeightPx =
    zoom === "fit" ? Math.min(alt * escalaPx, 600) : Math.min(alt * escalaPx * fator, 720);

  useEffect(() => {
    if (!onOverflow) return;
    if (!zpl || !zpl.trim() || alturaMm <= 0) {
      onOverflow(null);
      return;
    }
    onOverflow(detectarOverflowZpl(zpl, alturaMm, 8));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zpl, alturaMm]);

  return (
    <div className="w-full">
      <div
        className="flex items-center justify-center rounded-lg border border-border p-4 mx-auto max-w-full overflow-auto"
        style={{ background: DESK_MAT_BG, minHeight: `${Math.max(minHeightPx + 32, 140)}px` }}
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
            className="object-contain shrink-0"
            style={{
              width: `${widthPx}px`,
              imageRendering: "pixelated",
              background: "#ffffff",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.25)",
            }}
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
