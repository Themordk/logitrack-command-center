import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Loader2, Building2, Briefcase } from "lucide-react";
import { toast } from "sonner";

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
}

function maskCnpj(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function SupportCreateTenantModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    nome: "",
    slug: "",
    slugTouched: false,
    razaosocial: "",
    cnpj: "",
    codigo: "",
  });
  const [saving, setSaving] = useState(false);

  const onNomeChange = (v: string) => {
    setForm((f) => ({
      ...f,
      nome: v,
      slug: f.slugTouched ? f.slug : slugify(v),
    }));
  };

  const onSlugChange = (v: string) => {
    setForm((f) => ({ ...f, slug: slugify(v), slugTouched: true }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cnpjDigits = form.cnpj.replace(/\D/g, "");
    if (form.nome.trim().length < 2) return toast.error("Informe o nome do tenant.");
    if (!/^[a-z0-9-]{2,40}$/.test(form.slug)) return toast.error("Slug inválido.");
    if (form.razaosocial.trim().length < 2) return toast.error("Informe a razão social.");
    if (cnpjDigits.length !== 14) return toast.error("CNPJ deve ter 14 dígitos.");
    if (!form.codigo.trim()) return toast.error("Informe o código da empresa.");

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("support-create-tenant", {
        body: {
          nome: form.nome.trim(),
          slug: form.slug,
          razaosocial: form.razaosocial.trim(),
          cnpj: cnpjDigits,
          codigo: form.codigo.trim(),
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro ao criar tenant");
      toast.success(`Tenant "${data.tenant.nome}" criado com sucesso.`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Novo Tenant</h2>
            <p className="text-xs text-muted-foreground">Cadastra o cliente e sua primeira empresa.</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X size={14} />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-4">
          <Section icon={<Building2 size={12} />} title="Tenant">
            <Field label="Nome do Tenant *">
              <input
                type="text"
                value={form.nome}
                onChange={(e) => onNomeChange(e.target.value)}
                className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
                required
                maxLength={120}
              />
            </Field>
            <Field label="Slug (subdomínio) *">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={form.slug}
                  onChange={(e) => onSlugChange(e.target.value)}
                  className="flex-1 h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
                  required
                  pattern="[a-z0-9-]{2,40}"
                />
                <span className="text-[10px] text-muted-foreground">.corelogitrack.com.br</span>
              </div>
            </Field>
          </Section>

          <Section icon={<Briefcase size={12} />} title="Primeira Empresa">
            <Field label="Razão Social *">
              <input
                type="text"
                value={form.razaosocial}
                onChange={(e) => setForm({ ...form, razaosocial: e.target.value })}
                className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
                required
                maxLength={200}
              />
            </Field>
            <Field label="CNPJ *">
              <input
                type="text"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: maskCnpj(e.target.value) })}
                className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
                placeholder="00.000.000/0000-00"
                required
              />
            </Field>
            <Field label="Código *">
              <input
                type="text"
                value={form.codigo}
                onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                className="w-full h-9 px-2 rounded border border-border bg-secondary/40 text-xs"
                required
                maxLength={20}
                placeholder="Ex.: 001"
              />
            </Field>
          </Section>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 h-9 rounded border border-border text-xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 h-9 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex items-center gap-1.5 disabled:opacity-50"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              Criar Tenant
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
        {icon}
        {title}
      </div>
      <div className="space-y-3 pl-1">{children}</div>
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
