import { useCallback, useEffect, useState } from "react";
import { mw } from "./entidades";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, RotateCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  tenantId: string;
  empresaId: string;
}

type Tab = "sync_queue" | "return_queue";

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  processing: "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse",
  done: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  error: "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

export function FilasPanel({ tenantId, empresaId }: Props) {
  const [tab, setTab] = useState<Tab>("sync_queue");

  return (
    <div className="card-surface flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30">
        <h3 className="text-sm font-semibold text-foreground">Filas</h3>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="m-3 self-start bg-secondary border border-border">
          <TabsTrigger value="sync_queue">Fila de Entrada</TabsTrigger>
          <TabsTrigger value="return_queue">Fila de Retorno</TabsTrigger>
        </TabsList>
        <TabsContent value="sync_queue" className="flex-1 min-h-0 mt-0">
          <QueueTable table="sync_queue" tenantId={tenantId} empresaId={empresaId} />
        </TabsContent>
        <TabsContent value="return_queue" className="flex-1 min-h-0 mt-0">
          <QueueTable table="return_queue" tenantId={tenantId} empresaId={empresaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QueueTable({ table, tenantId, empresaId }: { table: Tab; tenantId: string; empresaId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({ pending: 0, processing: 0, done: 0, error: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const baseFilter = (q: any) => q.eq("tenant_id", tenantId).eq("empresa_id", empresaId);
    const [list, ...countsRes] = await Promise.all([
      baseFilter(mw.from(table).select("*"))
        .order("created_at", { ascending: false })
        .limit(100),
      ...["pending", "processing", "done", "error"].map((s) =>
        baseFilter(mw.from(table).select("*", { count: "exact", head: true })).eq("status", s),
      ),
    ]);
    setRows(list.data || []);
    setCounts({
      pending: countsRes[0].count || 0,
      processing: countsRes[1].count || 0,
      done: countsRes[2].count || 0,
      error: countsRes[3].count || 0,
    });
    setLoading(false);
  }, [table, tenantId, empresaId]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const reprocess = async (id: string) => {
    const { error } = await mw
      .from(table)
      .update({ status: "pending", retry_count: 0, error_message: null })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Reprocessar agendado"); load(); }
  };

  const discard = async (id: string) => {
    if (!confirm("Descartar este item da fila?")) return;
    const { error } = await mw
      .from(table)
      .update({ status: "error", error_message: "Descartado manualmente" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Descartado"); load(); }
  };

  const isReturn = table === "return_queue";

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-3 grid grid-cols-4 gap-2 mb-2">
        {(["pending", "processing", "error", "done"] as const).map((s) => (
          <div key={s} className={`rounded border px-2 py-1.5 text-center ${STATUS_CLASS[s]}`}>
            <div className="text-[10px] uppercase opacity-80">{s}</div>
            <div className="text-base font-bold">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary/40 backdrop-blur z-10">
            <tr className="text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">Omie ID</th>
              <th className="text-left px-3 py-2 font-medium">{isReturn ? "Doc Type" : "Número"}</th>
              <th className="text-left px-3 py-2 font-medium">Tipo</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Tent.</th>
              <th className="text-left px-3 py-2 font-medium">Criado</th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                <Loader2 size={14} className="inline animate-spin mr-2" />Carregando…
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Fila vazia</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-t border-border/40 hover:bg-secondary/30">
                <td className="px-3 py-1.5 text-foreground font-mono">{r.omie_id || "—"}</td>
                <td className="px-3 py-1.5 text-foreground">{isReturn ? r.document_type || "—" : r.omie_numero || "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{isReturn ? `${r.wms_status || ""}→${r.omie_status || ""}` : r.tipo || "—"}</td>
                <td className="px-3 py-1.5">
                  <Badge variant="outline" className={STATUS_CLASS[r.status] || ""}>{r.status}</Badge>
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.retry_count ?? 0}</td>
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => reprocess(r.id)} title="Reprocessar" className="p-1.5 rounded hover:bg-secondary/60 text-sky-400">
                      <RotateCw size={12} />
                    </button>
                    <button onClick={() => discard(r.id)} title="Descartar" className="p-1.5 rounded hover:bg-secondary/60 text-rose-400">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
