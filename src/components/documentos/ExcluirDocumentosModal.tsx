import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { parseError } from "@/lib/errorMapper";

interface ExcluirDocumentosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  documentoIds: string[];
  tipoDocumento: "entrada" | "saida";
}

interface ResumoDoc {
  id: string;
  numero: string;
  parceiro: string;
}

const inputClass =
  "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary";

export function ExcluirDocumentosModal({
  isOpen,
  onClose,
  onSuccess,
  documentoIds,
  tipoDocumento,
}: ExcluirDocumentosModalProps) {
  const { tenantId, empresaId, usuarioId } = useTenant();
  const [motivos, setMotivos] = useState<{ id: string; descricao: string }[]>([]);
  const [motivoId, setMotivoId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [resumo, setResumo] = useState<ResumoDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);

  const isEntrada = tipoDocumento === "entrada";

  useEffect(() => {
    if (!isOpen || !tenantId) return;
    setMotivoId("");
    setObservacao("");

    (async () => {
      setLoading(true);
      try {
        const baseMotivos = () =>
          (supabase as any)
            .from("motivo_ocorrencia")
            .select("id, descricao")
            .eq("tenant_id", tenantId)
            .eq("ativo", true)
            .order("descricao");

        let { data: motivosData } = await baseMotivos().eq("etapa_ocorrencia", "EXCLUSAO");
        if (!motivosData || motivosData.length === 0) {
          const fallback = await baseMotivos().eq("etapa_ocorrencia", "OUTROS");
          motivosData = fallback.data || [];
        }
        setMotivos(motivosData || []);

        const table = isEntrada ? "documento_entrada" : "documento_saida";
        const numeroCol = isEntrada ? "numero_nota" : "numero_pedido";
        const { data: docsData } = await (supabase as any)
          .from(table)
          .select(`id, ${numeroCol}, parceiro:parceiro_id ( razaosocial )`)
          .in("id", documentoIds);

        setResumo(
          (docsData || []).map((d: any) => ({
            id: d.id,
            numero: String(d[numeroCol] ?? "—"),
            parceiro: d.parceiro?.razaosocial || "—",
          }))
        );
      } catch (err) {
        const parsed = parseError(err);
        toast.error(parsed.title);
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen, tenantId, documentoIds, isEntrada]);

  const handleConfirm = async () => {
    if (!motivoId) {
      toast.error("Selecione o motivo da exclusão.");
      return;
    }
    setExecuting(true);
    let excluidos = 0;
    let ultimaOcorrencia: string | number | null = null;
    try {
      for (const docId of documentoIds) {
        const rpcName = isEntrada ? "fn_excluir_documento_entrada" : "fn_excluir_documento_saida";
        const paramName = isEntrada ? "p_documento_entrada_id" : "p_documento_saida_id";

        const { data, error } = await (supabase as any).rpc(rpcName, {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          [paramName]: docId,
          p_usuario_id: usuarioId,
          p_motivo_ocorrencia_id: motivoId,
          p_observacao: observacao || null,
        });

        if (error) throw error;
        if (!data?.success) throw new Error(data?.message || "Não foi possível excluir o documento.");
        excluidos += 1;
        ultimaOcorrencia = data?.numero_ocorrencia ?? ultimaOcorrencia;
      }

      toast.success(
        `${excluidos} documento(s) excluído(s).${ultimaOcorrencia ? ` Ocorrência #${ultimaOcorrencia} registrada.` : ""}`
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      const parsed = parseError(err);
      toast.error(err?.message || parsed.title, {
        description: excluidos > 0 ? `${excluidos} documento(s) já foram excluídos.` : undefined,
      });
      if (excluidos > 0) onSuccess();
    } finally {
      setExecuting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && !executing && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-500" />
            Excluir {documentoIds.length} Documento(s) de {isEntrada ? "Entrada" : "Saída"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Esta ação irá excluir os documentos selecionados e gerar uma ocorrência operacional para
              rastreabilidade. Os documentos poderão ser reimportados do ERP após a exclusão.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">
              Motivo da Exclusão *
            </label>
            <select
              value={motivoId}
              onChange={(e) => setMotivoId(e.target.value)}
              disabled={loading || executing}
              className={inputClass}
            >
              <option value="">Selecione...</option>
              {motivos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.descricao}
                </option>
              ))}
            </select>
            {!loading && motivos.length === 0 && (
              <p className="mt-1 text-[11px] text-destructive">
                Nenhum motivo de ocorrência cadastrado para exclusão. Cadastre em Configurações &gt; Motivos de
                Ocorrência.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              placeholder="Descreva o motivo da exclusão..."
              disabled={executing}
              className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary resize-none"
            />
          </div>

          <div className="rounded-lg border border-border bg-secondary/30">
            <div className="px-3 py-2 border-b border-border text-[11px] uppercase tracking-wider text-muted-foreground">
              Documentos a excluir
            </div>
            <div className="max-h-40 overflow-auto divide-y divide-border/50">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              ) : (
                resumo.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="font-mono text-foreground">
                      {isEntrada ? "NF" : "Pedido"} {d.numero}
                    </span>
                    <span className="text-muted-foreground truncate">{d.parceiro}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            disabled={executing}
            className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={executing || loading || !motivoId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            {executing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Confirmar Exclusão
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
