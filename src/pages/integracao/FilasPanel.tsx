import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, RotateCcw, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/utils/dateTime";

interface Props {
  tenantId: string;
  empresaId: string;
  sistemaOrigem?: string;
}

type Tab = "entrada" | "retorno";

const STATUS_CLASS: Record<string, string> = {
  pendente: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  processando: "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse",
  concluido: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  erro: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  cancelado: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
};

export function FilasPanel({ tenantId, empresaId }: Props) {
  const [tab, setTab] = useState<Tab>("entrada");

  return (
    <div className="card-surface flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-secondary/30">
        <h3 className="text-sm font-semibold text-foreground">Filas</h3>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex-1 flex flex-col min-h-0">
        <TabsList className="m-3 self-start bg-secondary border border-border">
          <TabsTrigger value="entrada">Fila de Entrada</TabsTrigger>
          <TabsTrigger value="retorno">Fila de Retorno</TabsTrigger>
        </TabsList>
        <TabsContent value="entrada" className="flex-1 min-h-0 mt-0">
          <QueueTable direcao="entrada" tenantId={tenantId} empresaId={empresaId} />
        </TabsContent>
        <TabsContent value="retorno" className="flex-1 min-h-0 mt-0">
          <QueueTable direcao="retorno" tenantId={tenantId} empresaId={empresaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QueueTable({ direcao, tenantId, empresaId }: { direcao: Tab; tenantId: string; empresaId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({
    pendente: 0, processando: 0, concluido: 0, erro: 0,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_direcao: direcao,
      p_limite: 100,
    } as Record<string, unknown>;

    const [listRes, ...countRes] = await Promise.all([
      (supabase as any).rpc("integracao_listar_fila", { ...params, p_status: null }),
      ...["pendente", "processando", "concluido", "erro"].map((s) =>
        (supabase as any).rpc("integracao_listar_fila", { ...params, p_status: s, p_limite: 1000 }),
      ),
    ]);

    setRows(listRes.data || []);
    setCounts({
      pendente: (countRes[0].data || []).length,
      processando: (countRes[1].data || []).length,
      concluido: (countRes[2].data || []).length,
      erro: (countRes[3].data || []).length,
    });
    setLoading(false);
  }, [direcao, tenantId, empresaId]);

  const handleReprocessar = async (filaId: string) => {
    try {
      const { error } = await (supabase as any).rpc("integracao_reprocessar_fila", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_fila_id: filaId,
        p_direcao: direcao,
      });
      if (error) throw error;
      toast.success("Item reenviado para processamento");
      load();
    } catch (e: any) {
      toast.error("Erro ao reprocessar: " + (e.message || "falha"));
    }
  };

  const handleDescartar = async (filaId: string) => {
    if (!window.confirm("Descartar este item? Ele será marcado como cancelado.")) return;
    try {
      const { error } = await (supabase as any).rpc("integracao_descartar_fila", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_fila_id: filaId,
        p_direcao: direcao,
      });
      if (error) throw error;
      toast.success("Item descartado");
      load();
    } catch (e: any) {
      toast.error("Erro ao descartar: " + (e.message || "falha"));
    }
  };

  const handleReprocessarTodos = async () => {
    if (!window.confirm(`Reprocessar ${counts.erro} item(ns) com erro?`)) return;
    try {
      const { data, error } = await (supabase as any).rpc("integracao_reprocessar_fila_todos", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_direcao: direcao,
      });
      if (error) throw error;
      toast.success(`${data} item(ns) reenviado(s) para processamento`);
      load();
    } catch (e: any) {
      toast.error("Erro ao reprocessar: " + (e.message || "falha"));
    }
  };

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="px-3 grid grid-cols-4 gap-2 mb-2">
        {(["pendente", "processando", "erro", "concluido"] as const).map((s) => (
          <div key={s} className={`rounded border px-2 py-1.5 text-center ${STATUS_CLASS[s]}`}>
            <div className="text-[10px] uppercase opacity-80">{s}</div>
            <div className="text-base font-bold">{counts[s] ?? 0}</div>
          </div>
        ))}
      </div>
      {counts.erro > 0 && (
        <div className="px-3 mb-2">
          <button
            onClick={handleReprocessarTodos}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-sky-500/30 bg-sky-500/10 text-xs text-sky-400 hover:bg-sky-500/20"
          >
            <RefreshCw size={12} /> Reprocessar todos com erro ({counts.erro})
          </button>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary/40 backdrop-blur z-10">
            <tr className="text-muted-foreground">
              <th className="text-left px-3 py-2 font-medium">ID Externo</th>
              <th className="text-left px-3 py-2 font-medium">Entidade</th>
              <th className="text-left px-3 py-2 font-medium">Provedor</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Tent.</th>
              <th className="text-left px-3 py-2 font-medium">Criado</th>
              <th className="text-left px-3 py-2 font-medium">Próx. tentativa</th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">
                <Loader2 size={14} className="inline animate-spin mr-2" />Carregando…
              </td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Fila vazia</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-t border-border/40 hover:bg-secondary/30">
                <td className="px-3 py-1.5 text-foreground font-mono">{r.id_externo || "—"}</td>
                <td className="px-3 py-1.5 text-foreground">{r.entidade || "—"}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{r.erp_provedor_id || "—"}</td>
                <td className="px-3 py-1.5">
                  <Badge variant="outline" className={STATUS_CLASS[r.status] || ""}>{r.status}</Badge>
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">
                  {(r.tentativas ?? 0)}{r.max_tentativas ? `/${r.max_tentativas}` : ""}
                </td>
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{formatDateTime(r.criado_em)}</td>
                <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">{r.processar_apos ? formatDateTime(r.processar_apos) : "—"}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center justify-end gap-1">
                    {(r.status === "erro" || r.status === "cancelado") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReprocessar(r.id); }}
                        title="Reprocessar"
                        className="p-1 rounded hover:bg-secondary/60 text-sky-400 hover:text-sky-300"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                    {(r.status === "erro" || r.status === "pendente") && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDescartar(r.id); }}
                        title="Descartar"
                        className="p-1 rounded hover:bg-secondary/60 text-rose-400 hover:text-rose-300"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
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
