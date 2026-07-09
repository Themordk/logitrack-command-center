import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { PlayCircle, ListTodo, UserCheck, RefreshCw, ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatarTempoEspera } from "@/pages/dashboard/dashboard.service";

const sb = supabase as any;
const REFRESH_INTERVAL = 30_000;

interface TarefaEmExecucao {
  tarefa_id: string;
  status: "EM_ANDAMENTO";
  tipo_tarefa_codigo: string | null;
  tipo_tarefa_desc: string | null;
  operador_id: string | null;
  operador_nome: string | null;
  produto_sku: string | null;
  produto_descricao: string | null;
  endereco_origem: string | null;
  endereco_destino: string | null;
  quantidade_requerida: number | null;
  quantidade_executada: number | null;
  prioridade: string | null;
  criado_em: string;
  iniciado_em: string | null;
  tempo_execucao_seg: number | null;
}

interface TarefaFilaEspera {
  tarefa_id: string;
  status: "CRIADA" | "ATRIBUIDA";
  tipo_tarefa_codigo: string | null;
  tipo_tarefa_desc: string | null;
  operador_id: string | null;
  operador_nome: string | null;
  produto_sku: string | null;
  produto_descricao: string | null;
  endereco_origem: string | null;
  endereco_destino: string | null;
  quantidade_requerida: number | null;
  prioridade: string | null;
  criado_em: string;
  tempo_espera_seg: number;
}

interface TarefasAtivasResult {
  contadores: { em_execucao: number; criadas: number; atribuidas: number; fila_total: number; total: number };
  em_execucao: TarefaEmExecucao[];
  fila_espera: TarefaFilaEspera[];
}

const PRIO_STYLE: Record<string, string> = {
  URGENTE: "bg-red-500/15 text-red-400 border-red-500/30",
  ALTA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  NORMAL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  BAIXA: "bg-slate-400/15 text-slate-400 border-slate-400/30",
};

function PrioBadge({ prio }: { prio: string | null }) {
  if (!prio) return <span className="text-muted-foreground text-xs">—</span>;
  const cls = PRIO_STYLE[prio] || "bg-secondary/40 text-muted-foreground border-border/40";
  return <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border", cls)}>{prio}</span>;
}

function TipoBadge({ desc, codigo }: { desc: string | null; codigo: string | null }) {
  const label = desc || codigo || "—";
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border bg-primary/10 text-primary border-primary/30">{label}</span>;
}

export function TarefasAtivasPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const { tenantId, empresaId, empresaVersion, armazemId } = useTenant();
  const [result, setResult] = useState<TarefasAtivasResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null);
  const [armazens, setArmazens] = useState<any[]>([]);
  const [filtroArmazem, setFiltroArmazem] = useState<string | null>(armazemId || null);
  const [filtroTipo, setFiltroTipo] = useState<string>("ALL");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!tenantId) return;
    let q = sb.from("armazem").select("id,descricao").eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
    if (empresaId) q = q.eq("empresa_id", empresaId);
    q.then(({ data }: any) => setArmazens(data || []));
  }, [tenantId, empresaId, empresaVersion]);

  const carregar = useCallback(async (showLoading = false) => {
    if (!tenantId) return;
    if (showLoading) setLoading(true);
    const { data, error } = await sb.rpc("dashboard_tarefas_ativas", {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId || null,
      p_armazem_id: filtroArmazem || null,
    });
    if (!error) {
      setResult(data || null);
      setUltimaAtualizacao(new Date());
    }
    setLoading(false);
  }, [tenantId, empresaId, filtroArmazem]);

  useEffect(() => { carregar(true); }, [carregar, empresaVersion]);
  useEffect(() => {
    const id = setInterval(() => carregar(false), REFRESH_INTERVAL);
    return () => clearInterval(id);
  }, [carregar]);

  const tiposDisponiveis = useMemo(() => {
    const set = new Set<string>();
    (result?.em_execucao || []).forEach((t) => t.tipo_tarefa_codigo && set.add(t.tipo_tarefa_codigo));
    (result?.fila_espera || []).forEach((t) => t.tipo_tarefa_codigo && set.add(t.tipo_tarefa_codigo));
    return Array.from(set).sort();
  }, [result]);

  const buscaLower = busca.trim().toLowerCase();
  const matchBusca = (t: { produto_sku?: string | null; produto_descricao?: string | null; operador_nome?: string | null }) => {
    if (!buscaLower) return true;
    return [t.produto_sku, t.produto_descricao, t.operador_nome].some((v) => (v || "").toLowerCase().includes(buscaLower));
  };
  const matchTipo = (t: { tipo_tarefa_codigo?: string | null }) => filtroTipo === "ALL" || t.tipo_tarefa_codigo === filtroTipo;

  const emExecucao = (result?.em_execucao || []).filter((t) => matchTipo(t) && matchBusca(t));
  const filaEspera = (result?.fila_espera || []).filter((t) => matchTipo(t) && matchBusca(t));
  const c = result?.contadores;

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
            <h1 className="text-xl font-bold text-foreground">Tarefas Ativas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Visão em tempo real das tarefas em execução e fila de espera</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {ultimaAtualizacao && (
            <button
              onClick={() => carregar(true)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
        <MiniCard icon={<PlayCircle size={18} />} label="Em Execução" value={c?.em_execucao ?? 0} accent="text-green-400 bg-green-500/10 border-green-500/20" />
        <MiniCard icon={<ListTodo size={18} />} label="Na Fila: Criadas" value={c?.criadas ?? 0} accent="text-muted-foreground bg-secondary/40 border-border/50" />
        <MiniCard icon={<UserCheck size={18} />} label="Na Fila: Atribuídas" value={c?.atribuidas ?? 0} accent="text-blue-400 bg-blue-500/10 border-blue-500/20" />
      </div>

      <div className="card-surface p-3 flex flex-wrap items-center gap-2">
        <Select value={filtroArmazem || "ALL"} onValueChange={(v) => setFiltroArmazem(v === "ALL" ? null : v)}>
          <SelectTrigger className="w-[220px] h-9 bg-secondary/40 border-border/50"><SelectValue placeholder="Armazém" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os armazéns</SelectItem>
            {armazens.map((a) => <SelectItem key={a.id} value={a.id}>{a.descricao}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[200px] h-9 bg-secondary/40 border-border/50"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Todos os tipos</SelectItem>
            {tiposDisponiveis.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[220px] max-w-[360px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por SKU, produto ou operador..."
            className="h-9 pl-9 bg-secondary/40 border-border/50"
          />
        </div>
        <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => carregar(true)}>
          <RefreshCw size={12} className={cn("mr-1.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <Section title="Tarefas em Execução" count={emExecucao.length}>
        {loading ? (
          <SkeletonRows />
        ) : emExecucao.length === 0 ? (
          <EmptyState msg="Nenhuma tarefa em execução no momento." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2.5 font-medium">Operador</th>
                  <th className="text-left px-4 py-2.5 font-medium">Produto</th>
                  <th className="text-left px-4 py-2.5 font-medium">Origem → Destino</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qtd</th>
                  <th className="text-left px-4 py-2.5 font-medium">Tempo</th>
                  <th className="text-left px-4 py-2.5 font-medium">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {emExecucao.map((t) => (
                  <tr key={t.tarefa_id} className="border-b border-border/30 hover:bg-secondary/20">
                    <td className="px-4 py-3"><TipoBadge desc={t.tipo_tarefa_desc} codigo={t.tipo_tarefa_codigo} /></td>
                    <td className="px-4 py-3">{t.operador_nome || <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-4 py-3 max-w-[280px]">
                      {t.produto_sku && <div className="font-semibold text-foreground">{t.produto_sku}</div>}
                      <div className="text-[11px] text-muted-foreground truncate" title={t.produto_descricao || ""}>{t.produto_descricao || "—"}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                      {[t.endereco_origem, t.endereco_destino].filter(Boolean).join(" → ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {(t.quantidade_executada ?? 0)}/{t.quantidade_requerida ?? 0}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{t.tempo_execucao_seg ? formatarTempoEspera(t.tempo_execucao_seg) : "—"}</td>
                    <td className="px-4 py-3"><PrioBadge prio={t.prioridade} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Fila de Espera" count={filaEspera.length}>
        {loading ? (
          <SkeletonRows />
        ) : filaEspera.length === 0 ? (
          <EmptyState msg="Nenhuma tarefa pendente na fila ✓" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">Tipo</th>
                  <th className="text-left px-4 py-2.5 font-medium">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium">Atribuído a</th>
                  <th className="text-left px-4 py-2.5 font-medium">Produto</th>
                  <th className="text-left px-4 py-2.5 font-medium">Origem → Destino</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qtd</th>
                  <th className="text-left px-4 py-2.5 font-medium">Aguardando</th>
                  <th className="text-left px-4 py-2.5 font-medium">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {filaEspera.map((t) => {
                  const esperaClass =
                    t.tempo_espera_seg > 86400
                      ? "text-red-400 font-medium"
                      : t.tempo_espera_seg > 14400
                        ? "text-yellow-400 font-medium"
                        : "";
                  const statusClass = t.status === "ATRIBUIDA"
                    ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                    : "bg-secondary/40 text-muted-foreground border-border/50";
                  return (
                    <tr key={t.tarefa_id} className="border-b border-border/30 hover:bg-secondary/20">
                      <td className="px-4 py-3"><TipoBadge desc={t.tipo_tarefa_desc} codigo={t.tipo_tarefa_codigo} /></td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border", statusClass)}>{t.status}</span>
                      </td>
                      <td className="px-4 py-3">{t.operador_nome || <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-4 py-3 max-w-[280px]">
                        {t.produto_sku && <div className="font-semibold text-foreground">{t.produto_sku}</div>}
                        <div className="text-[11px] text-muted-foreground truncate" title={t.produto_descricao || ""}>{t.produto_descricao || "—"}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-[12px] text-muted-foreground">
                        {[t.endereco_origem, t.endereco_destino].filter(Boolean).join(" → ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{t.quantidade_requerida ?? 0}</td>
                      <td className={cn("px-4 py-3 tabular-nums", esperaClass)}>{formatarTempoEspera(t.tempo_espera_seg)}</td>
                      <td className="px-4 py-3"><PrioBadge prio={t.prioridade} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="card-surface overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground tabular-nums">{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <div className="py-10 text-center text-sm text-muted-foreground">{msg}</div>;
}

function SkeletonRows() {
  return <div className="p-5 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-secondary/30 animate-pulse" />)}</div>;
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
