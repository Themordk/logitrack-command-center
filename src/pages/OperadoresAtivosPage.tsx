import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { formatTime } from "@/utils/dateTime";
import { Users, PlayCircle, Clock, RefreshCw, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatarTempoEspera } from "@/pages/dashboard/dashboard.service";

const sb = supabase as any;
const REFRESH_INTERVAL = 30_000;

interface OperadorAtivo {
  usuario_id: string;
  nome: string;
  tipo_operacao: string | null;
  habilidade: string | null;
  tipo_usuario: string | null;
  armazem: string | null;
  armazem_id: string | null;
  inicio_sessao: string;
  ultimo_heartbeat: string;
  seg_desde_heartbeat: number;
  status_operador: "EM_ATIVIDADE" | "OCIOSO";
  tarefa_execucao_id: string | null;
  tarefa_id: string | null;
  tipo_tarefa_codigo: string | null;
  tipo_tarefa_desc: string | null;
  produto_sku: string | null;
  produto_descricao: string | null;
  endereco_origem: string | null;
  endereco_destino: string | null;
  quantidade_requerida: number | null;
  iniciado_em: string | null;
  tempo_na_tarefa_seg: number | null;
  tempo_ocioso_seg: number | null;
  ultima_conclusao: string | null;
  tarefas_hoje: number;
}

export function OperadoresAtivosPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { tenantId, empresaId, empresaVersion, armazemId } = useTenant();
  const [data, setData] = useState<OperadorAtivo[]>([]);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [armazens, setArmazens] = useState<any[]>([]);
  const [filtroArmazem, setFiltroArmazem] = useState<string | null>(armazemId || null);
  const [filtroStatus, setFiltroStatus] = useState<"ALL" | "EM_ATIVIDADE" | "OCIOSO">("ALL");

  useEffect(() => {
    if (!tenantId) return;
    let q = sb.from("armazem").select("id,descricao").eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
    if (empresaId) q = q.eq("empresa_id", empresaId);
    q.then(({ data }: any) => setArmazens(data || []));
  }, [tenantId, empresaId, empresaVersion]);

  const carregar = useCallback(async (showLoading = false) => {
    if (!tenantId) return;
    if (showLoading) setLoading(true);
    const { data, error } = await sb.rpc("dashboard_operadores_ativos", {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId || null,
      p_armazem_id: filtroArmazem || null,
    });
    if (!error) {
      setData(Array.isArray(data) ? data : []);
      setUltimaAtualizacao(new Date());
    }
    setLoading(false);
  }, [tenantId, empresaId, filtroArmazem]);

  useEffect(() => { carregar(true); }, [carregar, empresaVersion]);
  useEffect(() => {
    const id = setInterval(() => carregar(false), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [carregar]);

  const filtered = useMemo(
    () => data.filter((o) => filtroStatus === "ALL" || o.status_operador === filtroStatus),
    [data, filtroStatus],
  );

  const totalOnline = data.length;
  const totalAtivos = data.filter((o) => o.status_operador === "EM_ATIVIDADE").length;
  const totalOciosos = data.filter((o) => o.status_operador === "OCIOSO").length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate("/")}
            className="p-1.5 rounded-md hover:bg-secondary/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Voltar ao Dashboard"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">Operadores Ativos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Visão em tempo real dos operadores no coletor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {ultimaAtualizacao && (
            <button
              onClick={() => carregar(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              title="Clique para atualizar agora"
            >
              <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
              {format(ultimaAtualizacao, "HH:mm:ss")}
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Auto-refresh
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MiniCard icon={<Users size={18} />} label="Total Online" value={totalOnline} accent="text-blue-400 bg-blue-500/10 border-blue-500/20" />
        <MiniCard icon={<PlayCircle size={18} />} label="Em Atividade" value={totalAtivos} accent="text-green-400 bg-green-500/10 border-green-500/20" />
        <MiniCard icon={<Clock size={18} />} label="Ociosos" value={totalOciosos} accent={totalOciosos > 0 ? "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" : "text-muted-foreground bg-secondary/40 border-border/50"} />
      </div>

      <div className="card-surface p-3 flex flex-wrap items-center gap-2">
        <Select value={filtroArmazem || "ALL"} onValueChange={(v) => setFiltroArmazem(v === "ALL" ? null : v)}>
          <SelectTrigger className="w-[220px] h-9 bg-secondary/40 border-border/50"><SelectValue placeholder="Armazém" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os armazéns</SelectItem>
            {armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={(v) => setFiltroStatus(v as any)}>
          <SelectTrigger className="w-[180px] h-9 bg-secondary/40 border-border/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os status</SelectItem>
            <SelectItem value="EM_ATIVIDADE">Em Atividade</SelectItem>
            <SelectItem value="OCIOSO">Ociosos</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => carregar(true)}>
          <RefreshCw size={12} className={cn("mr-1.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="card-surface overflow-hidden">
        {loading ? (
          <div className="p-5 space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-secondary/30 animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Users size={40} className="mb-3 opacity-40" />
            <p className="text-sm">Nenhum operador conectado no coletor no momento.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Operador</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tarefa Atual</th>
                  <th className="text-left px-4 py-2.5 font-medium">Produto</th>
                  <th className="text-left px-4 py-2.5 font-medium">Endereço</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tempo</th>
                  <th className="text-right px-4 py-2.5 font-medium">Tarefas Hoje</th>
                  <th className="text-left px-4 py-2.5 font-medium">Sessão</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const ocioso = o.status_operador === "OCIOSO";
                  const ociosoSeg = o.tempo_ocioso_seg || 0;
                  let borderClass = "";
                  let badgeClass = "bg-green-500/15 text-green-400 border-green-500/30";
                  let badgeLabel = "Em Atividade";
                  if (ocioso) {
                    if (ociosoSeg > 20 * 60) {
                      borderClass = "border-l-2 border-l-red-500";
                      badgeClass = "bg-red-500/15 text-red-400 border-red-500/30";
                      badgeLabel = "Ocioso > 20min";
                    } else if (ociosoSeg > 10 * 60) {
                      borderClass = "border-l-2 border-l-yellow-500";
                      badgeClass = "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
                      badgeLabel = "Ocioso";
                    } else {
                      badgeClass = "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
                      badgeLabel = "Ocioso";
                    }
                  }
                  const tempo = ocioso ? o.tempo_ocioso_seg || 0 : o.tempo_na_tarefa_seg || 0;
                  const endereco = [o.endereco_origem, o.endereco_destino].filter(Boolean).join(" → ") || "—";
                  return (
                    <tr key={o.usuario_id} className={cn("border-b border-border/30 hover:bg-secondary/20 transition-colors", borderClass)}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{o.nome}</div>
                        {o.tipo_operacao && <div className="text-[11px] text-muted-foreground">{o.tipo_operacao}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border", badgeClass)}>
                          {badgeLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {ocioso ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div>
                            <div className="font-medium text-foreground">{o.tipo_tarefa_desc || o.tipo_tarefa_codigo || "—"}</div>
                            {o.produto_sku && <div className="text-[11px] text-muted-foreground">SKU {o.produto_sku}</div>}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="truncate text-muted-foreground" title={o.produto_descricao || ""}>
                          {o.produto_descricao || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">{endereco}</td>
                      <td className="px-4 py-3 tabular-nums">{tempo > 0 ? formatarTempoEspera(tempo) : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{o.tarefas_hoje}</td>
                      <td className="px-4 py-3 text-muted-foreground">{o.inicio_sessao ? format(new Date(o.inicio_sessao), "HH:mm") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <div className="card-surface p-4 flex items-center gap-3">
      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center border", accent)}>{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums text-foreground">{value}</div>
      </div>
    </div>
  );
}
