import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, Search, ArrowLeft, Eye, Eraser, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

interface Props {
  onNavigate: (path: string) => void;
  inventarioId: string;
  numeroInventario: number;
}

interface ItemResumo {
  id: string | null;
  sku: string | null;
  referencia: string | null;
  descricao: string | null;
  rua: number | null;
  predio: number | null;
  nivel: number | null;
  apto: number | null;
  quantidade_requerida: number | null;
  primeira_contagem: number | null;
  segunda_contagem: number | null;
  saldo_final: number | null;
  divergência: number | null;
  status: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  ATRIBUIDA: "bg-muted text-muted-foreground border-border",
  EM_ANDAMENTO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  DIVERGENTE: "bg-red-500/15 text-red-400 border-red-500/30",
  CONCLUIDA: "bg-green-500/15 text-green-400 border-green-500/30",
  AUDITADA: "bg-green-500/15 text-green-400 border-green-500/30",
};

export function InventarioItensPage({ onNavigate, inventarioId, numeroInventario }: Props) {
  const { tenantId, usuarioId } = useTenant();
  const [zerarOpen, setZerarOpen] = useState(false);
  const [zerando, setZerando] = useState(false);
  const [itens, setItens] = useState<ItemResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 30;

  // Filters
  const [fSku, setFSku] = useState("");
  const [fRua, setFRua] = useState("");
  const [fPredio, setFPredio] = useState("");
  const [fNivel, setFNivel] = useState("");
  const [fApto, setFApto] = useState("");
  const [fNaoContados, setFNaoContados] = useState("");
  const [fDivergentes, setFDivergentes] = useState("");
  const [fStatus, setFStatus] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<string>("sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(1);
  };

  const fetchItens = useCallback(async () => {
    if (!tenantId || !inventarioId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = (supabase as any)
        .from("inventario_item_resumo")
        .select("*", { count: "exact" })
        .eq("inventario_id", inventarioId)
        .range(from, to);

      if (fSku) query = query.ilike("sku", `%${fSku}%`);
      if (fRua) query = query.eq("rua", Number(fRua));
      if (fPredio) query = query.eq("predio", Number(fPredio));
      if (fNivel) query = query.eq("nivel", Number(fNivel));
      if (fApto) query = query.eq("apto", Number(fApto));

      // Filter by não contados
      if (fNaoContados === "1") query = query.is("primeira_contagem", null);
      if (fNaoContados === "2") query = query.is("segunda_contagem", null);
      if (fNaoContados === "saldo") query = query.is("saldo_final", null);

      // Filter by divergentes (col name has cedilla → quote in or())
      if (fDivergentes === "SIM") {
        query = query.or('status.eq.DIVERGENTE,"divergência".gt.0');
      }
      if (fDivergentes === "NAO") {
        query = query.in("status", ["CONCLUIDA", "AUDITADA"]).or('"divergência".eq.0,"divergência".is.null');
      }

      // Status filter
      if (fStatus) query = query.eq("status", fStatus);

      // Sort
      query = query.order(sortKey, { ascending: sortDir === "asc", nullsFirst: false });

      const { data, error, count } = await query;
      if (error) throw error;
      setItens(data || []);
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, inventarioId, page, fSku, fRua, fPredio, fNivel, fApto, fNaoContados, fDivergentes, fStatus, sortKey, sortDir]);

  useEffect(() => { fetchItens(); }, [fetchItens]);

  const handleSearch = () => { setPage(1); fetchItens(); };
  const totalPages = Math.ceil(total / pageSize);
  const inputClass = "h-8 px-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  const handleZerar = useCallback(async (contagem: 1 | 2) => {
    if (!tenantId || !usuarioId || !inventarioId) {
      toast.error("Sessão inválida.");
      return;
    }
    setZerando(true);
    try {
      // Buscar tarefas alvo do inventário com os mesmos filtros visuais
      let q = (supabase as any)
        .from("tarefa")
        .select("id, id_local_origem, status, produto_id, produto:produto_id(sku)")
        .eq("tenant_id", tenantId)
        .eq("id_documento_origem", inventarioId)
        .eq("status", contagem === 1 ? "ATRIBUIDA" : "EM_ANDAMENTO");

      if (fRua) {/* filtrado client-side abaixo via endereco */}
      // Filtros de endereço aplicados via join: refazemos via id_local_origem -> endereco
      const { data: tarefas, error } = await q;
      if (error) throw error;

      // Filtros adicionais client-side (SKU / endereço) — busca endereço/produto se necessário
      let lista: any[] = tarefas || [];
      if (fSku) {
        lista = lista.filter((t: any) => (t.produto?.sku || "").toLowerCase().includes(fSku.toLowerCase()));
      }
      if (fRua || fPredio || fNivel || fApto) {
        const ids = Array.from(new Set(lista.map((t: any) => t.id_local_origem).filter(Boolean)));
        if (ids.length > 0) {
          const { data: ends } = await (supabase as any)
            .from("endereco")
            .select("id, rua, predio, nivel, apto")
            .in("id", ids);
          const byId = new Map((ends || []).map((e: any) => [e.id, e]));
          lista = lista.filter((t: any) => {
            const e: any = byId.get(t.id_local_origem);
            if (!e) return false;
            if (fRua && Number(e.rua) !== Number(fRua)) return false;
            if (fPredio && Number(e.predio) !== Number(fPredio)) return false;
            if (fNivel && Number(e.nivel) !== Number(fNivel)) return false;
            if (fApto && Number(e.apto) !== Number(fApto)) return false;
            return true;
          });
        }
      }

      if (lista.length === 0) {
        toast.info("Nenhum item elegível para zerar.");
        setZerarOpen(false);
        return;
      }

      let ok = 0;
      let fail = 0;
      const chunk = 10;
      for (let i = 0; i < lista.length; i += chunk) {
        const slice = lista.slice(i, i + chunk);
        const results = await Promise.allSettled(slice.map((t: any) =>
          (supabase as any).rpc("fn_inventario_registrar_contagem", {
            p_tenant_id: tenantId,
            p_tarefa_id: t.id,
            p_usuario: usuarioId,
            p_contagem: contagem,
            p_quantidade: 0,
            p_endereco_origem_id: t.id_local_origem,
          })
        ));
        results.forEach(r => {
          if (r.status === "fulfilled" && !(r.value as any)?.error) ok++;
          else fail++;
        });
      }

      if (fail === 0) toast.success(`${ok} ${ok === 1 ? "item zerado" : "itens zerados"} na ${contagem}ª contagem.`);
      else toast.warning(`${ok} sucesso, ${fail} falha(s).`);
      setZerarOpen(false);
      fetchItens();
    } catch (err: any) {
      toast.error(err.message || "Falha ao zerar itens.");
    } finally {
      setZerando(false);
    }
  }, [tenantId, usuarioId, inventarioId, fSku, fRua, fPredio, fNivel, fApto, fetchItens]);


  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3">
        <button onClick={() => onNavigate("/atividades/inventario")} className="w-8 h-8 rounded-lg hover:bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-bold text-foreground">Itens do Inventário #{numeroInventario}</h1>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">SKU</label>
          <input value={fSku} onChange={e => setFSku(e.target.value)} placeholder="SKU" className={cn(inputClass, "w-28")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Rua</label>
          <input type="number" value={fRua} onChange={e => setFRua(e.target.value)} className={cn(inputClass, "w-16")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Prédio</label>
          <input type="number" value={fPredio} onChange={e => setFPredio(e.target.value)} className={cn(inputClass, "w-16")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Nível</label>
          <input type="number" value={fNivel} onChange={e => setFNivel(e.target.value)} className={cn(inputClass, "w-16")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Apto</label>
          <input type="number" value={fApto} onChange={e => setFApto(e.target.value)} className={cn(inputClass, "w-16")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Não Contados</label>
          <select value={fNaoContados} onChange={e => setFNaoContados(e.target.value)} className={cn(inputClass, "w-36")}>
            <option value="">Todos</option>
            <option value="1">1ª Contagem</option>
            <option value="2">2ª Contagem</option>
            <option value="saldo">Saldo Final</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Divergentes</label>
          <select value={fDivergentes} onChange={e => setFDivergentes(e.target.value)} className={cn(inputClass, "w-28")}>
            <option value="">Todos</option>
            <option value="SIM">Sim</option>
            <option value="NAO">Não</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Status</label>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)} className={cn(inputClass, "w-40")}>
            <option value="">Todos</option>
            <option value="ATRIBUIDA">Atribuída (não contado)</option>
            <option value="EM_ANDAMENTO">Em andamento</option>
            <option value="DIVERGENTE">Divergente</option>
            <option value="CONCLUIDA">Concluída</option>
            <option value="AUDITADA">Auditada</option>
          </select>
        </div>
        <button onClick={handleSearch} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex items-center gap-1">
          <Search size={12} /> Filtrar
        </button>
        <button
          onClick={() => setZerarOpen(true)}
          className="h-8 px-3 rounded-md border border-border bg-secondary/40 text-xs font-medium text-foreground hover:bg-secondary flex items-center gap-1"
        >
          <Eraser size={12} /> Zerar não contados
        </button>
      </div>

      {/* Table */}
      <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-primary" />
            <span className="ml-3 text-sm text-muted-foreground">Carregando...</span>
          </div>
        ) : (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-border bg-secondary/30">
                    {([
                      { key: "sku", label: "SKU", align: "left" },
                      { key: "referencia", label: "Referência", align: "left" },
                      { key: "descricao", label: "Descrição", align: "left" },
                      { key: "rua", label: "Rua", align: "right" },
                      { key: "predio", label: "Prédio", align: "right" },
                      { key: "nivel", label: "Nível", align: "right" },
                      { key: "apto", label: "Apto", align: "right" },
                      { key: "quantidade_requerida", label: "Qtd Requerida", align: "right" },
                      { key: "primeira_contagem", label: "1ª Contagem", align: "right" },
                      { key: "segunda_contagem", label: "2ª Contagem", align: "right" },
                      { key: "saldo_final", label: "Saldo Final", align: "right" },
                      { key: "divergência", label: "Divergência", align: "right" },
                      { key: "status", label: "Status", align: "left" },
                    ] as const).map(col => {
                      const active = sortKey === col.key;
                      const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
                      return (
                        <th key={col.key} className={cn("px-3 py-3 text-xs font-semibold text-muted-foreground uppercase", col.align === "right" ? "text-right" : "text-left")}>
                          <button
                            type="button"
                            onClick={() => toggleSort(col.key)}
                            className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", col.align === "right" && "flex-row-reverse", active && "text-primary")}
                          >
                            <span>{col.label}</span>
                            <Icon size={11} />
                          </button>
                        </th>
                      );
                    })}
                    <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr><td colSpan={14} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum item encontrado.</td></tr>
                  ) : itens.map((item, idx) => {
                    const statusInfo = STATUS_COLOR[item.status || ""] || "";
                    return (
                      <tr key={`${item.sku}-${idx}`} className={cn("border-b border-border/50 hover:bg-secondary/30 transition-colors", idx % 2 !== 0 && "bg-secondary/10")}>
                        <td className="px-3 py-2 text-sm font-mono font-semibold text-primary">{item.sku || "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground">{item.referencia || "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground max-w-[200px] truncate">{item.descricao || "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{item.rua ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{item.predio ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{item.nivel ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{item.apto ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{item.quantidade_requerida ?? "—"}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{item.status === "ATRIBUIDA" ? "—" : (item.primeira_contagem ?? "—")}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{(item.status === "ATRIBUIDA" || item.status === "EM_ANDAMENTO") ? "—" : (item.segunda_contagem ?? "—")}</td>
                        <td className="px-3 py-2 text-sm text-muted-foreground text-right">{(item.status !== "CONCLUIDA" && item.status !== "AUDITADA") ? "—" : (item.saldo_final ?? "—")}</td>
                        <td className="px-3 py-2 text-sm text-right">
                          <span className={cn(Number(item.divergência || 0) !== 0 ? "text-red-400 font-semibold" : "text-muted-foreground")}>
                            {(item.status === "ATRIBUIDA" || item.status === "EM_ANDAMENTO") ? "—" : (item.divergência ?? "—")}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {item.status && (
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap", statusInfo)}>
                              {item.status}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end">
                            <button
                              onClick={() => onNavigate(`/atividades/inventario/${inventarioId}/execucao?numero=${numeroInventario}&tarefa_id=${item.id}&sku=${encodeURIComponent(item.sku || "")}`)}
                              className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                              title="Visualizar Execuções"
                            >
                              <Eye size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let p: number;
                    if (totalPages <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= totalPages - 3) p = totalPages - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <button key={p} onClick={() => setPage(p)} className={cn("w-7 h-7 rounded text-xs transition-colors", page === p ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground hover:text-foreground hover:bg-secondary")}>
                        {p}
                      </button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={zerarOpen} onOpenChange={(o) => !zerando && setZerarOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Zerar itens não contados</AlertDialogTitle>
            <AlertDialogDescription>
              Em qual contagem os itens ainda não contados devem ser registrados com quantidade <strong>0</strong>?
              Os filtros atuais (SKU, Rua, Prédio, Nível, Apto) serão aplicados à seleção.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={zerando}>Cancelar</AlertDialogCancel>
            <button
              disabled={zerando}
              onClick={() => handleZerar(1)}
              className="h-10 px-4 rounded-md border border-border bg-secondary text-sm font-medium hover:bg-secondary/80 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {zerando && <Loader2 size={14} className="animate-spin" />}
              1ª Contagem
            </button>
            <button
              disabled={zerando}
              onClick={() => handleZerar(2)}
              className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {zerando && <Loader2 size={14} className="animate-spin" />}
              2ª Contagem
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
