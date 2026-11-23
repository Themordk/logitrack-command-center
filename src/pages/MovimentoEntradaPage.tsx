import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { getRouteParam, clearRouteParam } from "@/lib/deepLinkParam";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/contexts/PermissionsContext";
import { RemoverDocumentoMovimentoModal } from "@/components/movimentos/RemoverDocumentoMovimentoModal";
import { DocumentosRemovidosBloco } from "@/components/movimentos/DocumentosRemovidosBloco";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import { Loader2, MoreVertical, Search, ChevronLeft, ChevronRight, Package, AlertTriangle, Ban, Unlock, Lock, Truck, RefreshCw, FileWarning, Eye, Unlink, UserCog } from "lucide-react";
import { ResponsaveisOndaModal } from "@/components/movimentos/ResponsaveisOndaModal";
import { FONTE_ENTRADA } from "@/lib/responsaveisOndaService";
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
import { parseError } from "@/lib/errorMapper";
import { ErpStatusBadge, erpBadgeApplies, atendeFiltroErp, OPCOES_FILTRO_ERP, type FiltroErp } from "@/components/movimentos/ErpStatusBadge";
import { useIntegracaoResumo } from "@/hooks/useIntegracaoResumo";
import { useTenantHasErp } from "@/hooks/useTenantHasErp";
import { DescricaoCell } from "@/components/DescricaoCell";
import { useTableSort } from "@/hooks/useTableSort";
import { SortableTh } from "@/components/tabela/SortableTh";
import {
  DETALHE_ENTRADA_STALE_MS,
  detalheEntradaKeys,
  fetchArmazenagemDetalheEntrada,
  fetchConferenciaDetalheEntrada,
  fetchInformacoesDetalheEntrada,
  fetchItensDetalheEntrada,
  invalidarDetalheEntrada,
  prefetchItensDetalheEntrada,
} from "@/lib/movimentoEntradaDetalheService";

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
  /** S1: pior estado de integração das NFs do recebimento (movimento_entrada.integracao_resumo). */
  integracao_resumo?: string | null;
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
  // Alertas decididos no banco (rpc_movimento_entrada_detalhe, seção itens)
  sem_picking: boolean;
  sem_ean: boolean;
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
  numero_movimento: number | null;
  status: string | null;
  created_at: string | null;
  updated_at: string | null;
  tipo_entrada_descricao: string | null;
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
  documento_entrada_id: string | null;
}

export function MovimentoEntradaPage() {
  const { armazemId, tenantId, empresaId, usuarioId } = useTenant();
  // statusCounts removed - no longer using cards
  const [selectedMov, setSelectedMov] = useState<string | null>(null);

  const [selectedMovStatus, setSelectedMovStatus] = useState<string | null>(null);
  const [itemTab, setItemTab] = useState("itens");

  // Fase 5.1: responsáveis do movimento (conferência e armazenagem)
  const [responsaveisMov, setResponsaveisMov] = useState<{ id: string; numero: number | null } | null>(null);
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const podeRemoverDoc = can("web.atividades.movimentos.remover-documento", "EXECUTE");
  const [remocaoDoc, setRemocaoDoc] = useState<DocVinculado | null>(null);

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
  const [filterErp, setFilterErp] = useState<FiltroErp>("");
  const [filterNumero, setFilterNumero] = useState("");
  const [filterDocumento, setFilterDocumento] = useState("");
  const [filterSku, setFilterSku] = useState("");
  const [pendingMovId, setPendingMovId] = useState<string | null>(null);
  const skuScrollRef = useRef<string | null>(null);
  const [filterTipoEntradaId, setFilterTipoEntradaId] = useState("");
  const [filterPlacaVeiculo, setFilterPlacaVeiculo] = useState("");
  const [filterBoxId, setFilterBoxId] = useState("");
  const [filterParceiroCodigoErp, setFilterParceiroCodigoErp] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }));
  const [filterDateTo, setFilterDateTo] = useState(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" }));
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const debouncedNumero = useDebounce(filterNumero, 400);
  const debouncedDocumento = useDebounce(filterDocumento, 400);
  const debouncedSku = useDebounce(filterSku, 400);
  const skuFiltro = debouncedSku.trim().toLowerCase();
  const isSkuHit = (sku: string | null | undefined) => !!skuFiltro && (sku || "").trim().toLowerCase() === skuFiltro;
  // Detalhe do movimento: uma chamada por aba (rpc_movimento_entrada_detalhe).
  // Itens carrega ao selecionar (traz status e contagens das outras abas);
  // as demais só quando abertas. O cache por movimento deixa voltar a um
  // movimento/aba já vistos sem nova chamada por 30 s.
  const detalheHabilitado = !!tenantId && !!selectedMov;
  const itensQuery = useQuery({
    queryKey: detalheEntradaKeys.secao(tenantId, selectedMov, "itens"),
    queryFn: () => fetchItensDetalheEntrada(selectedMov!),
    enabled: detalheHabilitado,
    staleTime: DETALHE_ENTRADA_STALE_MS,
  });
  const conferenciaQuery = useQuery({
    queryKey: detalheEntradaKeys.secao(tenantId, selectedMov, "conferencia"),
    queryFn: () => fetchConferenciaDetalheEntrada(selectedMov!),
    enabled: detalheHabilitado && itemTab === "conferencia",
    staleTime: DETALHE_ENTRADA_STALE_MS,
  });
  const armazenagemQuery = useQuery({
    queryKey: detalheEntradaKeys.secao(tenantId, selectedMov, "armazenagem"),
    queryFn: () => fetchArmazenagemDetalheEntrada(selectedMov!),
    enabled: detalheHabilitado && itemTab === "armazenagem",
    staleTime: DETALHE_ENTRADA_STALE_MS,
  });
  const informacoesQuery = useQuery({
    queryKey: detalheEntradaKeys.secao(tenantId, selectedMov, "informacoes"),
    queryFn: () => fetchInformacoesDetalheEntrada(selectedMov!),
    enabled: detalheHabilitado && itemTab === "informacoes",
    staleTime: DETALHE_ENTRADA_STALE_MS,
  });

  const resumoItems: ResumoItem[] = useMemo(
    () => (itensQuery.data?.itens ?? []).map((it) => ({
      movimento_id: selectedMov!,
      movimento_item_id: it.movimento_item_id,
      sku: it.sku,
      descricao: it.descricao,
      qtd_esperada: it.qtd_esperada,
      qtd_conferida: it.qtd_conferida,
      qtd_armazenada: it.qtd_armazenada,
      status_item_movimento: it.status_item_movimento,
      sem_picking: it.sem_picking,
      sem_ean: it.sem_ean,
    })),
    [itensQuery.data, selectedMov],
  );
  const conferenciaItems: ConferenciaItem[] = useMemo(
    () => (conferenciaQuery.data ?? []).map((c) => ({
      movimento_id: selectedMov!,
      sku: c.sku,
      descricao: c.descricao,
      operador: c.operador ?? "",
      codigo_hu: c.codigo_hu ?? "",
      validade: c.validade,
      fabricacao: c.fabricacao,
      serie: c.serie,
      quantidade_executada: c.quantidade_executada,
      iniciado_em: c.iniciado_em,
      concluido_em: c.concluido_em,
      status: c.status,
      lote: c.lote,
    })),
    [conferenciaQuery.data, selectedMov],
  );
  const armazenagemItems: ArmazenagemItem[] = useMemo(
    () => (armazenagemQuery.data ?? []).map((a) => ({
      movimento_entrada_id: selectedMov!,
      sku: a.sku ?? "",
      descricao_sku: a.descricao_sku ?? "",
      login: a.login ?? "",
      codigo_hu: a.codigo_hu ?? "",
      endereco: a.endereco ?? "",
      quantidade_executada: a.quantidade_executada,
      lote: a.lote,
      fabricacao: a.fabricacao,
      validade: a.validade,
      iniciado_em: a.iniciado_em,
      concluido_em: a.concluido_em,
    })),
    [armazenagemQuery.data, selectedMov],
  );
  const movimentoInfo: MovimentoInfo | null = useMemo(() => {
    const i = informacoesQuery.data?.informacoes;
    if (!i) return null;
    return {
      numero_movimento: i.numero_movimento,
      status: i.status,
      created_at: i.created_at,
      // A view antiga não tinha updated_at (sempre nulo); mantido nulo para não mudar a tela.
      updated_at: null,
      tipo_entrada_descricao: i.tipo_entrada_descricao,
      confirma_volume: i.confirma_volume,
      total_volume: i.total_volume,
      total_volume_conferido: i.total_volume_conferido,
      armazem_descricao: i.armazem_descricao || "—",
      box_descricao: i.box_descricao || "—",
      placa_veiculo: i.placa_veiculo,
      valor_descarga: i.valor_descarga,
      crossdocking: i.crossdocking,
      observacao: i.observacao,
    };
  }, [informacoesQuery.data]);
  const docsVinculados: DocVinculado[] = useMemo(
    () => (informacoesQuery.data?.documentos ?? []).map((d) => ({
      numero_nota: d.numero_nota,
      razaosocial: d.razaosocial || "—",
      total_skus: d.total_skus,
      valor_total_nota: d.valor_total_nota,
      qtd_volume: d.qtd_volume,
      documento_entrada_id: d.documento_entrada_id ?? null,
    })),
    [informacoesQuery.data],
  );
  const contagensAbas = itensQuery.data?.contagens ?? null;
  /** Status lido agora do banco (seção itens); a lista pode estar até 30 s atrás. */
  const statusAoVivo = itensQuery.data?.cabecalho.status ?? null;
  const queryDaAba =
    itemTab === "conferencia" ? conferenciaQuery
      : itemTab === "armazenagem" ? armazenagemQuery
        : itemTab === "informacoes" ? informacoesQuery
          : itensQuery;
  const abaCarregando = !!selectedMov && queryDaAba.isLoading;

  const sortItens = useTableSort(resumoItems, "sku", {
    status_item_movimento: (r: ResumoItem) => STATUS_ITEM_MAP[r.status_item_movimento]?.label ?? r.status_item_movimento,
  }, selectedMov);
  const sortConf = useTableSort(conferenciaItems, "sku", undefined, selectedMov);
  const sortArmz = useTableSort(armazenagemItems, "sku", undefined, selectedMov);
  const debouncedPlaca = useDebounce(filterPlacaVeiculo, 400);
  const debouncedParceiroErp = useDebounce(filterParceiroCodigoErp, 400);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedNumero, debouncedDocumento, debouncedSku, debouncedPlaca, debouncedParceiroErp, filterStatus, filterTipoEntradaId, filterBoxId, filterDateFrom, filterDateTo, tenantId, empresaId, armazemId]);

  // Tipos de entrada e boxes para filtros
  const tiposEntradaQuery = useQuery({
    queryKey: ["filter-tipos-entrada", tenantId, empresaId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("tipo_entrada")
        .select("id, descricao")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("descricao");
      return (data || []) as { id: string; descricao: string }[];
    },
    enabled: !!tenantId && !!empresaId,
    staleTime: 5 * 60_000,
  });

  const boxesQuery = useQuery({
    queryKey: ["filter-boxes", tenantId, armazemId],
    queryFn: async () => {
      let q = (supabase as any).from("box").select("id, descricao").eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
      if (armazemId) q = q.eq("armazem_id", armazemId);
      const { data } = await q;
      return (data || []) as { id: string; descricao: string }[];
    },
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
  });

  // List via RPC (server-side pagination)
  const listQuery = useQuery({
    queryKey: [
      "movimentos-entrada-rpc",
      tenantId,
      empresaId,
      armazemId,
      filterStatus,
      filterTipoEntradaId,
      filterBoxId,
      filterDateFrom,
      filterDateTo,
      debouncedNumero,
      debouncedDocumento,
      debouncedSku,
      debouncedPlaca,
      debouncedParceiroErp,
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
        p_tipo_entrada_id: filterTipoEntradaId || null,
        p_placa_veiculo: debouncedPlaca ? debouncedPlaca.toUpperCase() : null,
        p_box_id: filterBoxId || null,
        p_parceiro_codigo_erp: debouncedParceiroErp || null,
        p_sku: debouncedSku.trim() || null,
        p_page: page,
        p_page_size: pageSize,
      });
      if (error) throw error;
      return (data || []) as (MovimentoEntradaListItem & { tipo_entrada_descricao?: string })[];
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

  const integracaoQuery = useIntegracaoResumo("movimento_entrada", tenantId, movIdsKey ? movIdsKey.split(",") : []);

  const movements: MovEntry[] = useMemo(() => {
    const opsMap = opsQuery.data || new Map<string, string[]>();
    const intMap = integracaoQuery.data || new Map<string, string>();
    return listRows.map((r) => ({
      id: r.id,
      numero_movimento: r.numero_movimento,
      status: r.status,
      created_at: r.created_at,
      placa_veiculo: null,
      parceiro_nome: r.parceiro_nome || "—",
      tipo_entrada_descricao: (r as any).tipo_entrada_descricao || "—",
      operadores_atribuidos: opsMap.get(r.id) || [],
      integracao_resumo: intMap.get(r.id) ?? null,
    }));
  }, [listRows, opsQuery.data, integracaoQuery.data]);

  // Mantém o status do movimento selecionado em sincronia (controla as ações disponíveis):
  // o status lido agora pela seção itens vence o da lista, que pode estar até 30 s atrás.
  useEffect(() => {
    if (!selectedMov) return;
    if (statusAoVivo) { setSelectedMovStatus(statusAoVivo); return; }
    const atual = movements.find((m) => m.id === selectedMov);
    if (atual) setSelectedMovStatus(atual.status);
  }, [movements, selectedMov, statusAoVivo]);

  const hasErp = useTenantHasErp(tenantId);
  const resumoSelecionado = movements.find((m) => m.id === selectedMov)?.integracao_resumo ?? null;

  const filteredMovements = useMemo(() => {
    if (!filterErp) return movements;
    return movements.filter((m) => atendeFiltroErp(m.integracao_resumo, filterErp));
  }, [movements, filterErp]);

  const fetchMovements = useCallback(() => {
    listQuery.refetch();
    opsQuery.refetch();
  }, [listQuery, opsQuery]);

  const selecionarMovimento = (movId: string, movStatus: string) => {
    setSelectedMov(movId);
    setSelectedMovStatus(movStatus);
    setItemTab("itens");
  };

  /** Depois de uma ação no movimento: recarrega só o detalhe dele (todas as abas). */
  const recarregarDetalhe = (movId: string, novoStatus?: string | null) => {
    if (selectedMov !== movId) return;
    if (novoStatus) setSelectedMovStatus(novoStatus);
    void invalidarDetalheEntrada(queryClient, tenantId, movId);
  };

  // Pré-carrega a aba Itens ao parar o mouse (ou o foco) sobre o card: o clique
  // costuma chegar 150–400 ms depois e o grid já abre preenchido.
  const prefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const agendarPrefetch = (movId: string) => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = setTimeout(() => prefetchItensDetalheEntrada(queryClient, tenantId, movId), 120);
  };
  const cancelarPrefetch = () => {
    if (prefetchTimer.current) clearTimeout(prefetchTimer.current);
    prefetchTimer.current = null;
  };
  useEffect(() => cancelarPrefetch, []);

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

      // A RPC retorna jsonb: { sucesso, codigo, mensagem, dados }
      const rpcData = data as any;
      if (!rpcData?.sucesso) {
        toast.error(parseError(rpcData, "gerar-tarefas-conferencia-entrada").title);
        return;
      }

      toast.success(rpcData.mensagem || "Movimento liberado para conferência.");
      fetchMovements();
      recarregarDetalhe(movId, "LIBERADO");
    } catch (err: any) {
      toast.error(parseError(err, "gerar-tarefas-conferencia-entrada").title);
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
      recarregarDetalhe(movId, "GERADO");
    } catch (err: any) {
      toast.error(parseError(err, "movimento-entrada-page").title);
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
        setCancelarResult({ sucesso: false, mensagem: error.message });
        toast.error(parseError(error, "cancelar-movimento-entrada").title);
      } else if (!data?.sucesso) {
        setCancelarResult(data);
        toast.error(parseError(data, "cancelar-movimento-entrada").title);
      } else {
        setCancelarResult(data);
        toast.success(data.mensagem || "Movimento cancelado com sucesso.");
        if (selectedMov === cancelMovId) {
          setSelectedMov(null);
          setSelectedMovStatus(null);
        }
        fetchMovements();
      }
    } catch (err: any) {
      setCancelarResult({ sucesso: false, mensagem: err.message });
      toast.error(parseError(err, "cancelar-movimento-entrada").title);
    } finally {
      setCancelando(false);
    }
  };

  // Reabrir movimento vindo do detalhe do documento
  useEffect(() => {
    if (!tenantId) return;
    const movParam = getRouteParam("movimento");
    if (!movParam) return;
    clearRouteParam("movimento");
    (async () => {
      const { data } = await (supabase as any)
        .from("movimento_entrada")
        .select("id, numero_movimento, status, created_at")
        .eq("id", movParam)
        .maybeSingle();
      if (!data) return;
      if (data.numero_movimento != null) setFilterNumero(String(data.numero_movimento));
      if (data.created_at) {
        const dia = new Date(data.created_at).toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
        setFilterDateFrom(dia);
        setFilterDateTo(dia);
      }
      setPendingMovId(data.id);
    })();
  }, [tenantId]);

  useEffect(() => {
    if (!pendingMovId) return;
    const mov = movements.find((m) => m.id === pendingMovId);
    if (!mov) return;
    setPendingMovId(null);
    selecionarMovimento(mov.id, mov.status);
    setItemTab("informacoes");
  }, [pendingMovId, movements]);

  // Rolar até a primeira linha com o SKU filtrado (uma vez por movimento/SKU/aba)
  useEffect(() => {
    if (!skuFiltro || !selectedMov || abaCarregando) return;
    const chave = `${selectedMov}|${skuFiltro}|${itemTab}`;
    if (skuScrollRef.current === chave) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`[data-tab-sku="${itemTab}"][data-sku-hit="true"]`);
      if (el) {
        el.scrollIntoView({ block: "center" });
        skuScrollRef.current = chave;
      }
    }, 50);
    return () => clearTimeout(t);
  }, [skuFiltro, selectedMov, itemTab, abaCarregando, resumoItems, conferenciaItems, armazenagemItems]);

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
          <label htmlFor="filtro-sku-movimento-entrada" className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">SKU</label>
          <input id="filtro-sku-movimento-entrada" type="text" value={filterSku} onChange={(e) => setFilterSku(e.target.value)} placeholder="SKU" className={cn(inputClass, "w-24")} />
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
        {hasErp && (
          <div>
            <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Status ERP</label>
            <select value={filterErp} onChange={(e) => setFilterErp(e.target.value as FiltroErp)} className={cn(inputClass, "w-36")} aria-label="Status ERP">
              <option value="">Todos</option>
              {OPCOES_FILTRO_ERP.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Tipo Entrada</label>
          <select value={filterTipoEntradaId} onChange={(e) => setFilterTipoEntradaId(e.target.value)} className={cn(inputClass, "w-40")}>
            <option value="">Todos</option>
            {(tiposEntradaQuery.data || []).map((t) => (
              <option key={t.id} value={t.id}>{t.descricao}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Box</label>
          <select value={filterBoxId} onChange={(e) => setFilterBoxId(e.target.value)} className={cn(inputClass, "w-32")}>
            <option value="">Todos</option>
            {(boxesQuery.data || []).map((b) => (
              <option key={b.id} value={b.id}>{b.descricao}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Placa</label>
          <input type="text" value={filterPlacaVeiculo} onChange={(e) => setFilterPlacaVeiculo(e.target.value.toUpperCase())} placeholder="ABC-1234" className={cn(inputClass, "w-24")} />
        </div>
        <div>
          <label className="block text-[10px] font-medium text-muted-foreground mb-1 uppercase">Cód. ERP Parceiro</label>
          <input type="text" value={filterParceiroCodigoErp} onChange={(e) => setFilterParceiroCodigoErp(e.target.value)} placeholder="Código" className={cn(inputClass, "w-28")} />
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
            ) : filteredMovements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8 px-3">{debouncedSku.trim() ? `Nenhum movimento com o SKU ${debouncedSku.trim()} no período selecionado. Ajuste as datas para ampliar a busca.` : "Nenhum movimento encontrado."}</p>
            ) : (
              filteredMovements.map((mov) => {
                // No movimento aberto, o status lido agora pelo detalhe vence o da lista (até 30 s atrás).
                const statusMov = mov.id === selectedMov && statusAoVivo ? statusAoVivo : mov.status;
                const info = STATUS_MAP[statusMov] || { label: statusMov, class: "" };
                return (
                  <div key={mov.id} className={cn("w-full text-left px-3 py-3 border-b border-border/50 hover:bg-secondary/50 transition-colors flex items-start gap-2", selectedMov === mov.id && "bg-secondary/70")}>
                    <button
                      onClick={() => { cancelarPrefetch(); selecionarMovimento(mov.id, statusMov); }}
                      onMouseEnter={() => agendarPrefetch(mov.id)}
                      onMouseLeave={cancelarPrefetch}
                      onFocus={() => agendarPrefetch(mov.id)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-mono font-bold text-foreground">
                          MOV-{mov.numero_movimento ?? "—"}
                        </span>
                        <div className="flex items-center gap-1">
                          {hasErp && <ErpStatusBadge resumo={mov.integracao_resumo} compact />}
                          <span className={cn("text-xs px-2 py-0.5 rounded-full border", info.class)}>{info.label}</span>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate" title={mov.parceiro_nome}>
                        {(mov.parceiro_nome || "").length > 35 ? `${(mov.parceiro_nome || "").slice(0, 35)}…` : mov.parceiro_nome}
                      </p>
                      <OperadoresAtribuidos operadores={mov.operadores_atribuidos || []} />
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">{fmtDate(mov.created_at)}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[55%] text-right" title={mov.tipo_entrada_descricao}>{mov.tipo_entrada_descricao}</p>
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1 rounded hover:bg-secondary text-muted-foreground mt-0.5"><MoreVertical size={14} /></button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_conferencia", mov.id, statusMov)}>
                          <Unlock size={14} className="mr-2" /> Liberar para conferência
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("retirar_conferencia", mov.id, statusMov)}>
                          <Lock size={14} className="mr-2" /> Retirar de conferência
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_armazenagem", mov.id, statusMov)}>
                          <Package size={14} className="mr-2" /> Liberar armazenagem
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("liberar_erro_transporte", mov.id, statusMov)}>
                          <Truck size={14} className="mr-2" /> Liberar recebimento com erro no transporte
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setResponsaveisMov({ id: mov.id, numero: mov.numero_movimento ?? null })}>
                          <UserCog size={14} className="mr-2" /> Responsáveis
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleMenuAction("atualizar_erp", mov.id, statusMov)}>
                          <RefreshCw size={14} className="mr-2" /> Atualizar ERP
                        </DropdownMenuItem>
                        
                        <DropdownMenuItem onClick={() => handleMenuAction("cancelar_movimento", mov.id, statusMov)} className="text-destructive focus:text-destructive">
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
                <TabsTrigger value="conferencia" className="flex-1">
                  Conferência{contagensAbas ? <span className="ml-1 text-xs text-muted-foreground">({contagensAbas.conferencias})</span> : null}
                </TabsTrigger>
                <TabsTrigger value="armazenagem" className="flex-1">
                  Armazenagem{contagensAbas ? <span className="ml-1 text-xs text-muted-foreground">({contagensAbas.armazenagens})</span> : null}
                </TabsTrigger>
                <TabsTrigger value="informacoes" className="flex-1">Informações</TabsTrigger>
              </TabsList>

              {/* Aba Itens */}
              <TabsContent value="itens" className="flex-1 overflow-auto m-0">
                {itensQuery.isLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : itensQuery.isError ? (
                  <ErroAbaDetalhe erro={itensQuery.error} onTentar={() => itensQuery.refetch()} />
                ) : (
                  <TooltipProvider>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 sticky top-0">
                        <th className="px-3 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase w-8"></th>
                        <SortableTh label="SKU" sortKey="sku" activeKey={sortItens.sortKey} dir={sortItens.sortDir} onSort={sortItens.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Descrição" sortKey="descricao" activeKey={sortItens.sortKey} dir={sortItens.sortDir} onSort={sortItens.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Esperada" sortKey="qtd_esperada" activeKey={sortItens.sortKey} dir={sortItens.sortDir} onSort={sortItens.toggleSort} align="right" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Conferida" sortKey="qtd_conferida" activeKey={sortItens.sortKey} dir={sortItens.sortDir} onSort={sortItens.toggleSort} align="right" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Armazenada" sortKey="qtd_armazenada" activeKey={sortItens.sortKey} dir={sortItens.sortDir} onSort={sortItens.toggleSort} align="right" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Status" sortKey="status_item_movimento" activeKey={sortItens.sortKey} dir={sortItens.sortDir} onSort={sortItens.toggleSort} align="center" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortItens.sortedRows.map((item) => {
                        const alerts: string[] = [];
                        if (item.sem_picking) alerts.push("Sem endereço de picking cadastrado");
                        if (item.sem_ean) alerts.push("Sem código de barras cadastrado");
                        
                        const statusInfo = STATUS_ITEM_MAP[item.status_item_movimento] || { label: item.status_item_movimento || "—", class: "" };
                        return (
                          <tr key={item.movimento_item_id} data-tab-sku="itens" data-sku-hit={isSkuHit(item.sku) ? "true" : undefined} className={cn("border-b border-border/50 hover:bg-secondary/30", alerts.length > 0 && "bg-orange-500/5", isSkuHit(item.sku) && "bg-primary/10")}>
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
                            <td className="px-3 py-2.5 text-xs text-foreground"><DescricaoCell text={item.descricao} /></td>
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
                {conferenciaQuery.isLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : conferenciaQuery.isError ? (
                  <ErroAbaDetalhe erro={conferenciaQuery.error} onTentar={() => conferenciaQuery.refetch()} />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 sticky top-0">
                        <SortableTh label="SKU" sortKey="sku" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Descrição" sortKey="descricao" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Operador" sortKey="operador" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Qtd" sortKey="quantidade_executada" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="right" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="HU" sortKey="codigo_hu" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Lote" sortKey="lote" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Fabricação" sortKey="fabricacao" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Validade" sortKey="validade" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Série" sortKey="serie" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Status" sortKey="status" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="center" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Início" sortKey="iniciado_em" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Término" sortKey="concluido_em" activeKey={sortConf.sortKey} dir={sortConf.sortDir} onSort={sortConf.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortConf.sortedRows.map((item, idx) => (
                        <tr key={idx} data-tab-sku="conferencia" data-sku-hit={isSkuHit(item.sku) ? "true" : undefined} className={cn("border-b border-border/50 hover:bg-secondary/30", isSkuHit(item.sku) && "bg-primary/10")}>
                          <td className="px-3 py-2.5 font-mono text-xs text-foreground">{item.sku}</td>
                          <td className="px-3 py-2.5 text-xs text-foreground"><DescricaoCell text={item.descricao} minWidth={180} maxWidth={280} /></td>
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
                {armazenagemQuery.isLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : armazenagemQuery.isError ? (
                  <ErroAbaDetalhe erro={armazenagemQuery.error} onTentar={() => armazenagemQuery.refetch()} />
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                     <tr className="border-b border-border bg-secondary/30 sticky top-0">
                        <SortableTh label="SKU" sortKey="sku" activeKey={sortArmz.sortKey} dir={sortArmz.sortDir} onSort={sortArmz.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Descrição" sortKey="descricao_sku" activeKey={sortArmz.sortKey} dir={sortArmz.sortDir} onSort={sortArmz.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="HU" sortKey="codigo_hu" activeKey={sortArmz.sortKey} dir={sortArmz.sortDir} onSort={sortArmz.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Endereço Destino" sortKey="endereco" activeKey={sortArmz.sortKey} dir={sortArmz.sortDir} onSort={sortArmz.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Quantidade" sortKey="quantidade_executada" activeKey={sortArmz.sortKey} dir={sortArmz.sortDir} onSort={sortArmz.toggleSort} align="right" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Operador" sortKey="login" activeKey={sortArmz.sortKey} dir={sortArmz.sortDir} onSort={sortArmz.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                        <SortableTh label="Data Execução" sortKey="concluido_em" activeKey={sortArmz.sortKey} dir={sortArmz.sortDir} onSort={sortArmz.toggleSort} align="left" className="px-3 py-2.5 text-xs font-medium text-muted-foreground" />
                      </tr>
                    </thead>
                    <tbody>
                      {sortArmz.sortedRows.map((item, idx) => (
                        <tr key={idx} data-tab-sku="armazenagem" data-sku-hit={isSkuHit(item.sku) ? "true" : undefined} className={cn("border-b border-border/50 hover:bg-secondary/30", isSkuHit(item.sku) && "bg-primary/10")}>
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
                {informacoesQuery.isLoading ? (
                  <div className="flex-1 flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
                ) : informacoesQuery.isError ? (
                  <ErroAbaDetalhe erro={informacoesQuery.error} onTentar={() => informacoesQuery.refetch()} />
                ) : movimentoInfo ? (
                  <div className="space-y-6">
                    {/* Identificação */}
                    <div className="rounded-lg border border-border p-4 bg-secondary/20">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase mb-3">Identificação</h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Nº Movimento</p>
                          <p className="text-sm font-mono font-medium text-foreground">MOV-{movimentoInfo.numero_movimento ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Status</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.status ? (STATUS_MAP[movimentoInfo.status]?.label || movimentoInfo.status) : "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Data de Criação</p>
                          <p className="text-sm font-medium text-foreground">{fmtDateTime(movimentoInfo.created_at)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tipo de Entrada</p>
                          <p className="text-sm font-medium text-foreground">{movimentoInfo.tipo_entrada_descricao || "—"}</p>
                        </div>
                        {hasErp && (erpBadgeApplies(resumoSelecionado) || movimentoInfo.status === "EXPORTADO") && (
                          <div>
                            <p className="text-xs text-muted-foreground">Status ERP</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <ErpStatusBadge resumo={resumoSelecionado} />
                              {movimentoInfo.status === "EXPORTADO" && movimentoInfo.updated_at && (
                                <span className="text-[11px] text-muted-foreground">
                                  exportado em {fmtDateTime(movimentoInfo.updated_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

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
                              <th className={cn("px-2 py-2 text-center text-xs font-medium text-muted-foreground uppercase", podeRemoverDoc ? "w-20" : "w-12")}>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {docsVinculados.map((doc, idx) => (
                              <tr key={doc.documento_entrada_id || idx} className="border-b border-border/50">
                                <td className="px-2 py-2 font-mono text-xs text-foreground">{doc.numero_nota}</td>
                                <td className="px-2 py-2 text-xs text-foreground truncate max-w-[200px]">{doc.razaosocial}</td>
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">{doc.total_skus}</td>
                                <td className="px-2 py-2 text-center text-xs text-muted-foreground">{doc.qtd_volume ?? "—"}</td>
                                <td className="px-2 py-2 text-right font-mono text-xs text-foreground">
                                  {Number(doc.valor_total_nota).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Ver detalhes do documento de entrada"
                                    aria-label="Ver detalhes do documento de entrada"
                                    disabled={!doc.documento_entrada_id}
                                    onClick={() => {
                                      window.location.hash = `#/atividades/entradas?detalhe=${doc.documento_entrada_id}&origem=mov-entrada&movimento=${selectedMov}`;
                                    }}
                                  >
                                    <Eye size={14} />
                                  </Button>
                                  {podeRemoverDoc && (() => {
                                    const statusOk = ["GERADO", "LIBERADO", "ERRO_TRANSPORTADOR", "EM_CONFERENCIA", "CONFERIDO", "DIVERGENCIA"].includes(selectedMovStatus ?? "");
                                    const motivo = !statusOk
                                      ? "Só é possível remover até DIVERGÊNCIA (antes da armazenagem)"
                                      : docsVinculados.length <= 1 ? "Único documento do movimento. Use Cancelar movimento" : null;
                                    return (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex">
                                            <Button
                                              variant="ghost" size="icon" className="h-8 w-8"
                                              aria-label="Remover documento do movimento"
                                              disabled={!!motivo || !doc.documento_entrada_id}
                                              onClick={() => setRemocaoDoc(doc)}
                                            >
                                              <Unlink size={14} />
                                            </Button>
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent>{motivo ?? "Remover documento do movimento"}</TooltipContent>
                                      </Tooltip>
                                    );
                                  })()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                    {selectedMov && <DocumentosRemovidosBloco tipo="ENTRADA" movimentoId={selectedMov} />}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-8">Informações não disponíveis.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>

      {remocaoDoc && selectedMov && remocaoDoc.documento_entrada_id && (
        <RemoverDocumentoMovimentoModal
          open={!!remocaoDoc}
          onClose={() => setRemocaoDoc(null)}
          tipo="entrada"
          movimentoId={selectedMov}
          empresaId={empresaId ?? ""}
          documento={{ id: remocaoDoc.documento_entrada_id, numero: remocaoDoc.numero_nota, parceiro: remocaoDoc.razaosocial }}
          onSuccess={(res) => {
            recarregarDetalhe(selectedMov, res?.status_atual ?? null);
            ["movimentos-entrada-rpc", "movimentos-entrada-ops", "entradas-lista", "movimento-documento-remocao"].forEach((k) =>
              queryClient.invalidateQueries({ queryKey: [k] }));
          }}
        />
      )}

      {/* Modal Liberar com erro no transporte (unificado com registro de ocorrência) */}
      {erroMovId && (
        <LiberarErroTransporteModal
          open={showErroModal}
          onClose={() => setShowErroModal(false)}
          movimentoEntradaId={erroMovId}
          onSuccess={() => {
            fetchMovements();
            recarregarDetalhe(erroMovId, "LIBERADO");
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
            recarregarDetalhe(liberarMovId, "LIB_ARMAZENAGEM");
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

      <ResponsaveisOndaModal
        open={!!responsaveisMov}
        fonte={FONTE_ENTRADA}
        movimentoSaidaId={responsaveisMov?.id || null}
        numeroOnda={responsaveisMov?.numero ?? null}
        onClose={() => setResponsaveisMov(null)}
        onSuccess={() => { listQuery.refetch(); opsQuery.refetch(); }}
      />
    </div>
  );
}

/** Erro ao carregar uma aba do detalhe: mensagem amigável + tentar de novo (antes a falha virava lista vazia). */
function ErroAbaDetalhe({ erro, onTentar }: { erro: unknown; onTentar: () => void }) {
  const parsed = parseError(erro, "movimento-entrada-detalhe");
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 px-4 text-center">
      <AlertTriangle size={20} className="text-orange-400" />
      <p className="text-sm text-foreground">{parsed.title}</p>
      {parsed.instruction && <p className="text-xs text-muted-foreground">{parsed.instruction}</p>}
      <Button variant="outline" size="sm" onClick={onTentar} className="mt-1 h-7 text-xs">
        <RefreshCw size={12} className="mr-1" /> Tentar novamente
      </Button>
    </div>
  );
}
