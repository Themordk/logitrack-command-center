import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Loader2, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/useDebounce";
import { parseEndereco } from "./utils";
import { parseError } from "@/lib/errorMapper";

const PAGE_SIZE = 100;

interface Props {
  open: boolean;
  zona: any | null;
  tenantId: string | null;
  onClose: () => void;
  onAdded: () => void;
}

export function AddEnderecosDialog({ open, zona, tenantId, onClose, onAdded }: Props) {
  const [search, setSearch] = useState("");
  const [ruela, setRuela] = useState("ALL");
  const [predio, setPredio] = useState("ALL");
  const [nivel, setNivel] = useState("ALL");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [vinculadosIds, setVinculadosIds] = useState<string[]>([]);
  const [opts, setOpts] = useState<{ rua: number[]; predio: number[]; nivel: number[] }>({ rua: [], predio: [], nivel: [] });

  const debouncedSearch = useDebounce(search, 300);

  // Reset ao abrir/fechar
  useEffect(() => {
    if (open) {
      setSearch(""); setRuela("ALL"); setPredio("ALL"); setNivel("ALL"); setPage(1); setSelected(new Set());
    }
  }, [open]);

  // Carrega IDs já vinculados (uma vez por abertura)
  useEffect(() => {
    if (!open || !zona || !tenantId) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("endereco_zona_atividade")
        .select("endereco_id")
        .eq("tenant_id", tenantId)
        .eq("zona_atividade_id", zona.id)
        .limit(50000);
      if (error) { toast.error(parseError(error, "carregar vinculados").title); setVinculadosIds([]); return; }
      setVinculadosIds((data || []).map((d: any) => d.endereco_id));
    })();
  }, [open, zona, tenantId]);

  // Opções de filtros (valores distintos do armazém da zona, excluindo já vinculados)
  useEffect(() => {
    if (!open || !zona || !tenantId) return;
    (async () => {
      let q = (supabase as any)
        .from("endereco")
        .select("rua, predio, nivel")
        .eq("tenant_id", tenantId)
        .eq("armazem_id", zona.armazem_id)
        .eq("ativo", true)
        .limit(10000);
      const { data } = await q;
      const rua = new Set<number>(); const pred = new Set<number>(); const niv = new Set<number>();
      (data || []).forEach((e: any) => {
        if (e.rua != null) rua.add(e.rua);
        if (e.predio != null) pred.add(e.predio);
        if (e.nivel != null) niv.add(e.nivel);
      });
      const sort = (s: Set<number>) => Array.from(s).sort((a, b) => a - b);
      setOpts({ rua: sort(rua), predio: sort(pred), nivel: sort(niv) });
    })();
  }, [open, zona, tenantId]);

  const fetchData = useCallback(async () => {
    if (!open || !zona || !tenantId) return;
    setLoading(true);
    try {
      let q = (supabase as any)
        .from("endereco")
        .select("id, descricao, rua, predio, nivel, apto", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("armazem_id", zona.armazem_id)
        .eq("ativo", true);
      if (vinculadosIds.length > 0) {
        // PostgREST exige formato (a,b,c). Para listas longas, dividir em pedaços
        // se ultrapassar o limite. Aqui mandamos direto até 50k.
        q = q.not("id", "in", `(${vinculadosIds.join(",")})`);
      }
      if (debouncedSearch.trim()) q = q.ilike("descricao", `%${debouncedSearch.trim()}%`);
      if (ruela !== "ALL") q = q.eq("rua", Number(ruela));
      if (predio !== "ALL") q = q.eq("predio", Number(predio));
      if (nivel !== "ALL") q = q.eq("nivel", Number(nivel));
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.order("descricao", { ascending: true }).range(from, to);
      const { data: res, count, error } = await q;
      if (error) throw error;
      setData(res || []);
      setTotal(count || 0);
    } catch (e: any) {
      const parsed = parseError(e, "carregar disponiveis");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao carregar disponíveis." : parsed.title);
    } finally {
      setLoading(false);
    }
  }, [open, zona, tenantId, vinculadosIds, debouncedSearch, ruela, predio, nivel, page]);

  useEffect(() => { setPage(1); }, [debouncedSearch, ruela, predio, nivel]);
  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilter = !!debouncedSearch || ruela !== "ALL" || predio !== "ALL" || nivel !== "ALL";
  const visibleIds = data.map((d) => d.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleSubmit = async () => {
    if (selected.size === 0 || !zona || !tenantId) return;
    setSaving(true);
    try {
      const ids = Array.from(selected);
      const inserts = ids.map((endereco_id) => ({
        endereco_id,
        zona_atividade_id: zona.id,
        tenant_id: tenantId,
      }));
      const { data: inserted, error } = await (supabase as any)
        .from("endereco_zona_atividade")
        .upsert(inserts, { onConflict: "tenant_id,zona_atividade_id,endereco_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw error;
      const added = inserted?.length ?? 0;
      const ignored = ids.length - added;
      if (added > 0) toast.success(`${added} endereço(s) vinculado(s) com sucesso à ${zona.descricao}!`);
      if (ignored > 0) toast.warning(`${ignored} endereço(s) já estavam vinculados e foram ignorados.`);
      onAdded();
      onClose();
    } catch (e: any) {
      const parsed = parseError(e, "vincular enderecos");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao vincular endereços." : parsed.title);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !saving && onClose()}>
      <DialogContent className="max-w-3xl p-0 flex flex-col max-h-[85vh] bg-card">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="text-lg font-bold text-foreground">
            Adicionar Endereços — {zona?.descricao}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">Selecione os endereços disponíveis para vincular a esta zona.</p>
        </DialogHeader>
        <Separator />

        {/* Toolbar */}
        <div className="px-6 pt-3 pb-3 space-y-2 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 flex-1 bg-secondary rounded-lg px-3 py-2">
              <Search size={14} className="text-muted-foreground shrink-0" />
              <input
                aria-label="Buscar endereço disponível"
                type="text"
                placeholder="Buscar endereço disponível..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
              />
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                  {selected.size} selecionado{selected.size > 1 ? "s" : ""}
                </span>
                <button onClick={() => setSelected(new Set())} className="text-xs text-muted-foreground hover:text-foreground">
                  Limpar seleção
                </button>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Ruela" value={ruela} onChange={setRuela} options={opts.rua} prefix="R" />
            <FilterSelect label="Prédio" value={predio} onChange={setPredio} options={opts.predio} prefix="P" />
            <FilterSelect label="Nível" value={nivel} onChange={setNivel} options={opts.nivel} prefix="N" />
            {hasFilter && (
              <button
                onClick={() => { setSearch(""); setRuela("ALL"); setPredio("ALL"); setNivel("ALL"); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                <X size={12} /> Limpar filtros
              </button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">{total} disponíveis</span>
          </div>
          {data.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} id="select-all-visible" />
              <label htmlFor="select-all-visible" className="text-xs text-muted-foreground cursor-pointer">
                Selecionar todos os visíveis ({data.length} itens)
              </label>
            </div>
          )}
        </div>
        <Separator />

        {/* Lista */}
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-[420px]">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="animate-spin text-primary" />
              </div>
            ) : data.length === 0 ? (
              <div className="flex flex-col items-center gap-2 text-center py-20">
                <CheckCircle2 size={32} className="text-green-400" />
                <p className="text-sm font-medium text-foreground">Todos os endereços já estão vinculados!</p>
                <p className="text-xs text-muted-foreground">Não há endereços disponíveis para vincular a esta zona.</p>
              </div>
            ) : (
              <ul>
                {data.map((e) => {
                  const p = parseEndereco(e);
                  const isSel = selected.has(e.id);
                  return (
                    <li
                      key={e.id}
                      onClick={() => toggleOne(e.id)}
                      className={`flex items-center gap-3 h-10 px-4 cursor-pointer border-b border-border/40 transition-colors ${
                        isSel ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox checked={isSel} onCheckedChange={() => toggleOne(e.id)} onClick={(ev) => ev.stopPropagation()} />
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border border-border text-foreground">R{p.ruela}</span>
                      <span className="font-mono text-sm text-foreground w-[180px] truncate">{e.descricao}</span>
                      <span className="text-sm text-muted-foreground">P{p.predio}</span>
                      <span className="text-sm text-muted-foreground">N{p.nivel}</span>
                      <span className="text-sm text-muted-foreground">A{p.andar}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        <Separator />
        {/* Footer */}
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
          <span className="text-xs text-muted-foreground">{selected.size} endereço(s) selecionado(s) no total</span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-border text-sm text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleSubmit}
              disabled={selected.size === 0 || saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Vincular {selected.size} endereço{selected.size === 1 ? "" : "(s)"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
