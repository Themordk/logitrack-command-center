import { useState } from "react";
import { ImageIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  url?: string | null;
  alt?: string;
  caption?: string;
  size?: number;
  variant?: "admin" | "coletor";
  className?: string;
}

/**
 * Miniatura de imagem de produto com clique para ampliar em overlay.
 * `admin` usa fundo claro/borda padrão; `coletor` usa dark border igual aos cards.
 */
export function ProdutoImagemThumb({
  url,
  alt = "Produto",
  caption,
  size = 32,
  variant = "admin",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [errored, setErrored] = useState(false);
  const has = !!url && !errored;

  const isColetor = variant === "coletor";
  const wrapperBase = isColetor
    ? "bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)]"
    : "bg-secondary/40 border border-border";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (has) setOpen(true);
        }}
        disabled={!has}
        title={has ? "Clique para ampliar" : "Sem imagem"}
        style={{ width: size, height: size }}
        className={cn(
          "flex items-center justify-center rounded overflow-hidden shrink-0 transition-transform",
          wrapperBase,
          has ? "cursor-zoom-in hover:scale-105" : "cursor-default opacity-60",
          className
        )}
      >
        {has ? (
          <img
            src={url!}
            alt={alt}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImageIcon
            size={Math.max(12, Math.floor(size * 0.45))}
            className={isColetor ? "text-[hsl(213,31%,40%)]" : "text-muted-foreground/50"}
          />
        )}
      </button>

      {open && has && (
        <div
          className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            aria-label="Fechar"
          >
            <X size={20} />
          </button>
          <div
            className="flex flex-col items-center gap-3 max-w-full max-h-full"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={url!}
              alt={alt}
              referrerPolicy="no-referrer"
              className="max-w-[92vw] max-h-[80vh] object-contain rounded-lg shadow-2xl bg-white"
            />
            {caption && (
              <p className="text-sm text-white/80 text-center max-w-[92vw]">{caption}</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
