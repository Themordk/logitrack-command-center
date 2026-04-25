import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, ChevronLeft, ChevronRight, Package, MoreVertical, Search, AlertTriangle, X, Unlock, Lock, Ban, Eraser, Star, UserCog } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fetchOperadoresAtribuidos } from "@/lib/operadoresAtribuidos";
import { OperadoresAtribuidos } from "@/components/movimentos/OperadoresAtribuidos";
import { ReatribuirTarefasModal } from "@/components/movimentos/ReatribuirTarefasModal";
import { formatBrasiliaDateTime } from "@/lib/dateUtils";

const PRIORIDADE_OPTIONS = ["URGENTE", "ALTA", "NORMAL", "BAIXA"] as const;

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  CRIADA: { label: "Criada", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  LIBERADO: { label: "Liberada", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  EM_PICKING: { label: "Em Separação", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  SEPARADO: { label: "Separado", class: "bg-lime-500/15 text-lime-400 border-lime-500/30" },
  EM_CONFERENCIA: { label: "Em Conferência", class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  CONFERIDO: { label: "Conferido", class: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  EM_CARREGAMENTO: { label: "Em Carregamento", class: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  CONCLUIDA: { label: "Concluída", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  CANCELADA: { label: "Cancelada", class: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
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
  operadores_atribuidos?: string[];
}

interface OcorrenciaItem {
  sku?: string;
  tipo?: string;
  descricao?: string;
  produto_id?: string;
  qtd_esperada?: number;
  saldo_picking?: number;
  endereco_picking?: string;
  saldo_pulmao?: number;
  [key: string]: any;
}

interface LiberarResult {
  sucesso: boolean;
  mensagem: string;
  tipo_ocorrencia?: string;
  itens?: OcorrenciaItem[];
  ocorrencias?: OcorrenciaItem[];
}

interface MotivoOcorrencia {
  id: string;
  descricao: string;
}

const normalizeOccurrenceType = (tipo?: string | null) => (tipo || "").trim().toUpperCase();
const isSaldoInsuficientePicking = (tipo?: string | null) => normalizeOccurrenceType(tipo) === "SALDO_PICKING_INSUFICIENTE";

export function MovimentoSaidaPage() {
  const { tenantId, empresaId, armazemId, usuarioId } = useTenant();
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
  const [itemActionMenuId, setItemActionMenuId] = useState<string | null>(null);

  // Liberar result dialog
  const [liberarResult, setLiberarResult] = useState<LiberarResult | null>(null);
  const [liberarDialogOpen, setLiberarDialogOpen] = useState(false);
  const [liberarMovId, setLiberarMovId] = useState<string | null>(null);

  // Delete confirm
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Priority dialog
  const [prioridadeDialogId, setPrioridadeDialogId] = useState<string | null>(null);
  const [prioridadeValue, setPrioridadeValue] = useState("");
  const [savingPrioridade, setSavingPrioridade] = useState(false);

  // Corte dialog
  const [corteItem, setCorteItem] = useState<OcorrenciaItem | null>(null);
  const [corteMotivos, setCorteMotivos] = useState<MotivoOcorrencia[]>([]);
  const [corteMotivoId, setCorteMotivoId] = useState("");
  const [corteSaving, setCorteSaving] = useState(false);
  const [loadingSaldoPulmao, setLoadingSaldoPulmao] = useState(false);
  const [abastItemLoading, setAbastItemLoading] = useState<string | null>(null);

  // Limpar placeholders
  const [limparSepDialog, setLimparSepDialog] = useState<string | null>(null);
  const [limparConfDialog, setLimparConfDialog] = useState<string | null>(null);
  const [limparSepItemDialog, setLimparSepItemDialog] = useState<{ movId: string; produtoId: string } | null>(null);
  const [limparSepItemLoading, setLimparSepItemLoading] = useState(false);
  const [limparConfItemDialog, setLimparConfItemDialog] = useState<{ movId: string; produtoId: string } | null>(null);
  const [limparConfItemLoading, setLimparConfItemLoading] = useState(false);

  // Reatribuir tarefas
  const [reatribuirMov, setReatribuirMov] = useState<{ id: string; numero: number } | null>(null);

  const fetchMovimentos = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = (supabase as any)
        .from("vw_movimento_saida_lista")
        .select("id, numero_onda, status, data_emissao, destino_carga, motorista, total_pedidos, peso_total, m3, prioridade, total_volume, observacao, box_id, rota_id, veiculo_id, empresa_id, box_nome, parceiro_nome", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .order("numero_onda", { ascending: false })
        .range(from, to);

      if (filterStatus) query = query.eq("status", filterStatus);
      if (filterOnda) query = query.eq("numero_onda", Number(filterOnda));
      if (filterDateFrom) query = query.gte("data_emissao", filterDateFrom);
      if (filterDateTo) query = query.lte("data_emissao", filterDateTo + "T23:59:59");

      const { data, error, count } = await query;
      if (error) throw error;

      setMovimentos((data || []).map((mov: any) => ({
        ...mov,
        box_nome: mov.box_nome || "—",
        parceiro_nome: mov.parceiro_nome || "—",
        operadores_atribuidos: [],
      })));
      setTotal(count || 0);

      // Enriquece com operadores atribuídos (1 query agregada)
      const movIds = (data || []).map((m: any) => m.id);
      if (movIds.length > 0) {
        try {
          const opsMap = await fetchOperadoresAtribuidos(tenantId, movIds, "MOVIMENTO_SAIDA_ITEM");
          setMovimentos((prev) =>
            prev.map((m) => ({ ...m, operadores_atribuidos: opsMap.get(m.id) || [] })),
          );
        } catch (err) {
          console.error("Erro ao buscar operadores:", err);
        }
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId, page, filterStatus, filterOnda, filterDateFrom, filterDateTo]);

  useEffect(() => { fetchMovimentos(); }, [fetchMovimentos]);

  const loadTabData = useCallback(async (movId: string) => {
    setTabLoading(true);
    try {
      const [itensRes, sepRes, confRes, docsRes] = await Promise.all([
        (supabase as any).from("vw_movimento_saida_resumo").select("*").eq("movimento_id", movId),
        (supabase as any).from("vw_movimento_saida_separacao_detalhe").select("*").eq("movimento_id", movId),
        (supabase as any).from("vw_movimento_saida_conferencia_detalhe").select("*").eq("movimento_saida_id", movId),
        (supabase as any).from("vw_movimento_saida_docs_vinculados").select("*").eq("movimento_saida_id", movId).order("ordem"),
      ]);
      setTabItens(itensRes.data || []);
      setTabSeparacao(sepRes.data || []);
      setTabConferencia(confRes.data || []);
      setTabDocs((docsRes.data || []).map((d: any) => ({
        ...d,
        parceiro: d.parceiro || "—",
      })));
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
        setLiberarResult(result);
        setLiberarMovId(movId);
        setLiberarDialogOpen(true);

        if (isSaldoInsuficientePicking(result.tipo_ocorrencia) && result.itens?.length) {
          fetchSaldoPulmao(result.itens, "itens");
        }

        if (result.ocorrencias?.length) {
          const pickingOcs = result.ocorrencias.filter((oc) => isSaldoInsuficientePicking(oc.tipo) && oc.produto_id);
          if (pickingOcs.length > 0) {
            fetchSaldoPulmao(pickingOcs, "ocorrencias");
          }
        }
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

  const [cancelarResult, setCancelarResult] = useState<any>(null);

  const handleCancelarOnda = async () => {
    if (!deleteConfirmId || !tenantId) return;
    setDeleting(true);
    setCancelarResult(null);
    try {
      const { data, error } = await supabase.rpc("fn_cancelar_onda_carregamento" as any, {
        p_movimento_saida_id: deleteConfirmId,
        p_tenant_id: tenantId,
      });
      if (error) throw error;

      setCancelarResult(data);
      const result = typeof data === "string" ? JSON.parse(data) : data;
      if (result?.sucesso) {
        toast.success(result.mensagem || "Onda cancelada com sucesso!");
        if (selectedId === deleteConfirmId) {
          setSelectedId(null);
          setSelectedMov(null);
        }
        fetchMovimentos();
      } else {
        toast.error(result?.mensagem || "Erro ao cancelar onda.");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
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

  const fetchSaldoPulmao = async (itens: OcorrenciaItem[], target: "itens" | "ocorrencias" = "itens") => {
    setLoadingSaldoPulmao(true);
    try {
      const produtoIds = itens.map(i => i.produto_id).filter(Boolean) as string[];
      if (produtoIds.length === 0) return;

      const { data: endPulmao } = await (supabase as any)
        .from("endereco")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("tipo_endereco", "PULMAO");

      const pulmaoIds = (endPulmao || []).map((e: any) => e.id);

      if (pulmaoIds.length === 0) {
        setLiberarResult(prev => {
          if (!prev) return prev;
          const update = (arr?: OcorrenciaItem[]) => arr?.map(i => ({ ...i, saldo_pulmao: 0 }));
          return { ...prev, [target]: update(prev[target] as OcorrenciaItem[]) };
        });
        return;
      }

      const { data: estoques } = await (supabase as any)
        .from("estoque_geral")
        .select("produto_id, quantidade_disponivel")
        .eq("tenant_id", tenantId)
        .in("produto_id", produtoIds)
        .in("endereco_id", pulmaoIds)
        .gt("quantidade_disponivel", 0);

      const saldoMap: Record<string, number> = {};
      (estoques || []).forEach((e: any) => {
        saldoMap[e.produto_id] = (saldoMap[e.produto_id] || 0) + Number(e.quantidade_disponivel);
      });

      setLiberarResult(prev => {
        if (!prev) return prev;
        const update = (arr?: OcorrenciaItem[]) => arr?.map(i => ({
          ...i,
          saldo_pulmao: i.produto_id ? (saldoMap[i.produto_id] || 0) : 0,
        }));
        return { ...prev, [target]: update(prev[target] as OcorrenciaItem[]) };
      });
    } catch (err: any) {
      console.error("Erro ao buscar saldo pulmão:", err);
    } finally {
      setLoadingSaldoPulmao(false);
    }
  };

  const handleAbastecimentoItem = async (item: OcorrenciaItem) => {
    if (!liberarMovId || !tenantId || !item.produto_id) return;
    setAbastItemLoading(item.produto_id);
    try {
      const armazemId = localStorage.getItem("core_armazem_id") || "";
      const { data, error } = await supabase.rpc("fn_gerar_abastecimento" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_armazem_id: armazemId,
        p_tipo: "PREVENTIVO",
        p_usuario_id: usuarioId,
        p_simular: false,
        p_itens: [{ produto_id: item.produto_id, endereco_picking: item.endereco_picking }],
      });
      if (error) throw error;
      toast.success("Abastecimento gerado para o item!");
      // Refresh saldo
      if (liberarResult?.itens) fetchSaldoPulmao(liberarResult.itens, "itens");
      if (liberarResult?.ocorrencias) {
        const pickingOcs = liberarResult.ocorrencias.filter((oc) => isSaldoInsuficientePicking(oc.tipo) && oc.produto_id);
        if (pickingOcs.length > 0) fetchSaldoPulmao(pickingOcs, "ocorrencias");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAbastItemLoading(null);
    }
  };

  const handleOpenCorte = async (item: OcorrenciaItem) => {
    setCorteItem(item);
    setCorteMotivoId("");
    // Load motivos
    const { data } = await (supabase as any)
      .from("motivo_ocorrencia")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .eq("etapa_ocorrencia", "SEPARACAO")
      .order("descricao");
    setCorteMotivos(data || []);
  };

  const handleConfirmarCorte = async () => {
    if (!corteItem || !corteMotivoId || !liberarMovId || !usuarioId) return;
    if (!corteItem.produto_id) {
      toast.error("Produto do item não identificado para realizar o corte.");
      return;
    }

    setCorteSaving(true);
    try {
      const { data: itensMovimento, error: itensError } = await (supabase as any)
        .from("movimento_saida_item")
        .select("id, qtd_esperada")
        .eq("movimento_saida_id", liberarMovId)
        .eq("produto_id", corteItem.produto_id);

      if (itensError) throw itensError;
      if (!itensMovimento?.length) {
        throw new Error("Item da onda não encontrado para realizar o corte.");
      }

      const autorizadoEm = new Date().toISOString();
      const updateResults = await Promise.all(
        itensMovimento.map((item: any) =>
          (supabase as any)
            .from("movimento_saida_item")
            .update({
              qtde_cortada: Number(item.qtd_esperada ?? 0),
              motivo_ocorrencia: corteMotivoId,
              usuario_autorizou: usuarioId,
              autorizado_em: autorizadoEm,
            })
            .eq("id", item.id)
        )
      );

      const updateError = updateResults.find((result: any) => result.error)?.error;
      if (updateError) throw updateError;

      toast.success("Item cortado com sucesso!");
      setCorteItem(null);
      // Remove item from list
      setLiberarResult(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          itens: prev.itens?.filter(i => i.produto_id !== corteItem.produto_id),
          ocorrencias: prev.ocorrencias?.filter(i => i.produto_id !== corteItem.produto_id),
        };
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCorteSaving(false);
    }
  };

  const handleSavePrioridade = async () => {
    if (!prioridadeDialogId || !prioridadeValue) return;
    setSavingPrioridade(true);
    try {
      const { error } = await (supabase as any)
        .from("movimento_saida")
        .update({ prioridade: prioridadeValue })
        .eq("id", prioridadeDialogId);
      if (error) throw error;
      toast.success("Prioridade atualizada!");
      setPrioridadeDialogId(null);
      fetchMovimentos();
      if (selectedId === prioridadeDialogId) {
        setSelectedMov((prev) => prev ? { ...prev, prioridade: prioridadeValue } : null);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSavingPrioridade(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchMovimentos();
  };

  const totalPages = Math.ceil(total / pageSize);
  const inputClass = "h-8 px-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
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

      <div className="flex gap-3 flex-1 min-h-0">
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
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                <Unlock size={13} /> Liberar para separação
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRetirar(mov.id); }}
                                disabled={mov.status !== "LIBERADO" && mov.status !== "EM_PICKING"}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                <Lock size={13} /> Retirar da separação
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuId(null);
                                  setDeleteConfirmId(mov.id);
                                }}
                                className="w-full text-left px-3 py-2 text-xs text-destructive hover:bg-destructive/10 flex items-center gap-2"
                              >
                                <Ban size={13} /> Cancelar onda
                              </button>
                              <div className="border-t border-border" />
                              <button
                                onClick={(e) => { e.stopPropagation(); setActionMenuId(null); setLimparSepDialog(mov.id); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2"
                              >
                                <Eraser size={13} /> Limpar Separação Total
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setActionMenuId(null); setLimparConfDialog(mov.id); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2"
                              >
                                <Eraser size={13} /> Limpar Conferência Total
                              </button>
                              <div className="border-t border-border" />
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuId(null);
                                  setPrioridadeValue(mov.prioridade || "NORMAL");
                                  setPrioridadeDialogId(mov.id);
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary flex items-center gap-2"
                              >
                                <Star size={13} /> Prioridade
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuId(null);
                                  setReatribuirMov({ id: mov.id, numero: mov.numero_onda });
                                }}
                                disabled={(mov.operadores_atribuidos?.length || 0) === 0}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                              >
                                <UserCog size={13} /> Reatribuir tarefas
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{mov.parceiro_nome}</p>
                    <OperadoresAtribuidos operadores={mov.operadores_atribuidos || []} />
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
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Cortada</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase w-10">Opções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabItens.map((item: any, i: number) => (
                      <tr key={item.movimento_item_id || i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{item.sku}</td>
                        <td className="px-3 py-2 text-xs text-foreground">{item.descricao}</td>
                        <td className="px-3 py-2 text-right text-foreground">{Number(item.qtd_esperada)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{Number(item.qtd_separada || 0)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{Number(item.qtd_conferida || 0)}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{Number(item.qtd_cortada || 0)}</td>
                        <td className="px-3 py-2 text-xs">
                          {item.status ? (
                            <span className={cn("text-[10px] px-2 py-0.5 rounded-full border",
                              item.status === "PENDENTE" ? "bg-red-500/15 text-red-400 border-red-500/30" :
                              item.status === "EM_SEPARACAO" ? "bg-orange-500/15 text-orange-400 border-orange-500/30" :
                              item.status === "EM_CONFERENCIA" ? "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" :
                              item.status === "CONCLUIDA" || item.status === "FINALIZADA" ? "bg-blue-500/15 text-blue-400 border-blue-500/30" :
                              item.status === "CANCELADA" ? "bg-gray-500/15 text-gray-400 border-gray-500/30" :
                              "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                            )}>{item.status}</span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center relative">
                          <button
                            onClick={() => setItemActionMenuId(itemActionMenuId === (item.movimento_item_id || i) ? null : (item.movimento_item_id || i))}
                            className="p-1 rounded hover:bg-secondary"
                          >
                            <MoreVertical size={14} className="text-muted-foreground" />
                          </button>
                          {itemActionMenuId === (item.movimento_item_id || i) && (
                            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-card shadow-elevated z-50 overflow-hidden animate-fade-in">
                              <button
                                onClick={() => { setItemActionMenuId(null); setLimparSepItemDialog({ movId: selectedId!, produtoId: item.produto_id }); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary"
                              >
                                Limpar Separação Item
                              </button>
                              <button
                                onClick={() => { setItemActionMenuId(null); setLimparConfItemDialog({ movId: selectedId!, produtoId: item.produto_id }); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-secondary"
                              >
                                Limpar Conferência Item
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {tabItens.length === 0 && (
                      <tr><td colSpan={8} className="text-center py-8 text-xs text-muted-foreground">Sem itens</td></tr>
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
                        <td className="px-3 py-2 text-xs text-muted-foreground">{formatBrasiliaDateTime(item.concluido_em)}</td>
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
                        <td className="px-3 py-2 text-xs text-muted-foreground">{formatBrasiliaDateTime(item.concluido_em)}</td>
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
      <Dialog open={!!deleteConfirmId} onOpenChange={(v) => { if (!v) { setDeleteConfirmId(null); setCancelarResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                <Ban size={20} className="text-destructive" />
              </div>
              <div>
                <DialogTitle>Cancelar Onda</DialogTitle>
                <DialogDescription className="mt-1">
                  Tem certeza que deseja cancelar esta onda de carregamento?
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          {cancelarResult && (
            <div className="mt-2 p-3 rounded-lg bg-muted text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto">
              {JSON.stringify(cancelarResult, null, 2)}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setDeleteConfirmId(null); setCancelarResult(null); }} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Fechar
            </button>
            {!cancelarResult && (
              <button onClick={handleCancelarOnda} disabled={deleting} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors">
                {deleting && <Loader2 size={14} className="animate-spin" />}
                {deleting ? "Cancelando..." : "Cancelar Onda"}
              </button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Liberar result dialog */}
      <Dialog open={liberarDialogOpen} onOpenChange={setLiberarDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
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
          {liberarResult?.ocorrencias && liberarResult.ocorrencias.length > 0 && (() => {
            const hasPicking = liberarResult.ocorrencias.some((oc) => isSaldoInsuficientePicking(oc.tipo));
            return (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase mb-2">Ocorrências ({liberarResult.ocorrencias.length})</p>
              <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Tipo</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                      {hasPicking && (
                        <>
                          <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Saldo Pulmão</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Ação</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {liberarResult.ocorrencias.map((oc, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{oc.sku || "—"}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className="px-2 py-0.5 rounded bg-destructive/15 text-destructive text-[11px] font-medium uppercase">
                            {oc.tipo?.replace(/_/g, " ") || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-foreground">{oc.descricao || "—"}</td>
                        {hasPicking && (
                          <>
                            <td className="px-3 py-2 text-right font-mono">
                              {isSaldoInsuficientePicking(oc.tipo) ? (
                                loadingSaldoPulmao ? (
                                  <Loader2 size={12} className="animate-spin text-muted-foreground inline" />
                                ) : (
                                  <span className={oc.saldo_pulmao && oc.saldo_pulmao > 0 ? "text-green-400 font-semibold" : "text-destructive"}>
                                    {oc.saldo_pulmao ?? "—"}
                                  </span>
                                )
                              ) : "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {isSaldoInsuficientePicking(oc.tipo) && !loadingSaldoPulmao && oc.saldo_pulmao !== undefined && (
                                oc.saldo_pulmao > 0 ? (
                                  <button
                                    onClick={() => handleAbastecimentoItem(oc)}
                                    disabled={abastItemLoading === oc.produto_id}
                                    className="px-2 py-1 rounded text-[11px] font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors disabled:opacity-50"
                                  >
                                    {abastItemLoading === oc.produto_id ? <Loader2 size={12} className="animate-spin inline" /> : "Abastecer"}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleOpenCorte(oc)}
                                    className="px-2 py-1 rounded text-[11px] font-medium bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition-colors"
                                  >
                                    Cortar
                                  </button>
                                )
                              )}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            );
          })()}

          {/* Legacy itens format fallback */}
          {(!liberarResult?.ocorrencias || liberarResult.ocorrencias.length === 0) && liberarResult?.itens && liberarResult.itens.length > 0 && (
            <div className="mt-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                    {isSaldoInsuficientePicking(liberarResult.tipo_ocorrencia) && (
                      <>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Esperada</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Saldo Picking</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Endereço</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Saldo Pulmão</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Ação</th>
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
                      {isSaldoInsuficientePicking(liberarResult.tipo_ocorrencia) && (
                        <>
                          <td className="px-3 py-2 text-right text-foreground">{item.qtd_esperada ?? "—"}</td>
                          <td className="px-3 py-2 text-right text-destructive font-semibold">{item.saldo_picking ?? 0}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{item.endereco_picking || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {loadingSaldoPulmao ? (
                              <Loader2 size={12} className="animate-spin text-muted-foreground inline" />
                            ) : (
                              <span className={item.saldo_pulmao && item.saldo_pulmao > 0 ? "text-green-400 font-semibold" : "text-destructive"}>
                                {item.saldo_pulmao ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {!loadingSaldoPulmao && item.saldo_pulmao !== undefined && (
                              item.saldo_pulmao > 0 ? (
                                <button
                                  onClick={() => handleAbastecimentoItem(item)}
                                  disabled={abastItemLoading === item.produto_id}
                                  className="px-2 py-1 rounded text-[11px] font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors disabled:opacity-50"
                                >
                                  {abastItemLoading === item.produto_id ? <Loader2 size={12} className="animate-spin inline" /> : "Abastecer"}
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleOpenCorte(item)}
                                  className="px-2 py-1 rounded text-[11px] font-medium bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25 transition-colors"
                                >
                                  Cortar
                                </button>
                              )
                            )}
                          </td>
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

              {isSaldoInsuficientePicking(liberarResult.tipo_ocorrencia) && (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={handleGerarAbastecimentoPreventivo}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
                  >
                    Gerar Abastecimento Preventivo (Todos)
                  </button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Corte Dialog */}
      <Dialog open={!!corteItem} onOpenChange={(v) => !v && setCorteItem(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cortar Item</DialogTitle>
            <DialogDescription>
              Confirme o corte do item <span className="font-mono font-semibold">{corteItem?.sku}</span> — Qtd: {corteItem?.qtd_esperada}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Motivo de Ocorrência *</label>
            <select
              value={corteMotivoId}
              onChange={(e) => setCorteMotivoId(e.target.value)}
              className="w-full h-9 px-3 rounded-md border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
            >
              <option value="">Selecione...</option>
              {corteMotivos.map((m) => (
                <option key={m.id} value={m.id}>{m.descricao}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setCorteItem(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button
              onClick={handleConfirmarCorte}
              disabled={corteSaving || !corteMotivoId}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {corteSaving && <Loader2 size={14} className="animate-spin" />}
              Confirmar Corte
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prioridade Dialog */}
      <Dialog open={!!prioridadeDialogId} onOpenChange={(v) => !v && setPrioridadeDialogId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar Prioridade</DialogTitle>
            <DialogDescription>Selecione a nova prioridade para esta onda.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2">
            {PRIORIDADE_OPTIONS.map((p) => (
              <button
                key={p}
                onClick={() => setPrioridadeValue(p)}
                className={cn(
                  "px-4 py-3 rounded-lg border text-sm font-medium text-left transition-colors",
                  prioridadeValue === p
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-foreground hover:bg-secondary"
                )}
              >
                {p}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setPrioridadeDialogId(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button onClick={handleSavePrioridade} disabled={savingPrioridade} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {savingPrioridade && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Limpar Separação Total (UI only) */}
      <Dialog open={!!limparSepDialog} onOpenChange={(v) => !v && setLimparSepDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar Separação Total</DialogTitle>
            <DialogDescription>Esta ação irá limpar toda a separação desta onda. Funcionalidade em desenvolvimento.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setLimparSepDialog(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Fechar</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Limpar Conferência Total (UI only) */}
      <Dialog open={!!limparConfDialog} onOpenChange={(v) => !v && setLimparConfDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar Conferência Total</DialogTitle>
            <DialogDescription>Esta ação irá limpar toda a conferência desta onda. Funcionalidade em desenvolvimento.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setLimparConfDialog(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Fechar</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Limpar Separação Item */}
      <Dialog open={!!limparSepItemDialog} onOpenChange={(v) => !v && setLimparSepItemDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar Separação do Item</DialogTitle>
            <DialogDescription>Tem certeza que deseja limpar a separação deste item? Esta ação irá estornar o estoque separado.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setLimparSepItemDialog(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button
              disabled={limparSepItemLoading}
              onClick={async () => {
                if (!limparSepItemDialog || !tenantId || !usuarioId) return;
                setLimparSepItemLoading(true);
                try {
                  const { error } = await supabase.rpc("separacao_limpar_item" as any, {
                    p_tenant_id: tenantId,
                    p_movimento_saida_id: limparSepItemDialog.movId,
                    p_produto_id: limparSepItemDialog.produtoId,
                    p_usuario_id: usuarioId,
                  });
                  if (error) throw error;
                  toast.success("Separação do item limpa com sucesso!");
                  setLimparSepItemDialog(null);
                  if (selectedId) loadTabData(selectedId);
                  fetchMovimentos();
                } catch (err: any) {
                  toast.error(err.message || "Erro ao limpar separação do item.");
                } finally {
                  setLimparSepItemLoading(false);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
            >
              {limparSepItemLoading && <Loader2 size={14} className="animate-spin" />}
              Confirmar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Limpar Conferência Item */}
      <Dialog open={!!limparConfItemDialog} onOpenChange={(v) => !v && setLimparConfItemDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar Conferência do Item</DialogTitle>
            <DialogDescription>Tem certeza que deseja limpar a conferência deste item? Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setLimparConfItemDialog(null)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button
              disabled={limparConfItemLoading}
              onClick={async () => {
                if (!limparConfItemDialog || !tenantId || !usuarioId) return;
                setLimparConfItemLoading(true);
                try {
                  const { error } = await supabase.rpc("separacao_conferencia_limpar_item" as any, {
                    p_tenant_id: tenantId,
                    p_movimento_saida_id: limparConfItemDialog.movId,
                    p_produto_id: limparConfItemDialog.produtoId,
                    p_usuario_id: usuarioId,
                  });
                  if (error) throw error;
                  toast.success("Conferência do item limpa com sucesso!");
                  setLimparConfItemDialog(null);
                  if (selectedId) loadTabData(selectedId);
                  fetchMovimentos();
                } catch (err: any) {
                  toast.error(err.message || "Erro ao limpar conferência do item.");
                } finally {
                  setLimparConfItemLoading(false);
                }
              }}
              className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 flex items-center gap-2"
            >
              {limparConfItemLoading && <Loader2 size={14} className="animate-spin" />}
              Confirmar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <ReatribuirTarefasModal
        open={!!reatribuirMov}
        movimentoSaidaId={reatribuirMov?.id || null}
        numeroOnda={reatribuirMov?.numero || null}
        tenantId={tenantId}
        empresaId={empresaId}
        onClose={() => setReatribuirMov(null)}
        onSuccess={() => fetchMovimentos()}
      />
    </div>
  );
}
