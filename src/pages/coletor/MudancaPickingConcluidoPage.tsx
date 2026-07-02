import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { CheckCircle } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function MudancaPickingConcluidoPage({ onNavigate }: Props) {
  const origemDesc = sessionStorage.getItem("mudpick_origem_desc") || "";
  const destinoDesc = sessionStorage.getItem("mudpick_destino_desc") || "";
  const qtdItens = sessionStorage.getItem("mudpick_qtd_itens") || "0";
  const qtdTotal = sessionStorage.getItem("mudpick_qtd_total") || "0";

  const handleNew = () => {
    ["mudpick_origem_id", "mudpick_origem_desc", "mudpick_itens", "mudpick_destino_desc", "mudpick_qtd_itens", "mudpick_qtd_total"]
      .forEach(k => sessionStorage.removeItem(k));
    onNavigate("/coletor/movimentos/mudanca-picking/origem");
  };

  return (
    <ColetorLayout title="Mudança Concluída" onNavigate={onNavigate} showBack={false}>
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle size={48} className="text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Mudança Realizada!</h2>
      </div>

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-4 flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Origem</span><p className="text-xs font-mono text-white">{origemDesc}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Destino</span><p className="text-xs font-mono text-white">{destinoDesc}</p></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Itens transferidos</span><p className="text-lg font-bold text-green-400">{qtdItens}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Quantidade total</span><p className="text-lg font-bold text-green-400">{qtdTotal}</p></div>
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <ActionButton onClick={handleNew}>Nova Mudança</ActionButton>
        <button onClick={() => onNavigate("/coletor/movimentos")} className="h-[52px] rounded-xl border border-[hsl(222,35%,22%)] text-[hsl(213,31%,75%)] font-semibold text-base active:bg-[hsl(222,35%,16%)]">
          Voltar ao Menu
        </button>
      </div>
    </ColetorLayout>
  );
}
