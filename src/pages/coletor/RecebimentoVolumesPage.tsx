import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, PackageCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";

interface Props { onNavigate: (path: string) => void; }

export function RecebimentoVolumesPage({ onNavigate }: Props) {
  const result = useResultDialog({ coletorMode: true });
  const movimentoId = sessionStorage.getItem("coletor_movimento_id");
  const [totalVolume, setTotalVolume] = useState<number | null>(null);
  const [volumeInput, setVolumeInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [erroTransporte, setErroTransporte] = useState(false);

  useEffect(() => {
    if (!movimentoId) {
      result.showWarning("Movimento não encontrado.");
      onNavigate("/coletor/recebimento/iniciar");
      return;
    }
    loadVolume();
  }, []);

  const loadVolume = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("movimento_entrada")
        .select("total_volume")
        .eq("id", movimentoId)
        .single();
      if (error) throw error;
      setTotalVolume(data?.total_volume ?? 0);
    } catch {
      result.showWarning("Erro ao carregar dados do movimento.");
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!movimentoId) return;
    const qtdConferida = Number(volumeInput);
    if (!qtdConferida || qtdConferida <= 0) {
      result.showWarning("Informe a quantidade de volumes.");
      return;
    }

    setSubmitting(true);
    try {
      // Save total_volume_conferido
      const { error } = await (supabase as any)
        .from("movimento_entrada")
        .update({ total_volume_conferido: qtdConferida })
        .eq("id", movimentoId);

      if (error) throw error;

      // Compare volumes
      if (qtdConferida === (totalVolume ?? 0)) {
        toast.success("Volumes conferidos com sucesso!");
        onNavigate("/coletor/recebimento/execucao");
      } else {
        // Mark as ERRO_TRANSPORTADOR
        await (supabase as any)
          .from("movimento_entrada")
          .update({ status: "ERRO_TRANSPORTADOR" })
          .eq("id", movimentoId);

        setErroTransporte(true);
      }
    } catch (err: any) {
      const parsed = parseError(err, "recebimento-volumes");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      result.showParsedError(parsed);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ColetorLayout title="Conferência de Volumes" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/iniciar">
        <ResultDialog {...result.dialogProps} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" />
        </div>
      </ColetorLayout>
    );
  }

  if (erroTransporte) {
    return (
      <ColetorLayout title="Erro no Transporte" onNavigate={onNavigate} showBack backPath="/coletor/recebimento">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 px-4">
          <div className="w-16 h-16 rounded-full bg-[hsl(38,92%,50%)]/20 flex items-center justify-center">
            <AlertTriangle size={32} className="text-[hsl(38,92%,50%)]" />
          </div>
          <h2 className="text-lg font-bold text-white">Divergência de Volumes</h2>
          <p className="text-sm text-[hsl(213,31%,60%)]">
            Volumes esperados: <span className="font-bold text-white">{totalVolume ?? 0}</span>
          </p>
          <p className="text-sm text-[hsl(213,31%,60%)]">
            Volumes conferidos: <span className="font-bold text-[hsl(38,92%,50%)]">{volumeInput}</span>
          </p>
          <p className="text-sm text-[hsl(38,92%,50%)]">
            O movimento foi marcado como <strong>ERRO NO TRANSPORTADOR</strong>.
          </p>
          <p className="text-xs text-[hsl(213,31%,50%)]">
            Solicite a liberação com um supervisor para continuar o recebimento.
          </p>
          <ActionButton onClick={() => onNavigate("/coletor/recebimento")} variant="secondary">
            VOLTAR AO MENU
          </ActionButton>
        </div>
      </ColetorLayout>
    );
  }

  return (
    <ColetorLayout title="Conferência de Volumes" onNavigate={onNavigate} showBack backPath="/coletor/recebimento/iniciar">
      <div className="flex-1 flex flex-col space-y-4">
        {/* Info card */}
        <div className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4">
          <div className="flex items-center gap-3 mb-3">
            <PackageCheck size={24} className="text-[hsl(217,91%,60%)]" />
            <h3 className="text-sm font-bold text-white">Conferência de Volumes</h3>
          </div>
          <p className="text-xs text-[hsl(213,31%,55%)] text-center py-4">
            Informe abaixo a quantidade de volumes recebidos fisicamente
          </p>
        </div>

        {/* Input */}
        <div>
          <label className="block text-xs font-medium text-[hsl(213,31%,55%)] mb-1.5 uppercase">
            Quantidade de Volumes Recebidos *
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={volumeInput}
            onChange={(e) => setVolumeInput(e.target.value)}
            placeholder="0"
            autoFocus
            className="w-full h-14 px-4 rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-2xl font-mono font-bold text-white text-center outline-none focus:border-[hsl(217,91%,60%)]"
          />
        </div>

        <div className="flex-1" />

        {/* Action */}
        <ActionButton
          onClick={handleConfirm}
          loading={submitting}
          disabled={!volumeInput || Number(volumeInput) <= 0}
          variant="success"
        >
          CONFIRMAR VOLUMES
        </ActionButton>
      </div>
    </ColetorLayout>
  );
}
