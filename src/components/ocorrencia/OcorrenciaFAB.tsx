import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";
import { OcorrenciaBottomSheet } from "./OcorrenciaBottomSheet";

/** FAB global do coletor para registrar ocorrência — visibilidade controlada pelo context. */
export function OcorrenciaFAB() {
  const { contexto, fabVisivel } = useOcorrenciaColetorContext();
  const [open, setOpen] = useState(false);

  if (!fabVisivel) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Registrar ocorrência"
        className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-2xl bg-[#F59E0B] flex items-center justify-center shadow-lg shadow-amber-500/30 active:scale-90 transition-transform duration-200 ease-out"
      >
        <AlertTriangle size={24} className="text-white" />
      </button>

      <OcorrenciaBottomSheet open={open} onClose={() => setOpen(false)} contexto={contexto} />
    </>
  );
}
