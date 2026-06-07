import { useEffect, useMemo, useState } from "react";
import { mw, MODULOS, entidadeLabel } from "./entidades";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { formatDateTime } from "@/utils/dateTime";

const PAGE_SIZE = 20;

interface Props {
  tenantId: string;
  empresaId: string;
  sistemaOrigem?: string;
}

const STATUS_OPTIONS = ["success", "error", "partial", "running"];

function statusBadge(s: string) {
  const map: Record<string, string> = {
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    error: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    partial: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    running: "bg-sky-500/15 text-sky-400 border-sky-500/30 animate-pulse",
  };
  return (
    <Badge variant="outline" className={map[s] || ""}>
      {s}
    </Badge>
  );
}

export function LogsPanel({ tenantId, empresaId, sistemaOrigem }: Props) {
  const [modulo, setModulo] = useState<string>("");
  const [entidade, setEntidade] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  const entidadesDoModulo = useMemo(() => {
    if (!modulo) return MODULOS.flatMap((m) => m.entidades);
    return MODULOS.find((m) => m.key === modulo)?.entidades || [];
  }, [modulo]);

  const buildQuery = (forCount = false) => {
    let q = mw
      .from("sync_log")
      .select("*", forCount ? { count: "exact" } : undefined)
      .eq("tenant_id", tenantId)
      .eq("empresa_id", empresaId);
    if (sistemaOrigem) q = q.eq("sistema_origem", sistemaOrigem);
    if (modulo) q = q.eq("modulo", modulo);
    if (entidade) q = q.eq("entidade", entidade);
    if (status) q = q.eq("status", status);
    if (from) q = q.gte("executed_at", new Date(from + "T00:00:00").toISOString());
    if (to) q = q.lte("executed_at", new Date(to + "T23:59:59").toISOString());
    return q;
  };

  const load = async () => {
    setLoading(true);
    const fromIdx = (page - 1) * PAGE_SIZE;
    const toIdx = fromIdx + PAGE_SIZE - 1;
    const { data, error, count } = await buildQuery(true)
      .order("executed_at", { ascending: false })
      .range(fromIdx, toIdx);
    if (error) toast.error(error.message);
    setData(data || []);
    setCount(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, sistemaOrigem, modulo, entidade, status, from, to, page]);

  useEffect(() => setPage(1), [modulo, entidade, status, from, to]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const handleExport = async () => {
    const { data, error } = await buildQuery(false)
      .order("executed_at", { ascending: false })
      .limit(5000);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = data || [];
    const headers = ["executed_at", "modulo", "entidade", "status", "records_fetched", "records_inserted", "records_updated", "records_error", "duration_ms", "error_message"];
    const csv =
      headers.join(",") +
      "\n" +
      rows
        .map((r: any) =>
          headers
            .map((h) => {
              const v = r[h];
              const s = v == null ? "" : String(v).replace(/"/g, '""');
              return /[,"\n]/.test(s) ? `"${s}"` : s;
            })
            .join(","),
        )
        .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sync_log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputClass =
    "h-8 px-2 rounded border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  return (
    <div className="card-surface flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Histórico de Execuções</h3>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-border text-xs text-foreground hover:bg-secondary/60"
        >
          <Download size={12} /> Exportar CSV
        </button>
      </div>
      <div className="px-4 py-2 border-b border-border bg-secondary/10 grid grid-cols-2 md:grid-cols-5 gap-2">
        <select className={inputClass} value={modulo} onChange={(e) => { setModulo(e.target.value); setEntidade(""); }}>
          <option value="">Módulo (todos)</option>
          {MODULOS.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <select className={inputClass} value={entidade} onChange={(e) => setEntidade(e.target.value)}>
          <option value="">Entidade (todas)</option>
          {entidadesDoModulo.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Status (todos)</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" className={inputClass} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className={inputClass} value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary/40 backdrop-blur z-10">
            <tr className="text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Data/Hora</th>
              <th className="text-left px-3 py-2 font-medium">Módulo</th>
              <th className="text-left px-3 py-2 font-medium">Entidade</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Busc.</th>
              <th className="text-right px-3 py-2 font-medium">Ins.</th>
              <th className="text-right px-3 py-2 font-medium">Erros</th>
              <th className="text-right px-3 py-2 font-medium">Dur.</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                <Loader2 size={14} className="inline animate-spin mr-2" />Carregando…
              </td></tr>
            )}
            {!loading && data.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Sem registros</td></tr>
            )}
            {!loading && data.map((r) => (
              <tr key={r.id} onClick={() => setSelected(r)} className="border-t border-border/40 hover:bg-secondary/30 cursor-pointer">
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{formatDateTime(r.executed_at)}</td>
                <td className="px-3 py-1.5 text-foreground">{r.modulo}</td>
                <td className="px-3 py-1.5 text-foreground">{entidadeLabel(r.modulo, r.entidade)}</td>
                <td className="px-3 py-1.5">{statusBadge(r.status)}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{r.records_fetched ?? 0}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{(r.records_inserted ?? 0) + (r.records_updated ?? 0)}</td>
                <td className="px-3 py-1.5 text-right text-rose-400">{r.records_error ?? 0}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.duration_ms ? `${r.duration_ms} ms` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-border bg-secondary/20 flex items-center justify-between text-xs text-muted-foreground">
        <span>{count} registros</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-secondary/60 disabled:opacity-30">
            <ChevronLeft size={14} />
          </button>
          <span>Página {page} de {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1 rounded hover:bg-secondary/60 disabled:opacity-30">
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalhes da Execução</SheetTitle>
          </SheetHeader>
          {selected && (
            <div className="mt-4 space-y-3 text-sm">
              <Field label="Data/Hora" v={formatDateTime(selected.executed_at)} />
              <Field label="Módulo" v={selected.modulo} />
              <Field label="Entidade" v={entidadeLabel(selected.modulo, selected.entidade)} />
              <Field label="Status" v={selected.status} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Buscados" v={selected.records_fetched ?? 0} />
                <Field label="Inseridos" v={selected.records_inserted ?? 0} />
                <Field label="Atualizados" v={selected.records_updated ?? 0} />
                <Field label="Erros" v={selected.records_error ?? 0} />
              </div>
              <Field label="Duração" v={selected.duration_ms ? `${selected.duration_ms} ms` : "—"} />
              {selected.error_message && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Mensagem de erro</div>
                  <pre className="text-xs bg-secondary/40 border border-border rounded p-2 whitespace-pre-wrap break-all text-rose-300 max-h-64 overflow-auto">{selected.error_message}</pre>
                </div>
              )}
              {selected.payload_sample && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Payload (amostra)</div>
                  <pre className="text-xs bg-secondary/40 border border-border rounded p-2 whitespace-pre-wrap break-all max-h-64 overflow-auto">{JSON.stringify(selected.payload_sample, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, v }: { label: string; v: any }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{String(v)}</div>
    </div>
  );
}
