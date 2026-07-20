import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { Loader2, MoreVertical, Search, ChevronLeft, ChevronRight, Package, AlertTriangle, Ban, Unlock, Lock, Truck, RefreshCw, FileWarning } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchOperadoresAtribuidos } from "@/lib/operadoresAtribuidos";
import { OperadoresAtribuidos } from "@/components/movimentos/OperadoresAtribuidos";
import { formatDate, formatDateTime } from "@/utils/dateTime";
import { LiberarArmazenagemModal } from "@/components/movimento-entrada/LiberarArmazenagemModal";
import { LiberarErroTransporteModal } from "@/components/movimento-entrada/LiberarErroTransporteModal";

interface MovimentoEntradaListItem {
  id: string;
  numero_movimento: number;
  status: string;
  created_at: string;
  parceiro_nome: string | null;
  operador_nome: string | null;
  box_descricao: string | null;
  total_itens: number;
  total_esperado: number;
  total_conferido: number;
  total_armazenado: number;
  total_registros: number;
}

interface MovimentoEntradaItem {
  id: string;
  movimento_item_id: string;
  sku: string;
  descricao: string;
  qtd_esperada: number;
  qtd_conferida: number;
  qtd_armazenada: number;
  qtd_ocorrencia: number;
  status_item_movimento: string;
}

const STATUS_MAP: Record<string, { label: string; class: string }> = {
  GERADO: { label: "Gerado", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  LIBERADO: { label: "Liberado", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  ERRO_TRANSPORTADOR: { label: "Erro Transporte", class: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  "EM CONFERENCIA": { label: "Em Conferência", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  EM_CONFERENCIA: { label: "Em Conferência", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  CONFERIDO: { label: "Conferido", class: "bg-lime-500/15 text-lime-400 border-lime-500/30" },
  DIVERGENCIA: { label: "Divergência", class: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  LIB_ARMAZENAGEM: { label: "Lib. Armazenagem", class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  "LIB. ARMAZENAGEM": { label: "Lib. Armazenagem", class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  ARMAZENAGEM_PARCIAL: { label: "Armaz. Parcial", class: "bg-teal-500/15 text-teal-400 border-teal-500/30" },
  ARMAZENADO: { label: "Armazenado", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  EXPORTADO: { label: "Exportado", class: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30" },
  CANCELADO: { label: "Cancelado", class: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
};

const STATUS_ITEM_MAP: Record<string, { label: string; class: string }> = {
  PENDENTE: { label: "Pendente", class: "bg-red-500/15 text-red-400 border-red-500/30" },
  EM_ANDAMENTO: { label: "Em Andamento", class: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  CONCLUIDO: { label: "Concluído", class: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30" },
  CANCELADO: { label: "Cancelado", class: "bg-gray-500/15 text-gray-400 border-gray-500/30" },
  CONFERIDO: { label: "Conferido", class: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30" },
  DIVERGENTE: { label: "Divergente", class: "bg-pink-500/15 text-pink-400 border-pink-500/30" },
  ARMAZENADO: { label: "Armazenado", class: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

interface MovEntry {
  id: string;
  numero_movimento: number | null;
  status: string;
  created_at: string;
  placa_veiculo: string | null;
  parceiro_nome?: string;
  tipo_entrada_descricao?: string;
  operadores_atribuidos?: string[];
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
  // statusCounts removed - no longer using cards
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

  // Liberar armazenagem modal unificado
  const [showLiberarArmazenagem, setShowLiberarArmazenagem] = useState(false);
  const [liberarMovId, setLiberarMovId] = useState<string | null>(null);
  const [liberarMovStatus, setLiberarMovStatus] = useState<string>("");

  // Cancel modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelMovId, setCancelMovId] = useState<string | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [cancelarResult, setCancelarResult] = useState<any>(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState("");
  const [filterNumero, setFilterNumero] = useState("");
  const [filterDocumento, setFilterDocumento] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }));
  const [filterDateTo, setFilterDateTo] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }));
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const debouncedNumero = useDebounce(filterNumero, 400);
  const debouncedDocumento = useDebounce(filterDocumento, 400);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedNumero, debouncedDocumento, filterStatus, filterDateFrom, filterDateTo, tenantId, empresaId, armazemId]);

  // List via RPC (server-side pagination)
  const listQuery = useQuery({
    queryKey: [
      "movimentos-entrada-rpc",
      tenantId,
      empresaId,
      armazemId,
      filterStatus,
      filterDateFrom,
      filterDateTo,
      debouncedNumero,
      debouncedDocumento,
      page,
    ],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("listar_movimentos_entrada", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId || null,
        p_status: filterStatus || null,
        p_data_de: filterDateFrom || null,
        p_data_ate: filterDateTo || null,
        p_numero_movimento: debouncedNumero ? Number(debouncedNumero) : null,
        p_numero_nf: debouncedDocumento || null,
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw error;
      return (data || []) as MovimentoEntradaListItem[];
    },
    enabled: !!tenantId && !!empresaId,
    staleTime: 30_000,
  });

  const listRows = listQuery.data ?? [];
  const total = listRows[0]?.total_registros ?? 0;
  const loading = listQuery.isLoading;
  const movIdsKey = useMemo(() => listRows.map((r) => r.id).join(","), [listRows]);

  // Operadores atribuídos (enriquecimento paralelo)
  const opsQuery = useQuery({
    queryKey: ["movimentos-entrada-ops", tenantId, movIdsKey],
    queryFn: async () => {
      const ids = movIdsKey ? movIdsKey.split(",") : [];
      if (ids.length === 0) return new Map<string, string[]>();
      return await fetchOperadoresAtribuidos(tenantId!, ids, "MOVIMENTO_ENTRADA_ITEM");
    },
    enabled: !!tenantId && listRows.length > 0,
    staleTime: 30_000,
  });

  const movements: MovEntry[] = useMemo(() => {
    const opsMap = opsQuery.data || new Map<string, string[]>();
    return listRows.map((r) => ({
      id: r.id,
      numero_movimento: r.numero_movimento,
      status: r.status,
      created_at: r.created_at,
      placa_veiculo: null,
      parceiro_nome: r.parceiro_nome || "—",
      operadores_atribuidos: opsMap.get(r.id) || [],
    }));
  }, [listRows, opsQuery.data]);

  const fetchMovements = useCallback(() => {
    listQuery.refetch();
    opsQuery.refetch();
  }, [listQuery, opsQuery]);

  // Items tab data via RPC (lazy, enabled by selectedMov + tab)
  const itemsQuery = useQuery({
    queryKey: ["movimento-entrada-itens-rpc", tenantId, selectedMov],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("buscar_itens_movimento_entrada", {
        p_tenant_id: tenantId,
        p_movimento_entrada_id: selectedMov,
      });
      if (error) throw error;
      const items = (data || []) as MovimentoEntradaItem[];

      // Alert enrichment (sem_picking / sem_ean) — preservar UI atual
      const { data: meiData } = await (supabase as any)
        .from("movimento_entrada_item")
        .select("id, produto_id")
        .eq("movimento_entrada_id", selectedMov);
      const meiMap = new Map<string, string>((meiData || []).map((m: any) => [m.id, m.produto_id]));
      const produtoIds = Array.from(new Set((meiData || []).map((m: any) => m.produto_id))).filter(Boolean);

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

      return items.map((it) => {
        const prodId = meiMap.get(it.movimento_item_id);
        return {
          movimento_id: selectedMov!,
          movimento_item_id: it.movimento_item_id,
          sku: it.sku,
          descricao: it.descricao,
          qtd_esperada: Number(it.qtd_esperada) || 0,
          qtd_conferida: Number(it.qtd_conferida) || 0,
          qtd_armazenada: Number(it.qtd_armazenada) || 0,
          status_item_movimento: it.status_item_movimento,
          sem_picking: prodId ? !pickingSet.has(prodId) : false,
          sem_ean: prodId ? !eanSet.has(prodId) : false,
        } as ResumoItem;
      });
    },
    enabled: !!tenantId && !!selectedMov && itemTab === "itens",
    staleTime: 30_000,
  });

  // Sync items query result into the existing state slot used by the table
  useEffect(() => {
    if (itemsQuery.data) setResumoItems(itemsQuery.data);
  }, [itemsQuery.data]);

  const loadDetails = async (movId: string, movStatus: string) => {
    setSelectedMov(movId);
    setSelectedMovStatus(movStatus);
    setItemTab("itens");
    setDetailLoading(true);
    try {
      const [r2, r3] = await Promise.all([
        (supabase as any).from("vw_movimento_entrada_conferencia_detalhe").select("*").eq("movimento_id", movId),
        (supabase as any).from("vw_movimento_entrada_armazenagem_detalhe").select("*").eq("movimento_entrada_id", movId),
      ]);

      setConferenciaItems(r2.data || []);
      setArmazenagemItems(r3.data || []);


      // Load info tab data using consolidated view
      const { data: infoData } = await (supabase as any)
        .from("vw_movimento_entrada_info")
        .select("*")
        .eq("movimento_id", movId)
        .single();

      if (infoData) {
        setMovimentoInfo({
          confirma_volume: infoData.confirma_volume,
          total_volume: infoData.total_volume,
          total_volume_conferido: infoData.total_volume_conferido,
          armazem_descricao: infoData.armazem_descricao || "—",
          box_descricao: infoData.box_descricao || "—",
          placa_veiculo: infoData.placa_veiculo,
          valor_descarga: infoData.valor_descarga,
          crossdocking: infoData.crossdocking,
          observacao: infoData.observacao,
        });
      }

      // Load linked documents using consolidated view
      const { data: docsData } = await (supabase as any)
        .from("vw_movimento_entrada_docs_vinculados")
        .select("*")
        .eq("movimento_entrada_id", movId);

      setDocsVinculados((docsData || []).map((d: any) => ({
        numero_nota: d.numero_nota,
        razaosocial: d.razaosocial || "—",
        total_skus: Number(d.total_skus) || 0,
        valor_total_nota: d.valor_total_nota,
        qtd_volume: d.qtd_volume,
      })));
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
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
      const msg = String(data || "");
      if (msg.startsWith("Erro")) {
        toast.error(msg);
      } else {
        toast.success(msg || "Movimento liberado para conferência.");
        fetchMovements();
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
      if (selectedMov === movId) loadDetails(movId, "GERADO");
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const openLiberarArmazenagem = (movId: string, status: string) => {
    const blocked = ["GERADO", "EXPORTADO", "CANCELADO", "ARMAZENADO"];
    if (blocked.includes(status)) {
      toast.warning("Movimento ainda não pode ser liberado para armazenagem.");
      return;
    }
    setLiberarMovId(movId);
    setLiberarMovStatus(status);
    setShowLiberarArmazenagem(true);
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
    setShowErroModal(true);
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
      openLiberarArmazenagem(movId, status);
      return;
    }
    if (action === "liberar_erro_transporte") {
      openErroTransporteModal(movId);
      return;
    }
    if (action === "cancelar_movimento") {
      setCancelMovId(movId);
      setCancelarResult(null);
      setShowCancelModal(true);
      return;
    }
    if (action === "atualizar_erp") {
      toast.info("Funcionalidade de atualização ERP será implementada em breve.");
      return;
    }
  };

  const handleCancelarMovimento = async () => {
    if (!cancelMovId) return;
    setCancelando(true);
    setCancelarResult(null);
    try {
      const { data, error } = await supabase.rpc("fn_cancelar_movimento_entrada" as any, {
        p_movimento_entrada_id: cancelMovId,
        p_tenant_id: tenantId,
      });
      if (error) {
        setCancelarResult(error);
        toast.error("Erro ao cancelar movimento.");
      } else {
        setCancelarResult(data);
        toast.success("Movimento cancelado com sucesso.");
        if (selectedMov === cancelMovId) {
          setSelectedMov(null);
          setSelectedMovStatus(null);
        }
        fetchMovements();
      }
    } catch (err: any) {
      setCancelarResult({ error: err.message });
      toast.error(err.message);
    } finally {
      setCancelando(false);
    }
  };

  const handleSearch = () => {
    setPage(1);
    fetchMovements();
  };

  const totalPages = Math.ceil(total / pageSize);
  const inputClass = "h-8 px-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  const fmtDate = (d: string | null) => formatDate(d);
  const fmtDateTime = (d: string | null) => formatDateTime(d);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-3 animate-fade-in">
      <h1 className="text-lg font-bold text-foreground">Movimentos de Entrada</h1>

      {/* Filters inline */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Data De</label>
          <input type="date" required value={filterDateFrom} onChange={(e) => { if (e.target.value) setFilterDateFrom(e.target.value); }} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Data Até</label>
          <input type="date" required value={filterDateTo} onChange={(e) => { if (e.target.value) setFilterDateTo(e.target.value); }} className={inputClass} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Nº Movimento</label>
          <input type="number" value={filterNumero} onChange={(e) => setFilterNumero(e.target.value)} placeholder="Nº" className={cn(inputClass, "w-20")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Nº Documento</label>
          <input type="text" value={filterDocumento} onChange={(e) => setFilterDocumento(e.target.value)} placeholder="Nº NF" className={cn(inputClass, "w-24")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Status</label>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className={cn(inputClass, "w-36")}>
            <option value="">Todos</option>
            {Object.entries(STATUS_MAP).filter(([k]) => !k.includes(" ")).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <button onClick={handleSearch} className="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 flex items-center gap-1">
          <Search size={12} /> Filtrar
        </button>
        <button
          onClick={() => { window.location.hash = "/relatorios/picking-nao-cadastrado"; }}
          className="h-8 px-3 rounded-md border border-border bg-secondary/40 text-xs font-medium text-foreground hover:bg-secondary flex items-center gap-1"
          title="Listar itens em movimentos abertos que ainda não têm picking cadastrado"
        >
          <FileWarning size={12} /> Itens sem Picking
        </button>
      </div>

      <div className="flex gap-3 flex-1 min-h-0">
        {/* Movement list */}
        <div className="w-80 shrink-0 card-surface flex flex-col">
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
                      <OperadoresAtribuidos operadores={mov.operadores_atribuidos || []} />
                      <p className="text-xs text-muted-foreground">{fmtDate(mov.created_at)}</p>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-secondary text-muted-foreground mt-0.5"><MoreVertical size={14} /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_conferencia", mov.id, mov.status)}>
                          <Unlock size={14} className="mr-2" /> Liberar para conferência
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("retirar_conferencia", mov.id, mov.status)}>
                          <Lock size={14} className="mr-2" /> Retirar de conferência
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_armazenagem", mov.id, mov.status)}>
                          <Package size={14} className="mr-2" /> Liberar armazenagem
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_erro_transporte", mov.id, mov.status)}>
                          <Truck size={14} className="mr-2" /> Liberar recebimento com erro no transporte
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("atualizar_erp", mov.id, mov.status)}>
                          <RefreshCw size={14} className="mr-2" /> Atualizar ERP
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={() => handleMenuAction("cancelar_movimento", mov.id, mov.status)} className="text-destructive focus:text-destructive">
                          <Ban size={14} className="mr-2" /> Cancelar movimento
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
        <div className="flex-1 card-surface flex flex-col min-h-0 overflow-hidden">
          {!selectedMov ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <Package size={32} className="mb-2 opacity-40" />
              <p className="text-sm">Selecione um movimento para ver os detalhes</p>
            </div>
          ) : (
            <Tabs value={itemTab} onValueChange={setItemTab} className="flex flex-col flex-1 min-h-0 overflow-hidden">
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
              <TabsContent value="informacoes" className="flex-1 overflow-auto m-0 p-4 min-h-0">
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

      {/* Modal Liberar com erro no transporte (unificado com registro de ocorrência) */}
      {erroMovId && (
        <LiberarErroTransporteModal
          open={showErroModal}
          onClose={() => setShowErroModal(false)}
          movimentoEntradaId={erroMovId}
          onSuccess={() => {
            fetchMovements();
            if (selectedMov === erroMovId) loadDetails(erroMovId, "LIBERADO");
          }}
        />
      )}

      {/* Modal Liberar Armazenagem (unificado) */}
      {liberarMovId && (
        <LiberarArmazenagemModal
          open={showLiberarArmazenagem}
          onClose={() => setShowLiberarArmazenagem(false)}
          movimentoEntradaId={liberarMovId}
          statusMovimento={liberarMovStatus}
          onSuccess={() => {
            fetchMovements();
            if (selectedMov === liberarMovId) loadDetails(liberarMovId, "LIB_ARMAZENAGEM");
          }}
        />
      )}

      {/* Modal Cancelar Movimento */}
      <Dialog open={showCancelModal} onOpenChange={(v) => { if (!v) { setShowCancelModal(false); setCancelarResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-destructive/15 flex items-center justify-center">
                <Ban size={20} className="text-destructive" />
              </div>
              <DialogTitle>Cancelar Movimento de Entrada</DialogTitle>
            </div>
          </DialogHeader>
          {!cancelarResult ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Tem certeza que deseja cancelar este movimento? A função de cancelamento será executada no banco de dados.</p>
              <DialogFooter>
                <button onClick={() => setShowCancelModal(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                  Voltar
                </button>
                <button
                  onClick={handleCancelarMovimento}
                  disabled={cancelando}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                >
                  {cancelando && <Loader2 size={14} className="animate-spin" />}
                  {cancelando ? "Cancelando..." : "Confirmar Cancelamento"}
                </button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">Resultado da execução:</p>
              <pre className="p-3 rounded-lg bg-secondary/50 border border-border text-xs text-foreground overflow-auto max-h-60 whitespace-pre-wrap">
                {JSON.stringify(cancelarResult, null, 2)}
              </pre>
              <DialogFooter>
                <button onClick={() => { setShowCancelModal(false); setCancelarResult(null); }} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  Fechar
                </button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
