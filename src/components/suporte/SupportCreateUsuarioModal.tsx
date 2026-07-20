import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";

interface Props {
  tenant: { id: string; nome: string };
  onClose: () => void;
  onCreated: () => void;
}

export function SupportCreateUsuarioModal({ tenant, onClose, onCreated }: Props) {
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [perfis, setPerfis] = useState<any[]>([]);
  const [armazens, setArmazens] = useState<any[]>([]);
  const [form, setForm] = useState({
    empresa_id: "",
    armazem_id: "",
    nome: "",
    login: "",
    senha: "",
    tipo_operacao: "RECEBIMENTO",
    habilidade: "TREINANDO",
    perfil_id: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const sess = await supabase.auth.getSession();
      const token = sess.data.session?.access_token || "";
      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tenant-detail?tenant_id=${tenant.id}`;
      const resp = await fetch(baseUrl, { headers: { Authorization: `Bearer ${token}` } });
      const json = await resp.json();
      if (json.success) {
        setEmpresas(json.empresas || []);
      }
      // Perfis e armazéns: precisamos de outras edge calls. Para simplificar, tentar via REST com header tenant.
      // Como suporte não tem tenant_id, fazemos via service role indireto chamando uma function pequena seria ideal,
      // mas para v1 deixamos perfil/armazém opcionais.
    })();
  }, [tenant.id]);

  // Quando empresa muda, buscar armazéns dessa empresa via fetch direto (seria ideal outra edge,
  // por ora deixar livre — o operador já pode digitar/escolher na UI principal de cada cliente)
  useEffect(() => {
    setArmazens([]);
  }, [form.empresa_id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.empresa_id || !form.nome || !form.login || form.senha.length < 6) {
      toast.error("Preencha todos os campos. Senha mínima de 6 caracteres.");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("support-create-usuario", {
        body: {
          tenant_id: tenant.id,
          empresa_id: form.empresa_id,
          armazem_id: form.armazem_id || null,
          nome: form.nome,
          login: form.login,
          senha: form.senha,
          tipo_operacao: form.tipo_operacao,
          habilidade: form.habilidade,
          perfil_id: form.perfil_id || null,
          ativo: true,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao criar usuário");
      toast.success("Usuário criado com sucesso");
      onCreated();
    } catch (err: any) {
      toast.error(parseError(err, "support-create-usuario-modal").title);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Novo Usuário</h2>
            <p className="text-xs text-muted-foreground">Tenant: <span className="text-foreground">{tenant.nome}</span></p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          <Field label="Empresa *">
            <select
              value={form.empresa_id}
              onChange={(e) => setForm({ ...form, empresa_id: e.target.value })}
              className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
              required
            >
              <option value="">Selecione...</option>
              {empresas.map((e) => (
                <option key={e.id} value={e.id}>{e.codigo || e.razaosocial}</option>
              ))}
            </select>
          </Field>

          <Field label="Nome *">
            <input
              type="text" value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
              required
            />
          </Field>

          <Field label="Login *">
            <input
              type="text" value={form.login}
              onChange={(e) => setForm({ ...form, login: e.target.value.toLowerCase() })}
              className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
              required
            />
          </Field>

          <Field label="Senha (mínimo 6 caracteres) *">
            <input
              type="password" value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
              required minLength={6}
            />
          </Field>

          <Field label="Tipo de Operação">
            <select
              value={form.tipo_operacao}
              onChange={(e) => setForm({ ...form, tipo_operacao: e.target.value })}
              className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
            >
              <option value="RECEBIMENTO">RECEBIMENTO</option>
              <option value="ARMAZENAGEM">ARMAZENAGEM</option>
              <option value="MOVIMENTOS">MOVIMENTOS</option>
              <option value="SEPARACAO">SEPARACAO</option>
              <option value="CONFERENCIA">CONFERENCIA</option>
              <option value="EXPEDICAO">EXPEDICAO</option>
              <option value="AUDITORIA">AUDITORIA</option>
            </select>
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 h-9 rounded border border-border text-xs">
              Cancelar
            </button>
            <button
              type="submit" disabled={saving}
              className="px-4 h-9 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Cadastrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-muted-foreground uppercase mb-1">{label}</label>
      {children}
    </div>
  );
}
