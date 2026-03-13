import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, MoreVertical, Search, ChevronLeft, ChevronRight, Package, Filter, X, AlertTriangle, Trash2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  GERADO: { label: "Gerado", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  LIBERADO: { label: "Liberado", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  ERRO_TRANSPORTADOR: { label: "Erro Transporte", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  "EM CONFERENCIA": { label: "Em Conferência", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  EM_CONFERENCIA: { label: "Em Conferência", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  CONFERIDO: { label: "Conferido", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  DIVERGENCIA: { label: "Divergência", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  LIB_ARMAZENAGEM: { label: "Lib. Armazenagem", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  "LIB. ARMAZENAGEM": { label: "Lib. Armazenagem", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  ARMAZENADO: { label: "Armazenado", class: "bg-green-500/15 text-green-400 border-green-500/30" },
};

const STATUS_ITEM_MAP: Record<string, { label: string; class: string }> = {
  PENDENTE: { label: "Pendente", class: "bg-muted text-muted-foreground border-border" },
  EM_ANDAMENTO: { label: "Em Andamento", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  CONFERIDO: { label: "Conferido", class: "bg-green-500/15 text-green-400 border-green-500/30" },
  DIVERGENTE: { label: "Divergente", class: "bg-red-500/15 text-red-400 border-red-500/30" },
};

interface MovEntry {
  id: string;
  numero_movimento: number | null;
  status: string;
  created_at: string;
  placa_veiculo: string | null;
  parceiro_nome?: string;
}

interface ResumoItem {
  movimento_id: string;
  movimento_item_id: string;
  sku: string;
  descricao: string;
  qtd_esperada: number;
  qtd_conferida: number;
  qtd_armazenada: number;
  status_item_movimento: string;
  // Alert flags (populated client-side)
  sem_picking?: boolean;
  sem_ean?: boolean;
  divergente?: boolean;
}

interface ConferenciaItem {
  movimento_id: string;
  sku: string;
  descricao: string;
  operador: string;
  codigo_hu: string;
  validade: string | null;
  fabricacao: string | null;
  serie: string | null;
  quantidade_executada: number;
  iniciado_em: string | null;
  concluido_em: string | null;
  status: string;
  lote: string | null;
}

interface ArmazenagemItem {
  movimento_entrada_id: string;
  sku: string;
  descricao_sku: string;
  login: string;
  codigo_hu: string;
  endereco: string;
  quantidade_executada: number;
  lote: string | null;
  fabricacao: string | null;
  validade: string | null;
  iniciado_em: string | null;
  concluido_em: string | null;
}

interface MovimentoInfo {
  confirma_volume: boolean;
  total_volume: number | null;
  total_volume_conferido: number | null;
  armazem_descricao: string;
  box_descricao: string;
  placa_veiculo: string | null;
  valor_descarga: number | null;
  crossdocking: boolean;
  observacao: string | null;
}

interface DocVinculado {
  numero_nota: string;
  razaosocial: string;
  total_skus: number;
  valor_total_nota: number;
  qtd_volume: number | null;
}

export function MovimentoEntradaPage() {
  const { armazemId, tenantId, empresaId, usuarioId } = useTenant();
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [movements, setMovements] = useState<MovEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMov, setSelectedMov] = useState<string | null>(null);
  const [selectedMovStatus, setSelectedMovStatus] = useState<string | null>(null);
  const [itemTab, setItemTab] = useState("itens");

  // View data
  const [resumoItems, setResumoItems] = useState<ResumoItem[]>([]);
  const [conferenciaItems, setConferenciaItems] = useState<ConferenciaItem[]>([]);
  const [armazenagemItems, setArmazenagemItems] = useState<ArmazenagemItem[]>([]);
  const [movimentoInfo, setMovimentoInfo] = useState<MovimentoInfo | null>(null);
  const [docsVinculados, setDocsVinculados] = useState<DocVinculado[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Liberar erro transporte modal
  const [showErroModal, setShowErroModal] = useState(false);
  const [erroMovId, setErroMovId] = useState<string | null>(null);
  const [motivos, setMotivos] = useState<{ id: string; descricao: string }[]>([]);
  const [selectedMotivo, setSelectedMotivo] = useState("");
  const [erroSubmitting, setErroSubmitting] = useState(false);

  // Liberar armazenagem c/ divergência modal
  const [showDivergenciaModal, setShowDivergenciaModal] = useState(false);
  const [divergenciaMovId, setDivergenciaMovId] = useState<string | null>(null);
  const [divergenciaMotivos, setDivergenciaMotivos] = useState<{ id: string; descricao: string }[]>([]);
  const [selectedDivergenciaMotivo, setSelectedDivergenciaMotivo] = useState("");
  const [divergenciaSubmitting, setDivergenciaSubmitting] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMovId, setDeleteMovId] = useState<string | null>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterNumero, setFilterNumero] = useState("");
  const [filterData, setFilterData] = useState("");
  const [filterParceiro, setFilterParceiro] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;

  const fetchCounts = useCallback(async () => {
    if (!tenantId) return;
    let q = (supabase as any).from("movimento_entrada").select("status").eq("tenant_id", tenantId);
    if (armazemId) q = q.eq("armazem_id", armazemId);
    const { data } = await q;
    const counts: Record<string, number> = {};
    (data || []).forEach((m: any) => { counts[m.status] = (counts[m.status] || 0) + 1; });
    setStatusCounts(counts);
  }, [tenantId, armazemId]);

  const fetchMovements = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = (supabase as any)
        .from("movimento_entrada")
        .select("id, numero_movimento, status, created_at, placa_veiculo", { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (armazemId) query = query.eq("armazem_id", armazemId);
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
  }, [tenantId, armazemId, page, filterStatus, filterNumero, filterData, filterParceiro]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { fetchMovements(); }, [fetchMovements]);

  const loadDetails = async (movId: string, movStatus: string) => {
    setSelectedMov(movId);
    setSelectedMovStatus(movStatus);
    setItemTab("itens");
    setDetailLoading(true);
    try {
      // Fetch resumo + alerts data in parallel
      const [r1, r2, r3] = await Promise.all([
        (supabase as any).from("vw_movimento_entrada_resumo").select("*").eq("movimento_id", movId),
        (supabase as any).from("vw_movimento_entrada_conferencia_detalhe").select("*").eq("movimento_id", movId),
        (supabase as any).from("vw_movimento_entrada_armazenagem_detalhe").select("*").eq("movimento_entrada_id", movId),
      ]);

      // Get produto_ids from movimento_entrada_item for alerts
      const { data: meiData } = await (supabase as any)
        .from("movimento_entrada_item")
        .select("id, produto_id")
        .eq("movimento_entrada_id", movId);

      const produtoIds = (meiData || []).map((m: any) => m.produto_id);
      const meiMap = new Map((meiData || []).map((m: any) => [m.id, m.produto_id]));

      // Fetch picking and embalagem data for alerts
      let pickingSet = new Set<string>();
      let eanSet = new Set<string>();
      if (produtoIds.length > 0) {
        const [pickRes, eanRes] = await Promise.all([
          (supabase as any).from("picking_produto").select("produto_id").in("produto_id", produtoIds).eq("ativo", true),
          (supabase as any).from("produto_embalagem").select("produto_id").in("produto_id", produtoIds).eq("ativo", true),
        ]);
        pickingSet = new Set((pickRes.data || []).map((p: any) => p.produto_id));
        eanSet = new Set((eanRes.data || []).map((p: any) => p.produto_id));
      }

      // Enrich resumo items with alerts
      const enrichedResumo = (r1.data || []).map((item: any) => {
        const prodId = meiMap.get(item.movimento_item_id);
        return {
          ...item,
          sem_picking: prodId ? !pickingSet.has(prodId as string) : false,
          sem_ean: prodId ? !eanSet.has(prodId as string) : false,
        };
      });

      setResumoItems(enrichedResumo);
      setConferenciaItems(r2.data || []);
      setArmazenagemItems(r3.data || []);

      // Load info tab data
      const { data: movData } = await (supabase as any)
        .from("movimento_entrada")
        .select("confirma_volume, total_volume, total_volume_conferido, placa_veiculo, valor_descarga, crossdocking, observacao, box_id, armazem_id")
        .eq("id", movId)
        .single();

      if (movData) {
        const [boxRes, armRes] = await Promise.all([
          (supabase as any).from("box").select("descricao").eq("id", movData.box_id).single(),
          movData.armazem_id ? (supabase as any).from("armazem").select("descricao").eq("id", movData.armazem_id).single() : Promise.resolve({ data: null }),
        ]);
        setMovimentoInfo({
          confirma_volume: movData.confirma_volume,
          total_volume: movData.total_volume,
          total_volume_conferido: movData.total_volume_conferido,
          armazem_descricao: armRes.data?.descricao || "—",
          box_descricao: boxRes.data?.descricao || "—",
          placa_veiculo: movData.placa_veiculo,
          valor_descarga: movData.valor_descarga,
          crossdocking: movData.crossdocking,
          observacao: movData.observacao,
        });
      }

      // Load linked documents
      const { data: links } = await (supabase as any)
        .from("movimento_entrada_documento")
        .select("documento_entrada_id")
        .eq("movimento_entrada_id", movId);

      if (links && links.length > 0) {
        const docIds = links.map((l: any) => l.documento_entrada_id);
        const docsArr: DocVinculado[] = [];
        for (const docId of docIds) {
          const { data: doc } = await (supabase as any)
            .from("documento_entrada")
            .select("numero_nota, parceiro_id, valor_total_nota, qtd_volume")
            .eq("id", docId)
            .single();
          if (doc) {
            const { data: parceiro } = await (supabase as any).from("parceiro").select("razaosocial").eq("id", doc.parceiro_id).single();
            const { count: skuCount } = await (supabase as any).from("documento_entrada_item").select("id", { count: "exact" }).eq("documento_entrada_id", docId);
            docsArr.push({
              numero_nota: doc.numero_nota,
              razaosocial: parceiro?.razaosocial || "—",
              total_skus: skuCount || 0,
              valor_total_nota: doc.valor_total_nota,
              qtd_volume: doc.qtd_volume,
            });
          }
        }
        setDocsVinculados(docsArr);
      } else {
        setDocsVinculados([]);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleLiberarConferencia = async (movId: string, status: string) => {
    if (status !== "GERADO") {
      toast.warning("Apenas movimentos com status 'Gerado' podem ser liberados para conferência.");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("gerar_tarefas_conferencia_entrada" as any, {
        p_movimento_entrada_id: movId,
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      const msg = String(data || "");
      if (msg.startsWith("Erro")) {
        toast.error(msg);
      } else {
        toast.success(msg || "Movimento liberado para conferência.");
        fetchMovements();
        fetchCounts();
        if (selectedMov === movId) loadDetails(movId, "LIBERADO");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRetirarConferencia = async (movId: string, status: string) => {
    if (status !== "LIBERADO" && status !== "EM_CONFERENCIA" && status !== "EM CONFERENCIA") {
      toast.warning("Apenas movimentos com status 'Liberado' ou 'Em Conferência' podem ser retirados da conferência.");
      return;
    }
    try {
      const { error } = await (supabase as any)
        .from("movimento_entrada")
        .update({ status: "GERADO" })
        .eq("id", movId);
      if (error) throw error;
      toast.success("Movimento retirado da conferência com sucesso.");
      fetchMovements();
      fetchCounts();
      if (selectedMov === movId) loadDetails(movId, "GERADO");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLiberarArmazenagem = async (movId: string, status: string) => {
    if (status !== "CONFERIDO" && status !== "DIVERGENCIA") {
      toast.warning("Apenas movimentos conferidos podem ser liberados para armazenagem.");
      return;
    }
    try {
      const { data, error } = await supabase.rpc("gerar_tarefas_armazenagem_s_divergencia" as any, {
        p_movimento_entrada_id: movId,
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      const msg = String(data || "");
      if (msg.toLowerCase().includes("erro")) {
        toast.error(msg);
      } else {
        toast.success(msg || "Armazenagem liberada com sucesso.");
        fetchMovements();
        fetchCounts();
        if (selectedMov === movId) loadDetails(movId, "LIB_ARMAZENAGEM");
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openErroTransporteModal = async (movId: string) => {
    // Check if total_volume differs from total_volume_conferido
    const { data: movCheck } = await (supabase as any)
      .from("movimento_entrada")
      .select("total_volume, total_volume_conferido")
      .eq("id", movId)
      .single();

    if (movCheck) {
      const tv = Number(movCheck.total_volume) || 0;
      const tvc = Number(movCheck.total_volume_conferido) || 0;
      if (tv === tvc) {
        toast.info("A conferência dos volumes está correta. Não é necessário liberar com erro no transporte.");
        return;
      }
    }

    setErroMovId(movId);
    setSelectedMotivo("");
    const { data } = await (supabase as any)
      .from("motivo_ocorrencia")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("descricao");
    setMotivos(data || []);
    setShowErroModal(true);
  };

  const handleConfirmarErroTransporte = async () => {
    if (!selectedMotivo || !erroMovId) {
      toast.error("Selecione um motivo de ocorrência.");
      return;
    }
    setErroSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("movimento_entrada")
        .update({
          usuario_autorizou: usuarioId,
          motivo_ocorrencia: selectedMotivo,
          autorizado_em: new Date().toISOString().split("T")[0],
          status: "LIBERADO",
        })
        .eq("id", erroMovId);
      if (error) throw error;
      toast.success("Recebimento liberado com erro no transporte.");
      setShowErroModal(false);
      fetchMovements();
      fetchCounts();
      if (selectedMov === erroMovId) loadDetails(erroMovId, "LIBERADO");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setErroSubmitting(false);
    }
  };

  const openDivergenciaModal = async (movId: string, status: string) => {
    if (status !== "CONFERIDO" && status !== "DIVERGENCIA") {
      toast.warning("Apenas movimentos conferidos ou com divergência podem ser liberados para armazenagem c/ divergência.");
      return;
    }
    setDivergenciaMovId(movId);
    setSelectedDivergenciaMotivo("");
    const { data } = await (supabase as any)
      .from("motivo_ocorrencia")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .eq("etapa_ocorrencia", "RECEBIMENTO")
      .order("descricao");
    setDivergenciaMotivos(data || []);
    setShowDivergenciaModal(true);
  };

  const handleConfirmarDivergencia = async () => {
    if (!selectedDivergenciaMotivo || !divergenciaMovId) {
      toast.error("Selecione um motivo de ocorrência.");
      return;
    }
    setDivergenciaSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("gerar_tarefas_armazenagem_c_divergencia" as any, {
        p_movimento_entrada_id: divergenciaMovId,
        p_tenant_id: tenantId,
        p_motivo_ocorrencia: selectedDivergenciaMotivo,
        p_usuario: usuarioId,
      });
      if (error) throw error;
      const msg = String(data || "");
      if (msg.toLowerCase().includes("erro")) {
        toast.error(msg);
      } else {
        toast.success(msg || "Armazenagem liberada com divergência.");
        setShowDivergenciaModal(false);
        fetchMovements();
        fetchCounts();
        if (selectedMov === divergenciaMovId) loadDetails(divergenciaMovId, "LIB_ARMAZENAGEM");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setDivergenciaSubmitting(false);
    }
  };

  const handleMenuAction = (action: string, movId: string, status: string) => {
    if (action === "liberar_conferencia") {
      handleLiberarConferencia(movId, status);
      return;
    }
    if (action === "retirar_conferencia") {
      handleRetirarConferencia(movId, status);
      return;
    }
    if (action === "liberar_armazenagem") {
      handleLiberarArmazenagem(movId, status);
      return;
    }
    if (action === "liberar_armazenagem_divergencia") {
      openDivergenciaModal(movId, status);
      return;
    }
    if (action === "liberar_erro_transporte") {
      openErroTransporteModal(movId);
      return;
    }
    if (action === "excluir_movimento") {
      handleExcluirMovimento(movId, status);
      return;
    }
    if (action === "atualizar_erp") {
      toast.info("Funcionalidade de atualização ERP será implementada em breve.");
      return;
    }
  };

  const handleExcluirMovimento = async (movId: string, status: string) => {
    if (status !== "GERADO" && status !== "LIBERADO") {
      toast.warning("Apenas movimentos com status 'Gerado' ou 'Liberado' podem ser excluídos.");
      return;
    }
    // Check qtd_conferida and qtd_armazenada
    const { data: items } = await (supabase as any)
      .from("movimento_entrada_item")
      .select("qtd_conferida, qtd_armazenada")
      .eq("movimento_entrada_id", movId);

    const hasActivity = (items || []).some((i: any) =>
      (Number(i.qtd_conferida) || 0) > 0 || (Number(i.qtd_armazenada) || 0) > 0
    );
    if (hasActivity) {
      toast.error("Não é possível excluir: existem itens com conferência ou armazenagem registrada.");
      return;
    }

    setDeleteMovId(movId);
    setShowDeleteModal(true);
  };

  const confirmDeleteMovimento = async (): Promise<boolean> => {
    if (!deleteMovId) return false;
    try {
      // 1. Get linked document IDs
      const { data: links } = await (supabase as any)
        .from("movimento_entrada_documento")
        .select("documento_entrada_id")
        .eq("movimento_entrada_id", deleteMovId);
      const docIds = (links || []).map((l: any) => l.documento_entrada_id);

      // 2. Delete items
      await (supabase as any).from("movimento_entrada_item").delete().eq("movimento_entrada_id", deleteMovId);
      // 3. Delete document links
      await (supabase as any).from("movimento_entrada_documento").delete().eq("movimento_entrada_id", deleteMovId);
      // 4. Delete movement
      await (supabase as any).from("movimento_entrada").delete().eq("id", deleteMovId);
      // 5. Reset document status
      if (docIds.length > 0) {
        await (supabase as any).from("documento_entrada").update({ status: 0 }).in("id", docIds);
      }

      toast.success("Movimento de entrada excluído com sucesso.");
      if (selectedMov === deleteMovId) {
        setSelectedMov(null);
        setSelectedMovStatus(null);
      }
      fetchMovements();
      fetchCounts();
      return true;
    } catch (err: any) {
      toast.error(`Erro ao excluir: ${err.message}`);
      return false;
    }
  };

  const clearFilters = () => {
    setFilterStatus(""); setFilterNumero(""); setFilterData(""); setFilterParceiro("");
    setPage(1);
  };

  const hasFilters = filterStatus || filterNumero || filterData || filterParceiro;
  const totalPages = Math.ceil(total / pageSize);
  const statusCards = ["GERADO", "EM CONFERENCIA", "ARMAZENADO", "DIVERGENCIA"];
  const inputClass = "w-full h-8 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("pt-BR") : "—";
  const fmtDateTime = (d: string | null) => d ? new Date(d).toLocaleString("pt-BR") : "—";

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    <button onClick={() => loadDetails(mov.id, mov.status)} className="flex-1 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-foreground">
                          MOV-{mov.numero_movimento ?? "—"}
                        </span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full border", info.class)}>{info.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{mov.parceiro_nome}</p>
                      <p className="text-xs text-muted-foreground">{fmtDate(mov.created_at)}</p>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-secondary text-muted-foreground mt-0.5"><MoreVertical size={14} /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_conferencia", mov.id, mov.status)}>Liberar para conferência</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("retirar_conferencia", mov.id, mov.status)}>Retirar de conferência</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_armazenagem", mov.id, mov.status)}>Liberar armazenagem</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_armazenagem_divergencia", mov.id, mov.status)}>Liberar armazenagem c/ divergência</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_erro_transporte", mov.id, mov.status)}>Liberar recebimento com erro no transporte</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("atualizar_erp", mov.id, mov.status)}>Atualizar ERP</DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={() => handleMenuAction("excluir_movimento", mov.id, mov.status)} className="text-destructive focus:text-destructive">
                          <Trash2 size={14} className="mr-2" /> Excluir movimento
                        </DropdownMenuItem>
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
                <TabsTrigger value="conferencia" className="flex-1">Conferência</TabsTrigger>
                <TabsTrigger value="armazenagem" className="flex-1">Armazenagem</TabsTrigger>
                <TabsTrigger value="informacoes" className="flex-1">Informações</TabsTrigger>
              </TabsList>

              {/* Aba Itens */}
              <TabsContent value="itens" className="flex-1 overflow-auto m-0">
                {detailLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  <TooltipProvider>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 sticky top-0">
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase w-8"></th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Esperada</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Conferida</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Armazenada</th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoItems.map((item) => {
                        const alerts: string[] = [];
                        if (item.sem_picking) alerts.push("Sem endereço de picking cadastrado");
                        if (item.sem_ean) alerts.push("Sem código de barras cadastrado");
                        
                        const statusInfo = STATUS_ITEM_MAP[item.status_item_movimento] || { label: item.status_item_movimento || "—", class: "" };
                        return (
                          <tr key={item.movimento_item_id} className={cn("border-b border-border/50 hover:bg-secondary/30", alerts.length > 0 && "bg-orange-500/5")}>
                            <td className="px-3 py-2.5 text-center">
                              {alerts.length > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle size={14} className="text-orange-400 inline-block" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="max-w-xs">
                                    <ul className="text-xs space-y-0.5">
                                      {alerts.map((a, i) => <li key={i}>⚠ {a}</li>)}
                                    </ul>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </td>
                            <td className="px-3 py-2.5 font-mono text-xs text-foreground">{item.sku}</td>
                            <td className="px-3 py-2.5 text-xs text-foreground truncate max-w-[200px]">{item.descricao}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">{item.qtd_esperada}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">{item.qtd_conferida}</td>
                            <td className="px-3 py-2.5 text-right text-foreground">{item.qtd_armazenada ?? "—"}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={cn("text-xs px-2 py-0.5 rounded-full border", statusInfo.class)}>{statusInfo.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                      {resumoItems.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">Nenhum item encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                  </TooltipProvider>
                )}
              </TabsContent>

              {/* Aba Conferência */}
              <TabsContent value="conferencia" className="flex-1 overflow-auto m-0">
                {detailLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 sticky top-0">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Operador</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Qtd</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">HU</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Lote</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Fabricação</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Validade</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Série</th>
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Status</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Início</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Término</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conferenciaItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground">{item.sku}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground truncate max-w-[150px]">{item.descricao}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.operador || "—"}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{item.quantidade_executada ?? "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.codigo_hu || "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.lote || "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{fmtDate(item.fabricacao)}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{fmtDate(item.validade)}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.serie || "—"}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="text-xs px-2 py-0.5 rounded-full border border-border bg-secondary/50 text-foreground">{item.status || "—"}</span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{fmtDateTime(item.iniciado_em)}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{fmtDateTime(item.concluido_em)}</td>
                        </tr>
                      ))}
                      {conferenciaItems.length === 0 && (
                        <tr><td colSpan={12} className="text-center py-8 text-xs text-muted-foreground">Nenhum registro de conferência encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </TabsContent>

              {/* Aba Armazenagem */}
              <TabsContent value="armazenagem" className="flex-1 overflow-auto m-0">
                {detailLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                     <tr className="border-b border-border bg-secondary/30 sticky top-0">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">SKU</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Descrição</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">HU</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Endereço Destino</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Quantidade</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Operador</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Data Execução</th>
                      </tr>
                    </thead>
                    <tbody>
                      {armazenagemItems.map((item, idx) => (
                        <tr key={idx} className="border-b border-border/50 hover:bg-secondary/30">
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground">{item.sku}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground truncate max-w-[150px]">{item.descricao_sku}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.codigo_hu || "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.endereco || "—"}</td>
                          <td className="px-3 py-2.5 text-right text-foreground">{item.quantidade_executada ?? "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{item.login || "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground">{fmtDateTime(item.concluido_em)}</td>
                        </tr>
                      ))}
                      {armazenagemItems.length === 0 && (
                        <tr><td colSpan={7} className="text-center py-8 text-xs text-muted-foreground">Nenhum registro de armazenagem encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                )}
              </TabsContent>

              {/* Aba Informações */}
              <TabsContent value="informacoes" className="flex-1 overflow-auto m-0 p-4">
                {detailLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : movimentoInfo ? (
                  <div className="space-y-6">
                    {/* Volumes */}
                    <div className="rounded-lg border border-border p-4 bg-secondary/20">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3">Volumes</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Confirma Volume</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.confirma_volume ? "Sim" : "Não"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Volumes Recebidos</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.total_volume ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Volumes Confirmados</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.total_volume_conferido ?? "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Dados do movimento */}
                    <div className="rounded-lg border border-border p-4 bg-secondary/20">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3">Dados do Movimento</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Armazém</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.armazem_descricao}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Box</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.box_descricao}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Placa do Veículo</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.placa_veiculo || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Valor Descarga</p>
                          <p className="text-sm font-medium text-foreground">
                            {movimentoInfo.valor_descarga != null
                              ? Number(movimentoInfo.valor_descarga).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                              : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Crossdocking</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.crossdocking ? "Sim" : "Não"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Observação</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.observacao || "—"}</p>
                        </div>
                      </div>
                    </div>

                    {/* Documentos vinculados */}
                    <div className="rounded-lg border border-border p-4 bg-secondary/20">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3">Documentos Vinculados</h3>
                      {docsVinculados.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nenhum documento vinculado.</p>
                      ) : (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nº NF</th>
                              <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Parceiro</th>
                              <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground uppercase">SKUs</th>
                              <th className="px-2 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Volumes</th>
                              <th className="px-2 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Valor</th>
                            </tr>
                          </thead>
                          <tbody>
                            {docsVinculados.map((doc, idx) => (
                              <tr key={idx} className="border-b border-border/50">
                                <td className="px-2 py-2 font-mono text-xs text-foreground">{doc.numero_nota}</td>
                                <td className="px-2 py-2 text-xs text-foreground truncate max-w-[200px]">{doc.razaosocial}</td>
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">{doc.total_skus}</td>
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">{doc.qtd_volume ?? "—"}</td>
                                <td className="px-2 py-2 text-right font-mono text-xs text-foreground">
                                  {Number(doc.valor_total_nota).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">Informações não disponíveis.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {/* Modal Liberar com erro no transporte */}
      <Dialog open={showErroModal} onOpenChange={setShowErroModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Liberar Recebimento com Erro no Transporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Motivo de Ocorrência *</label>
              <select
                value={selectedMotivo}
                onChange={(e) => setSelectedMotivo(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Selecione o motivo...</option>
                {motivos.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowErroModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleConfirmarErroTransporte}
              disabled={erroSubmitting || !selectedMotivo}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {erroSubmitting && <Loader2 size={14} className="animate-spin" />}
              Confirmar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Excluir Movimento */}
      <DeleteConfirmDialog
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeleteMovimento}
        title="Excluir Movimento de Entrada"
        description="Tem certeza que deseja excluir este movimento? Os documentos vinculados voltarão ao status pendente."
      />
    </div>
  );
}
