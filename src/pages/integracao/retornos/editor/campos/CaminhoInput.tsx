import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MIME_CAMINHO, usePainel } from "./painelContext";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  id?: string;
}

export function CaminhoInput({ value, onChange, placeholder = "ex.: documento.codigo_erp", className, id, ...rest }: Props) {
  const { caminhos, somenteLeitura } = usePainel();
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const sugestoes = useMemo(() => {
    const q = value.toLowerCase();
    return caminhos.filter((c) => c.toLowerCase().includes(q) && c !== value).slice(0, 30);
  }, [caminhos, value]);

  const escolher = (c: string) => { onChange(c); setAberto(false); };

  return (
    <Popover open={aberto && sugestoes.length > 0 && !somenteLeitura} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <div className={cn("w-full", className)}>
          <Input
            id={id}
            aria-label={rest["aria-label"]}
            value={value}
            disabled={somenteLeitura}
            placeholder={placeholder}
            onChange={(e) => { onChange(e.target.value); setAberto(true); setAtivo(0); }}
            onFocus={() => setAberto(true)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setAtivo((a) => Math.min(a + 1, sugestoes.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && aberto && sugestoes[ativo]) { e.preventDefault(); escolher(sugestoes[ativo]); }
              else if (e.key === "Escape") setAberto(false);
            }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(MIME_CAMINHO)) e.preventDefault(); }}
            onDrop={(e) => {
              const c = e.dataTransfer.getData(MIME_CAMINHO);
              if (c) { e.preventDefault(); onChange(c); }
            }}
            className="h-9 rounded-lg bg-secondary/40 font-mono text-xs leading-normal"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        <ul role="listbox" className="max-h-56 overflow-y-auto">
          {sugestoes.map((c, i) => (
            <li key={c} role="option" aria-selected={i === ativo}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => escolher(c)}
                className={cn("w-full truncate rounded px-2 py-1 text-left font-mono text-xs", i === ativo && "bg-secondary")}
              >
                {c}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
