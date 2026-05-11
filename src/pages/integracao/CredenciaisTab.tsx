import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Loader2, Save, Plug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  tenantId: string;
  empresaId: string;
  onSaved?: () => void;
}

const DEFAULT_URL = "https://app.omie.com.br/api/v1";

export function CredenciaisTab({ tenantId, empresaId, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [appKey, setAppKey] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [hasSecret, setHasSecret] = useState(false);
  const [urlBase, setUrlBase] = useState(DEFAULT_URL);
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setTestResult(null);
      const { data, error } = await supabase.functions.invoke("omie-config-get", {
        body: { tenant_id: tenantId, empresa_id: empresaId },
      });
      if (!alive) return;
      if (error) toast.error(`Erro ao carregar credenciais: ${error.message}`);
      const cfg = (data as any)?.config;
      if (cfg) {
        setId(cfg.id);
        setAppKey(cfg.app_key || "");
        setHasSecret(!!cfg.has_secret);
        setAppSecret("");
        setUrlBase(cfg.omie_base_url || DEFAULT_URL);
        setAtivo(!!cfg.ativo);
      } else {
        setId(null);
        setAppKey("");
        setAppSecret("");
        setHasSecret(false);
        setUrlBase(DEFAULT_URL);
        setAtivo(true);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [tenantId, empresaId]);

  const handleSave = async () => {
    if (!appKey) { toast.error("Informe o APP KEY"); return; }
    if (!id && !appSecret) { toast.error("Informe o APP SECRET"); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("omie-config-save", {
        body: {
          tenant_id: tenantId,
          empresa_id: empresaId,
          app_key: appKey,
          app_secret: appSecret || undefined,
          omie_base_url: urlBase,
          ativo,
        },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.error) throw new Error(resp.error);
      if (resp?.id) setId(resp.id);
      setHasSecret(true);
      setAppSecret("");
      toast.success("Credenciais salvas!");
      onSaved?.();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("omie-test-connection", {
        body: {
          tenant_id: tenantId,
          empresa_id: empresaId,
          ...(appKey ? { app_key: appKey } : {}),
          ...(appSecret ? { app_secret: appSecret } : {}),
          ...(urlBase ? { omie_base_url: urlBase } : {}),
        },
      });
      if (error) throw error;
      const resp = data as any;
      setTestResult({ ok: !!resp?.ok, msg: resp?.message || (resp?.ok ? "Conexão OK" : "Falha") });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "Falha na requisição" });
    } finally {
      setTesting(false);
    }
  };

  const inputClass =
    "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

  if (loading) {
    return (
      <div className="card-surface p-6 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="card-surface p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            APP KEY <span className="text-destructive">*</span>
          </label>
          <input className={inputClass} value={appKey} onChange={(e) => setAppKey(e.target.value)} placeholder="123456789..." />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
            APP SECRET {!id && <span className="text-destructive">*</span>}
          </label>
          <div className="relative">
            <input
              type={showSecret ? "text" : "password"}
              className={inputClass}
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={hasSecret ? "••• (deixe vazio para manter)" : "secret"}
            />
            <button
              type="button"
              onClick={() => setShowSecret(!showSecret)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">URL BASE</label>
          <input className={`${inputClass} opacity-70 cursor-not-allowed`} value={urlBase} readOnly />
        </div>
        <div className="md:col-span-2 flex items-center justify-between border border-border rounded-lg px-4 py-3 bg-secondary/30">
          <div>
            <div className="text-sm font-medium text-foreground">Integração ativa</div>
            <div className="text-xs text-muted-foreground">Quando inativa, nenhuma sincronização será executada.</div>
          </div>
          <Switch checked={ativo} onCheckedChange={setAtivo} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          onClick={handleTest}
          disabled={testing || saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-foreground hover:bg-secondary/60 disabled:opacity-50"
        >
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
          Testar Conexão
        </button>
        {testResult && (
          <Badge
            variant="outline"
            className={
              testResult.ok
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                : "bg-rose-500/15 text-rose-400 border-rose-500/40"
            }
          >
            {testResult.ok ? "Conexão OK" : `Falha: ${testResult.msg}`}
          </Badge>
        )}
        <div className="ml-auto" />
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar Configurações
        </button>
      </div>
    </div>
  );
}
