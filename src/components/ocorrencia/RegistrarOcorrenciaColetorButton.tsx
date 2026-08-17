import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ActionButton } from "@/components/coletor/ActionButton";
import type { OcorrenciaContexto } from "./RegistrarOcorrenciaModal";
import { OcorrenciaBottomSheet } from "./OcorrenciaBottomSheet";

interface Props {
  contexto: OcorrenciaContexto;
  onSuccess?: (resultado: { ocorrencia_id: string; numero_ocorrencia: number }) => void;
  label?: string;
}

export function RegistrarOcorrenciaColetorButton({ contexto, onSuccess, label = "Registrar Ocorrência" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <ActionButton onClick={() => setOpen(true)} variant="warning">
        <AlertTriangle size={18} /> {label}
      </ActionButton>

      <OcorrenciaBottomSheet
        open={open}
        onClose={() => setOpen(false)}
        contexto={contexto}
        onSuccess={onSuccess}
      />
    </>
  );
}
