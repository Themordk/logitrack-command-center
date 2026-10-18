import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { OcorrenciaContexto } from "@/components/ocorrencia/RegistrarOcorrenciaModal";
import { OcorrenciaBottomSheet } from "@/components/ocorrencia/OcorrenciaBottomSheet";

interface Props { contexto: OcorrenciaContexto; }

export function OcorrenciaIconButton({ contexto }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Registrar ocorrência"
        title="Registrar ocorrência"
        className="w-12 h-12 -m-1 flex items-center justify-center shrink-0"
      >
        <span className="w-10 h-10 rounded-lg border-[1.5px] border-[#F59E0B] flex items-center justify-center active:bg-[#F59E0B]/15">
          <AlertTriangle size={18} className="text-[#F59E0B]" />
        </span>
      </button>
      <OcorrenciaBottomSheet open={open} onClose={() => setOpen(false)} contexto={contexto} />
    </>
  );
}
