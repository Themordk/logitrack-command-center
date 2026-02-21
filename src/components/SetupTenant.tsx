import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Boxes, Loader2, Building2 } from "lucide-react";
import { toast } from "sonner";

export function SetupTenant() {
  const { setTenantId, setEmpresaId } = useTenant();
  const [step, setStep] = useState<"tenant" | "empresa">("tenant");
  const [tenantNome, setTenantNome] = useState("CORE LogiTrack");
  const [empresaRazao, setEmpresaRazao] = useState("");
  const [empresaCnpj, setEmpresaCnpj] = useState("");
  const [saving, setSaving] = useState(false);
  const [createdTenantId, setCreatedTenantId] = useState<string>("");

  const handleCreateTenant = async () => {
    if (!tenantNome.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from("tenant").insert({ nome: tenantNome }).select("id").single();
      if (error) throw error;
      setCreatedTenantId(data.id);
      setTenantId(data.id);
      setStep("empresa");
      toast.success("Tenant criado!");
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateEmpresa = async () => {
    if (!empresaRazao.trim() || !empresaCnpj.trim()) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.from("empresa").insert({
        razaosocial: empresaRazao,
        cnpj: empresaCnpj,
        tenant_id: createdTenantId,
      }).select("id").single();
      if (error) throw error;
      setEmpresaId(data.id);
      toast.success("Empresa criada! Sistema pronto.");
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="card-surface p-8 max-w-md w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Boxes size={20} className="text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">CORE LogiTrack</h1>
            <p className="text-xs text-muted-foreground">Configuração Inicial</p>
          </div>
        </div>

        {step === "tenant" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Configure seu tenant para começar a usar o sistema.</p>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Nome do Tenant</label>
              <input
                value={tenantNome}
                onChange={(e) => setTenantNome(e.target.value)}
                placeholder="Nome da organização"
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={handleCreateTenant}
              disabled={saving || !tenantNome.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Criar Tenant
            </button>
          </div>
        )}

        {step === "empresa" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Building2 size={16} className="text-primary" />
              <p className="text-sm text-muted-foreground">Agora cadastre sua empresa principal.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Razão Social</label>
              <input
                value={empresaRazao}
                onChange={(e) => setEmpresaRazao(e.target.value)}
                placeholder="Razão Social da Empresa"
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">CNPJ</label>
              <input
                value={empresaCnpj}
                onChange={(e) => setEmpresaCnpj(e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <button
              onClick={handleCreateEmpresa}
              disabled={saving || !empresaRazao.trim() || !empresaCnpj.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              Criar Empresa e Iniciar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
