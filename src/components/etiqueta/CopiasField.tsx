import { Minus, Plus } from "lucide-react";

export const MAX_COPIAS = 20;

export function sanitizeCopias(v: any): number {
  return Math.min(MAX_COPIAS, Math.max(1, Math.floor(Number(v) || 1)));
}

interface CopiasFieldProps {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

export function CopiasField({ value, onChange, disabled }: CopiasFieldProps) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
        Cópias
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Diminuir cópias"
          disabled={disabled || value <= 1}
          onClick={() => onChange(sanitizeCopias(value - 1))}
          className="h-10 w-10 rounded-lg bg-secondary border border-border text-foreground flex items-center justify-center hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Minus size={14} />
        </button>
        <input
          type="number"
          min={1}
          max={MAX_COPIAS}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(sanitizeCopias(e.target.value))}
          className="h-10 flex-1 min-w-0 px-3 text-center rounded-lg bg-secondary border border-border text-sm font-semibold text-foreground outline-none focus:ring-2 focus:ring-primary/50"
        />
        <button
          type="button"
          aria-label="Aumentar cópias"
          disabled={disabled || value >= MAX_COPIAS}
          onClick={() => onChange(sanitizeCopias(value + 1))}
          className="h-10 w-10 rounded-lg bg-secondary border border-border text-foreground flex items-center justify-center hover:bg-secondary/70 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
        </button>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">
        Máximo de {MAX_COPIAS} cópias por etiqueta.
      </div>
    </div>
  );
}
