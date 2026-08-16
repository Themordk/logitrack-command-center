import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import {
  AlertTriangle, ShieldAlert, CheckCircle2, Clock, RefreshCw, Filter, Search,
  ChevronLeft, ChevronRight, Eye, Loader2, X, Wrench, FileText, MapPin, Package,
  ChevronUp, ChevronDown, MoreVertical, XCircle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import { RegistrarOcorrenciaButton } from "@/components/ocorrencia/RegistrarOcorrenciaButton";
import { parseError } from "@/lib/errorMapper";
import {
  STATUS_BADGE, STATUS_LABEL, PRIORIDADE_BADGE, PRIORIDADE_LABEL,
  CATEGORIA_BADGE, CATEGORIA_LABEL, ETAPA_LABEL, TIPO_LABEL, TIPO_DOC_LABEL,
  tempoRelativo,
} from "@/lib/ocorrenciaConstants";

interface Props {
  onNavigate: (path: string) => void;
}

const PAGE_SIZE = 15;

const STATUS_ICON: Record<string, React.ReactNode> = {
  ABERTA: <AlertTriangle size={11} />,
  EM_INVESTIGACAO: <Search size={11} />,
  EM_TRATAMENTO: <Wrench size={11} />,
  RESOLVIDA: <CheckCircle2 size={11} />,
  CANCELADA: <XCircle size={11} />,
};

type SortKey = "numero_ocorrencia" | "status" | "criado_em" | "prioridade";
type QuickAction = "EM_INVESTIGACAO" | "EM_TRATAMENTO" | "RESOLVIDA";

function urgencyBorder(prioridade: string, status: string) {
  if (status === "RESOLVIDA" || status === "CANCELADA") return "border-l-gray-500/30";
  if (prioridade === "CRITICA") return "border-l-red-500";
  if (prioridade === "ALTA") return "border-l-yellow-500";
  return "border-l-blue-500/50";
}

export function OcorrenciasOperacionaisPage({ onNavigate }: Props) {
  const { tenantId, empresaId, usuarioId } = useTenant();
  const [page, setPage] = useState(1);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterEtapa, setFilterEtapa] = useState("");
  const [filterPrioridade, setFilterPrioridade] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterTipo, setFilterTipo] = useState("");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const debouncedDataIni = useDebounce(dataIni, 400);
  const debouncedDataFim = useDebounce(dataFim, 400);
  const [busca, setBusca] = useState("");
  const debouncedBusca = useDebounce(busca, 400);

  const [orderBy, setOrderBy] = useState<SortKey>("criado_em");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("desc");

  const [quickTarget, setQuickTarget] = useState<{ id: string; numero: number; action: QuickAction } | null>(null);
  const [quickText, setQuickText] = useState("");
  const [quickSaving, setQuickSaving] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [tenantId, empresaId, filterStatus, filterEtapa, filterPrioridade, filterCategoria, filterTipo, debouncedBusca, debouncedDataIni, debouncedDataFim]);

  const kpisQuery = useQuery({
    queryKey: ["ocorrencias-kpis", tenantId, empresaId],
    queryFn: async () => {
      let q = (supabase as any)
        .from("ocorrencia_operacional")
        .select("status, criado_em, resolvido_em")
        .eq("tenant_id", tenantId);
      if (empresaId) q = q.eq("empresa_id", empresaId);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let abertas = 0, investigacao = 0, tratamento = 0, resolvidasHoje = 0;
      let somaH = 0, contH = 0;
      (data || []).forEach((r: any) => {
        if (r.status === "ABERTA") abertas++;
        else if (r.status === "EM_INVESTIGACAO") investigacao++;
        else if (r.status === "EM_TRATAMENTO") tratamento++;
        else if (r.status === "RESOLVIDA") {
          if (r.resolvido_em) {
            const dr = new Date(r.resolvido_em);
            if (dr >= today) resolvidasHoje++;
            if (r.criado_em) {
              const dc = new Date(r.criado_em);
              const h = (dr.getTime() - dc.getTime()) / 3600000;
              if (h >= 0) { somaH += h; contH++; }
            }
          }
        }
      });
      return {
        abertas,
        investigacao,
        tratamento,
        resolvidasHoje,
        tempoMedio: contH > 0 ? Math.round((somaH / contH) * 10) / 10 : 0,
      };
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  });
  const kpis = kpisQuery.data ?? { abertas: 0, investigacao: 0, tratamento: 0, resolvidasHoje: 0, tempoMedio: 0 };

  const listQuery = useQuery({
    queryKey: ["ocorrencias-list", tenantId, empresaId, page, filterStatus, filterEtapa, filterPrioridade, filterCategoria, filterTipo, debouncedDataIni, debouncedDataFim, orderBy, orderDir],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = (supabase as any)
        .from("ocorrencia_operacional")
        .select(`*,
          produto:produto_id(sku, descricao),
          motivo_ocorrencia:motivo_ocorrencia_id(descricao),
          endereco:endereco_id(descricao),
          usuario_criador:usuario!ocorrencia_operacional_criado_por_fkey(nome),
          usuario_resolvedor:usuario!ocorrencia_operacional_resolvido_por_fkey(nome)`,
          { count: "exact" })
        .eq("tenant_id", tenantId)
        .order(orderBy, { ascending: orderDir === "asc" })
        .range(from, to);
      if (empresaId) q = q.eq("empresa_id", empresaId);
      if (filterStatus) q = q.eq("status", filterStatus);
      if (filterEtapa) q = q.eq("etapa_ocorrencia", filterEtapa);
      if (filterPrioridade) q = q.eq("prioridade", filterPrioridade);
      if (filterCategoria) q = q.eq("categoria", filterCategoria);
      if (filterTipo) q = q.eq("tipo_ocorrencia", filterTipo);
      if (debouncedDataIni) q = q.gte("criado_em", `${debouncedDataIni}T00:00:00`);
      if (debouncedDataFim) q = q.lte("criado_em", `${debouncedDataFim}T23:59:59.999`);
      const { data, error, count } = await q;
      if (error) throw error;

      const rows = data || [];

      // Segundo fetch agrupado: número real dos documentos de origem da página
      const docNumeros: Record<string, string> = {};
      const entradaIds = rows
        .filter((r: any) => r.tipo_documento_origem === "DOCUMENTO_ENTRADA" && r.documento_origem_id)
        .map((r: any) => r.documento_origem_id);
      const saidaIds = rows
        .filter((r: any) => r.tipo_documento_origem === "DOCUMENTO_SAIDA" && r.documento_origem_id)
        .map((r: any) => r.documento_origem_id);
      const movEntradaIds = rows
        .filter((r: any) => r.tipo_documento_origem === "MOVIMENTO_ENTRADA" && r.documento_origem_id)
        .map((r: any) => r.documento_origem_id);
      const movSaidaIds = rows
        .filter((r: any) => r.tipo_documento_origem === "MOVIMENTO_SAIDA" && r.documento_origem_id)
        .map((r: any) => r.documento_origem_id);
      const movEntradaItemIds = rows
        .filter((r: any) => r.tipo_documento_origem === "MOVIMENTO_ENTRADA_ITEM" && r.documento_origem_id)
        .map((r: any) => r.documento_origem_id);

      const [entradas, saidas, movEntradas, movSaidas, movEntradaItems] = await Promise.all([
        entradaIds.length
          ? (supabase as any).from("documento_entrada").select("id, numero_nota").in("id", entradaIds)
          : Promise.resolve({ data: [] }),
        saidaIds.length
          ? (supabase as any).from("documento_saida").select("id, numero_pedido").in("id", saidaIds)
          : Promise.resolve({ data: [] }),
        movEntradaIds.length
          ? (supabase as any).from("movimento_entrada").select("id, numero_movimento").in("id", movEntradaIds)
          : Promise.resolve({ data: [] }),
        movSaidaIds.length
          ? (supabase as any).from("movimento_saida").select("id, numero_onda").in("id", movSaidaIds)
          : Promise.resolve({ data: [] }),
        movEntradaItemIds.length
          ? (supabase as any).from("movimento_entrada_item").select("id, movimento_entrada_id, movimento_entrada:movimento_entrada_id(numero_movimento)").in("id", movEntradaItemIds)
          : Promise.resolve({ data: [] }),
      ]);
      (entradas.data || []).forEach((d: any) => { docNumeros[d.id] = `NF ${d.numero_nota}`; });
      (saidas.data || []).forEach((d: any) => { docNumeros[d.id] = `Pedido ${d.numero_pedido}`; });
      (movEntradas.data || []).forEach((d: any) => { docNumeros[d.id] = `Mov. ${d.numero_movimento}`; });
      (movSaidas.data || []).forEach((d: any) => { docNumeros[d.id] = `Onda ${d.numero_onda}`; });
      (movEntradaItems.data || []).forEach((d: any) => {
        docNumeros[d.id] = `Mov. ${d.movimento_entrada?.numero_movimento ?? "—"}`;
      });

      // Contagem de anexos por ocorrência da página
      const anexoCount: Record<string, number> = {};
      if (rows.length) {
        const { data: anexosData } = await (supabase as any)
          .from("ocorrencia_anexo")
          .select("ocorrencia_id")
          .in("ocorrencia_id", rows.map((r: any) => r.id));
        (anexosData || []).forEach((a: any) => {
          anexoCount[a.ocorrencia_id] = (anexoCount[a.ocorrencia_id] || 0) + 1;
        });
      }

      return { rows, count: count || 0, docNumeros, anexoCount };

    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });

  const rows = listQuery.data?.rows ?? [];
  const docNumeros = listQuery.data?.docNumeros ?? {};
  const total = listQuery.data?.count ?? 0;
  const loading = listQuery.isLoading;

  useEffect(() => {
    if (listQuery.error) {
      const parsed = parseError(listQuery.error, "carregar ocorrencias");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Falha ao carregar ocorrências." : parsed.title);
    }
  }, [listQuery.error]);

  const filtered = useMemo(() => {
    const term = debouncedBusca.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r: any) => {
      const n = String(r.numero_ocorrencia ?? "");
      const sku = (r.produto?.sku || "").toLowerCase();
      const desc = (r.produto?.descricao || "").toLowerCase();
      return n.includes(term) || sku.includes(term) || desc.includes(term);
    });
  }, [rows, debouncedBusca]);

  const hasFilters = !!(filterStatus || filterEtapa || filterPrioridade || filterCategoria || filterTipo || busca || dataIni || dataFim);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limparFiltros = () => {
    setFilterStatus(""); setFilterEtapa(""); setFilterPrioridade(""); setFilterCategoria("");
    setFilterTipo(""); setBusca(""); setDataIni(""); setDataFim("");
    setPage(1);
  };

  const refresh = () => { kpisQuery.refetch(); listQuery.refetch(); };

  const toggleSort = (key: SortKey) => {
    if (orderBy === key) setOrderDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setOrderBy(key); setOrderDir("desc"); }
    setPage(1);
  };

  const confirmQuickAction = async () => {
    if (!quickTarget || !tenantId || !usuarioId) return;
    if (quickTarget.action === "RESOLVIDA" && !quickText.trim()) {
      toast.error("Descreva como a ocorrência foi resolvida.");
      return;
    }
    setQuickSaving(true);
    try {
      const patch: any = { status: quickTarget.action, updated_by: usuarioId };
      if (quickTarget.action === "RESOLVIDA") {
        patch.resolvido_por = usuarioId;
        patch.resolvido_em = new Date().toISOString();
        patch.resolucao = quickText.trim();
      } else if (quickText.trim()) {
        patch.observacao = quickText.trim();
      }
      const { error } = await (supabase as any)
        .from("ocorrencia_operacional")
        .update(patch)
        .eq("id", quickTarget.id)
        .eq("tenant_id", tenantId);
      if (error) throw error;
      toast.success("Ocorrência atualizada.");
      setQuickTarget(null);
      setQuickText("");
      refresh();
    } catch (err: any) {
      const p = parseError(err, "ocorrencias-quick-action");
      toast.error((!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Falha ao atualizar." : p.title);
    } finally {
      setQuickSaving(false);
    }
  };

  const inputClass = "h-9 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";

  const SortHeader = ({ label, sortKey, align = "left" }: { label: string; sortKey: SortKey; align?: "left" | "right" }) => (
    <th className={cn("px-3 py-2 font-medium", align === "right" ? "text-right" : "text-left")}>
      <button
        onClick={() => toggleSort(sortKey)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground transition-colors", orderBy === sortKey && "text-foreground")}
      >
        {label}
        {orderBy === sortKey && (orderDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
      </button>
    </th>
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Ocorrências operacionais</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Divergências e incidentes em todas as etapas da operação
          </p>
        </div>
        <div className="flex items-center gap-2">
          <RegistrarOcorrenciaButton
            contexto={{}}
            onSuccess={refresh}
          />
          <button
            onClick={refresh}
            className="h-9 px-3 rounded-md bg-secondary border border-border text-xs font-medium text-foreground hover:bg-secondary/80 flex items-center gap-1.5"
          >
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs — clicáveis como filtro rápido */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Kpi
          icon={<AlertTriangle size={16} />}
          label="Abertas"
          value={kpis.abertas}
          tone="red"
          active={filterStatus === "ABERTA"}
          onClick={() => setFilterStatus(filterStatus === "ABERTA" ? "" : "ABERTA")}
        />
        <Kpi
          icon={<ShieldAlert size={16} />}
          label="Em investigação"
          value={kpis.investigacao}
          tone="yellow"
          active={filterStatus === "EM_INVESTIGACAO"}
          onClick={() => setFilterStatus(filterStatus === "EM_INVESTIGACAO" ? "" : "EM_INVESTIGACAO")}
        />
        <Kpi
          icon={<Wrench size={16} />}
          label="Em tratamento"
          value={kpis.tratamento}
          tone="purple"
          active={filterStatus === "EM_TRATAMENTO"}
          onClick={() => setFilterStatus(filterStatus === "EM_TRATAMENTO" ? "" : "EM_TRATAMENTO")}
        />
        <Kpi
          icon={<CheckCircle2 size={16} />}
          label="Resolvidas hoje"
          value={kpis.resolvidasHoje}
          tone="green"
          active={filterStatus === "RESOLVIDA"}
          onClick={() => setFilterStatus(filterStatus === "RESOLVIDA" ? "" : "RESOLVIDA")}
        />
        <Kpi icon={<Clock size={16} />} label="Tempo médio (h)" value={kpis.tempoMedio} tone="blue" />
      </div>

      {/* Filtros */}
      <div className="card-surface p-3">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-foreground">Filtros</span>
          {hasFilters && (
            <button
              onClick={limparFiltros}
              className="ml-auto text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X size={12} /> Limpar filtros
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">Todos status</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterEtapa} onChange={(e) => { setFilterEtapa(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">Todas etapas</option>
            {Object.entries(ETAPA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterTipo} onChange={(e) => { setFilterTipo(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">Todos tipos</option>
            {Object.entries(TIPO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterPrioridade} onChange={(e) => { setFilterPrioridade(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">Todas prioridades</option>
            {Object.entries(PRIORIDADE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterCategoria} onChange={(e) => { setFilterCategoria(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">Todas categorias</option>
            {Object.entries(CATEGORIA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nº, SKU ou produto..."
              className={cn(inputClass, "w-full pl-8")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Criada de</label>
            <input
              type="date"
              value={dataIni}
              max={dataFim || undefined}
              onChange={(e) => { setDataIni(e.target.value); setPage(1); }}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Criada até</label>
            <input
              type="date"
              value={dataFim}
              min={dataIni || undefined}
              onChange={(e) => { setDataFim(e.target.value); setPage(1); }}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card-surface flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-12">
            <CheckCircle2 size={36} className="text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-foreground">Nenhuma ocorrência encontrada</p>
            <p className="text-xs text-muted-foreground mt-1">Ajuste os filtros ou aguarde novas ocorrências</p>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-secondary/40 text-muted-foreground sticky top-0 z-10">
                <tr>
                  <th className="w-1 p-0" />
                  <SortHeader label="Ocorrência" sortKey="numero_ocorrencia" />
                  <th className="text-left px-3 py-2 font-medium">Origem</th>
                  <th className="text-left px-3 py-2 font-medium">Motivo</th>
                  <th className="text-left px-3 py-2 font-medium">Categoria</th>
                  <SortHeader label="Status" sortKey="status" />
                  <SortHeader label="Tempo" sortKey="criado_em" />
                  <th className="text-right px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => {
                  const tempo = tempoRelativo(r.criado_em);
                  const numeroDoc = r.documento_origem_id ? docNumeros[r.documento_origem_id] : null;
                  const motivo = r.motivo_ocorrencia?.descricao || r.observacao || null;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        "border-t border-border/60 hover:bg-secondary/40 border-l-4",
                        urgencyBorder(r.prioridade, r.status),
                      )}
                    >
                      <td className="w-1 p-0" />

                      {/* Ocorrência */}
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-primary font-semibold">#{r.numero_ocorrencia}</span>
                          <span className={cn("px-1.5 py-0.5 rounded-full text-[9px] border", PRIORIDADE_BADGE[r.prioridade] || "bg-secondary/40 text-muted-foreground border-border")}>
                            {PRIORIDADE_LABEL[r.prioridade] ?? r.prioridade}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {(ETAPA_LABEL[r.etapa_ocorrencia] ?? r.etapa_ocorrencia)} · {(TIPO_LABEL[r.tipo_ocorrencia] ?? r.tipo_ocorrencia)}
                        </div>
                      </td>

                      {/* Origem */}
                      <td className="px-3 py-2 align-top max-w-[200px]">
                        {r.tipo_documento_origem && r.documento_origem_id ? (
                          <>
                            <div className="flex items-center gap-1 text-foreground">
                              <FileText size={12} className="text-muted-foreground" />
                              {TIPO_DOC_LABEL[r.tipo_documento_origem] ?? r.tipo_documento_origem}
                            </div>
                            <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
                              {numeroDoc ?? "—"}
                            </div>
                          </>
                        ) : r.produto_id ? (
                          <>
                            <div className="flex items-center gap-1 font-mono text-foreground">
                              <Package size={12} className="text-muted-foreground" />
                              {r.produto?.sku ?? "—"}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                              {r.produto?.descricao ?? ""}
                            </div>
                          </>
                        ) : r.endereco_id ? (
                          <div className="flex items-center gap-1 font-mono text-foreground">
                            <MapPin size={12} className="text-muted-foreground" />
                            {r.endereco?.descricao ?? "—"}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Motivo */}
                      <td className="px-3 py-2 align-top">
                        {motivo ? (
                          <span className="block max-w-[200px] truncate text-foreground" title={motivo}>{motivo}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Categoria */}
                      <td className="px-3 py-2 align-top">
                        {r.categoria ? (
                          <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] border", CATEGORIA_BADGE[r.categoria] || "bg-secondary/40 text-muted-foreground border-border")}>
                            {CATEGORIA_LABEL[r.categoria] ?? r.categoria}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>

                      {/* Status */}
                      <td className="px-3 py-2 align-top">
                        <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border", STATUS_BADGE[r.status])}>
                          {STATUS_ICON[r.status]}
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>

                      {/* Tempo */}
                      <td className="px-3 py-2 align-top">
                        <span className={cn("font-medium", tempo.cor)} title={formatDateTime(r.criado_em)}>
                          {tempo.texto}
                        </span>
                      </td>

                      {/* Ações */}
                      <td className="px-3 py-2 align-top text-right whitespace-nowrap">
                        <button
                          onClick={() => onNavigate(`/atividades/ocorrencias/${r.id}`)}
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                          title="Ver detalhes"
                        >
                          <Eye size={14} />
                        </button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                              title="Ações rápidas"
                            >
                              <MoreVertical size={14} />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            {r.status === "ABERTA" && (
                              <DropdownMenuItem onClick={() => { setQuickText(""); setQuickTarget({ id: r.id, numero: r.numero_ocorrencia, action: "EM_INVESTIGACAO" }); }}>
                                <Search size={12} className="mr-2" /> Iniciar investigação
                              </DropdownMenuItem>
                            )}
                            {r.status === "EM_INVESTIGACAO" && (
                              <DropdownMenuItem onClick={() => { setQuickText(""); setQuickTarget({ id: r.id, numero: r.numero_ocorrencia, action: "EM_TRATAMENTO" }); }}>
                                <Wrench size={12} className="mr-2" /> Iniciar tratamento
                              </DropdownMenuItem>
                            )}
                            {["ABERTA", "EM_INVESTIGACAO", "EM_TRATAMENTO"].includes(r.status) && (
                              <DropdownMenuItem onClick={() => { setQuickText(""); setQuickTarget({ id: r.id, numero: r.numero_ocorrencia, action: "RESOLVIDA" }); }}>
                                <CheckCircle2 size={12} className="mr-2" /> Resolver
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onNavigate(`/atividades/ocorrencias/${r.id}`)}>
                              <Eye size={12} className="mr-2" /> Ver detalhes
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="shrink-0 flex items-center justify-between px-3 py-2 border-t border-border">
          <p className="text-xs text-muted-foreground">{total} ocorrência(s) encontrada(s)</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1 rounded hover:bg-secondary disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-muted-foreground">{page}/{totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded hover:bg-secondary disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Dialog de ação rápida */}
      <Dialog open={!!quickTarget} onOpenChange={(o) => { if (!o) { setQuickTarget(null); setQuickText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {quickTarget?.action === "EM_INVESTIGACAO" && "Iniciar investigação"}
              {quickTarget?.action === "EM_TRATAMENTO" && "Iniciar tratamento"}
              {quickTarget?.action === "RESOLVIDA" && "Resolver ocorrência"}
              {quickTarget ? ` — #${quickTarget.numero}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {quickTarget?.action === "RESOLVIDA" ? "Descrição da resolução *" : "Observação (opcional)"}
            </label>
            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              rows={4}
              className="w-full p-2 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary resize-none"
              placeholder={quickTarget?.action === "RESOLVIDA" ? "Descreva como a ocorrência foi resolvida..." : "Informação adicional..."}
            />
          </div>
          <DialogFooter>
            <button
              onClick={() => { setQuickTarget(null); setQuickText(""); }}
              className="h-9 px-3 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
            <button
              onClick={confirmQuickAction}
              disabled={quickSaving}
              className="h-9 px-4 rounded-md bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {quickSaving && <Loader2 size={12} className="animate-spin" />} Confirmar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Kpi({
  icon, label, value, tone, active, onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "red" | "yellow" | "green" | "blue" | "purple";
  active?: boolean;
  onClick?: () => void;
}) {
  const toneClass: Record<string, string> = {
    red: "border-red-500/30 bg-red-500/5 text-red-400",
    yellow: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400",
    green: "border-green-500/30 bg-green-500/5 text-green-400",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-400",
    purple: "border-purple-500/30 bg-purple-500/5 text-purple-400",
  };
  const activeClass: Record<string, string> = {
    red: "ring-2 ring-red-500 bg-red-500/15",
    yellow: "ring-2 ring-yellow-500 bg-yellow-500/15",
    green: "ring-2 ring-green-500 bg-green-500/15",
    blue: "ring-2 ring-blue-500 bg-blue-500/15",
    purple: "ring-2 ring-purple-500 bg-purple-500/15",
  };

  const content = (
    <>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      </div>
      <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
    </>
  );

  if (!onClick) {
    return <div className={cn("rounded-lg border p-3", toneClass[tone])}>{content}</div>;
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border p-3 text-left cursor-pointer transition-transform hover:scale-[1.02]",
        toneClass[tone],
        active && activeClass[tone],
      )}
    >
      {content}
    </button>
  );
}
