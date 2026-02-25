import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Search, ChevronLeft, ChevronRight, Package, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<number, { label: string; class: string }> = {
  0: { label: "Pendente", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  1: { label: "Gerada", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  2: { label: "Em Separação", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  3: { label: "Separada", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  4: { label: "Em Conferência", class: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  5: { label: "Conferida", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  6: { label: "Embarcada", class: "bg-green-500/15 text-green-400 border-green-500/30" },
};

interface OndaEntry {
  id: string;
  numero_onda: number;
  status: number;
  data_emissao: string;
  motorista: string;
  destino_carga: string;
  total_pedidos: number | null;
  peso_total: number | null;
  m3: number | null;
  prioridade: string | null;
}

interface OndaItem {
  id: string;
  produto_id: string;
  quantidade: number;
  valor_unit: number;
  valor_total: number;
  sku?: string;
  descricao?: string;
}

export function MovimentoSaidaPage() {
  const { tenantId } = useTenant();
  const [statusCounts, setStatusCounts] = useState<Record<number, number>>({});
  const [ondas, setOndas] = useState<OndaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOnda, setSelectedOnda] = useState<string | null>(null);
  const [selectedOndaData, setSelectedOndaData] = useState<OndaEntry | null>(null);
  const [items, setItems] = useState<OndaItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchCounts = useCallback(async () => {
    if (!tenantId) return;
    const { data } = await (supabase as any).from("onda_carregamento").select("status").eq("tenant_id", tenantId);
    const counts: Record<number, number> = {};
    (data || []).forEach((o: any) => { counts[o.status] = (counts[o.status] || 0) + 1; });
    setStatusCounts(counts);
  }, [tenantId]);

  const fetchOndas = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = (supabase as any)
        .from("onda_carregamento")
        .select("id, numero_onda, status, data_emissao, motorista, destino_carga, total_pedidos, peso_total, m3, prioridade", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("numero_onda", { ascending: false })
        .range(from, to);
      if (filterStatus !== null) query = query.eq("status", filterStatus);
      const { data, error, count } = await query;
      if (error) throw error;
      setOndas(data || []);
      setTotal(count || 0);
    } catch (err: any) { toast.error(err.message); } finally { setLoading(false); }
  }, [tenantId, page, filterStatus]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchOndas(); }, [fetchOndas]);

  const loadItems = async (onda: OndaEntry) => {
    setSelectedOnda(onda.id);
    setSelectedOndaData(onda);
    setItemsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("onda_carregamento_item")
        .select("id, produto_id, quantidade, valor_unit, valor_total")
        .eq("onda_carregamento_id", onda.id);
      if (error) throw error;
      const enriched = await Promise.all(
        (data || []).map(async (item: any) => {
          const { data: prod } = await (supabase as any).from("produto").select("sku, descricao").eq("id", item.produto_id).single();
          return { ...item, sku: prod?.sku || "—", descricao: prod?.descricao || "—" };
        })
      );
      setItems(enriched);
    } catch (err: any) { toast.error(err.message); } finally { setItemsLoading(false); }
  };

  const totalPages = Math.ceil(total / pageSize);
  const statusCards = [1, 2, 3, 6];

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-lg font-bold text-foreground">Ondas de Carregamento</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statusCards.map((s) => {
          const info = STATUS_MAP[s] || { label: `Status ${s}`, class: "" };
          return (
            <button
              key={s}
              onClick={() => { setFilterStatus(filterStatus === s ? null : s); setPage(1); }}
              className={cn("card-surface p-4 text-left transition-all", filterStatus === s && "ring-1 ring-primary")}
            >
              <p className="text-xs text-muted-foreground">{info.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{statusCounts[s] || 0}</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-4" style={{ minHeight: "60vh" }}>
        {/* List panel */}
        <div className="w-80 shrink-0 card-surface flex flex-col">
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : ondas.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhuma onda encontrada.</p>
            ) : (
              ondas.map((onda) => {
                const info = STATUS_MAP[onda.status] || { label: `${onda.status}`, class: "" };
                return (
                  <button
                    key={onda.id}
                    onClick={() => loadItems(onda)}
                    className={cn("w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors", selectedOnda === onda.id && "bg-secondary/70")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-semibold text-foreground">Onda #{onda.numero_onda}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border", info.class)}>{info.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{onda.destino_carga} • {onda.motorista || "—"}</p>
                    <p className="text-xs text-muted-foreground">{new Date(onda.data_emissao).toLocaleDateString("pt-BR")} • {onda.total_pedidos || 0} pedidos</p>
                  </button>
                );
              })
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-secondary disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span className="text-xs text-muted-foreground">{page}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1 rounded hover:bg-secondary disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="flex-1 card-surface flex flex-col">
          {!selectedOnda ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Package size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Selecione uma onda para ver os itens</p>
            </div>
          ) : itemsLoading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {selectedOndaData && (
                <div className="p-4 border-b border-border grid grid-cols-4 gap-3">
                  <div><p className="text-xs text-muted-foreground">Onda</p><p className="text-sm font-bold text-foreground">#{selectedOndaData.numero_onda}</p></div>
                  <div><p className="text-xs text-muted-foreground">Destino</p><p className="text-sm text-foreground">{selectedOndaData.destino_carga}</p></div>
                  <div><p className="text-xs text-muted-foreground">Motorista</p><p className="text-sm text-foreground">{selectedOndaData.motorista || "—"}</p></div>
                  <div><p className="text-xs text-muted-foreground">Prioridade</p><p className="text-sm text-foreground">{selectedOndaData.prioridade || "—"}</p></div>
                </div>
              )}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 sticky top-0">
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Vlr Unit</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Vlr Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 table-row-hover">
                        <td className="px-4 py-2.5 font-mono text-xs text-foreground">{item.sku}</td>
                        <td className="px-4 py-2.5 text-xs text-foreground">{item.descricao}</td>
                        <td className="px-4 py-2.5 text-right text-foreground">{item.quantidade}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{Number(item.valor_unit).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-foreground">{Number(item.valor_total).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
