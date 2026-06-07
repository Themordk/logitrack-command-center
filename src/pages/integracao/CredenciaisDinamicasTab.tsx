import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Loader2, Save, Plug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { mw } from "./entidades";
import { useErpProvedor, type EsquemaCampo } from "./useErpProvedor";

interface Props {
  erpId: string;
  tenantId: string;
  empresaId: string;
  onSaved?: () => void;
}

const inputClass =
  "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

export function CredenciaisDinamicasTab({ erpId, tenantId, empresaId, onSaved }: Props) {
  const { data: provedor, loading: loadingProv, error: provErr } = useErpProvedor(erpId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [hasSecret, setHasSecret] = useState<Record<string, boolean>>({});
  const [ativo, setAtivo] = useState(true);
  const [integracaoExiste, setIntegracaoExiste] = useState(false);

  const esquema: EsquemaCampo[] = provedor?.esquema_credencial ?? [];

  // Carrega valores existentes
  useEffect(() => {
    if (!provedor) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setTestResult(null);
      const initVals: Record<string, string> = {};
      const initSecret: Record<string, boolean> = {};

      // 1) Tenta erp_integracao
      const { data: integ } = await mw
        .from("erp_integracao")
        .select("credenciais, ativo")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("erp_provedor_id", erpId)
        .maybeSingle();

      let creds: Record<string, unknown> = {};
      let ativoAtual = true;
      let existe = false;

      if (integ) {
        existe = true;
        creds = (integ.credenciais && typeof integ.credenciais === "object")
          ? integ.credenciais as Record<string, unknown> : {};
        ativoAtual = integ.ativo !== false;
      } else if (erpId === "omie") {
        // 2) Fallback Omie legado via omie-config-get
        try {
          const { data } = await supabase.functions.invoke("omie-config-get", {
            body: { tenant_id: tenantId, empresa_id: empresaId },
          });
          const cfg = (data as any)?.config;
          if (cfg) {
            existe = true;
            creds = {
              app_key: cfg.app_key || "",
              url_base: cfg.omie_base_url || "",
            };
            if (cfg.has_secret) initSecret["app_secret"] = true;
            ativoAtual = !!cfg.ativo;
          }
        } catch { /* ignore */ }
      }

      for (const c of provedor.esquema_credencial) {
        const v = creds[c.chave];
        if (c.tipo === "senha") {
          // Não preenche senha; marca placeholder se já existe valor
          initVals[c.chave] = "";
          if (v != null && v !== "") initSecret[c.chave] = true;
        } else {
          initVals[c.chave] = (v != null ? String(v) : (c.padrao ?? ""));
        }
      }

      if (!alive) return;
      setValues(initVals);
      setHasSecret(initSecret);
      setAtivo(ativoAtual);
      setIntegracaoExiste(existe);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [provedor, erpId, tenantId, empresaId]);

  const handleSave = async () => {
    // Valida obrigatórios client-side (senha pode ficar vazia se já houver valor gravado)
    for (const c of esquema) {
      const v = (values[c.chave] || "").trim();
      const hasOld = c.tipo === "senha" && hasSecret[c.chave];
      if (c.obrigatorio && !v && !hasOld && !(c.padrao && c.padrao.length > 0)) {
        toast.error(`Informe: ${c.rotulo}`);
        return;
      }
    }
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const c of esquema) payload[c.chave] = values[c.chave] ?? "";

      const { data, error } = await supabase.functions.invoke("salvar-erp-credenciais", {
        body: { erpId, tenantId, empresaId, credenciais: payload, ativo },
      });
      if (error) throw error;
      const resp = data as any;
      if (!resp?.ok) throw new Error(resp?.message || "Falha ao salvar");

      // Limpa senhas locais e marca que existe segredo
      const nextSecret = { ...hasSecret };
      const nextVals = { ...values };
      for (const c of esquema) {
        if (c.tipo === "senha" && (values[c.chave] || "").trim()) {
          nextSecret[c.chave] = true;
          nextVals[c.chave] = "";
        }
      }
      setHasSecret(nextSecret);
      setValues(nextVals);
      setIntegracaoExiste(true);
      toast.success("Credenciais salvas!");
      onSaved?.();
    } catch (e: any) {
      toast.error(`Erro ao salvar: ${e.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (erpId !== "omie") {
      setTestResult({ ok: false, msg: "Teste de conexão disponível após configuração completa" });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const body: Record<string, unknown> = { tenant_id: tenantId, empresa_id: empresaId };
      if (values.app_key) body.app_key = values.app_key;
      if (values.app_secret) body.app_secret = values.app_secret;
      if (values.url_base) body.omie_base_url = values.url_base;
      const { data, error } = await supabase.functions.invoke("omie-test-connection", { body });
      if (error) throw error;
      const resp = data as any;
      setTestResult({ ok: !!resp?.ok, msg: resp?.message || (resp?.ok ? "Conexão OK" : "Falha") });
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "Falha na requisição" });
    } finally {
      setTesting(false);
    }
  };

  if (loadingProv || loading) {
    return (
      <div className="card-surface p-6 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </div>
    );
  }
  if (provErr || !provedor) {
    return <div className="card-surface p-6 text-sm text-destructive">Provedor não encontrado.</div>;
  }

  return (
    <div className="card-surface p-6 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {esquema.map((c) => {
          const isSecret = c.tipo === "senha";
          const show = !!showSecret[c.chave];
          const valor = values[c.chave] ?? "";
          const placeholder = isSecret && hasSecret[c.chave]
            ? "••• (deixe vazio para manter)"
            : (c.placeholder ?? "");
          return (
            <div key={c.chave} className={isSecret ? "" : ""}>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                {c.rotulo}{" "}
                {c.obrigatorio && !(isSecret && hasSecret[c.chave]) && (
                  <span className="text-destructive">*</span>
                )}
              </label>
              {isSecret ? (
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    className={inputClass}
                    value={valor}
                    onChange={(e) => setValues((v) => ({ ...v, [c.chave]: e.target.value }))}
                    placeholder={placeholder}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((s) => ({ ...s, [c.chave]: !s[c.chave] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {show ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  className={inputClass}
                  value={valor}
                  onChange={(e) => setValues((v) => ({ ...v, [c.chave]: e.target.value }))}
                  placeholder={placeholder}
                />
              )}
            </div>
          );
        })}

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
