import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useDebounce } from "@/hooks/useDebounce";
import { toast } from "sonner";
import {
  AlertTriangle, ShieldAlert, CheckCircle2, Clock, RefreshCw, Filter, Search,
  ChevronLeft, ChevronRight, Eye, Loader2, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/utils/dateTime";
import { RegistrarOcorrenciaButton } from "@/components/ocorrencia/RegistrarOcorrenciaButton";



interface Props {
  onNavigate: (path: string) => void;
}

const STATUS_BADGE: Record<string, string> = {
  ABERTA: "bg-red-500/15 text-red-400 border-red-500/30",
  EM_INVESTIGACAO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  EM_TRATAMENTO: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  RESOLVIDA: "bg-green-500/15 text-green-400 border-green-500/30",
  CANCELADA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta",
  EM_INVESTIGACAO: "Em investigação",
  EM_TRATAMENTO: "Em tratamento",
  RESOLVIDA: "Resolvida",
  CANCELADA: "Cancelada",
};

const CATEGORIA_BADGE: Record<string, string> = {
  PREVENTIVA: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CORRETIVA: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};
const CATEGORIA_LABEL: Record<string, string> = {
  PREVENTIVA: "Preventiva",
  CORRETIVA: "Corretiva",
};


const ETAPA_LABEL: Record<string, string> = {
  RECEBIMENTO: "Recebimento",
  ARMAZENAGEM: "Armazenagem",
  ABASTECIMENTO: "Abastecimento",
  MOVIMENTACAO: "Movimentação",
  SEPARACAO: "Separação",
  EXPEDICAO: "Expedição",
  INVENTARIO: "Inventário",
  AUDITORIA: "Auditoria",
};

const TIPO_LABEL: Record<string, string> = {
  FALTA: "Falta",
  SOBRA: "Sobra",
  AVARIA: "Avaria",
  DIVERGENCIA_INVENTARIO: "Divergência de inventário",
  EXTRAVIO: "Extravio",
  PRODUTO_INCORRETO: "Produto incorreto",
  VALIDADE_INCORRETA: "Validade incorreta",
  LOTE_INCORRETO: "Lote incorreto",
  OUTROS: "Outros",
};

const PRIORIDADE_CLASS: Record<string, string> = {
  BAIXA: "text-gray-400",
  NORMAL: "text-blue-400",
  ALTA: "text-yellow-400",
  CRITICA: "text-red-400",
};

const PAGE_SIZE = 15;

export function OcorrenciasOperacionaisPage({ onNavigate }: Props) {
  const { tenantId, empresaId } = useTenant();
  const [page, setPage] = useState(1);

  const [filterStatus, setFilterStatus] = useState("");
  const [filterEtapa, setFilterEtapa] = useState("");
  const [filterPrioridade, setFilterPrioridade] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [dataIni, setDataIni] = useState("");
  const [dataFim, setDataFim] = useState("");
  const debouncedDataIni = useDebounce(dataIni, 400);
  const debouncedDataFim = useDebounce(dataFim, 400);
  const [busca, setBusca] = useState("");
  const debouncedBusca = useDebounce(busca, 400);

  useEffect(() => {
    setPage(1);
  }, [tenantId, empresaId, filterStatus, filterEtapa, filterPrioridade, filterCategoria, debouncedBusca, debouncedDataIni, debouncedDataFim]);


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
    queryKey: ["ocorrencias-list", tenantId, empresaId, page, filterStatus, filterEtapa, filterPrioridade, debouncedDataIni, debouncedDataFim],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = (supabase as any)
        .from("ocorrencia_operacional")
        .select(`*,
          produto:produto_id(sku, descricao),
          motivo_ocorrencia:motivo_ocorrencia_id(descricao),
          usuario_criador:usuario!ocorrencia_operacional_criado_por_fkey(nome),
          usuario_resolvedor:usuario!ocorrencia_operacional_resolvido_por_fkey(nome)`,
          { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("criado_em", { ascending: false })
        .range(from, to);
      if (empresaId) q = q.eq("empresa_id", empresaId);
      if (filterStatus) q = q.eq("status", filterStatus);
      if (filterEtapa) q = q.eq("etapa_ocorrencia", filterEtapa);
      if (filterPrioridade) q = q.eq("prioridade", filterPrioridade);
      if (debouncedDataIni) q = q.gte("criado_em", `${debouncedDataIni}T00:00:00`);
      if (debouncedDataFim) q = q.lte("criado_em", `${debouncedDataFim}T23:59:59.999`);
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: data || [], count: count || 0 };
    },
    enabled: !!tenantId,
    staleTime: 30_000,
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.count ?? 0;
  const loading = listQuery.isLoading;

  useEffect(() => {
    if (listQuery.error) toast.error((listQuery.error as Error).message || "Falha ao carregar ocorrências.");
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

  const hasFilters = !!(filterStatus || filterEtapa || filterPrioridade || busca || dataIni || dataFim);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const limparFiltros = () => {
    setFilterStatus(""); setFilterEtapa(""); setFilterPrioridade(""); setBusca("");
    setDataIni(""); setDataFim("");
    setPage(1);
  };

  const refresh = () => { kpisQuery.refetch(); listQuery.refetch(); };

  const inputClass = "h-9 px-3 rounded-md border border-border bg-secondary/40 text-xs text-foreground outline-none focus:border-primary";


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
        <button
          onClick={refresh}
          className="h-9 px-3 rounded-md bg-secondary border border-border text-xs font-medium text-foreground hover:bg-secondary/80 flex items-center gap-1.5"
        >
          <RefreshCw size={12} /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<AlertTriangle size={16} />} label="Abertas" value={kpis.abertas} tone="red" />
        <Kpi icon={<ShieldAlert size={16} />} label="Em investigação" value={kpis.investigacao} tone="yellow" />
        <Kpi icon={<CheckCircle2 size={16} />} label="Resolvidas hoje" value={kpis.resolvidasHoje} tone="green" />
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
          <select value={filterPrioridade} onChange={(e) => { setFilterPrioridade(e.target.value); setPage(1); }} className={inputClass}>
            <option value="">Todas prioridades</option>
            <option value="BAIXA">Baixa</option>
            <option value="NORMAL">Normal</option>
            <option value="ALTA">Alta</option>
            <option value="CRITICA">Crítica</option>
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
              <thead className="bg-secondary/40 text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Nº</th>
                  <th className="text-left px-3 py-2 font-medium">Etapa</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Produto</th>
                  <th className="text-right px-3 py-2 font-medium">Divergência</th>
                  <th className="text-left px-3 py-2 font-medium">Prioridade</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Criada em</th>
                  <th className="text-right px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const divQty = Number(r.quantidade_divergente) || 0;
                  return (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-secondary/40">
                      <td className="px-3 py-2 font-mono text-primary">#{r.numero_ocorrencia}</td>
                      <td className="px-3 py-2 text-foreground">{ETAPA_LABEL[r.etapa_ocorrencia] ?? r.etapa_ocorrencia}</td>
                      <td className="px-3 py-2 text-foreground">{TIPO_LABEL[r.tipo_ocorrencia] ?? r.tipo_ocorrencia}</td>
                      <td className="px-3 py-2 max-w-[260px] truncate">
                        <span className="font-mono text-muted-foreground mr-1">{r.produto?.sku ?? "—"}</span>
                        <span className="text-foreground">{r.produto?.descricao ?? ""}</span>
                      </td>
                      <td className={cn("px-3 py-2 text-right font-mono", divQty > 0 && "text-red-400")}>{divQty}</td>
                      <td className={cn("px-3 py-2 font-medium", PRIORIDADE_CLASS[r.prioridade] || "")}>{r.prioridade}</td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-[10px] border", STATUS_BADGE[r.status])}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDateTime(r.criado_em)}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => onNavigate(`/atividades/ocorrencias/${r.id}`)}
                          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
                          title="Ver detalhes"
                        >
                          <Eye size={14} />
                        </button>
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
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "red" | "yellow" | "green" | "blue" }) {
  const toneClass: Record<string, string> = {
    red: "border-red-500/30 bg-red-500/5 text-red-400",
    yellow: "border-yellow-500/30 bg-yellow-500/5 text-yellow-400",
    green: "border-green-500/30 bg-green-500/5 text-green-400",
    blue: "border-blue-500/30 bg-blue-500/5 text-blue-400",
  };
  return (
    <div className={cn("rounded-lg border p-3", toneClass[tone])}>
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
      </div>
      <p className="text-2xl font-bold mt-1 text-foreground">{value}</p>
    </div>
  );
}
