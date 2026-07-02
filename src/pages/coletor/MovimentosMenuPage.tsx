import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ArrowLeftRight, ArrowDownToLine, Replace } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

const options = [
  { label: "Transferência entre Picking", desc: "Mover estoque entre endereços de picking", icon: <ArrowLeftRight size={28} />, path: "/coletor/movimentos/transferencia/origem", color: "hsl(45,93%,47%)" },
  { label: "Mudança de Picking", desc: "Transferir todos os itens de um endereço para outro", icon: <Replace size={28} />, path: "/coletor/movimentos/mudanca-picking/origem", color: "hsl(280,80%,60%)" },
  { label: "Abastecimento", desc: "Reabastecer endereços de picking", icon: <ArrowDownToLine size={28} />, path: "/coletor/movimentos/abastecimento", color: "hsl(142,76%,36%)" },
];

export function MovimentosMenuPage({ onNavigate }: Props) {
  return (
    <ColetorLayout title="Movimentos" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col gap-3">
        {options.map((o) => (
          <button
            key={o.label}
            onClick={() => onNavigate(o.path)}
            className="flex items-center gap-4 p-4 rounded-2xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] active:bg-[hsl(222,35%,16%)] active:scale-[0.98] transition-all"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${o.color}20`, color: o.color }}>
              {o.icon}
            </div>
            <div className="text-left">
              <span className="text-base font-bold text-white block">{o.label}</span>
              <span className="text-xs text-[hsl(213,31%,55%)]">{o.desc}</span>
            </div>
          </button>
        ))}
      </div>
    </ColetorLayout>
  );
}
