import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, MoreVertical, Search, ChevronLeft, ChevronRight, Package, Eye, Filter, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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

const ITEM_STATUS_MAP: Record<string, { label: string; class: string }> = {
  PENDENTE: { label: "Pendente", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  CONFERIDO: { label: "Conferido", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  DIVERGENTE: { label: "Divergente", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  ARMAZENADO: { label: "Armazenado", class: "bg-green-500/15 text-green-400 border-green-500/30" },
};

interface MovEntry {
  id: string;
  numero_movimento: number | null;
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
  qtd_armazenada: number | null;
  qtd_ocorrencia: number | null;
  status_item_movimento: string;
  sku?: string;
  referencia?: string;
  descricao?: string;
}

export function MovimentoEntradaPage() {
  const { armazemId, tenantId } = useTenant();
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<MovEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMov, setSelectedMov] = useState<string | null>(null);
  const [items, setItems] = useState<MovItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [detailItem, setDetailItem] = useState<MovItem | null>(null);
  const [itemTab, setItemTab] = useState("itens");

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterNumero, setFilterNumero] = useState("");
  const [filterData, setFilterData] = useState("");
  const [filterParceiro, setFilterParceiro] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchCounts = useCallback(async () => {
    if (!armazemId) return;
    const { data } = await (supabase as any).from("movimento_entrada").select("status").eq("armazem_id", armazemId);
    const counts: Record<string, number> = {};
    (data || []).forEach((m: any) => { counts[m.status] = (counts[m.status] || 0) + 1; });
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
        .select("id, numero_movimento, status, created_at, placa_veiculo", { count: "exact" })
        .eq("armazem_id", armazemId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (filterStatus) query = query.eq("status", filterStatus);
      if (filterNumero) query = query.eq("numero_movimento", Number(filterNumero));
      if (filterData) query = query.gte("created_at", filterData + "T00:00:00").lte("created_at", filterData + "T23:59:59");

      const { data, error, count } = await query;
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (mov: any) => {
          const { data: link } = await (supabase as any).from("movimento_entrada_documento").select("documento_entrada_id").eq("movimento_entrada_id", mov.id).limit(1);
          let parceiro_nome = "—";
          if (link && link.length > 0) {
            const { data: doc } = await (supabase as any).from("documento_entrada").select("parceiro_id").eq("id", link[0].documento_entrada_id).single();
            if (doc) {
              const { data: p } = await (supabase as any).from("parceiro").select("razaosocial").eq("id", doc.parceiro_id).single();
              if (p) parceiro_nome = p.razaosocial;
            }
          }
          return { ...mov, parceiro_nome };
        })
      );

      // Client-side filter for parceiro name
      let filtered = enriched;
      if (filterParceiro) {
        filtered = filtered.filter((m: any) => m.parceiro_nome?.toLowerCase().includes(filterParceiro.toLowerCase()));
      }

      setMovements(filtered);
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [armazemId, page, filterStatus, filterNumero, filterData, filterParceiro]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  const loadItems = async (movId: string) => {
    setSelectedMov(movId);
    setItemsLoading(true);
    setItemTab("itens");
    try {
      const { data, error } = await (supabase as any)
        .from("movimento_entrada_item")
        .select("id, produto_id, qtd_esperada, qtd_conferida, qtd_armazenada, qtd_ocorrencia, status_item_movimento")
        .eq("movimento_entrada_id", movId);
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (item: any) => {
          const { data: prod } = await (supabase as any).from("produto").select("sku, referencia, descricao").eq("id", item.produto_id).single();
          return { ...item, sku: prod?.sku || "—", referencia: prod?.referencia || "—", descricao: prod?.descricao || "—" };
        })
      );

      // Client-side filter by SKU
      let filtered = enriched;
      if (filterSku) {
        filtered = filtered.filter((i: any) => i.sku?.toLowerCase().includes(filterSku.toLowerCase()));
      }

      setItems(filtered);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setItemsLoading(false);
    }
  };

  // Context menu handlers (UI only for now)
  const handleMenuAction = (action: string, movId: string) => {
    toast.info(`Ação "${action}" será implementada em breve.`);
  };

  const clearFilters = () => {
    setFilterStatus(""); setFilterNumero(""); setFilterData(""); setFilterParceiro(""); setFilterSku("");
    setPage(1);
  };

  const hasFilters = filterStatus || filterNumero || filterData || filterParceiro || filterSku;
  const totalPages = Math.ceil(total / pageSize);
  const statusCards = ["GERADO", "EM CONFERENCIA", "ARMAZENADO", "DIVERGENCIA"];

  const inputClass = "w-full h-8 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  return (
    <div className="space-y-4 animate-fade-in">
      <h1 className="text-lg font-bold text-foreground">Movimentos de Entrada</h1>

      {/* Status cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statusCards.map((s) => {
          const info = STATUS_MAP[s] || { label: s, class: "" };
          return (
            <button key={s} onClick={() => { setFilterStatus(filterStatus === s ? "" : s); setPage(1); }}
              className={cn("card-surface p-4 text-left transition-all", filterStatus === s && "ring-1 ring-primary")}>
              <p className="text-xs text-muted-foreground">{info.label}</p>
              <p className="text-2xl font-bold text-foreground mt-1">{statusCounts[s] || 0}</p>
            </button>
          );
        })}
      </div>

      {/* Filters bar */}
      <div className="card-surface p-3">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => setShowFilters(!showFilters)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <Filter size={13} /> Filtros {hasFilters && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground">
              <X size={11} /> Limpar
            </button>
          )}
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nº Movimento</label>
              <input value={filterNumero} onChange={(e) => { setFilterNumero(e.target.value); setPage(1); }} placeholder="Ex: 1001" className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Data Geração</label>
              <input type="date" value={filterData} onChange={(e) => { setFilterData(e.target.value); setPage(1); }} className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Parceiro</label>
              <input value={filterParceiro} onChange={(e) => { setFilterParceiro(e.target.value); setPage(1); }} placeholder="Nome..." className={inputClass} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className={inputClass}>
                <option value="">Todos</option>
                {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">SKU</label>
              <input value={filterSku} onChange={(e) => setFilterSku(e.target.value)} placeholder="SKU..." className={inputClass} />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4" style={{ minHeight: "60vh" }}>
        {/* Movement list */}
        <div className="w-80 shrink-0 card-surface flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={filterNumero} onChange={(e) => { setFilterNumero(e.target.value); setPage(1); }} placeholder="Buscar nº movimento..."
                className="w-full h-8 pl-8 pr-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary" />
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : movements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhum movimento encontrado.</p>
            ) : (
              movements.map((mov) => {
                const info = STATUS_MAP[mov.status] || { label: mov.status, class: "" };
                return (
                  <div key={mov.id} className={cn("w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors flex items-start gap-2", selectedMov === mov.id && "bg-secondary/70")}>
                    <button onClick={() => loadItems(mov.id)} className="flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-foreground">
                          MOV-{mov.numero_movimento ?? mov.id.slice(0, 6).toUpperCase()}
                        </span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full border", info.class)}>{info.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{mov.parceiro_nome}</p>
                      <p className="text-xs text-muted-foreground">{new Date(mov.created_at).toLocaleDateString("pt-BR")}</p>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-secondary text-muted-foreground mt-0.5"><MoreVertical size={14} /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_conferencia", mov.id)}>Liberar para conferência</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("retirar_conferencia", mov.id)}>Retirar de conferência</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_armazenagem", mov.id)}>Liberar armazenagem</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_armazenagem_divergencia", mov.id)}>Liberar armazenagem c/ divergência</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("abrir_ocorrencias", mov.id)}>Abrir ocorrências do movimento</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
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

        {/* Detail panel with tabs */}
        <div className="flex-1 card-surface flex flex-col">
          {!selectedMov ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Package size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Selecione um movimento para ver os detalhes</p>
            </div>
          ) : (
            <Tabs value={itemTab} onValueChange={setItemTab} className="flex flex-col flex-1">
              <TabsList className="w-full shrink-0 border-b border-border rounded-none bg-transparent px-3 pt-2">
                <TabsTrigger value="itens" className="flex-1">Itens</TabsTrigger>
                <TabsTrigger value="hu" className="flex-1">HU</TabsTrigger>
                <TabsTrigger value="ocorrencias" className="flex-1">Ocorrências</TabsTrigger>
              </TabsList>

              {/* Aba Itens */}
              <TabsContent value="itens" className="flex-1 overflow-auto m-0">
                {itemsLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 sticky top-0">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Esperada</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Conferida</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Armazenada</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Ocorrência</th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Status</th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Det.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const si = ITEM_STATUS_MAP[item.status_item_movimento] || { label: item.status_item_movimento, class: "" };
                        return (
                          <tr key={item.id} className="border-b border-border/50 table-row-hover">
                            <td className="px-3 py-2.5 font-mono text-xs text-foreground">{item.sku}</td>
                            <td className="px-3 py-2.5 text-xs text-foreground truncate max-w-[200px]">{item.descricao}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">{item.qtd_esperada}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">{item.qtd_conferida}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">{item.qtd_armazenada ?? "—"}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">{item.qtd_ocorrencia ?? "—"}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("text-xs px-2 py-0.5 rounded-full border", si.class)}>{si.label}</span>
                            </td>
                            <td className="px-3 py-2.5 text-center">
                              <button onClick={() => setDetailItem(item)} className="p-1 rounded hover:bg-secondary transition-colors"><Eye size={14} className="text-muted-foreground" /></button>
                            </td>
                          </tr>
                        );
                      })}
                      {items.length === 0 && (
                        <tr><td colSpan={8} className="text-center py-8 text-xs text-muted-foreground">Nenhum item encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </TabsContent>

              {/* Aba HU (UI only) */}
              <TabsContent value="hu" className="flex-1 overflow-auto m-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 sticky top-0">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Número HU</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Geração</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Usuário</th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Status HU</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td colSpan={4} className="text-center py-8 text-xs text-muted-foreground">Em desenvolvimento — dados serão conectados em breve.</td></tr>
                  </tbody>
                </table>
              </TabsContent>

              {/* Aba Ocorrências (UI only) */}
              <TabsContent value="ocorrencias" className="flex-1 overflow-auto m-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 sticky top-0">
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                      <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Quantidade</th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td colSpan={4} className="text-center py-8 text-xs text-muted-foreground">Em desenvolvimento — dados serão conectados em breve.</td></tr>
                  </tbody>
                </table>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailItem} onOpenChange={() => setDetailItem(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Detalhes de Conferência</DialogTitle></DialogHeader>
          {detailItem && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">SKU</p><p className="text-sm font-mono text-foreground">{detailItem.sku}</p></div>
                <div><p className="text-xs text-muted-foreground">Descrição</p><p className="text-sm text-foreground">{detailItem.descricao}</p></div>
                <div><p className="text-xs text-muted-foreground">Qtd Esperada</p><p className="text-sm font-bold text-foreground">{detailItem.qtd_esperada}</p></div>
                <div><p className="text-xs text-muted-foreground">Qtd Conferida</p><p className="text-sm font-bold text-foreground">{detailItem.qtd_conferida}</p></div>
                <div><p className="text-xs text-muted-foreground">Qtd Armazenada</p><p className="text-sm font-bold text-foreground">{detailItem.qtd_armazenada ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground">Qtd Ocorrência</p><p className="text-sm font-bold text-foreground">{detailItem.qtd_ocorrencia ?? "—"}</p></div>
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
