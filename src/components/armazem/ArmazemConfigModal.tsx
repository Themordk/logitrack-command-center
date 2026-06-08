import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { EnderecoSearchInput } from "./EnderecoSearchInput";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

interface Props {
  open: boolean;
  onClose: () => void;
  armazem: { id: string; descricao: string; empresa_id: string } | null;
}

export function ArmazemConfigModal({ open, onClose, armazem }: Props) {
  const { tenantId, usuarioId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [enderecoCancelamentoId, setEnderecoCancelamentoId] = useState<string | null>(null);
  const [enderecoAvariaId, setEnderecoAvariaId] = useState<string | null>(null);
  const [enderecoQuarentenaId, setEnderecoQuarentenaId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !armazem || !tenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("armazem_config")
        .select("id, endereco_cancelamento_id, endereco_avaria_id, endereco_quarentena_id")
        .eq("armazem_id", armazem.id)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (cancelled) return;
      setConfigId(data?.id ?? null);
      setEnderecoCancelamentoId(data?.endereco_cancelamento_id ?? null);
      setEnderecoAvariaId(data?.endereco_avaria_id ?? null);
      setEnderecoQuarentenaId(data?.endereco_quarentena_id ?? null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, armazem, tenantId]);

  const handleSave = async () => {
    if (!armazem || !tenantId) return;
    setSaving(true);
    const payload: any = {
      tenant_id: tenantId,
      empresa_id: armazem.empresa_id,
      armazem_id: armazem.id,
      endereco_cancelamento_id: enderecoCancelamentoId,
      ativo: true,
      updated_by: usuarioId,
    };
    if (!configId) payload.created_by = usuarioId;
    const { data, error } = await (supabase as any)
      .from("armazem_config")
      .upsert(payload, { onConflict: "tenant_id,armazem_id" })
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (error) {
      toast.error(error.message || "Erro ao salvar configuração.");
      return;
    }
    if (data?.id) setConfigId(data.id);
    toast.success("Configuração salva com sucesso!");
    onClose();
  };

  const handleRemove = async () => {
    if (!armazem || !tenantId || !configId) return false;
    setRemoving(true);
    const { error } = await (supabase as any)
      .from("armazem_config")
      .delete()
      .eq("id", configId)
      .eq("tenant_id", tenantId);
    setRemoving(false);
    if (error) {
      toast.error(error.message || "Erro ao remover configuração.");
      return false;
    }
    toast.success("Configuração removida.");
    setConfigId(null);
    setEnderecoCancelamentoId(null);
    setConfirmRemove(false);
    onClose();
    return true;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Configurações do Armazém
              {armazem && <span className="block text-xs font-normal text-muted-foreground mt-1">{armazem.descricao}</span>}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="py-12 flex items-center justify-center text-muted-foreground">
              <Loader2 size={18} className="animate-spin mr-2" /> Carregando...
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 py-4">
              <EnderecoSearchInput
                label="Endereço de Cancelamento"
                value={enderecoCancelamentoId}
                onChange={(id) => setEnderecoCancelamentoId(id)}
                armazemId={armazem?.id ?? null}
                tenantId={tenantId}
              />
              <EnderecoSearchInput
                label="Endereço de Avaria"
                value={null}
                onChange={() => {}}
                armazemId={armazem?.id ?? null}
                tenantId={tenantId}
                disabled
                badge="Em breve"
                placeholder="Disponível em breve"
              />
              <EnderecoSearchInput
                label="Endereço de Quarentena"
                value={null}
                onChange={() => {}}
                armazemId={armazem?.id ?? null}
                tenantId={tenantId}
                disabled
                badge="Em breve"
                placeholder="Disponível em breve"
              />
            </div>
          )}

          <DialogFooter className="flex sm:justify-between gap-2">
            <div>
              {configId && !loading && (
                <button
                  onClick={() => setConfirmRemove(true)}
                  disabled={removing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                >
                  <Trash2 size={14} /> Remover configuração
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemove}
        description="A configuração deste armazém será removida permanentemente."
      />
    </>
  );
}
