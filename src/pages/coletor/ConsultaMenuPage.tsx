import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Package, MapPin, Archive, Target } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

const options = [
  { label: "Scan Produto", desc: "Saldo por endereço (Pulmão/Picking)", icon: <Package size={28} />, path: "/coletor/consulta/produto", color: "hsl(217,91%,50%)" },
  { label: "Scan Endereço", desc: "Produtos neste endereço com lote/validade", icon: <MapPin size={28} />, path: "/coletor/consulta/endereco", color: "hsl(142,76%,36%)" },
  { label: "Scan HU", desc: "Status da HU e localização", icon: <Archive size={28} />, path: "/coletor/consulta/hu", color: "hsl(45,93%,47%)" },
  { label: "Mapear Picking", desc: "Vincular endereço de picking ao produto", icon: <Target size={28} />, path: "/coletor/consulta/mapear-picking", color: "hsl(280,70%,55%)" },
];

export function ConsultaMenuPage({ onNavigate }: Props) {
  return (
    <ColetorLayout title="Consultas" onNavigate={onNavigate} showBack backPath="/coletor/home">
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
