import { useCallback, useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Loader2, Plus, Unlink2, Link2Off, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { formatDate } from "@/utils/dateTime";
import { parseEndereco } from "./utils";
import { AddEnderecosDialog } from "./AddEnderecosDialog";

const PAGE_SIZE = 50;

interface Props {
  zona: any | null;
  tenantId: string | null;
  armazemNome?: string;
  onClose: () => void;
  onCountChanged: () => void;
}

export function ZonaEnderecosSheet({ zona, tenantId, armazemNome, onClose, onCountChanged }: Props) {
  const [search, setSearch] = useState("");
  const [ruela, setRuela] = useState("ALL");
  const [predio, setPredio] = useState("ALL");
  const [nivel, setNivel] = useState("ALL");
  const [andar, setAndar] = useState("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [opts, setOpts] = useState<{ rua: number[]; predio: number[]; nivel: number[]; apto: number[] }>({
    rua: [], predio: [], nivel: [], apto: [],
  });

  const debouncedSearch = useDebounce(search, 300);

  const resetState = () => {
    setSearch(""); setRuela("ALL"); setPredio("ALL"); setNivel("ALL"); setAndar("ALL"); setPage(1);
  };

  // Carrega opções de filtros (valores distintos) — uma vez por zona
  useEffect(() => {
    if (!zona || !tenantId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("endereco_zona_atividade")
        .select("endereco!inner(rua, predio, nivel, apto)")
        .eq("tenant_id", tenantId)
        .eq("zona_atividade_id", zona.id)
        .limit(5000);
      const rua = new Set<number>(); const pred = new Set<number>(); const niv = new Set<number>(); const apt = new Set<number>();
      (data || []).forEach((r: any) => {
        const e = r.endereco; if (!e) return;
        if (e.rua != null) rua.add(e.rua);
        if (e.predio != null) pred.add(e.predio);
        if (e.nivel != null) niv.add(e.nivel);
        if (e.apto != null) apt.add(e.apto);
      });
      const sort = (s: Set<number>) => Array.from(s).sort((a, b) => a - b);
      setOpts({ rua: sort(rua), predio: sort(pred), nivel: sort(niv), apto: sort(apt) });
    })();
  }, [zona, tenantId]);

  const fetchData = useCallback(async () => {
    if (!zona || !tenantId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("endereco_zona_atividade")
        .select("id, endereco_id, created_at, endereco!inner(id, descricao, rua, predio, nivel, apto)", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("zona_atividade_id", zona.id);
      if (debouncedSearch.trim()) q = q.ilike("endereco.descricao", `%${debouncedSearch.trim()}%`);
      if (ruela !== "ALL") q = q.eq("endereco.rua", Number(ruela));
      if (predio !== "ALL") q = q.eq("endereco.predio", Number(predio));
      if (nivel !== "ALL") q = q.eq("endereco.nivel", Number(nivel));
      if (andar !== "ALL") q = q.eq("endereco.apto", Number(andar));
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.order("descricao", { foreignTable: "endereco", ascending: true }).range(from, to);
      const { data: res, count, error } = await q;
      if (error) throw error;
      setData(res || []);
      setTotal(count || 0);
    } catch (e: any) {
      toast.error(`Erro ao carregar endereços: ${e.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [zona, tenantId, debouncedSearch, ruela, predio, nivel, andar, page]);

  useEffect(() => { setPage(1); }, [debouncedSearch, ruela, predio, nivel, andar]);
  useEffect(() => { if (zona) fetchData(); }, [fetchData, zona]);
  useEffect(() => { if (!zona) resetState(); }, [zona]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilter = !!debouncedSearch || ruela !== "ALL" || predio !== "ALL" || nivel !== "ALL" || andar !== "ALL";

  const handleUnlink = (vinculo: any) => {
    const cod = vinculo.endereco?.descricao || "endereço";
    toast(`Desvincular ${cod} de ${zona?.descricao}?`, {
      action: {
        label: "Confirmar",
        onClick: async () => {
          const { error } = await (supabase as any).from("endereco_zona_atividade").delete().eq("id", vinculo.id);
          if (error) { toast.error(`Erro: ${error.message}`); return; }
          toast.success("Endereço desvinculado.");
          setData((prev) => prev.filter((v) => v.id !== vinculo.id));
          setTotal((t) => Math.max(0, t - 1));
          onCountChanged();
        },
      },
      duration: 6000,
    });
  };

  const handleAdded = () => {
    fetchData();
    onCountChanged();
  };

  const subtitle = useMemo(() => {
    const arm = armazemNome || "—";
    return `${arm} · ${zona?.tipo_grupo || "—"}`;
  }, [zona, armazemNome]);

  return (
    <>
      <Sheet open={!!zona} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="sm:max-w-[720px] w-full p-0 flex flex-col bg-card">
          {zona && (
            <>
              <SheetHeader className="px-6 pt-6 pb-3 space-y-1">
                <SheetTitle className="text-xl font-bold text-foreground">{zona.descricao}</SheetTitle>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">{subtitle}</p>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    {total} endereço{total === 1 ? "" : "s"} vinculado{total === 1 ? "" : "s"}
                  </span>
                </div>
              </SheetHeader>
              <Separator />

              {/* Toolbar */}
              <div className="px-6 pt-3 pb-3 space-y-2 shrink-0">
                <div className="flex items-center gap-2 bg-secondary rounded-lg px-3 py-2">
                  <Search size={14} className="text-muted-foreground shrink-0" />
                  <input
                    aria-label="Buscar por código de endereço"
                    type="text"
                    placeholder="Buscar por código de endereço..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterSelect label="Ruela" value={ruela} onChange={setRuela} options={opts.rua} prefix="R" />
                  <FilterSelect label="Prédio" value={predio} onChange={setPredio} options={opts.predio} prefix="P" />
                  <FilterSelect label="Nível" value={nivel} onChange={setNivel} options={opts.nivel} prefix="N" />
                  <FilterSelect label="Andar" value={andar} onChange={setAndar} options={opts.apto} prefix="A" />
                  {hasFilter && (
                    <button
                      onClick={() => { setSearch(""); setRuela("ALL"); setPredio("ALL"); setNivel("ALL"); setAndar("ALL"); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                    >
                      <X size={12} /> Limpar
                    </button>
                  )}
                  <span className="ml-auto text-xs text-muted-foreground">
                    Exibindo {data.length} de {total}
                  </span>
                </div>
              </div>
              <Separator />

              {/* Lista */}
              <div className="flex-1 min-h-0">
                <ScrollArea className="h-full">
                  <TooltipProvider>
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-card">
                        <tr className="border-b border-border bg-secondary/30">
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Código</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Ruela</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Prédio</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Nível</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-16">Andar</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-32">Vinculado em</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-14">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {loading ? (
                          Array.from({ length: 8 }).map((_, i) => (
                            <tr key={i} className="border-b border-border/40">
                              {Array.from({ length: 7 }).map((__, j) => (
                                <td key={j} className="px-3 py-3"><div className="h-3 rounded bg-muted animate-pulse" /></td>
                              ))}
                            </tr>
                          ))
                        ) : data.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-16">
                              <div className="flex flex-col items-center gap-2 text-center">
                                <Link2Off size={32} className="text-muted-foreground/30" />
                                <p className="text-sm font-medium text-foreground">Nenhum endereço vinculado a esta zona.</p>
                                <p className="text-xs text-muted-foreground">Clique em "+ Adicionar Endereços" para vincular.</p>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          data.map((v) => {
                            const p = parseEndereco(v.endereco);
                            return (
                              <tr key={v.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-2 font-mono text-sm text-primary truncate max-w-[200px]">{v.endereco?.descricao || "—"}</td>
                                <td className="px-2 py-2 text-center"><span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-border text-foreground">{p.ruela}</span></td>
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">{p.predio}</td>
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">{p.nivel}</td>
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">{p.andar}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">{formatDate(v.created_at)}</td>
                                <td className="px-3 py-2">
                                  <div className="flex justify-end">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          aria-label={`Desvincular ${v.endereco?.descricao}`}
                                          onClick={() => handleUnlink(v)}
                                          className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
                                        >
                                          <Unlink2 size={13} />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>Desvincular</TooltipContent>
                                    </Tooltip>
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </TooltipProvider>
                </ScrollArea>
              </div>

              {/* Footer */}
              <Separator />
              <div className="px-6 py-3 flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-1">
                  {totalPages > 1 && (
                    <>
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page <= 1}
                        aria-label="Página anterior"
                        className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                      >
                        <ChevronLeft size={12} /> Anterior
                      </button>
                      <span className="text-xs text-muted-foreground px-2">Página {page} de {totalPages}</span>
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page >= totalPages}
                        aria-label="Próxima página"
                        className="px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                      >
                        Próximo <ChevronRight size={12} />
                      </button>
                    </>
                  )}
                </div>
                <button
                  onClick={() => setAddOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                >
                  <Plus size={14} /> Adicionar Endereços
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AddEnderecosDialog
        open={addOpen}
        zona={zona}
        tenantId={tenantId}
        onClose={() => setAddOpen(false)}
        onAdded={handleAdded}
      />
    </>
  );
}

function FilterSelect({ label, value, onChange, options, prefix }: { label: string; value: string; onChange: (v: string) => void; options: number[]; prefix: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[120px] text-xs bg-secondary border-border">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ALL">Todas — {label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={String(o)}>{prefix}{String(o).padStart(2, "0")}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
