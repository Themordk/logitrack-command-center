import { useCallback, useEffect, useState } from "react";
import { KeyRound, Eye, EyeOff, Copy, RefreshCw, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/utils/dateTime";
import { parseError } from "@/lib/errorMapper";

interface ApiKeySectionProps {
  tenantId: string;
  empresaId: string;
  erpProvedorId: string;
  onChanged?: () => void;
}

interface WebhookInfo {
  conexao_id: string;
  webhook_secret_display: string | null;
  webhook_ativo: boolean;
  webhook_label: string;
  webhook_criado_em: string | null;
  webhook_ultimo_uso_em: string | null;
  tipo_integracao: string;
}

const iconBtn =
  "p-1.5 rounded border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary/60 disabled:opacity-50 transition-colors";

export function ApiKeySection({ tenantId, empresaId, erpProvedorId, onChanged }: ApiKeySectionProps) {
  const [info, setInfo] = useState<WebhookInfo | null>(null);
  const [semConexao, setSemConexao] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"gerar" | "copiar" | "toggle" | "revelar" | null>(null);
  const [showing, setShowing] = useState(false);
  const [novaChave, setNovaChave] = useState<string | null>(null);

  const erro = (e: any, fallback: string) => {
    const p = parseError(e, "api-key");
    toast.error(!p.errorCode && p.title === "Ocorreu um erro inesperado." ? fallback : p.title);
  };

  const load = useCallback(
    async (revelar = false) => {
      const { data, error } = await (supabase as any).rpc("integracao_get_webhook_info", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_erp_provedor_id: erpProvedorId,
        p_revelar: revelar,
      });
      if (error) throw error;
      const row = Array.isArray(data) && data.length > 0 ? (data[0] as WebhookInfo) : null;
      setSemConexao(!row);
      setInfo(row);
      return row;
    },
    [tenantId, empresaId, erpProvedorId],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        await load(false);
      } catch (e) {
        if (alive) erro(e, "Erro ao carregar chave de API.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const handleGerar = async () => {
    setBusy("gerar");
    try {
      const { data, error } = await (supabase as any).rpc("integracao_regenerar_webhook_secret", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_erp_provedor_id: erpProvedorId,
      });
      if (error) throw error;
      setNovaChave(typeof data === "string" ? data : String(data));
      setShowing(false);
      await load(false);
      onChanged?.();
      toast.success("Chave de API gerada!");
    } catch (e) {
      erro(e, "Erro ao gerar chave.");
    } finally {
      setBusy(null);
    }
  };

  const handleRegenerar = async () => {
    if (
      !window.confirm(
        "Tem certeza? A chave atual será invalidada e todas as integrações que a utilizam pararão de funcionar até serem atualizadas com a nova chave.",
      )
    )
      return;
    await handleGerar();
  };

  const handleToggleShow = async () => {
    setBusy("revelar");
    try {
      if (showing) {
        await load(false);
        setShowing(false);
      } else {
        await load(true);
        setShowing(true);
        setNovaChave(null);
      }
    } catch (e) {
      erro(e, "Erro ao revelar chave.");
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    setBusy("copiar");
    try {
      let chave = novaChave;
      if (!chave) {
        const row = await load(true);
        chave = row?.webhook_secret_display ?? null;
        await load(false);
        setShowing(false);
      }
      if (!chave) throw new Error("Chave indisponível");
      await navigator.clipboard.writeText(chave);
      toast.success("Chave copiada!");
    } catch (e) {
      erro(e, "Erro ao copiar chave.");
    } finally {
      setBusy(null);
    }
  };

  const handleToggleAtivo = async (ativo: boolean) => {
    setBusy("toggle");
    try {
      const { error } = await (supabase as any).rpc("integracao_toggle_webhook", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_erp_provedor_id: erpProvedorId,
        p_ativo: ativo,
      });
      if (error) throw error;
      await load(showing);
      onChanged?.();
      toast.success(ativo ? "Webhook ativado" : "Webhook desativado");
    } catch (e) {
      erro(e, "Erro ao alterar status do webhook.");
    } finally {
      setBusy(null);
    }
  };

  const chaveExibida = novaChave ?? info?.webhook_secret_display ?? "";
  const temChave = !!novaChave || !!info?.webhook_secret_display;

  return (
    <div className="card-surface p-5 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound size={16} className="text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Chave de API (Push)</h3>
          <p className="text-xs text-muted-foreground">
            Use esta chave no header <code className="font-mono">x-api-key</code> para enviar dados ao WMS via API Push.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 size={14} className="animate-spin" /> Carregando…
        </div>
      ) : semConexao ? (
        <p className="text-xs text-muted-foreground">
          Salve as credenciais do provedor acima para habilitar a geração da chave de API.
        </p>
      ) : !temChave ? (
        <div className="flex items-center justify-between border border-dashed border-border rounded-lg px-4 py-3 bg-secondary/20">
          <span className="text-xs text-muted-foreground">Nenhuma chave gerada ainda.</span>
          <button
            onClick={handleGerar}
            disabled={busy !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {busy === "gerar" ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
            Gerar Chave de API
          </button>
        </div>
      ) : (
        <>
          {novaChave && (
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              Copie a chave agora. Ela não será exibida novamente na íntegra.
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              readOnly
              value={chaveExibida}
              className="flex-1 h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm font-mono text-foreground outline-none"
            />
            <button
              title={showing ? "Ocultar" : "Mostrar"}
              onClick={handleToggleShow}
              disabled={busy !== null || !!novaChave}
              className={iconBtn}
            >
              {busy === "revelar" ? (
                <Loader2 size={14} className="animate-spin" />
              ) : showing ? (
                <EyeOff size={14} />
              ) : (
                <Eye size={14} />
              )}
            </button>
            <button title="Copiar" onClick={handleCopy} disabled={busy !== null} className={iconBtn}>
              {busy === "copiar" ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
            </button>
            <button title="Regenerar" onClick={handleRegenerar} disabled={busy !== null} className={iconBtn}>
              {busy === "gerar" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          </div>

          <div className="flex items-center justify-between border border-border rounded-lg px-4 py-3 bg-secondary/30">
            <div>
              <div className="text-sm font-medium text-foreground">Webhook ativo</div>
              {!info?.webhook_ativo && (
                <div className="text-xs text-rose-400">Webhook desativado — requisições Push serão rejeitadas.</div>
              )}
            </div>
            <Switch checked={!!info?.webhook_ativo} onCheckedChange={handleToggleAtivo} disabled={busy !== null} />
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            <span>
              Label: <span className="text-foreground">{info?.webhook_label || "Produção"}</span>
            </span>
            <span>
              Criada em:{" "}
              <span className="text-foreground">
                {info?.webhook_criado_em ? formatDateTime(info.webhook_criado_em) : "—"}
              </span>
            </span>
            <span>
              Último uso:{" "}
              <span className="text-foreground">
                {info?.webhook_ultimo_uso_em ? formatDateTime(info.webhook_ultimo_uso_em) : "Nunca utilizada"}
              </span>
            </span>
          </div>
        </>
      )}
    </div>
  );
}
