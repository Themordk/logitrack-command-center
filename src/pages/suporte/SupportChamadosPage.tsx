import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, MessageSquare, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { SupportLayout } from "@/components/suporte/SupportLayout";
import { formatDateTime } from "@/utils/dateTime";

interface Props {
  onNavigate: (path: string) => void;
  tenantId?: string;
}

export function SupportChamadosPage({ onNavigate, tenantId }: Props) {
  const [chamados, setChamados] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sess = await supabase.auth.getSession();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/support-list-chamados${tenantId ? `?tenant_id=${tenantId}` : ""}`;
        const resp = await fetch(url, {
          headers: { Authorization: `Bearer ${sess.data.session?.access_token || ""}` },
        });
        const json = await resp.json();
        if (!resp.ok || !json.success) throw new Error(json.error);
        setChamados(json.chamados);
      } catch (err: any) {
        toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [tenantId]);

  return (
    <SupportLayout
      currentPath="/suporte/chamados"
      onNavigate={onNavigate}
      breadcrumb={[{ label: "CORE LogiTrack" }, { label: "Suporte" }, { label: "Chamados" }]}
    >
      {tenantId && (
        <button
          onClick={() => onNavigate("/suporte/tenants")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft size={13} /> Voltar para Tenants
        </button>
      )}

      <div className="card-surface p-4">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare size={16} className="text-primary" />
          <h1 className="text-base font-semibold text-foreground">Chamados</h1>
          {tenantId && <span className="text-xs text-muted-foreground">(filtrado por tenant)</span>}
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : chamados.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhum chamado registrado.</p>
            <p className="text-xs mt-1">Os clientes ainda não criaram chamados de suporte.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium">Título</th>
                <th className="text-left py-2 font-medium">Prioridade</th>
                <th className="text-left py-2 font-medium">Status</th>
                <th className="text-left py-2 font-medium">Aberto em</th>
              </tr>
            </thead>
            <tbody>
              {chamados.map((c) => (
                <tr key={c.id} className="border-b border-border/40 hover:bg-secondary/30">
                  <td className="py-2">{c.titulo}</td>
                  <td className="py-2">{c.prioridade}</td>
                  <td className="py-2">{c.status}</td>
                  <td className="py-2">{formatDateTime(c.criado_em)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </SupportLayout>
  );
}
