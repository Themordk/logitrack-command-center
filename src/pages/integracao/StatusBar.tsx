import { useEffect, useState } from "react";
import { mw } from "./entidades";
import { Loader2 } from "lucide-react";

interface Props {
  tenantId: string;
  empresaId: string;
  refreshKey: number;
}

export function StatusBar({ tenantId, empresaId, refreshKey }: Props) {
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const [cfgRes, scRes, errRes, impRes] = await Promise.all([
        mw.from("omie_config").select("ativo").eq("tenant_id", tenantId).eq("empresa_id", empresaId).maybeSingle(),
        mw.from("sync_config").select("ativo,last_sync_at").eq("tenant_id", tenantId).eq("empresa_id", empresaId),
        mw
          .from("sync_log")
          .select("*", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("empresa_id", empresaId)
          .eq("status", "error")
          .gte("executed_at", todayIso),
        mw
          .from("sync_log")
          .select("records_inserted,records_updated")
          .eq("tenant_id", tenantId)
          .eq("empresa_id", empresaId)
          .gte("executed_at", todayIso)
          .limit(5000),
      ]);

      const sc = scRes.data || [];
      const lastSync = sc
        .map((s: any) => s.last_sync_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null;
      const activeCount = sc.filter((s: any) => s.ativo).length;
      const importedToday = (impRes.data || []).reduce(
        (acc: number, r: any) => acc + (r.records_inserted || 0) + (r.records_updated || 0),
        0,
      );

      setData({
        ativo: cfgRes.data?.ativo ?? null,
        lastSync,
        activeCount,
        errorsToday: errRes.count || 0,
        importedToday,
      });
    } catch (e) {
      // silently fail
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

  return (
    <div className="card-surface px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block w-2 h-2 rounded-full ${ativo ? "bg-emerald-400 animate-pulse" : "bg-rose-500"}`} />
          <span className="font-semibold text-foreground">
            Integração Omie {ativo ? "ATIVA" : "INATIVA"}
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
