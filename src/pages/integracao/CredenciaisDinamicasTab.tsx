import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Loader2, Save, Plug } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useErpProvedor, type EsquemaCampo } from "./useErpProvedor";
import { parseError } from "@/lib/errorMapper";

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

      const { data: rows } = await (supabase as any).rpc("integracao_get_credenciais", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_erp_provedor_id: erpId,
      });

      const row = Array.isArray(rows) ? rows[0] : null;
      const creds: Record<string, unknown> =
        row?.credenciais && typeof row.credenciais === "object" ? row.credenciais : {};
      const configExtra: Record<string, unknown> =
        row?.config_extra && typeof row.config_extra === "object" ? row.config_extra : {};
      const existe = !!row;

      for (const c of provedor.esquema_credencial) {
        const v = creds[c.chave] ?? configExtra[c.chave];
        if (c.tipo === "senha") {
          initVals[c.chave] = "";
          if (v != null && v !== "") initSecret[c.chave] = true;
        } else {
          initVals[c.chave] = (v != null ? String(v) : (c.padrao ?? ""));
        }
      }

      if (!alive) return;
      setValues(initVals);
      setHasSecret(initSecret);
      setAtivo(true);
      setIntegracaoExiste(existe);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [provedor, erpId, tenantId, empresaId]);

  const handleSave = async () => {
    // Valida obrigatórios client-side
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
      // Separa credenciais (senha) vs config_extra (texto). Heurística: senhas → credenciais.
      const credenciais: Record<string, string> = {};
      const configExtra: Record<string, string> = {};
      for (const c of esquema) {
        const v = values[c.chave] ?? "";
        if (c.tipo === "senha") {
          if (v) credenciais[c.chave] = v;
        } else {
          // Para retrocompatibilidade enviamos campos texto também em credenciais
          credenciais[c.chave] = v;
          configExtra[c.chave] = v;
        }
      }

      const { data, error } = await supabase.functions.invoke("erp-conexao", {
        body: {
          acao: "save",
          empresa_id: empresaId,
          erp_id: erpId,
          credenciais,
          config_extra: configExtra,
          tipo_integracao: "polling",
          ativo,
        },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp && resp.sucesso === false) {
        const msg = resp.campos?.length
          ? `${resp.mensagem || "Campos obrigatórios"}: ${resp.campos.join(", ")}`
          : resp.mensagem || "Falha ao salvar";
        throw new Error(msg);
      }

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
      const parsed = parseError(e, "salvar credenciais");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao salvar." : parsed.title);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!integracaoExiste) {
      setTestResult({ ok: false, msg: "Salve as credenciais antes de testar a conexão." });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("erp-conexao", {
        body: { acao: "testar", empresa_id: empresaId, erp_id: erpId },
      });
      if (error) throw error;
      const resp = data as any;
      const ok = !!(resp?.ok ?? resp?.sucesso);
      setTestResult({ ok, msg: resp?.message || resp?.mensagem || (ok ? "Conexão OK" : "Falha") });
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
            <div key={c.chave}>
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
          disabled={testing || saving || !integracaoExiste}
          title={!integracaoExiste ? "Salve as credenciais antes de testar" : "Testar conexão"}
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
