import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function TransferenciaOrigemPage({ onNavigate }: Props) {
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
        .select("id, descricao, tipo_endereco")
        .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
        .limit(1);

      if (!data || data.length === 0) {
        setOverlay("error");
        setOverlayMsg("Endereço não encontrado.");
        return;
      }

      sessionStorage.setItem("transf_origem_id", data[0].id);
      sessionStorage.setItem("transf_origem_desc", data[0].descricao);
      onNavigate("/coletor/movimentos/transferencia/produto");
    } catch {
      setOverlay("error");
      setOverlayMsg("Erro ao buscar endereço.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout title="Transferência - Origem" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 1 de 4</span>
        <p className="text-sm font-bold text-white">Escanear o endereço de ORIGEM</p>
      </div>

      <ScanField label="Escanear Endereço Origem" onScan={handleScan} lastScanned={scanned} disabled={loading} />
      {loading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={28} /></div>}
    </ColetorLayout>
  );
}
