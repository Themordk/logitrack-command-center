import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, Search, Plus, Eye, MoreHorizontal, Play, Pause, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/utils/dateTime";

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  CRIADO: { label: "Criado", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  EM_CONTAGEM: { label: "Em Contagem", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  EM_EXECUCAO: { label: "Em Execução", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  EM_ANALISE: { label: "Em Análise", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  EM_REVISAO: { label: "Em Revisão", class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  FINALIZADO: { label: "Finalizado", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  CANCELADO: { label: "Cancelado", class: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

const TIPO_MAP: Record<string, string> = {
  GERAL: "Geral",
  ENDERECO: "Endereço",
  PRODUTO: "Produto",
  GRUPO: "Grupo",
  ZONA: "Zona",
};

const TIPO_EXECUCAO_MAP: Record<string, string> = {
  AUDITORIA: "Auditoria",
  ATUALIZACAO: "Atualização",
};

interface Inventario {
  id: string;
  numero_inventario: number;
  tipo_inventario: string;
  tipo_execucao: string | null;
  descricao: string | null;
  status: string;
  criado_em: string | null;
  criado_por_nome?: string;
  total_itens: number | null;
  total_divergencias: number | null;
  acuracidade: number | null;
}

interface Props { onNavigate: (path: string) => void; }

export function InventarioPage({ onNavigate }: Props) {
  const { tenantId, empresaId, armazemId } = useTenant();
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  // Filters
  const [filterDateFrom, setFilterDateFrom] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }));
  const [filterDateTo, setFilterDateTo] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }));
  const [filterTipo, setFilterTipo] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCodigo, setFilterCodigo] = useState("");

  const fetchInventarios = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = (supabase as any)
        .from("vw_inventario_lista")
        .select("id, numero_inventario, tipo_inventario, tipo_execucao, descricao, status, criado_em, criado_por, total_itens, total_divergencias, acuracidade, criado_por_nome", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .order("numero_inventario", { ascending: false })
        .range(from, to);

      if (armazemId) query = query.eq("armazem_id", armazemId);
      if (filterStatus) query = query.eq("status", filterStatus);
      if (filterTipo) query = query.eq("tipo_inventario", filterTipo);
      if (filterCodigo) query = query.eq("numero_inventario", Number(filterCodigo));
      if (filterDateFrom) query = query.gte("criado_em", filterDateFrom + "T00:00:00");
      if (filterDateTo) query = query.lte("criado_em", filterDateTo + "T23:59:59");

      const { data, error, count } = await query;
      if (error) throw error;

      setInventarios((data || []).map((inv: any) => ({ ...inv, criado_por_nome: inv.criado_por_nome || "—" })));
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId, armazemId, page, filterStatus, filterTipo, filterCodigo, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchInventarios(); }, [fetchInventarios]);

  const handleSearch = () => {
    setPage(1);
    fetchInventarios();
  };

  const handleChangeStatus = async (invId: string, newStatus: string, label: string) => {
    setOpenMenuId(null);
    try {
      const { error } = await (supabase as any)
        .from("inventario")
        .update({ status: newStatus })
        .eq("id", invId);
      if (error) throw error;
      toast.success(`Inventário ${label} com sucesso!`);
      fetchInventarios();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const totalPages = Math.ceil(total / pageSize);
  const inputClass = "h-8 px-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  const fmtDate = (d: string | null) => formatDate(d);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground">Inventários</h1>
        <button onClick={() => onNavigate("/atividades/inventario/novo")} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
          <Plus size={16} />
          Novo Inventário
        </button>
      </div>

      {/* Filters */}
      <div className="shrink-0 flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Data De</label>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Data Até</label>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Tipo</label>
          <select value={filterTipo} onChange={(e) => setFilterTipo(e.target.value)} className={cn(inputClass, "w-32")}>
            <option value="">Todos</option>
            {Object.entries(TIPO_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={cn(inputClass, "w-36")}>
            <option value="">Todos</option>
            {Object.entries(STATUS_MAP).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Código</label>
          <input type="number" value={filterCodigo} onChange={(e) => setFilterCodigo(e.target.value)} placeholder="Nº" className={cn(inputClass, "w-20")} />
        </div>
        <button onClick={handleSearch} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex items-center gap-1">
          <Search size={12} /> Filtrar
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
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Código</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tipo Execução</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Descrição</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Data Criação</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Criado Por</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Itens</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Divergências</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Acuracidade</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {inventarios.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        Nenhum inventário encontrado.
                      </td>
                    </tr>
                  ) : (
                    inventarios.map((inv, idx) => {
                      const statusInfo = STATUS_MAP[inv.status] || { label: inv.status, class: "" };
                      return (
                        <tr key={inv.id} className={cn("border-b border-border/50 hover:bg-secondary/30 transition-colors", idx % 2 !== 0 && "bg-secondary/10")}>
                          <td className="px-4 py-3 cursor-pointer" onClick={() => onNavigate(`/atividades/inventario/${inv.id}/itens?numero=${inv.numero_inventario}`)}>
                            <span className="font-mono text-sm font-semibold text-primary">#{inv.numero_inventario}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground cursor-pointer" onClick={() => onNavigate(`/atividades/inventario/${inv.id}/itens?numero=${inv.numero_inventario}`)}>{TIPO_MAP[inv.tipo_inventario] || inv.tipo_inventario}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground cursor-pointer" onClick={() => onNavigate(`/atividades/inventario/${inv.id}/itens?numero=${inv.numero_inventario}`)}>{TIPO_EXECUCAO_MAP[inv.tipo_execucao || ""] || (inv.tipo_execucao || "—")}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate cursor-pointer" onClick={() => onNavigate(`/atividades/inventario/${inv.id}/itens?numero=${inv.numero_inventario}`)}>{inv.descricao || "—"}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(inv.criado_em)}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{inv.criado_por_nome}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground text-right">{inv.total_itens ?? 0}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            <span className={cn(Number(inv.total_divergencias || 0) > 0 ? "text-red-400 font-semibold" : "text-muted-foreground")}>
                              {inv.total_divergencias ?? 0}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground text-right">
                            {inv.acuracidade != null ? `${Number(inv.acuracidade).toFixed(1)}%` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap", statusInfo.class)}>
                              {statusInfo.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1 relative">
                              <button onClick={() => onNavigate(`/atividades/inventario/${inv.id}/itens?numero=${inv.numero_inventario}`)} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center" title="Visualizar">
                                <Eye size={13} />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === inv.id ? null : inv.id); }}
                                className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                                title="Opções"
                              >
                                <MoreHorizontal size={13} />
                              </button>
                              {openMenuId === inv.id && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
                                  <div className="absolute right-0 top-8 z-30 w-48 bg-popover border border-border rounded-lg shadow-lg py-1">
                                    <button
                                      onClick={() => handleChangeStatus(inv.id, "EM_CONTAGEM", "liberado")}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary flex items-center gap-2 text-foreground"
                                    >
                                      <Play size={12} className="text-blue-400" /> Liberar Inventário
                                    </button>
                                    <button
                                      onClick={() => handleChangeStatus(inv.id, "EM_ANALISE", "pausado")}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary flex items-center gap-2 text-foreground"
                                    >
                                      <Pause size={12} className="text-yellow-400" /> Pausar Inventário
                                    </button>
                                    <button
                                      onClick={() => handleChangeStatus(inv.id, "FINALIZADO", "finalizado")}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary flex items-center gap-2 text-foreground"
                                    >
                                      <CheckCircle size={12} className="text-green-400" /> Finalizar Inventário
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  Mostrando {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} de {total}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
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
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
