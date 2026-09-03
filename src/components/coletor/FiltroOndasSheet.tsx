import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { OndasFilters } from "@/hooks/useOndasFilter";
import { EMPTY_ONDAS_FILTERS } from "@/hooks/useOndasFilter";

interface Props {
  open: boolean;
  onClose: () => void;
  filters: OndasFilters;
  tiposSaida: string[];
  onApply: (f: OndasFilters) => void;
  onClear: () => void;
}

const inputClass =
  "w-full h-11 px-3 rounded-xl bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] text-sm text-white placeholder:text-[hsl(213,31%,40%)] outline-none focus:border-[hsl(217,91%,60%)]";

export function FiltroOndasSheet({ open, onClose, filters, tiposSaida, onApply, onClear }: Props) {
  const [local, setLocal] = useState<OndasFilters>(filters);

  useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full rounded-t-3xl bg-[hsl(222,40%,12%)] border-t border-[hsl(222,35%,22%)] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Filtrar lista</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full flex items-center justify-center text-[hsl(213,31%,55%)]">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[hsl(213,31%,55%)]">Tipo de saída</label>
          <select
            className={inputClass}
            value={local.tipoSaida}
            onChange={(e) => setLocal({ ...local, tipoSaida: e.target.value })}
          >
            <option value="">Todos</option>
            {tiposSaida.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[hsl(213,31%,55%)]">Nº do movimento de saída</label>
          <input
            className={`${inputClass} font-mono`}
            inputMode="numeric"
            placeholder="Ex.: 808"
            value={local.numeroMovimento}
            onChange={(e) => setLocal({ ...local, numeroMovimento: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[hsl(213,31%,55%)]">Nº do documento de saída</label>
          <input
            className={`${inputClass} font-mono`}
            placeholder="Ex.: 171717"
            value={local.numeroDocumento}
            onChange={(e) => setLocal({ ...local, numeroDocumento: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setLocal(EMPTY_ONDAS_FILTERS);
              onClear();
              onClose();
            }}
            className="flex-1 h-12 rounded-xl border border-[hsl(222,35%,28%)] text-sm font-medium text-[hsl(213,31%,70%)] active:scale-95 transition-all"
          >
            Limpar filtros
          </button>
          <button
            type="button"
            onClick={() => {
              onApply(local);
              onClose();
            }}
            className="flex-1 h-12 rounded-xl bg-[hsl(217,91%,50%)] text-sm font-bold text-white active:scale-95 transition-all"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
