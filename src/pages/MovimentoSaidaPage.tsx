import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, Package, MoreVertical, Search, AlertTriangle, X } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  CRIADA: { label: "Criada", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  LIBERADO: { label: "Liberada", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  EM_PICKING: { label: "Em Separação", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  EM_CONFERENCIA: { label: "Em Conferência", class: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  EM_CARREGAMENTO: { label: "Em Carregamento", class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  CONCLUIDA: { label: "Concluída", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  CANCELADA: { label: "Cancelada", class: "bg-red-500/15 text-red-400 border-red-500/30" },
};

interface MovSaida {
  id: string;
  numero_onda: number;
  status: string;
  data_emissao: string;
  destino_carga: string;
  motorista: string;
  total_pedidos: number | null;
  peso_total: number | null;
  m3: number | null;
  prioridade: string | null;
  total_volume: number;
  observacao: string | null;
  box_id: string;
  rota_id: string;
  veiculo_id: string;
  empresa_id: string;
  parceiro_nome?: string;
  box_nome?: string;
}

interface OcorrenciaItem {
  sku?: string;
  tipo?: string;
  descricao?: string;
  produto_id?: string;
  qtd_esperada?: number;
  saldo_picking?: number;
  endereco_picking?: string;
  [key: string]: any;
}

interface LiberarResult {
  sucesso: boolean;
  mensagem: string;
  tipo_ocorrencia?: string;
  itens?: OcorrenciaItem[];
  ocorrencias?: OcorrenciaItem[];
}

export function MovimentoSaidaPage() {
  const { tenantId, empresaId } = useTenant();
  const [movimentos, setMovimentos] = useState<MovSaida[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMov, setSelectedMov] = useState<MovSaida | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterOnda, setFilterOnda] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const [tabItens, setTabItens] = useState<any[]>([]);
  const [tabSeparacao, setTabSeparacao] = useState<any[]>([]);
  const [tabConferencia, setTabConferencia] = useState<any[]>([]);
  const [tabDocs, setTabDocs] = useState<any[]>([]);
  const [tabLoading, setTabLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("itens");

  const [actionMenuId, setActionMenuId] = useState<string | null>(null);

  // Liberar result dialog
  const [liberarResult, setLiberarResult] = useState<LiberarResult | null>(null);
  const [liberarDialogOpen, setLiberarDialogOpen] = useState(false);
  const [liberarMovId, setLiberarMovId] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMovimentos = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = (supabase as any)
        .from("movimento_saida")
        .select("id, numero_onda, status, data_emissao, destino_carga, motorista, total_pedidos, peso_total, m3, prioridade, total_volume, observacao, box_id, rota_id, veiculo_id, empresa_id", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("numero_onda", { ascending: false })
        .range(from, to);

      if (filterStatus) query = query.eq("status", filterStatus);
      if (filterOnda) query = query.eq("numero_onda", Number(filterOnda));
      if (filterDateFrom) query = query.gte("data_emissao", filterDateFrom);
      if (filterDateTo) query = query.lte("data_emissao", filterDateTo + "T23:59:59");

      const { data, error, count } = await query;
      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (mov: any) => {
          const [boxRes, docRes] = await Promise.all([
            (supabase as any).from("box").select("descricao").eq("id", mov.box_id).single(),
            (supabase as any).from("movimento_saida_documento").select("documento_saida_id").eq("movimento_saida_id", mov.id).limit(1),
          ]);
          let parceiro_nome = "—";
          if (docRes.data?.[0]) {
            const { data: ds } = await (supabase as any).from("documento_saida").select("parceiro_id").eq("id", docRes.data[0].documento_saida_id).single();
            if (ds?.parceiro_id) {
              const { data: parc } = await (supabase as any).from("parceiro").select("razaosocial").eq("id", ds.parceiro_id).single();
              parceiro_nome = parc?.razaosocial || "—";
            }
          }
          return { ...mov, box_nome: boxRes.data?.descricao || "—", parceiro_nome };
        })
      );

      setMovimentos(enriched);
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, page, filterStatus, filterOnda, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchMovimentos(); }, [fetchMovimentos]);

  const loadTabData = useCallback(async (movId: string) => {
    setTabLoading(true);
    try {
      const [itensRes, sepRes, confRes, docsRes] = await Promise.all([
        (supabase as any).from("vw_movimento_saida_resumo").select("*").eq("movimento_id", movId),
        (supabase as any).from("vw_movimento_saida_separacao_detalhe").select("*").eq("movimento_id", movId),
        (supabase as any).from("vw_movimento_saida_conferencia_detalhe").select("*").eq("movimento_saida_id", movId),
        (supabase as any).from("movimento_saida_documento").select("documento_saida_id, ordem").eq("movimento_saida_id", movId).order("ordem"),
      ]);
      setTabItens(itensRes.data || []);
      setTabSeparacao(sepRes.data || []);
      setTabConferencia(confRes.data || []);

      if (docsRes.data?.length) {
        const enrichedDocs = await Promise.all(
          docsRes.data.map(async (d: any) => {
            const { data: ds } = await (supabase as any).from("documento_saida").select("numero_pedido, data_emissao, valor_pedido, parceiro_id").eq("id", d.documento_saida_id).single();
            let parceiro = "—";
            if (ds?.parceiro_id) {
              const { data: p } = await (supabase as any).from("parceiro").select("razaosocial").eq("id", ds.parceiro_id).single();
              parceiro = p?.razaosocial || "—";
            }
            return { ...d, numero_pedido: ds?.numero_pedido, data_emissao: ds?.data_emissao, valor_pedido: ds?.valor_pedido, parceiro };
          })
        );
        setTabDocs(enrichedDocs);
      } else {
        setTabDocs([]);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setTabLoading(false);
    }
  }, []);

  const selectMov = (mov: MovSaida) => {
    setSelectedId(mov.id);
    setSelectedMov(mov);
    loadTabData(mov.id);
  };

  const handleLiberar = async (movId: string) => {
    setActionMenuId(null);
    const mov = movimentos.find(m => m.id === movId);
    try {
      const { data, error } = await supabase.rpc("liberar_onda_separacao" as any, {
        p_movimento_saida_id: movId,
        p_tenant_id: tenantId,
        p_empresa_id: mov?.empresa_id || empresaId,
      });
      if (error) throw error;

      // Parse the result - could be JSON or string
      let result: LiberarResult;
      if (typeof data === "string") {
        try {
          result = JSON.parse(data);
        } catch {
          result = { sucesso: true, mensagem: data };
        }
      } else if (typeof data === "object" && data !== null) {
        result = data as LiberarResult;
      } else {
        result = { sucesso: true, mensagem: "Liberado para separação!" };
      }

      if (result.sucesso) {
        toast.success(result.mensagem || "Liberado para separação!");
        fetchMovimentos();
        if (selectedId === movId) {
          setSelectedMov((prev) => prev ? { ...prev, status: "LIBERADO" } : null);
        }
      } else {
        // Show dialog with occurrence details
        setLiberarResult(result);
        setLiberarMovId(movId);
        setLiberarDialogOpen(true);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRetirar = async (movId: string) => {
    setActionMenuId(null);
    try {
      const { error } = await (supabase as any)
        .from("movimento_saida")
        .update({ status: "CRIADA" })
        .eq("id", movId);
      if (error) throw error;
      toast.success("Retirado da separação!");
      fetchMovimentos();
      if (selectedId === movId) {
        setSelectedMov((prev) => prev ? { ...prev, status: "CRIADA" } : null);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleExcluirOnda = async () => {
    if (!deleteConfirmId || !tenantId) return;
    setDeleting(true);
    try {
      const mov = movimentos.find(m => m.id === deleteConfirmId);
      if (!mov) throw new Error("Movimento não encontrado");
      if (mov.status !== "CRIADA") {
        toast.error("Só é possível excluir ondas com status CRIADA.");
        return;
      }

      // Get linked documents
      const { data: docs } = await (supabase as any)
        .from("movimento_saida_documento")
        .select("documento_saida_id")
        .eq("movimento_saida_id", deleteConfirmId);
      const docIds = (docs || []).map((d: any) => d.documento_saida_id);

      // Delete items -> docs -> movement
      await (supabase as any).from("movimento_saida_item").delete().eq("movimento_saida_id", deleteConfirmId);
      await (supabase as any).from("movimento_saida_documento").delete().eq("movimento_saida_id", deleteConfirmId);
      const { error } = await (supabase as any).from("movimento_saida").delete().eq("id", deleteConfirmId);
      if (error) throw error;

      // Reset doc status to 0
      if (docIds.length > 0) {
        await (supabase as any).from("documento_saida").update({ status: 0 }).in("id", docIds);
      }

      toast.success("Onda excluída com sucesso!");
      if (selectedId === deleteConfirmId) {
        setSelectedId(null);
        setSelectedMov(null);
      }
      fetchMovimentos();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
      setDeleteConfirmId(null);
    }
  };

  const handleGerarAbastecimentoPreventivo = async () => {
    if (!liberarResult?.itens || !liberarMovId || !tenantId) return;
    try {
      const { data, error } = await supabase.rpc("gerar_abastecimento_preventivo" as any, {
        p_movimento_saida_id: liberarMovId,
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      toast.success(typeof data === "string" ? data : "Abastecimento preventivo gerado!");
      setLiberarDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchMovimentos();
  };

  const totalPages = Math.ceil(total / pageSize);
  const inputClass = "h-8 px-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  return (
    <div className="space-y-3 animate-fade-in">
      <h1 className="text-lg font-bold text-foreground">Ondas de Carregamento</h1>

      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Data De</label>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Data Até</label>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Nº Onda</label>
          <input type="number" value={filterOnda} onChange={(e) => setFilterOnda(e.target.value)} placeholder="Nº" className={cn(inputClass, "w-20")} />
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
        <button onClick={handleSearch} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex items-center gap-1">
          <Search size={12} /> Filtrar
        </button>
      </div>

      <div className="flex gap-3" style={{ minHeight: "65vh" }}>
        {/* Left panel */}
        <div className="w-80 shrink-0 card-surface flex flex-col">
          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : movimentos.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhuma onda encontrada.</p>
            ) : (
              movimentos.map((mov) => {
                const info = STATUS_MAP[mov.status] || { label: mov.status, class: "" };
                return (
                  <div
                    key={mov.id}
                    className={cn("relative w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors cursor-pointer", selectedId === mov.id && "bg-secondary/70")}
                    onClick={() => selectMov(mov)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-semibold text-foreground">Onda #{mov.numero_onda}</span>
                      <div className="flex items-center gap-1">
                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", info.class)}>{info.label}</span>
                        <div className="relative">
                          <button
                            onClick={(e) => { e.stopPropagation(); setActionMenuId(actionMenuId === mov.id ? null : mov.id); }}
                            className="p-1 rounded hover:bg-secondary"
                          >
                            <MoreVertical size={14} className="text-muted-foreground" />
                          </button>
                          {actionMenuId === mov.id && (
                            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-card shadow-elevated z-50 overflow-hidden animate-fade-in">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleLiberar(mov.id); }}
                                disabled={mov.status !== "CRIADA"}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                Liberar para separação
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRetirar(mov.id); }}
                                disabled={mov.status !== "LIBERADO"}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                Retirar da separação
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuId(null);
                                  if (mov.status !== "CRIADA") {
                                    toast.error("Só é possível excluir ondas com status CRIADA.");
                                    return;
                                  }
                                  setDeleteConfirmId(mov.id);
                                }}
                                disabled={mov.status !== "CRIADA"}
                                className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                Excluir onda
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{mov.parceiro_nome}</p>
                    <p className="text-xs text-muted-foreground">Box: {mov.box_nome} • {new Date(mov.data_emissao).toLocaleDateString("pt-BR")}</p>
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

        {/* Right panel with tabs */}
        <div className="flex-1 card-surface flex flex-col overflow-hidden">
          {!selectedId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Package size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Selecione uma onda para ver os detalhes</p>
            </div>
          ) : tabLoading ? (
            <div className="flex-1 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden">
              <TabsList className="mx-3 mt-3 shrink-0">
                <TabsTrigger value="itens">Itens</TabsTrigger>
                <TabsTrigger value="separacao">Separação</TabsTrigger>
                <TabsTrigger value="conferencia">Conferência</TabsTrigger>
                <TabsTrigger value="info">Informações</TabsTrigger>
              </TabsList>

              <TabsContent value="itens" className="flex-1 overflow-auto m-0 px-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 sticky top-0">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Esperada</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Separada</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Conferida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabItens.map((item: any, i: number) => (
                      <tr key={item.movimento_item_id || i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{item.sku}</td>
                        <td className="px-3 py-2 text-xs text-foreground">{item.descricao}</td>
                        <td className="px-3 py-2 text-right text-foreground">{Number(item.qtd_esperada)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{Number(item.qtd_separada)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{Number(item.qtd_conferida)}</td>
                      </tr>
                    ))}
                    {tabItens.length === 0 && (
                      <tr><td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">Sem itens</td></tr>
                    )}
                  </tbody>
                </table>
              </TabsContent>

              <TabsContent value="separacao" className="flex-1 overflow-auto m-0 px-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 sticky top-0">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Operador</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Lote</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Concluído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabSeparacao.map((item: any, i: number) => (
                      <tr key={item.tarefa_execucao_id || i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{item.sku}</td>
                        <td className="px-3 py-2 text-xs text-foreground">{item.descricao}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.operador || "—"}</td>
                        <td className="px-3 py-2 text-right text-foreground">{Number(item.quantidade_executada)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.lote || "—"}</td>
                        <td className="px-3 py-2 text-xs">{item.status || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.concluido_em ? new Date(item.concluido_em).toLocaleString("pt-BR") : "—"}</td>
                      </tr>
                    ))}
                    {tabSeparacao.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">Sem dados de separação</td></tr>
                    )}
                  </tbody>
                </table>
              </TabsContent>

              <TabsContent value="conferencia" className="flex-1 overflow-auto m-0 px-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30 sticky top-0">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Lote</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Operador</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Endereço</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Concluído</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabConferencia.map((item: any, i: number) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{item.sku}</td>
                        <td className="px-3 py-2 text-xs text-foreground">{item.descricao_sku}</td>
                        <td className="px-3 py-2 text-right text-foreground">{Number(item.quantidade_executada)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.lote || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.login || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.endereco || "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{item.concluido_em ? new Date(item.concluido_em).toLocaleString("pt-BR") : "—"}</td>
                      </tr>
                    ))}
                    {tabConferencia.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">Sem dados de conferência</td></tr>
                    )}
                  </tbody>
                </table>
              </TabsContent>

              <TabsContent value="info" className="flex-1 overflow-auto m-0 p-4 space-y-4">
                {selectedMov && (
                  <>
                    <div>
                      <h3 className="text-xs font-semibold text-foreground uppercase mb-2">Dados do Movimento</h3>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          ["Nº Onda", `#${selectedMov.numero_onda}`],
                          ["Status", STATUS_MAP[selectedMov.status]?.label || selectedMov.status],
                          ["Data Emissão", new Date(selectedMov.data_emissao).toLocaleDateString("pt-BR")],
                          ["Destino", selectedMov.destino_carga],
                          ["Motorista", selectedMov.motorista || "—"],
                          ["Prioridade", selectedMov.prioridade || "—"],
                          ["Total Pedidos", String(selectedMov.total_pedidos || 0)],
                          ["Total Volumes", String(selectedMov.total_volume)],
                          ["Peso Total", selectedMov.peso_total ? `${Number(selectedMov.peso_total).toFixed(2)} kg` : "—"],
                          ["M³", selectedMov.m3 ? Number(selectedMov.m3).toFixed(3) : "—"],
                          ["Box", selectedMov.box_nome || "—"],
                          ["Observação", selectedMov.observacao || "—"],
                        ].map(([label, value]) => (
                          <div key={label} className="p-2 rounded-md bg-secondary/30 border border-border/50">
                            <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
                            <p className="text-xs text-foreground mt-0.5">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-foreground uppercase mb-2">Documentos Vinculados</h3>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border bg-secondary/30">
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Ordem</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nº Pedido</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Data Emissão</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Parceiro</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tabDocs.map((doc: any, i: number) => (
                            <tr key={i} className="border-b border-border/50">
                              <td className="px-3 py-2 text-xs text-foreground">{doc.ordem}</td>
                              <td className="px-3 py-2 font-mono text-xs text-foreground">{doc.numero_pedido}</td>
                              <td className="px-3 py-2 text-xs text-muted-foreground">{doc.data_emissao ? new Date(doc.data_emissao).toLocaleDateString("pt-BR") : "—"}</td>
                              <td className="px-3 py-2 text-xs text-foreground">{doc.parceiro}</td>
                              <td className="px-3 py-2 text-right font-mono text-xs text-foreground">{doc.valor_pedido ? Number(doc.valor_pedido).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—"}</td>
                            </tr>
                          ))}
                          {tabDocs.length === 0 && (
                            <tr><td colSpan={5} className="text-center py-8 text-xs text-muted-foreground">Sem documentos vinculados</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(v) => !v && setDeleteConfirmId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <DialogTitle>Excluir Onda</DialogTitle>
                <DialogDescription className="mt-1">
                  Tem certeza que deseja excluir esta onda de carregamento? Itens, documentos vinculados serão removidos e os documentos de saída terão status resetado.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setDeleteConfirmId(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button onClick={handleExcluirOnda} disabled={deleting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors">
              {deleting && <Loader2 size={14} className="animate-spin" />}
              {deleting ? "Excluindo..." : "Excluir"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Liberar result dialog */}
      <Dialog open={liberarDialogOpen} onOpenChange={setLiberarDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                <AlertTriangle size={20} className="text-destructive" />
              </div>
              <div>
                <DialogTitle>Não foi possível liberar</DialogTitle>
                <DialogDescription className="mt-1">
                  {liberarResult?.mensagem}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Ocorrências list from new JSON format */}
          {liberarResult?.ocorrencias && liberarResult.ocorrencias.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Ocorrências ({liberarResult.ocorrencias.length})</p>
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Tipo</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liberarResult.ocorrencias.map((oc, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{oc.sku || "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-destructive/15 text-destructive text-[11px] font-medium">
                            {oc.tipo?.replace(/_/g, " ") || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">{oc.descricao || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legacy itens format fallback */}
          {(!liberarResult?.ocorrencias || liberarResult.ocorrencias.length === 0) && liberarResult?.itens && liberarResult.itens.length > 0 && (
            <div className="mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                    {liberarResult.tipo_ocorrencia === "saldo_insuficiente_picking" && (
                      <>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Esperada</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Saldo Picking</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Endereço</th>
                      </>
                    )}
                    {liberarResult.tipo_ocorrencia === "sem_picking" && (
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Situação</th>
                    )}
                    {liberarResult.tipo_ocorrencia === "sem_estoque_pulmao" && (
                      <>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Esperada</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Situação</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {liberarResult.itens.map((item, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-3 py-2 font-mono text-xs text-foreground">{item.sku || "—"}</td>
                      <td className="px-3 py-2 text-xs text-foreground">{item.descricao || "—"}</td>
                      {liberarResult.tipo_ocorrencia === "saldo_insuficiente_picking" && (
                        <>
                          <td className="px-3 py-2 text-right text-foreground">{item.qtd_esperada ?? "—"}</td>
                          <td className="px-3 py-2 text-right text-destructive font-semibold">{item.saldo_picking ?? 0}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.endereco_picking || "—"}</td>
                        </>
                      )}
                      {liberarResult.tipo_ocorrencia === "sem_picking" && (
                        <td className="px-3 py-2 text-xs text-destructive">Sem endereço de picking</td>
                      )}
                      {liberarResult.tipo_ocorrencia === "sem_estoque_pulmao" && (
                        <>
                          <td className="px-3 py-2 text-right text-foreground">{item.qtd_esperada ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-destructive">Sem estoque no pulmão</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {liberarResult.tipo_ocorrencia === "saldo_insuficiente_picking" && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleGerarAbastecimentoPreventivo}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Gerar Abastecimento Preventivo
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
