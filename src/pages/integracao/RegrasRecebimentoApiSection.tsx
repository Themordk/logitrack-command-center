import { useCallback, useEffect, useState } from "react";
import { RotateCcw, CheckCircle2, Ban, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/utils/dateTime";
import { parseError } from "@/lib/errorMapper";
import { usePermissions } from "@/contexts/PermissionsContext";

interface Props {
  tenantId: string;
  empresaId: string;
  erpProvedorId: string;
  onChanged?: () => void;
}

interface RegrasApi {
  conexao_id: string;
  permitir_reenvio_cancelado: boolean;
  atualizado_em: string | null;
  atualizado_por_nome: string | null;
}

const TEXTO_PERMITIDO = "O reenvio cria um documento novo. O documento cancelado é mantido no histórico.";
const TEXTO_BLOQUEADO =
  "O reenvio é ignorado e o WMS devolve o documento cancelado. Para receber de novo, o ERP precisa usar outro código.";

export function RegrasRecebimentoApiSection({ tenantId, empresaId, erpProvedorId, onChanged }: Props) {
  const { can } = usePermissions();
  const podeEditar = can("web.config.integracao", "UPDATE");
  const [info, setInfo] = useState<RegrasApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState<boolean | null>(null);

  const erro = (e: unknown, fallback: string) => {
    const p = parseError(e, "regra-reenvio");
    toast.error(!p.errorCode && p.title === "Ocorreu um erro inesperado." ? fallback : p.title);
  };

  const carregar = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc("integracao_get_regras_api", {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_erp_provedor_id: erpProvedorId,
    });
    if (error) throw error;
    setInfo(Array.isArray(data) && data.length > 0 ? (data[0] as RegrasApi) : null);
  }, [tenantId, empresaId, erpProvedorId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await carregar();
      } catch (e) {
        if (alive) erro(e, "Erro ao carregar regra de reenvio.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregar]);

  const confirmar = async () => {
    if (pendente === null) return;
    const novoValor = pendente;
    setPendente(null);
    setSalvando(true);
    try {
      const { error } = await (supabase as any).rpc("integracao_set_reenvio_cancelado", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_erp_provedor_id: erpProvedorId,
        p_permitir: novoValor,
      });
      if (error) throw error;
      toast.success("Regra de reenvio atualizada.");
      await carregar();
      onChanged?.();
    } catch (e) {
      erro(e, "Erro ao atualizar regra de reenvio.");
    } finally {
      setSalvando(false);
    }
  };

  const ligado = !!info?.permitir_reenvio_cancelado;

  return (
    <div className="card-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <RotateCcw size={16} className="text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Reenvio de documentos cancelados (API Push)</h3>
          <p className="text-xs text-muted-foreground">
            Define o que acontece quando o ERP reenvia, pela API, um documento de entrada ou de saída que foi cancelado no WMS.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      ) : !info ? (
        <p className="text-xs text-muted-foreground">
          Salve as credenciais do provedor acima para configurar esta regra.
        </p>
      ) : (
        <>
          <div className="border border-border rounded-lg px-4 py-3 bg-secondary/30 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="sw-reenvio-cancelado" className="text-sm font-medium text-foreground">
                Permitir reenvio de documento cancelado
              </label>
              <div className="flex items-center gap-2">
                {salvando && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
                <Switch
                  id="sw-reenvio-cancelado"
                  aria-label="Permitir reenvio de documento cancelado"
                  checked={ligado}
                  onCheckedChange={(v) => setPendente(v)}
                  disabled={salvando || !podeEditar}
                />
              </div>
            </div>
            {ligado ? (
              <div className="flex items-start gap-2 text-xs text-emerald-400">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <span><strong>Permitido:</strong> {TEXTO_PERMITIDO}</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-xs text-rose-400">
                <Ban size={14} className="mt-0.5 shrink-0" />
                <span><strong>Bloqueado:</strong> {TEXTO_BLOQUEADO}</span>
              </div>
            )}
          </div>

          {!podeEditar && (
            <p className="text-xs text-muted-foreground">
              Somente usuários com permissão de edição em Integração podem alterar esta regra.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Vale somente para a API Push. A sincronização automática (ex.: Omiê) nunca recria documentos cancelados.
            Documentos excluídos nunca podem ser reenviados.
          </p>

          {info.atualizado_em && (
            <p className="text-xs text-muted-foreground">
              Última alteração: <span className="text-foreground">{formatDateTime(info.atualizado_em)}</span>
              {info.atualizado_por_nome ? <> por <span className="text-foreground">{info.atualizado_por_nome}</span></> : null}
            </p>
          )}
        </>
      )}

      <AlertDialog open={pendente !== null} onOpenChange={(o) => !o && setPendente(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar regra de reenvio?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendente ? `Permitido: ${TEXTO_PERMITIDO}` : `Bloqueado: ${TEXTO_BLOQUEADO}`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmar}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
