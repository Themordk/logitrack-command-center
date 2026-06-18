import { useEffect, useState, useCallback } from "react";
import { MODULOS, INTERVALOS } from "./entidades";
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
  intervalo_minutos: number;
  ativo: boolean;
  ultimo_sync_em: string | null;
  cursor_state: Record<string, unknown> | null;
  data_inicio: string | null;
  data_fim: string | null;
}

interface LastLog {
  status: string;
  criado_em: string;
  registros_buscados: number | null;
  registros_atualizados: number | null;
  registros_inseridos: number | null;
  mensagem_erro: string | null;
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
      (supabase as any).rpc("integracao_get_sync_configs", {
        p_modulo: null,
        p_entidade: null,
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
      }),
      (supabase as any).rpc("integracao_listar_logs", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_entidade: null,
        p_status: null,
        p_erp_provedor_id: null,
        p_limite: 500,
        p_offset: 0,
      }),
    ]);
    const cfgMap: Record<string, ConfigRow> = {};
    (cfgRes.data || []).forEach((c: any) => {
      cfgMap[key(c.modulo, c.entidade)] = {
        id: c.config_id ?? c.id,
        modulo: c.modulo,
        entidade: c.entidade,
        intervalo_minutos: c.intervalo_minutos ?? 60,
        ativo: c.ativo ?? false,
        ultimo_sync_em: c.ultimo_sync_em ?? null,
        cursor_state: c.cursor_state ?? null,
        data_inicio: c.cursor_state?.data_inicio ?? null,
        data_fim: c.cursor_state?.data_fim ?? null,
      };
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
        intervalo_minutos: 60,
        ativo: false,
        ultimo_sync_em: null,
        cursor_state: null,
        data_inicio: null,
        data_fim: null,
      }),
      ...patch,
    };
    setConfigs((prev) => ({ ...prev, [k]: optimistic }));
    try {
      const direcao = modulo === "retorno" ? "saida" : "entrada";
      const params: Record<string, unknown> = {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_modulo: modulo,
        p_entidade: entidade,
        p_ativo: optimistic.ativo,
        p_intervalo_minutos: optimistic.intervalo_minutos,
        p_estrategia: "polling",
        p_direcao: direcao,
        p_erp_conexao_id: null,
      };
      // Se as datas foram alteradas, gravamos no cursor_state
      if (patch.data_inicio !== undefined || patch.data_fim !== undefined) {
        params.p_cursor_state = {
          ...(optimistic.cursor_state || {}),
          data_inicio: optimistic.data_inicio,
          data_fim: optimistic.data_fim,
        };
      } else {
        params.p_cursor_state = null;
      }
      const { error } = await (supabase as any).rpc("integracao_upsert_sync_config", params);
      if (error) throw error;
      onChanged?.();
    } catch (e: any) {
      toast.error(`Erro: ${e.message || e}`);
      load();
    }
  };

  const handleRun = async (modulo: string, entidade: string, sincronizavel: boolean) => {
    if (!sincronizavel) return;
    const k = key(modulo, entidade);
    const cfg = configs[k];
    setRunning((p) => ({ ...p, [k]: true }));
    try {
      const body: Record<string, unknown> = {
        entidade,
        modulo,
        tenant_id: tenantId,
        empresa_id: empresaId,
      };
      if (modulo === "movimentos") {
        if (cfg?.data_inicio) body.data_inicio = cfg.data_inicio;
        if (cfg?.data_fim) body.data_fim = cfg.data_fim;
      }
      const { error } = await supabase.functions.invoke("sync-entidade", { body });
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
    try {
      const { error } = await (supabase as any).rpc("integracao_resetar_cursor", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_entidade: entidade,
      });
      if (error) throw error;
      toast.success("Cursor resetado");
      load();
    } catch (e: any) {
      toast.error(`Erro ao resetar: ${e.message || e}`);
    }
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
                  {mod.key === "movimentos" && (
                    <>
                      <th className="text-left px-3 py-2 font-medium">Data De</th>
                      <th className="text-left px-3 py-2 font-medium">Data Até</th>
                    </>
                  )}
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
                  const isRunning = running[k] || false;
                  const interval = cfg?.intervalo_minutos ?? 60;
                  const ativo = cfg?.ativo ?? false;
                  const next =
                    cfg?.ultimo_sync_em && ativo
                      ? new Date(new Date(cfg.ultimo_sync_em).getTime() + interval * 60_000).toISOString()
                      : null;
                  let statusLabel = ativo ? "Ativo" : "Pausado";
                  let statusClass = ativo
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                    : "bg-amber-500/15 text-amber-400 border-amber-500/30";
                  if (isRunning) {
                    statusLabel = "Executando";
                    statusClass = "bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse";
                  } else if (log?.status === "erro" && ativo) {
                    statusLabel = "Erro";
                    statusClass = "bg-rose-500/15 text-rose-400 border-rose-500/30";
                  }
                  const ultLote = log
                    ? log.registros_buscados ?? log.registros_atualizados ?? log.registros_inseridos ?? 0
                    : null;

                  return (
                    <tr key={ent.id} className="border-t border-border/50 hover:bg-secondary/20">
                      <td className="px-3 py-2 text-foreground">
                        <div className="flex items-center gap-1.5">
                          {ent.label}
                          {!ent.sincronizavel && (
                            <span title="Sincronização ainda não disponível para esta entidade">
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
                          onChange={(e) => upsertConfig(mod.key, ent.id, { intervalo_minutos: Number(e.target.value) })}
                          className="h-7 px-2 rounded border border-border bg-secondary/40 text-foreground text-xs outline-none"
                        >
                          {INTERVALOS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      {mod.key === "movimentos" && (
                        <>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={cfg?.data_inicio ?? ""}
                              onChange={(e) =>
                                upsertConfig(mod.key, ent.id, { data_inicio: e.target.value || null })
                              }
                              className="h-7 px-2 rounded border border-border bg-secondary/40 text-foreground text-xs outline-none"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={cfg?.data_fim ?? ""}
                              onChange={(e) =>
                                upsertConfig(mod.key, ent.id, { data_fim: e.target.value || null })
                              }
                              className="h-7 px-2 rounded border border-border bg-secondary/40 text-foreground text-xs outline-none"
                            />
                          </td>
                        </>
                      )}
                      <td className="px-3 py-2 text-muted-foreground">
                        {cfg?.ultimo_sync_em ? relativeTime(cfg.ultimo_sync_em) : "Nunca"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{next ? relativeTime(next) : "—"}</td>
                      <td className="px-3 py-2 text-foreground">
                        {ultLote != null ? `${ultLote.toLocaleString("pt-BR")} reg.` : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleRun(mod.key, ent.id, ent.sincronizavel)}
                            disabled={!ent.sincronizavel || isRunning}
                            title={ent.sincronizavel ? "Executar agora" : "Sincronização ainda não disponível"}
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
