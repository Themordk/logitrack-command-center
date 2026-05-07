import { useEffect, useMemo, useState, useCallback } from "react";
import { MODULOS, INTERVALOS, mw, type Modulo } from "./entidades";
import { relativeTime } from "./StatusBar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Play, Pause, RotateCcw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  tenantId: string;
  empresaId: string;
  onChanged?: () => void;
}

interface ConfigRow {
  id?: string;
  modulo: string;
  entidade: string;
  interval_minutes: number;
  ativo: boolean;
  last_sync_at: string | null;
  last_omie_id: number | null;
  last_omie_page: number | null;
}

interface LastLog {
  status: string;
  executed_at: string;
  records_fetched: number | null;
  records_updated: number | null;
  records_inserted: number | null;
  error_message: string | null;
}

export function SincronizacaoTab({ tenantId, empresaId, onChanged }: Props) {
  const [configs, setConfigs] = useState<Record<string, ConfigRow>>({});
  const [lastLogs, setLastLogs] = useState<Record<string, LastLog>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  const key = (m: string, e: string) => `${m}::${e}`;

  const load = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    const [cfgRes, logRes] = await Promise.all([
      mw.from("sync_config").select("*").eq("tenant_id", tenantId).eq("empresa_id", empresaId),
      mw
        .from("sync_log")
        .select("modulo,entidade,status,executed_at,records_fetched,records_updated,records_inserted,error_message")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .order("executed_at", { ascending: false })
        .limit(500),
    ]);
    const cfgMap: Record<string, ConfigRow> = {};
    (cfgRes.data || []).forEach((c: any) => {
      cfgMap[key(c.modulo, c.entidade)] = c;
    });
    const logMap: Record<string, LastLog> = {};
    (logRes.data || []).forEach((l: any) => {
      const k = key(l.modulo, l.entidade);
      if (!logMap[k]) logMap[k] = l;
    });
    setConfigs(cfgMap);
    setLastLogs(logMap);
    setLoading(false);
  }, [tenantId, empresaId]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const upsertConfig = async (modulo: string, entidade: string, patch: Partial<ConfigRow>) => {
    const k = key(modulo, entidade);
    const existing = configs[k];
    const optimistic: ConfigRow = {
      ...(existing || {
        modulo,
        entidade,
        interval_minutes: 60,
        ativo: false,
        last_sync_at: null,
        last_omie_id: null,
        last_omie_page: null,
      }),
      ...patch,
    };
    setConfigs((prev) => ({ ...prev, [k]: optimistic }));
    try {
      if (existing?.id) {
        const { error } = await mw.from("sync_config").update(patch).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { data, error } = await mw
          .from("sync_config")
          .insert({
            tenant_id: tenantId,
            empresa_id: empresaId,
            modulo,
            entidade,
            interval_minutes: optimistic.interval_minutes,
            ativo: optimistic.ativo,
          })
          .select("*")
          .single();
        if (error) throw error;
        setConfigs((prev) => ({ ...prev, [k]: data }));
      }
      onChanged?.();
    } catch (e: any) {
      toast.error(`Erro: ${e.message || e}`);
      load();
    }
  };

  const handleRun = async (modulo: string, entidade: string, fn: string | null) => {
    if (!fn) return;
    const k = key(modulo, entidade);
    setRunning((p) => ({ ...p, [k]: true }));
    try {
      const { error } = await supabase.functions.invoke(fn, {
        body: { tenant_id: tenantId, empresa_id: empresaId },
      });
      if (error) throw error;
      toast.success(`${entidade}: execução iniciada`);
    } catch (e: any) {
      toast.error(`Falha ao executar: ${e.message || e}`);
    } finally {
      setTimeout(() => {
        setRunning((p) => ({ ...p, [k]: false }));
        load();
      }, 1500);
    }
  };

  const handleReset = async (modulo: string, entidade: string) => {
    if (!confirm(`Resetar cursor de ${entidade}? Isto fará a próxima execução reimportar tudo.`)) return;
    await upsertConfig(modulo, entidade, { last_omie_id: null, last_omie_page: null });
    toast.success("Cursor resetado");
  };

  if (loading) {
    return (
      <div className="card-surface p-6 flex items-center justify-center text-muted-foreground gap-2">
        <Loader2 size={16} className="animate-spin" /> Carregando…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {MODULOS.map((mod) => (
        <div key={mod.key} className="card-surface overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-secondary/30">
            <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">{mod.label}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground bg-secondary/20">
                  <th className="text-left px-3 py-2 font-medium">Entidade</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Intervalo</th>
                  <th className="text-left px-3 py-2 font-medium">Últ. exec</th>
                  <th className="text-left px-3 py-2 font-medium">Próx. exec</th>
                  <th className="text-left px-3 py-2 font-medium">Últ. lote</th>
                  <th className="text-right px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {mod.entidades.map((ent) => {
                  const k = key(mod.key, ent.id);
                  const cfg = configs[k];
                  const log = lastLogs[k];
                  const isRunning = running[k] || log?.status === "running";
                  const interval = cfg?.interval_minutes ?? 60;
                  const ativo = cfg?.ativo ?? false;
                  const next =
                    cfg?.last_sync_at && ativo
                      ? new Date(new Date(cfg.last_sync_at).getTime() + interval * 60_000).toISOString()
                      : null;
                  let statusLabel = ativo ? "Ativo" : "Pausado";
                  let statusClass = ativo
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30";
                  if (isRunning) {
                    statusLabel = "Executando";
                    statusClass = "bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse";
                  } else if (log?.status === "error" && ativo) {
                    statusLabel = "Erro";
                    statusClass = "bg-rose-500/15 text-rose-400 border-rose-500/30";
                  }
                  const ultLote = log
                    ? log.records_fetched ?? log.records_updated ?? log.records_inserted ?? 0
                    : null;

                  return (
                    <tr key={ent.id} className="border-t border-border/50 hover:bg-secondary/20">
                      <td className="px-3 py-2 text-foreground">
                        <div className="flex items-center gap-1.5">
                          {ent.label}
                          {!ent.fn && (
                            <span title="Edge function ainda não disponível">
                              <AlertTriangle size={11} className="text-amber-400/70" />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={statusClass}>{statusLabel}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={interval}
                          onChange={(e) => upsertConfig(mod.key, ent.id, { interval_minutes: Number(e.target.value) })}
                          className="h-7 px-2 rounded border border-border bg-secondary/40 text-foreground text-xs outline-none"
                        >
                          {INTERVALOS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {cfg?.last_sync_at ? relativeTime(cfg.last_sync_at) : "Nunca"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{next ? relativeTime(next) : "—"}</td>
                      <td className="px-3 py-2 text-foreground">
                        {ultLote != null ? `${ultLote.toLocaleString("pt-BR")} reg.` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleRun(mod.key, ent.id, ent.fn)}
                            disabled={!ent.fn || isRunning}
                            title={ent.fn ? "Executar agora" : "Edge function ainda não disponível"}
                            className="p-1.5 rounded hover:bg-secondary/60 text-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                          </button>
                          <button
                            onClick={() => upsertConfig(mod.key, ent.id, { ativo: !ativo })}
                            title={ativo ? "Pausar" : "Ativar"}
                            className="p-1.5 rounded hover:bg-secondary/60 text-amber-400"
                          >
                            <Pause size={13} />
                          </button>
                          <button
                            onClick={() => handleReset(mod.key, ent.id)}
                            title="Resetar cursor"
                            className="p-1.5 rounded hover:bg-secondary/60 text-sky-400"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
