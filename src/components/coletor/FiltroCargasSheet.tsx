/**
 * Fluxo de Expedição · F6.8 — filtro da lista de cargas do embarque (coletor).
 * Mesmo visual do FiltroOndasSheet da separação; as opções vêm das cargas que o operador já vê.
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { FILTROS_CARGA_COLETOR_VAZIOS, type FiltrosCargaColetor } from "@/lib/cargaExibicao";

interface Props {
  open: boolean;
  onClose: () => void;
  filters: FiltrosCargaColetor;
  opcoes: { veiculos: string[]; boxes: string[]; motoristas: string[] };
  onApply: (f: FiltrosCargaColetor) => void;
  onClear: () => void;
}

const inputClass =
  "w-full h-11 px-3 rounded-xl bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] text-sm text-white outline-none focus:border-[hsl(217,91%,60%)]";

const CAMPOS: { campo: keyof FiltrosCargaColetor; rotulo: string; opcao: "veiculos" | "boxes" | "motoristas" }[] = [
  { campo: "veiculo", rotulo: "Veículo", opcao: "veiculos" },
  { campo: "box", rotulo: "Box", opcao: "boxes" },
  { campo: "motorista", rotulo: "Motorista", opcao: "motoristas" },
];

export function FiltroCargasSheet({ open, onClose, filters, opcoes, onApply, onClear }: Props) {
  const [local, setLocal] = useState<FiltrosCargaColetor>(filters);

  useEffect(() => {
    if (open) setLocal(filters);
  }, [open, filters]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label="Filtrar cargas">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative w-full rounded-t-3xl bg-[hsl(222,40%,12%)] border-t border-[hsl(222,35%,22%)] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Filtrar lista</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="w-8 h-8 rounded-full flex items-center justify-center text-[hsl(213,31%,55%)]">
            <X size={18} />
          </button>
        </div>

        {CAMPOS.map(({ campo, rotulo, opcao }) => (
          <div key={campo} className="flex flex-col gap-1">
            <label htmlFor={`filtro-carga-${campo}`} className="text-xs text-[hsl(213,31%,55%)]">{rotulo}</label>
            <select
              id={`filtro-carga-${campo}`}
              className={inputClass}
              value={local[campo]}
              onChange={(e) => setLocal({ ...local, [campo]: e.target.value })}
            >
              <option value="">Todos</option>
              {opcoes[opcao].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => { setLocal(FILTROS_CARGA_COLETOR_VAZIOS); onClear(); onClose(); }}
            className="flex-1 h-12 rounded-xl border border-[hsl(222,35%,28%)] text-sm font-medium text-[hsl(213,31%,70%)] active:scale-95 transition-all"
          >
            Limpar filtros
          </button>
          <button
            type="button"
            onClick={() => { onApply(local); onClose(); }}
            className="flex-1 h-12 rounded-xl bg-[hsl(217,91%,50%)] text-sm font-bold text-white active:scale-95 transition-all"
          >
            Aplicar
          </button>
        </div>
      </div>
    </div>
  );
}
