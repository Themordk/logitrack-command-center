import { useState } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ScanField } from "@/components/coletor/ScanField";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { Loader2 } from "lucide-react";
import {
  MUDPICK_KEYS,
  buscarEnderecoPorCodigo,
  limparSessaoMudanca,
  previewMudanca,
} from "@/modules/coletor/mudanca-picking/mudancaPicking.service";

interface Props { onNavigate: (path: string) => void; }

export function MudancaPickingOrigemPage({ onNavigate }: Props) {
  const offlineBlocked = useOnlineOnlyBlocked();
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const result = useResultDialog({ coletorMode: true });

  const handleScan = async (code: string) => {
    const tenantId = localStorage.getItem("core_tenant_id") || "";
    setScanned(code);
    setLoading(true);
    try {
      const endereco = await buscarEnderecoPorCodigo(tenantId, code);
      if (!endereco) {
        result.showWarning("Endereço não encontrado.");
        return;
      }

      const preview = await previewMudanca(tenantId, endereco.id);
      if (preview.sucesso !== true) {
        result.showWarning(preview.mensagem);
        return;
      }

      limparSessaoMudanca();
      sessionStorage.setItem(MUDPICK_KEYS.origemId, endereco.id);
      sessionStorage.setItem(MUDPICK_KEYS.origemDesc, endereco.descricao);
      sessionStorage.setItem(MUDPICK_KEYS.preview, JSON.stringify(preview));
      onNavigate("/coletor/movimentos/mudanca-picking/lista");
    } catch (err) {
      result.showError(err, { context: "mudanca-picking" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout title="Mudança de Picking - Origem" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      <OnlineOnlyNotice flow="Mudança de Picking" />
      <ResultDialog {...result.dialogProps} />
      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 1 de 3</span>
        <p className="text-sm font-bold text-white">Escanear o endereço de ORIGEM</p>
      </div>
      <ScanField label="Escanear Endereço Origem" onScan={handleScan} lastScanned={scanned} disabled={loading || offlineBlocked} />
      {loading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[hsl(280,80%,60%)]" size={28} /></div>}
    </ColetorLayout>
  );
}
