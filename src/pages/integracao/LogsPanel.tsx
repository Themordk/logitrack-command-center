import { useEffect, useMemo, useState } from "react";
import { MODULOS, entidadeLabel } from "./entidades";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { formatDateTime } from "@/utils/dateTime";
import { parseError } from "@/lib/errorMapper";

const PAGE_SIZE = 20;

interface Props {
  tenantId: string;
  empresaId: string;
  sistemaOrigem?: string;
}

const STATUS_OPTIONS = ["sucesso", "erro", "parcial", "duplicado"];

function statusBadge(s: string) {
  const map: Record<string, string> = {
    sucesso: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    erro: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    parcial: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    duplicado: "bg-sky-500/15 text-sky-400 border-sky-500/30",
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
  const [disparadoPor, setDisparadoPor] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);

  const entidadesDoModulo = useMemo(() => {
    if (!modulo) return MODULOS.flatMap((m) => m.entidades);
    return MODULOS.find((m) => m.key === modulo)?.entidades || [];
  }, [modulo]);

  const fetchRows = async (limit: number, offset: number) => {
    const { data, error } = await (supabase as any).rpc("integracao_listar_logs", {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_entidade: entidade || null,
      p_status: status || null,
      p_erp_provedor_id: sistemaOrigem || null,
      p_limite: limit,
      p_offset: offset,
      p_disparado_por: disparadoPor || null,
    });
    if (error) throw error;
    let rows: any[] = data || [];
    if (modulo) rows = rows.filter((r) => r.modulo === modulo);
    if (from) {
      const fromIso = new Date(from + "T00:00:00").getTime();
      rows = rows.filter((r) => new Date(r.criado_em).getTime() >= fromIso);
    }
    if (to) {
      const toIso = new Date(to + "T23:59:59").getTime();
      rows = rows.filter((r) => new Date(r.criado_em).getTime() <= toIso);
    }
    return rows;
  };

  const load = async () => {
    setLoading(true);
    try {
      // pede +1 pra detectar próxima página
      const rows = await fetchRows(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE);
      setHasNext(rows.length > PAGE_SIZE);
      setData(rows.slice(0, PAGE_SIZE));
    } catch (e: any) {
      toast.error((() => { const p = parseError(e, "logs-panel"); return (!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao carregar logs" : p.title; })());
      setData([]);
      setHasNext(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, sistemaOrigem, modulo, entidade, status, from, to, page, disparadoPor]);

  useEffect(() => setPage(1), [modulo, entidade, status, from, to, disparadoPor]);

  const handleExport = async () => {
    try {
      const rows = await fetchRows(5000, 0);
      const headers = ["criado_em", "modulo", "entidade", "status", "registros_buscados", "registros_inseridos", "registros_atualizados", "registros_erro", "duracao_ms", "mensagem_erro"];
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
    } catch (e: any) {
      toast.error((() => { const p = parseError(e, "logs-panel"); return (!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao exportar" : p.title; })());
    }
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
      <div className="px-4 py-2 border-b border-border bg-secondary/10 grid grid-cols-2 md:grid-cols-6 gap-2">
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
        <select className={inputClass} value={disparadoPor} onChange={(e) => setDisparadoPor(e.target.value)}>
          <option value="">Origem (todas)</option>
          <option value="webhook">Webhook (Push)</option>
          <option value="polling">Polling</option>
          <option value="manual">Manual</option>
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
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{formatDateTime(r.criado_em)}</td>
                <td className="px-3 py-1.5 text-foreground">{r.modulo}</td>
                <td className="px-3 py-1.5 text-foreground">{entidadeLabel(r.modulo, r.entidade)}</td>
                <td className="px-3 py-1.5">{statusBadge(r.status)}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{r.registros_buscados ?? 0}</td>
                <td className="px-3 py-1.5 text-right text-foreground">{(r.registros_inseridos ?? 0) + (r.registros_atualizados ?? 0)}</td>
                <td className="px-3 py-1.5 text-right text-rose-400">{r.registros_erro ?? 0}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.duracao_ms ? `${r.duracao_ms} ms` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-4 py-2 border-t border-border bg-secondary/20 flex items-center justify-between text-xs text-muted-foreground">
        <span>{data.length} registros nesta página</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-secondary/60 disabled:opacity-30">
            <ChevronLeft size={14} />
          </button>
          <span>Página {page}</span>
          <button onClick={() => setPage((p) => p + 1)} disabled={!hasNext} className="p-1 rounded hover:bg-secondary/60 disabled:opacity-30">
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
              <Field label="Data/Hora" v={formatDateTime(selected.criado_em)} />
              <Field label="Módulo" v={selected.modulo} />
              <Field label="Entidade" v={entidadeLabel(selected.modulo, selected.entidade)} />
              <Field label="Operação" v={selected.operacao || "—"} />
              <Field label="Disparado por" v={selected.disparado_por || "—"} />
              <Field label="Status" v={selected.status} />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Buscados" v={selected.registros_buscados ?? 0} />
                <Field label="Inseridos" v={selected.registros_inseridos ?? 0} />
                <Field label="Atualizados" v={selected.registros_atualizados ?? 0} />
                <Field label="Erros" v={selected.registros_erro ?? 0} />
              </div>
              <Field label="Duração" v={selected.duracao_ms ? `${selected.duracao_ms} ms` : "—"} />
              {selected.mensagem_erro && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1">Mensagem de erro</div>
                  <pre className="text-xs bg-secondary/40 border border-border rounded p-2 whitespace-pre-wrap break-all text-rose-300 max-h-64 overflow-auto">{selected.mensagem_erro}</pre>
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
