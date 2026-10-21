import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { RecebimentoFilters } from "@/hooks/useRecebimentoFilter";
import { EMPTY_RECEBIMENTO_FILTERS } from "@/hooks/useRecebimentoFilter";

interface Props {
  open: boolean;
  onClose: () => void;
  filters: RecebimentoFilters;
  tiposEntrada: string[];
  onApply: (f: RecebimentoFilters) => void;
  onClear: () => void;
}

const inputClass =
  "w-full h-11 px-3 rounded-xl bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] text-sm text-white placeholder:text-[hsl(213,31%,40%)] outline-none focus:border-[hsl(217,91%,60%)]";

export function FiltroRecebimentoSheet({ open, onClose, filters, tiposEntrada, onApply, onClear }: Props) {
  const [local, setLocal] = useState<RecebimentoFilters>(filters);

  useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  if (!open) return null;

  const aplicar = () => {
    onApply(local);
    onClose();
  };

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
          <label className="text-xs text-[hsl(213,31%,55%)]">Tipo de entrada</label>
          <select
            className={inputClass}
            value={local.tipoEntrada}
            onChange={(e) => setLocal({ ...local, tipoEntrada: e.target.value })}
          >
            <option value="">Todos</option>
            {tiposEntrada.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[hsl(213,31%,55%)]">Nº do movimento</label>
          <input
            className={`${inputClass} font-mono`}
            inputMode="numeric"
            placeholder="Ex.: 152"
            value={local.numeroMovimento}
            onChange={(e) => setLocal({ ...local, numeroMovimento: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && aplicar()}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[hsl(213,31%,55%)]">Nº do documento (NF)</label>
          <input
            className={`${inputClass} font-mono`}
            placeholder="Ex.: 171717"
            value={local.numeroDocumento}
            onChange={(e) => setLocal({ ...local, numeroDocumento: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && aplicar()}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-[hsl(213,31%,55%)]">Fornecedor / parceiro</label>
          <input
            className={inputClass}
            placeholder="Nome ou razão social"
            autoCapitalize="characters"
            value={local.parceiro}
            onChange={(e) => setLocal({ ...local, parceiro: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && aplicar()}
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setLocal(EMPTY_RECEBIMENTO_FILTERS);
              onClear();
              onClose();
            }}
            className="flex-1 h-12 rounded-xl border border-[hsl(222,35%,28%)] text-sm font-medium text-[hsl(213,31%,70%)] active:scale-95 transition-all"
          >
            Limpar filtros
          </button>
          <button
            type="button"
            onClick={aplicar}
            className="flex-1 h-12 rounded-xl bg-[hsl(217,91%,50%)] text-sm font-bold text-white active:scale-95 transition-all"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
