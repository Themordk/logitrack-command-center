import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function MudancaPickingOrigemPage({ onNavigate }: Props) {
  const offlineBlocked = useOnlineOnlyBlocked();
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const handleScan = async (code: string) => {
    setScanned(code);
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("endereco")
        .select("id, descricao, situacao")
        .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
        .limit(1);

      if (!data || data.length === 0) {
        setOverlay("error");
        setOverlayMsg("Endereço não encontrado.");
        return;
      }
      if (!["LIVRE", "OCUPADO"].includes(data[0].situacao)) {
        setOverlay("error");
        setOverlayMsg(`Endereço ${data[0].descricao} está ${data[0].situacao}. Movimentações não são permitidas.`);
        return;
      }

      sessionStorage.setItem("mudpick_origem_id", data[0].id);
      sessionStorage.setItem("mudpick_origem_desc", data[0].descricao);
      onNavigate("/coletor/movimentos/mudanca-picking/lista");
    } catch {
      setOverlay("error");
      setOverlayMsg("Erro ao buscar endereço.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout title="Mudança de Picking - Origem" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      <OnlineOnlyNotice flow="Mudança de Picking" />
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />
      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 1 de 3</span>
        <p className="text-sm font-bold text-white">Escanear o endereço de ORIGEM</p>
      </div>
      <ScanField label="Escanear Endereço Origem" onScan={handleScan} lastScanned={scanned} disabled={loading || offlineBlocked} />
      {loading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[hsl(280,80%,60%)]" size={28} /></div>}
    </ColetorLayout>
  );
}
