import { useEffect } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { CheckCircle, Home, RotateCcw } from "lucide-react";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";

interface Props { onNavigate: (path: string) => void; }

export function RecebimentoConcluidoPage({ onNavigate }: Props) {
  const { setFabVisivel, setContexto } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(true);
    setContexto({ etapa: "RECEBIMENTO" });
    return () => setFabVisivel(false);
  }, [setFabVisivel, setContexto]);
  return (
    <ColetorLayout title="Concluído" onNavigate={onNavigate} showBack={false}>
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center">
        <div className="w-24 h-24 rounded-full bg-[#22C55E]/20 flex items-center justify-center">
          <CheckCircle size={56} className="text-[#22C55E]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Recebimento Finalizado!</h2>
          <p className="text-base text-[hsl(213,31%,55%)]">Todas as informações foram registradas com sucesso.</p>
        </div>
      </div>

      <div className="space-y-3 pb-4">
        <ActionButton onClick={() => onNavigate("/coletor/recebimento")} variant="primary">
          <RotateCcw size={20} /> NOVO RECEBIMENTO
        </ActionButton>
        <ActionButton onClick={() => onNavigate("/coletor/home")} variant="secondary">
          <Home size={20} /> VOLTAR AO MENU
        </ActionButton>
      </div>
    </ColetorLayout>
  );
}
