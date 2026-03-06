import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { CheckCircle } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function TransferenciaConcluidoPage({ onNavigate }: Props) {
  const origemDesc = sessionStorage.getItem("transf_origem_desc") || "";
  const destinoDesc = sessionStorage.getItem("transf_destino_desc") || "";
  const sku = sessionStorage.getItem("transf_produto_sku") || "";
  const desc = sessionStorage.getItem("transf_produto_desc") || "";
  const quantidade = sessionStorage.getItem("transf_quantidade") || "0";

  const handleNew = () => {
    // Clear transfer data
    ["transf_origem_id", "transf_origem_desc", "transf_produto_id", "transf_produto_sku", "transf_produto_desc",
     "transf_saldo_disponivel", "transf_lote", "transf_validade", "transf_fabricacao", "transf_quantidade", "transf_destino_desc"]
      .forEach(k => sessionStorage.removeItem(k));
    onNavigate("/coletor/movimentos/transferencia/origem");
  };

  return (
    <ColetorLayout title="Transferência Concluída" onNavigate={onNavigate} showBack={false}>
      <div className="flex flex-col items-center justify-center py-8 gap-4">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <CheckCircle size={48} className="text-green-400" />
        </div>
        <h2 className="text-xl font-bold text-white">Transferência Realizada!</h2>
      </div>

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-4 flex flex-col gap-2">
        <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Produto</span><p className="text-sm text-white">{sku} - {desc}</p></div>
        <div className="grid grid-cols-2 gap-2">
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Origem</span><p className="text-xs font-mono text-white">{origemDesc}</p></div>
          <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Destino</span><p className="text-xs font-mono text-white">{destinoDesc}</p></div>
        </div>
        <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Quantidade</span><p className="text-lg font-bold text-green-400">{quantidade}</p></div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <ActionButton onClick={handleNew}>Nova Transferência</ActionButton>
        <button onClick={() => onNavigate("/coletor/movimentos")} className="h-[52px] rounded-xl border border-[hsl(222,35%,22%)] text-[hsl(213,31%,75%)] font-semibold text-base active:bg-[hsl(222,35%,16%)]">
          Voltar ao Menu
        </button>
      </div>
    </ColetorLayout>
  );
}
