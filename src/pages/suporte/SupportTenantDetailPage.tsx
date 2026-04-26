import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Building2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SupportLayout } from "@/components/suporte/SupportLayout";

interface Props {
  tenantId: string;
  onNavigate: (path: string) => void;
}

export function SupportTenantDetailPage({ tenantId, onNavigate }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-tenant-detail?tenant_id=${tenantId}`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${sess.data.session?.access_token || ""}` },
        });
        const json = await resp.json();
        if (!resp.ok || !json.success) throw new Error(json.error);
        setData(json);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  return (
    <SupportLayout
      currentPath="/suporte/tenants"
      onNavigate={onNavigate}
      breadcrumb={[
        { label: "CORE LogiTrack" },
        { label: "Suporte" },
        { label: "Tenants", path: "/suporte/tenants" },
        { label: "Detalhes" },
      ]}
    >
      <button
        onClick={() => onNavigate("/suporte/tenants")}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft size={13} /> Voltar
      </button>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-muted-foreground" /></div>
      ) : !data ? (
        <p className="text-sm text-muted-foreground">Tenant não encontrado.</p>
      ) : (
        <div className="space-y-4">
          <div className="card-surface p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 size={18} className="text-primary" />
                  <h1 className="text-lg font-semibold text-foreground">{data.tenant.nome}</h1>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    data.tenant.ativo ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                  }`}>
                    {data.tenant.ativo ? "ATIVO" : "INATIVO"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ID: <span className="font-mono">{data.tenant.id}</span> · Criado em{" "}
                  {new Date(data.tenant.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KPI label="Empresas" value={data.tenant.total_empresas} />
              <KPI label="Usuários" value={data.tenant.total_usuarios} />
              <KPI label="Produtos" value={data.tenant.total_produtos} />
              <KPI label="Armazéns" value={data.counts.armazem} />
              <KPI label="Endereços" value={data.counts.endereco} />
              <KPI label="Doc. Entrada" value={data.counts.documento_entrada} />
              <KPI label="Doc. Saída" value={data.counts.documento_saida} />
              <KPI label="HUs" value={data.counts.hu} />
              <KPI label="Tarefas Exec." value={data.counts.tarefa_execucao} />
              <KPI label="Mov. Estoque" value={data.tenant.total_movimentos} />
              <KPI label="Mov. Entrada" value={data.tenant.total_entradas} />
              <KPI label="Ondas Saída" value={data.tenant.total_ondas} />
              <KPI label="Perfis" value={data.counts.perfil} />
              <KPI label="Sessões" value={data.counts.log_sessao_usuario} />
            </div>

            {data.ultima_sessao && (
              <p className="mt-4 text-xs text-muted-foreground">
                Última atividade:{" "}
                <span className="text-foreground">
                  {new Date(data.ultima_sessao.ultimo_heartbeat).toLocaleString("pt-BR")}
                </span>
              </p>
            )}
          </div>

          <div className="card-surface p-5">
            <h2 className="text-sm font-semibold text-foreground mb-3">Empresas</h2>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium">Código</th>
                  <th className="text-left py-2 font-medium">Razão Social</th>
                  <th className="text-left py-2 font-medium">CNPJ</th>
                  <th className="text-center py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.empresas.map((e: any) => (
                  <tr key={e.id} className="border-b border-border/40">
                    <td className="py-2 font-mono">{e.codigo || "—"}</td>
                    <td className="py-2">{e.razaosocial}</td>
                    <td className="py-2 font-mono text-muted-foreground">{e.cnpj}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                        e.ativo ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"
                      }`}>
                        {e.ativo ? "ATIVO" : "INATIVO"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SupportLayout>
  );
}

function KPI({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground tabular-nums mt-0.5">{value?.toLocaleString("pt-BR") ?? 0}</div>
    </div>
  );
}
