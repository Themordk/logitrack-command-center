import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, MoreVertical, Search, ChevronLeft, ChevronRight, Package, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  GERADO: { label: "Gerado", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  LIBERADO: { label: "Liberado", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  "EM CONFERENCIA": { label: "Em Conferência", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  CONFERIDO: { label: "Conferido", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  DIVERGENCIA: { label: "Divergência", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  "LIB. ARMAZENAGEM": { label: "Lib. Armazenagem", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  ARMAZENADO: { label: "Armazenado", class: "bg-green-500/15 text-green-400 border-green-500/30" },
};

interface MovEntry {
  id: string;
  status: string;
  created_at: string;
  placa_veiculo: string | null;
  parceiro_nome?: string;
}

interface MovItem {
  id: string;
  produto_id: string;
  qtd_esperada: number;
  qtd_conferida: number;
  sku?: string;
  referencia?: string;
  descricao?: string;
}

export function MovimentoEntradaPage() {
  const { armazemId } = useTenant();
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<MovEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMov, setSelectedMov] = useState<string | null>(null);
  const [items, setItems] = useState<MovItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<MovItem | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterNota, setFilterNota] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchCounts = useCallback(async () => {
    if (!armazemId) return;
    const { data } = await (supabase as any)
      .from("movimento_entrada")
      .select("status")
      .eq("armazem_id", armazemId);

    const counts: Record<string, number> = {};
    (data || []).forEach((m: any) => {
      counts[m.status] = (counts[m.status] || 0) + 1;
    });
    setStatusCounts(counts);
  }, [armazemId]);

  const fetchMovements = useCallback(async () => {
    if (!armazemId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = (supabase as any)
        .from("movimento_entrada")
        .select("id, status, created_at, placa_veiculo", { count: "exact" })
        .eq("armazem_id", armazemId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filterStatus) query = query.eq("status", filterStatus);

      const { data, error, count } = await query;
      if (error) throw error;

      // Enrich with parceiro from linked documents
      const enriched = await Promise.all(
        (data || []).map(async (mov: any) => {
          const { data: link } = await (supabase as any)
            .from("movimento_entrada_documento")
            .select("documento_entrada_id")
            .eq("movimento_entrada_id", mov.id)
            .limit(1);
          let parceiro_nome = "—";
          if (link && link.length > 0) {
            const { data: doc } = await (supabase as any)
              .from("documento_entrada")
              .select("parceiro_id")
              .eq("id", link[0].documento_entrada_id)
              .single();
            if (doc) {
              const { data: p } = await (supabase as any)
                .from("parceiro")
                .select("razaosocial")
                .eq("id", doc.parceiro_id)
                .single();
              if (p) parceiro_nome = p.razaosocial;
            }
          }
          return { ...mov, parceiro_nome };
        })
      );

      setMovements(enriched);
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [armazemId, page, filterStatus]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  const loadItems = async (movId: string) => {
    setSelectedMov(movId);
    setItemsLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("movimento_entrada_item")
        .select("id, produto_id, qtd_esperada, qtd_conferida")
        .eq("movimento_entrada_id", movId);
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (item: any) => {
          const { data: prod } = await (supabase as any)
            .from("produto")
            .select("sku, referencia, descricao")
            .eq("id", item.produto_id)
            .single();
          return { ...item, sku: prod?.sku || "—", referencia: prod?.referencia || "—", descricao: prod?.descricao || "—" };
        })
      );
      setItems(enriched);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setItemsLoading(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);
  const statusCards = ["GERADO", "EM CONFERENCIA", "ARMAZENADO", "DIVERGENCIA"];

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-lg font-bold text-foreground">Movimentos de Entrada</h1>

      {/* Status cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statusCards.map((s) => {
          const info = STATUS_MAP[s] || { label: s, class: "" };
          return (
            <button
              key={s}
              onClick={() => { setFilterStatus(filterStatus === s ? "" : s); setPage(1); }}
              className={cn(
                "card-surface p-4 text-left transition-all",
                filterStatus === s && "ring-1 ring-primary"
              )}
            >
              <p className="text-xs text-muted-foreground">{info.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{statusCounts[s] || 0}</p>
            </button>
          );
        })}
      </div>

      <div className="flex gap-4" style={{ minHeight: "60vh" }}>
        {/* Right panel - Movement list */}
        <div className="w-80 shrink-0 card-surface flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={filterNota}
                onChange={(e) => setFilterNota(e.target.value)}
                placeholder="Buscar..."
                className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            ) : movements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhum movimento encontrado.</p>
            ) : (
              movements.map((mov) => {
                const info = STATUS_MAP[mov.status] || { label: mov.status, class: "" };
                return (
                  <button
                    key={mov.id}
                    onClick={() => loadItems(mov.id)}
                    className={cn(
                      "w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors",
                      selectedMov === mov.id && "bg-secondary/70"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-foreground">{mov.id.slice(0, 8).toUpperCase()}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border", info.class)}>{info.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{mov.parceiro_nome}</p>
                    <p className="text-xs text-muted-foreground">{new Date(mov.created_at).toLocaleDateString("pt-BR")}</p>
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

        {/* Left panel - Items */}
        <div className="flex-1 card-surface flex flex-col">
          {!selectedMov ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Package size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Selecione um movimento para ver os itens</p>
            </div>
          ) : itemsLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30 sticky top-0">
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Referência</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Esperada</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Conferida</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Divergência</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const div = item.qtd_esperada - item.qtd_conferida;
                    return (
                      <tr key={item.id} className="border-b border-border/50 table-row-hover">
                        <td className="px-4 py-2.5 font-mono text-xs text-foreground">{item.sku}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.referencia}</td>
                        <td className="px-4 py-2.5 text-xs text-foreground">{item.descricao}</td>
                        <td className="px-4 py-2.5 text-right text-foreground">{item.qtd_esperada}</td>
                        <td className="px-4 py-2.5 text-right text-foreground">{item.qtd_conferida}</td>
                        <td className={cn("px-4 py-2.5 text-right font-medium", div > 0 ? "text-yellow-400" : div < 0 ? "text-red-400" : "text-green-400")}>
                          {div}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => setDetailItem(item)} className="p-1 rounded hover:bg-secondary transition-colors">
                            <Eye size={14} className="text-muted-foreground" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Detalhes de Conferência</DialogTitle>
          </DialogHeader>
          {detailItem && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">SKU</p>
                  <p className="text-sm font-mono text-foreground">{detailItem.sku}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Descrição</p>
                  <p className="text-sm text-foreground">{detailItem.descricao}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Qtd Esperada</p>
                  <p className="text-sm font-bold text-foreground">{detailItem.qtd_esperada}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Qtd Conferida</p>
                  <p className="text-sm font-bold text-foreground">{detailItem.qtd_conferida}</p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                <p className="text-xs text-muted-foreground">
                  ⚠️ Detalhes de conferência por lote (HU, Fabricação, Lote, Validade, Quantidade, Usuário, Data/Hora) serão exibidos quando a tabela de conferência estiver disponível.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
