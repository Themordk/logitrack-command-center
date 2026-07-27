import { useCallback, useEffect, useState } from "react";
import { Clock, Loader2, CheckCircle2, AlertCircle, RefreshCw, RotateCcw, Ban } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/utils/dateTime";
import { parseError } from "@/lib/errorMapper";

const STATUS_OPTIONS = ["PENDENTE", "PROCESSANDO", "IMPRESSO", "ERRO", "CANCELADO", "REIMPRESSAO"];
const ORIGEM_OPTIONS = ["CONFERENCIA_ENTRADA", "EXPEDICAO", "MANUAL", "REIMPRESSAO"];

const statusColors: Record<string, string> = {
  PENDENTE: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  PROCESSANDO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  IMPRESSO: "bg-green-500/15 text-green-400 border-green-500/30",
  ERRO: "bg-red-500/15 text-red-400 border-red-500/30",
  CANCELADO: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  REIMPRESSAO: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const origemColors: Record<string, string> = {
  CONFERENCIA_ENTRADA: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  EXPEDICAO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  MANUAL: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  REIMPRESSAO: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

function StatCard({ icon: Icon, label, value, color, spin }: any) {
  return (
    <div className="card-surface p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={18} className={spin ? "animate-spin" : ""} />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="text-xl font-bold text-foreground">{value}</div>
      </div>
    </div>
  );
}

function StatusBadgeCell({ value }: { value: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${statusColors[value] || statusColors.PENDENTE}`}>
      {value === "PROCESSANDO" && <Loader2 size={10} className="animate-spin" />}
      {value}
    </span>
  );
}

export function FilaImpressaoTab({ active }: { active: boolean }) {
  const { tenantId, armazemId } = useTenant();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [impressoras, setImpressoras] = useState<{ id: string; nome: string }[]>([]);
  const [fStatus, setFStatus] = useState("");
  const [fImpressora, setFImpressora] = useState("");
  const [fOrigem, setFOrigem] = useState("");

  const fetchImpressoras = useCallback(async () => {
    if (!tenantId || !armazemId) return;
    const { data } = await (supabase as any)
      .from("impressora")
      .select("id, nome")
      .eq("tenant_id", tenantId)
      .eq("armazem_id", armazemId)
      .eq("ativo", true)
      .order("nome");
    setImpressoras(data || []);
  }, [tenantId, armazemId]);

  const fetchData = useCallback(async () => {
    if (!tenantId || !armazemId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("fila_impressao")
        .select("*, impressora:impressora_id(nome, codigo), etiqueta_template:template_id(nome, tipo)")
        .eq("tenant_id", tenantId)
        .eq("armazem_id", armazemId)
        .order("criado_em", { ascending: false })
        .limit(100);
      if (fStatus) q = q.eq("status", fStatus);
      if (fImpressora) q = q.eq("impressora_id", fImpressora);
      if (fOrigem) q = q.eq("origem", fOrigem);
      const { data, error } = await q;
      if (error) throw error;
      setData(data || []);
    } catch (err: any) {
      toast.error(parseError(err, "carregar fila de impressão").title);
    } finally {
      setLoading(false);
    }
  }, [tenantId, armazemId, fStatus, fImpressora, fOrigem]);

  useEffect(() => { fetchImpressoras(); }, [fetchImpressoras]);
  useEffect(() => { fetchData(); }, [fetchData]);

  // Auto-refresh + Realtime while tab active
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(fetchData, 10000);
    let channel: any = null;
    if (armazemId) {
      channel = supabase
        .channel(`fila_impressao_${armazemId}`)
        .on("postgres_changes" as any, {
          event: "*", schema: "public", table: "fila_impressao",
          filter: `armazem_id=eq.${armazemId}`,
        }, () => { fetchData(); })
        .subscribe();
    }
    return () => {
      clearInterval(timer);
      if (channel) supabase.removeChannel(channel);
    };
  }, [active, armazemId, fetchData]);

  // Stats
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const pendentes = data.filter((r) => r.status === "PENDENTE" || r.status === "REIMPRESSAO").length;
  const processando = data.filter((r) => r.status === "PROCESSANDO").length;
  const impressosHoje = data.filter((r) => r.status === "IMPRESSO" && new Date(r.criado_em) >= todayStart).length;
  const errosHoje = data.filter((r) => r.status === "ERRO" && new Date(r.criado_em) >= todayStart).length;

  const reimprimir = async (id: string) => {
    try {
      const { error } = await (supabase.rpc as any)("reimprimir_etiqueta", { p_job_original_id: id });
      if (error) throw error;
      toast.success("Job de reimpressão criado");
      fetchData();
    } catch (err: any) {
      toast.error(parseError(err, "reimprimir etiqueta").title);
    }
  };

  const cancelar = async (id: string) => {
    if (!confirm("Cancelar este job de impressão?")) return;
    try {
      const { error } = await (supabase.rpc as any)("cancelar_job_impressao", { p_job_id: id });
      if (error) throw error;
      toast.success("Job cancelado");
      fetchData();
    } catch (err: any) {
      toast.error(parseError(err, "cancelar job").title);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Clock} label="Pendentes" value={pendentes} color="bg-yellow-500/15 text-yellow-400" />
        <StatCard icon={Loader2} label="Processando" value={processando} color="bg-blue-500/15 text-blue-400" spin={processando > 0} />
        <StatCard icon={CheckCircle2} label="Impressos (hoje)" value={impressosHoje} color="bg-green-500/15 text-green-400" />
        <StatCard icon={AlertCircle} label="Erros (hoje)" value={errosHoje} color="bg-red-500/15 text-red-400" />
      </div>

      <div className="card-surface p-3 flex flex-wrap items-center gap-2">
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="h-9 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground outline-none">
          <option value="">Todos os status</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fImpressora} onChange={(e) => setFImpressora(e.target.value)} className="h-9 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground outline-none">
          <option value="">Todas as impressoras</option>
          {impressoras.map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}
        </select>
        <select value={fOrigem} onChange={(e) => setFOrigem(e.target.value)} className="h-9 px-2 rounded-lg bg-secondary border border-border text-xs text-foreground outline-none">
          <option value="">Todas as origens</option>
          {ORIGEM_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 h-9 rounded-lg border border-border text-xs text-foreground hover:bg-secondary disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          Atualizar
        </button>
        <span className="text-xs text-muted-foreground ml-auto">Atualização automática a cada 10s</span>
      </div>

      <div className="card-surface overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/30">
                {["Data/Hora", "Origem", "Status", "Impressora", "Template", "Cópias", "Tentativas", "Erro", "Impresso em", "Ações"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && data.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground"><Loader2 size={18} className="inline animate-spin mr-2" /> Carregando...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum job de impressão.</td></tr>
              ) : data.map((r, idx) => {
                const canCancel = ["PENDENTE", "ERRO", "REIMPRESSAO"].includes(r.status);
                return (
                  <tr key={r.id} className={`border-b border-border/50 table-row-hover ${idx % 2 !== 0 ? "bg-secondary/10" : ""}`}>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(r.criado_em)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${origemColors[r.origem] || origemColors.MANUAL}`}>
                        {r.origem}
                      </span>
                    </td>
                    <td className="px-3 py-2"><StatusBadgeCell value={r.status} /></td>
                    <td className="px-3 py-2 text-xs text-foreground">{r.impressora?.nome || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.etiqueta_template?.nome || "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{r.quantidade_copias}</td>
                    <td className="px-3 py-2 text-xs font-mono text-muted-foreground">{r.tentativas}/{r.max_tentativas}</td>
                    <td className="px-3 py-2 text-xs text-red-400 max-w-[200px] truncate" title={r.erro_mensagem || ""}>
                      {r.status === "ERRO" ? (r.erro_mensagem || "—") : ""}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                      {r.status === "IMPRESSO" && r.impresso_em ? formatDateTime(r.impresso_em) : ""}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <button onClick={() => reimprimir(r.id)} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-primary flex items-center justify-center" title="Reimprimir">
                          <RotateCcw size={13} />
                        </button>
                        {canCancel && (
                          <button onClick={() => cancelar(r.id)} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center" title="Cancelar">
                            <Ban size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
