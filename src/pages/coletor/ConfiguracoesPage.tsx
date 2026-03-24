import { useState } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { Settings, Smartphone, ScanBarcode } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function ConfiguracoesPage({ onNavigate }: Props) {
  const [tipoDispositivo, setTipoDispositivo] = useState(
    () => localStorage.getItem("coletor_tipo_dispositivo") || "celular"
  );

  const handleChange = (tipo: string) => {
    setTipoDispositivo(tipo);
    localStorage.setItem("coletor_tipo_dispositivo", tipo);
  };

  return (
    <ColetorLayout title="Configurações" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold text-foreground">Tipo de Dispositivo</h2>
        <p className="text-sm text-muted-foreground">
          Selecione o tipo de dispositivo para otimizar a experiência de uso.
        </p>

        <button
          onClick={() => handleChange("coletor")}
          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
            tipoDispositivo === "coletor"
              ? "border-primary bg-primary/10"
              : "border-border bg-card"
          }`}
        >
          <ScanBarcode size={28} className={tipoDispositivo === "coletor" ? "text-primary" : "text-muted-foreground"} />
          <div className="text-left">
            <div className="font-semibold text-foreground">Coletor com leitor</div>
            <div className="text-xs text-muted-foreground">Zebra, Honeywell, etc. Teclado virtual desativado nos campos de scan.</div>
          </div>
        </button>

        <button
          onClick={() => handleChange("celular")}
          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
            tipoDispositivo === "celular"
              ? "border-primary bg-primary/10"
              : "border-border bg-card"
          }`}
        >
          <Smartphone size={28} className={tipoDispositivo === "celular" ? "text-primary" : "text-muted-foreground"} />
          <div className="text-left">
            <div className="font-semibold text-foreground">Celular / Tablet</div>
            <div className="text-xs text-muted-foreground">Teclado virtual disponível para digitação manual.</div>
          </div>
        </button>

        <div className="mt-6 pt-4 border-t border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings size={16} />
            <span className="text-sm">Mais configurações em breve.</span>
          </div>
        </div>
      </div>
    </ColetorLayout>
  );
}
