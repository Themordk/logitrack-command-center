import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Props {
  tenantId: string;
  empresaId: string;
  refreshKey: number;
  nomeProvedor?: string;
}

export function StatusBar({ tenantId, empresaId, refreshKey, nomeProvedor }: Props) {
  const [data, setData] = useState<{
    ativo: boolean | null;
    lastSync: string | null;
    activeCount: number;
    errorsToday: number;
    importedToday: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!tenantId || !empresaId) return;
    try {
      const [credRes, syncRes, resumoRes] = await Promise.all([
        (supabase as any).rpc("integracao_get_credenciais", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_erp_provedor_id: null,
        }),
        (supabase as any).rpc("integracao_get_sync_configs", {
          p_modulo: null,
          p_entidade: null,
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
        }),
        (supabase as any).rpc("integracao_resumo_sync_hoje", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
        }),
      ]);

      const ativo = (credRes.data || []).length > 0;
      const cfgs = syncRes.data || [];
      const activeCount = cfgs.filter((c: any) => c.ativo).length;
      const resumo = Array.isArray(resumoRes.data) ? resumoRes.data[0] : resumoRes.data;

      setData({
        ativo,
        lastSync: resumo?.ultimo_sync_em ?? null,
        activeCount,
        errorsToday: resumo?.total_erro ?? 0,
        importedToday:
          (resumo?.registros_inseridos_hoje ?? 0) +
          (resumo?.registros_atualizados_hoje ?? 0),
      });
    } catch {
      /* silently fail */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, refreshKey]);

  if (loading || !data) {
    return (
      <div className="card-surface px-4 py-2.5 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 size={12} className="animate-spin" /> Carregando status…
      </div>
    );
  }

  const ativo = data.ativo === true;
  const label = nomeProvedor || "ERP";

  return (
    <div className="card-surface px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${ativo ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
          <span className="font-semibold text-foreground">
            Integração {label} {ativo ? "ATIVA" : "INATIVA"}
          </span>
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          Última sync: <span className="text-foreground">{data.lastSync ? relativeTime(data.lastSync) : "—"}</span>
        </span>
      </div>
      <div className="flex items-center gap-3 text-muted-foreground">
        <span><span className="text-foreground font-semibold">{data.activeCount}</span> entidades ativas</span>
        <span>·</span>
        <span>
          <span className={`font-semibold ${data.errorsToday > 0 ? "text-rose-400" : "text-foreground"}`}>{data.errorsToday}</span> erros hoje
        </span>
        <span>·</span>
        <span><span className="text-foreground font-semibold">{data.importedToday.toLocaleString("pt-BR")}</span> reg. importados</span>
      </div>
    </div>
  );
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 0) {
    const future = Math.abs(diff);
    if (future < 60_000) return `em ${Math.round(future / 1000)}s`;
    if (future < 3600_000) return `em ${Math.round(future / 60_000)} min`;
    if (future < 86400_000) return `em ${Math.round(future / 3600_000)}h`;
    return `em ${Math.round(future / 86400_000)}d`;
  }
  if (diff < 60_000) return "agora";
  if (diff < 3600_000) return `há ${Math.round(diff / 60_000)} min`;
  if (diff < 86400_000) return `há ${Math.round(diff / 3600_000)}h`;
  return `há ${Math.round(diff / 86400_000)}d`;
}
