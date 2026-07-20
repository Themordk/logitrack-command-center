import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Truck, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseError } from "@/lib/errorMapper";

interface Props {
  open: boolean;
  onClose: () => void;
  movimentoEntradaId: string;
  onSuccess?: () => void;
}

interface Motivo { id: string; descricao: string }

export function LiberarErroTransporteModal({ open, onClose, movimentoEntradaId, onSuccess }: Props) {
  const { tenantId, usuarioId, armazemId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [totalVolume, setTotalVolume] = useState(0);
  const [totalConferido, setTotalConferido] = useState(0);
  const [motivos, setMotivos] = useState<Motivo[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [observacao, setObservacao] = useState("");

  useEffect(() => {
    if (!open || !tenantId || !movimentoEntradaId) return;
    let active = true;
    (async () => {
      setLoading(true);
      setMotivoId("");
      setObservacao("");
      try {
        const [movRes, motRes] = await Promise.all([
          (supabase as any)
            .from("movimento_entrada")
            .select("total_volume, total_volume_conferido")
            .eq("id", movimentoEntradaId)
            .eq("tenant_id", tenantId)
            .single(),
          (supabase as any)
            .from("motivo_ocorrencia")
            .select("id, descricao")
            .eq("tenant_id", tenantId)
            .eq("armazem_id", armazemId)
            .eq("ativo", true)
            .order("descricao"),
        ]);
        if (!active) return;
        if (movRes.error) throw movRes.error;
        if (motRes.error) throw motRes.error;
        setTotalVolume(Number(movRes.data?.total_volume) || 0);
        setTotalConferido(Number(movRes.data?.total_volume_conferido) || 0);
        setMotivos(motRes.data || []);
      } catch (err: any) {
        toast.error((() => { const p = parseError(err, "liberar-erro-transporte-modal"); return (!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Falha ao carregar dados" : p.title; })());
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, tenantId, movimentoEntradaId, armazemId]);

  const diferenca = Math.abs(totalVolume - totalConferido);
  const volumesIguais = !loading && totalVolume === totalConferido;

  const handleConfirm = async () => {
    if (!tenantId || !usuarioId) {
      toast.error("Sessão inválida.");
      return;
    }
    if (!motivoId) {
      toast.error("Selecione um motivo de ocorrência.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("liberar_recebimento_erro_transporte" as any, {
        p_movimento_entrada_id: movimentoEntradaId,
        p_tenant_id: tenantId,
        p_usuario_id: usuarioId,
        p_motivo_ocorrencia_id: motivoId,
        p_observacao: observacao.trim() || null,
      });
      if (error) throw error;
      const r: any = data || {};
      if (r.sucesso === false) {
        toast.error(r.mensagem || "Falha ao liberar.");
        return;
      }
      toast.success(r.mensagem || "Recebimento liberado e ocorrência registrada.");
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error((() => { const p = parseError(err, "liberar-erro-transporte-modal"); return (!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao registrar ocorrência." : p.title; })());
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck size={18} className="text-amber-400" />
            Liberar recebimento com erro no transporte
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : volumesIguais ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12 gap-3">
            <AlertTriangle size={42} className="text-muted-foreground" />
            <p className="text-sm text-foreground">A conferência dos volumes está correta.</p>
            <p className="text-xs text-muted-foreground">Não é necessário liberar com erro no transporte.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto space-y-4 pr-1">
            <div className="grid grid-cols-3 gap-3">
              <Kpi label="Volume esperado" value={totalVolume} tone="neutral" />
              <Kpi label="Volume conferido" value={totalConferido} tone="neutral" />
              <Kpi label="Diferença" value={diferenca} tone="red" />
            </div>

            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex items-start gap-2">
              <AlertTriangle size={16} className="text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200">
                Esta ação registra uma ocorrência operacional (etapa Recebimento) e libera o
                movimento mesmo com divergência entre volumes esperados e conferidos.
              </p>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">
                Motivo da ocorrência *
              </label>
              <select
                value={motivoId}
                onChange={(e) => setMotivoId(e.target.value)}
                disabled={submitting}
                className="w-full h-9 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary"
              >
                <option value="">Selecione o motivo...</option>
                {motivos.map((m) => (
                  <option key={m.id} value={m.id}>{m.descricao}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">
                Observação (opcional)
              </label>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                disabled={submitting}
                rows={3}
                className="w-full px-3 py-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary resize-none"
              />
            </div>
          </div>
        )}

        <DialogFooter className="shrink-0">
          {volumesIguais ? (
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
            >
              Fechar
            </button>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={submitting || loading || !motivoId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
              >
                {submitting && <Loader2 size={14} className="animate-spin" />}
                Registrar ocorrência e liberar
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: "neutral" | "red" }) {
  const cls = tone === "red"
    ? "border-red-500/30 bg-red-500/5 text-red-400"
    : "border-border bg-secondary/40 text-foreground";
  return (
    <div className={cn("rounded-lg border p-3", cls)}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1 font-mono">{value}</p>
    </div>
  );
}
