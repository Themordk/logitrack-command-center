import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { RegistrarOcorrenciaModal, type OcorrenciaContexto } from "./RegistrarOcorrenciaModal";

interface Props {
  contexto: OcorrenciaContexto;
  variant?: "icon" | "full";
  onSuccess?: (resultado: { ocorrencia_id: string; numero_ocorrencia: number }) => void;
}

export function RegistrarOcorrenciaButton({ contexto, variant = "full", onSuccess }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          title="Registrar ocorrência"
          className="p-1.5 rounded hover:bg-secondary text-amber-400 hover:text-amber-300"
        >
          <AlertTriangle size={14} />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 text-xs font-medium"
        >
          <AlertTriangle size={14} /> Registrar ocorrência
        </button>
      )}
      <RegistrarOcorrenciaModal
        open={open}
        onClose={() => setOpen(false)}
        contexto={contexto}
        onSuccess={onSuccess}
      />
    </>
  );
}
