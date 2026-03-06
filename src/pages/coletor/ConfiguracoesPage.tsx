import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Settings } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function ConfiguracoesPage({ onNavigate }: Props) {
  return (
    <ColetorLayout title="Configurações" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[hsl(213,31%,55%)]/20 flex items-center justify-center">
          <Settings size={32} className="text-[hsl(213,31%,55%)]" />
        </div>
        <h2 className="text-lg font-bold text-white">Configurações</h2>
        <p className="text-sm text-[hsl(213,31%,55%)] text-center max-w-xs">
          Em breve você poderá ajustar configurações do coletor aqui.
        </p>
      </div>
    </ColetorLayout>
  );
}
