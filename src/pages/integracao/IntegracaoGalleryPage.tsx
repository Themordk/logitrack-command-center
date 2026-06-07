import { useTenant } from "@/contexts/TenantContext";
import { StatusBar } from "./StatusBar";
import { ErpCard } from "./ErpCard";
import { useErpGallery } from "./useErpGallery";
import { Loader2 } from "lucide-react";

interface Props {
  onNavigate: (path: string) => void;
}

export function IntegracaoGalleryPage({ onNavigate }: Props) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const { data, loading, error } = useErpGallery(tenantId, empresaId, empresaVersion);

  if (!tenantId || !empresaId) {
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
        <div>
          <h1 className="text-xl font-bold text-foreground">Integração ERP</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Selecione uma empresa para configurar a integração.
          </p>
        </div>
      </div>
    );
  }

  const handleSelect = (erpId: string) => {
    onNavigate(`/config/integracao/${erpId}`);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-foreground">Integração ERP</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Selecione e configure a integração com o seu sistema ERP.
        </p>
      </div>

      <StatusBar key={`sb-${empresaId}-${empresaVersion}`} tenantId={tenantId} empresaId={empresaId} refreshKey={empresaVersion} />

      {loading ? (
        <div className="card-surface p-6 flex items-center justify-center text-muted-foreground gap-2 text-sm">
          <Loader2 size={14} className="animate-spin" /> Carregando provedores…
        </div>
      ) : error ? (
        <div className="card-surface p-6 text-sm text-destructive">{error}</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {data.map((d) => (
            <ErpCard key={d.provedor.id} data={d} onSelect={handleSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
