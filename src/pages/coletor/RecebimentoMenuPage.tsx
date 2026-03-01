import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Play, RotateCcw } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function RecebimentoMenuPage({ onNavigate }: Props) {
  return (
    <ColetorLayout title="Recebimento" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex-1 flex flex-col justify-center gap-4">
        <ActionButton onClick={() => onNavigate("/coletor/recebimento/iniciar")} variant="primary">
          <Play size={22} /> INICIAR NOVO RECEBIMENTO
        </ActionButton>
        <ActionButton onClick={() => onNavigate("/coletor/recebimento/iniciar?continuar=1")} variant="secondary">
          <RotateCcw size={22} /> CONTINUAR RECEBIMENTO
        </ActionButton>
      </div>
    </ColetorLayout>
  );
}
