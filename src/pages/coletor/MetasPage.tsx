import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { BarChart3 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function MetasPage({ onNavigate }: Props) {
  return (
    <ColetorLayout title="Metas & Resultados" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[hsl(280,70%,55%)]/20 flex items-center justify-center">
          <BarChart3 size={32} className="text-[hsl(280,70%,55%)]" />
        </div>
        <h2 className="text-lg font-bold text-white">Metas & Resultados</h2>
        <p className="text-sm text-[hsl(213,31%,55%)] text-center max-w-xs">
          Em breve você poderá acompanhar suas metas de produtividade e resultados diários aqui.
        </p>
      </div>
    </ColetorLayout>
  );
}
