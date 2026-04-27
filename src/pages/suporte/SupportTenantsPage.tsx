import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Loader2, Building2, Info, UserPlus, MessageSquare, Power, PowerOff, Plus } from "lucide-react";
import { toast } from "sonner";
import { SupportLayout } from "@/components/suporte/SupportLayout";
import { SupportCreateUsuarioModal } from "@/components/suporte/SupportCreateUsuarioModal";
import { SupportCreateTenantModal } from "@/components/suporte/SupportCreateTenantModal";

interface TenantRow {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  total_empresas: number;
  total_usuarios: number;
  total_produtos: number;
  total_movimentos: number;
}

interface Props {
  onNavigate: (path: string) => void;
}

export function SupportTenantsPage({ onNavigate }: Props) {
  const [filtro, setFiltro] = useState("");
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createUserTenant, setCreateUserTenant] = useState<TenantRow | null>(null);
  const [showCreateTenant, setShowCreateTenant] = useState(false);

  const fetchTenants = async (nome = "") => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("support-list-tenants", {
        method: "GET",
        headers: nome ? {} : {},
        // edge function lê via URL — usa query string
        body: undefined,
      });
      // supabase.functions.invoke não aceita query nativamente; fazemos fetch direto
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-list-tenants${nome ? `?nome=${encodeURIComponent(nome)}` : ""}`;
      const sess = await supabase.auth.getSession();
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${sess.data.session?.access_token || ""}` },
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || "Erro ao listar tenants");
      setTenants(json.tenants);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => fetchTenants(filtro), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

  const toggleTenant = async (t: TenantRow) => {
    const acao = t.ativo ? "desativar" : "ativar";
    if (!confirm(`Confirma ${acao} o tenant "${t.nome}"?`)) return;
    try {
      const { data, error } = await supabase.functions.invoke("support-tenant-toggle", {
        body: { tenant_id: t.id, ativo: !t.ativo },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Erro");
      toast.success(`Tenant ${!t.ativo ? "ativado" : "desativado"}`);
      fetchTenants(filtro);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <SupportLayout
      currentPath="/suporte/tenants"
      onNavigate={onNavigate}
      breadcrumb={[{ label: "CORE LogiTrack" }, { label: "Suporte" }, { label: "Tenants" }]}
    >
      <div className="card-surface p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Building2 size={16} className="text-primary" />
              Gestão de Tenants
            </h1>
            <p className="text-xs text-muted-foreground">{tenants.length} cliente(s) cadastrado(s)</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateTenant(true)}
              className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex items-center gap-1.5"
            >
              <Plus size={13} />
              Novo Tenant
            </button>
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                placeholder="Buscar por nome..."
                className="h-9 w-64 pl-8 pr-3 rounded-md border border-border bg-secondary/40 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Tenant</th>
                <th className="text-center px-3 py-2 font-medium">Status</th>
                <th className="text-right px-3 py-2 font-medium">Empresas</th>
                <th className="text-right px-3 py-2 font-medium">Usuários</th>
                <th className="text-right px-3 py-2 font-medium">Produtos</th>
                <th className="text-right px-3 py-2 font-medium">Movimentos</th>
                <th className="text-right px-3 py-2 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <Loader2 size={16} className="animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : tenants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-muted-foreground">
                    Nenhum tenant encontrado.
                  </td>
                </tr>
              ) : (
                tenants.map((t) => (
                  <tr key={t.id} className="border-t border-border hover:bg-secondary/30">
                    <td className="px-3 py-2 font-medium text-foreground">{t.nome}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        t.ativo ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                      }`}>
                        {t.ativo ? "ATIVO" : "INATIVO"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.total_empresas}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.total_usuarios}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.total_produtos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.total_movimentos}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onNavigate(`/suporte/tenants/${t.id}`)}
                          className="p-1.5 rounded hover:bg-primary/10 text-primary"
                          title="Informações gerais"
                        >
                          <Info size={13} />
                        </button>
                        <button
                          onClick={() => setCreateUserTenant(t)}
                          className="p-1.5 rounded hover:bg-blue-500/10 text-blue-400"
                          title="Cadastrar usuário"
                        >
                          <UserPlus size={13} />
                        </button>
                        <button
                          onClick={() => onNavigate(`/suporte/chamados?tenant_id=${t.id}`)}
                          className="p-1.5 rounded hover:bg-amber-500/10 text-amber-400"
                          title="Chamados"
                        >
                          <MessageSquare size={13} />
                        </button>
                        <button
                          onClick={() => toggleTenant(t)}
                          className={`p-1.5 rounded ${t.ativo ? "hover:bg-red-500/10 text-red-400" : "hover:bg-green-500/10 text-green-400"}`}
                          title={t.ativo ? "Desativar" : "Ativar"}
                        >
                          {t.ativo ? <PowerOff size={13} /> : <Power size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {createUserTenant && (
        <SupportCreateUsuarioModal
          tenant={createUserTenant}
          onClose={() => setCreateUserTenant(null)}
          onCreated={() => {
            setCreateUserTenant(null);
            fetchTenants(filtro);
          }}
        />
      )}

      {showCreateTenant && (
        <SupportCreateTenantModal
          onClose={() => setShowCreateTenant(false)}
          onCreated={() => {
            setShowCreateTenant(false);
            fetchTenants(filtro);
          }}
        />
      )}
    </SupportLayout>
  );
}
