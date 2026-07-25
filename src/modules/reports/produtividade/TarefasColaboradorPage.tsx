import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle, Package, Clock, Zap, ChevronUp, ChevronDown, ChevronsUpDown, Loader2 } from "lucide-react";
import { ReportHeader } from "../components/ReportHeader";
import {
  fetchTarefasColaborador,
  type TarefaColaboradorRow,
} from "./produtividade.service";
import {
  exportToExcel,
  exportToPdf,
  fmtNumberBR,
  fmtDateTimeBR,
  type ExportColumn,
} from "../utils/exporters";
import { formatDateTimeNaive, nowDisplay } from "@/utils/dateTime";
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from "@/components/ui/pagination";
import { parseError } from "@/lib/errorMapper";

interface Props {
  usuarioId: string;
  onNavigate?: (path: string) => void;
  dataInicio?: string;
  dataFim?: string;
}

const PAGE_SIZE = 20;

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDuracao(seg: number | null | undefined): string {
  if (!seg || seg <= 0) return "—";
  if (seg < 60) return `${Math.round(seg)}s`;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  const s = Math.floor(seg % 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min ${s}s`;
}

function truncar(s: string | null | undefined, n: number): string {
  if (!s) return "—";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function slugify(s: string): string {
  return (s || "operador")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

const STATUS_COLORS: Record<string, string> = {
  CONCLUIDA: "bg-green-500/10 text-green-400 border-green-500/20",
  CANCELADA: "bg-red-500/10 text-red-400 border-red-500/20",
  INICIADA: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ATRIBUIDA: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

type SortKey =
  | "atribuido_em" | "concluido_em" | "tipo_tarefa_descricao" | "tipo_tarefa_categoria" | "tarefa_id"
  | "produto_sku" | "produto_descricao" | "quantidade_requerida"
  | "quantidade_executada" | "quantidade_cortada" | "duracao_segundos"
  | "espera_segundos" | "endereco_origem" | "endereco_destino"
  | "status_execucao" | "lote";

export function TarefasColaboradorPage({ usuarioId, onNavigate, dataInicio: propInicio, dataFim: propFim }: Props) {
  const { tenantId, empresaId, empresaVersion, armazemId, usuarioNome } = useTenant();

  const [dataInicio, setDataInicio] = useState<string>(propInicio || diasAtras(7));
  const [dataFim, setDataFim] = useState<string>(propFim || hojeISO());
  const [tipoTarefaId, setTipoTarefaId] = useState<string>("");
  const [statusFiltro, setStatusFiltro] = useState<string>("");
  const [buscaSku, setBuscaSku] = useState<string>("");

  const [tiposTarefa, setTiposTarefa] = useState<{ id: string; descricao: string }[]>([]);
  const [rows, setRows] = useState<TarefaColaboradorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<string>("");

  const [sortKey, setSortKey] = useState<SortKey>("atribuido_em");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  // Carrega tipos de tarefa
  useEffect(() => {
    if (!tenantId) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("tipo_tarefa")
        .select("id, descricao")
        .eq("tenant_id", tenantId)
        .order("descricao");
      setTiposTarefa(data || []);
    })();
  }, [tenantId, empresaVersion]);

  const buscar = async () => {
    if (!tenantId || !usuarioId) return;
    if (!dataInicio || !dataFim) {
      toast.error("Período obrigatório.");
      return;
    }
    setLoading(true);
    try {
      const data = await fetchTarefasColaborador({
        tenant_id: tenantId,
        usuario_id: usuarioId,
        data_inicio: dataInicio,
        data_fim: dataFim,
        empresa_id: empresaId || null,
        armazem_id: armazemId || null,
        tipo_tarefa_id: tipoTarefaId || null,
        status: statusFiltro || null,
      });
      setRows(data);
      setGeneratedAt(nowDisplay());
      setPage(1);
    } catch (e: any) {
      const parsed = parseError(e, "carregar tarefas-colaborador");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao carregar tarefas." : parsed.title);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId && usuarioId) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, usuarioId, empresaId, empresaVersion, tipoTarefaId, statusFiltro]);

  const nomeOperador = rows[0]?.usuario_nome || "Operador";

  // Filtro client-side por SKU/produto
  const filtered = useMemo(() => {
    const q = buscaSku.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      (r.produto_sku || "").toLowerCase().includes(q) ||
      (r.produto_descricao || "").toLowerCase().includes(q)
    );
  }, [rows, buscaSku]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      const va: any = (a as any)[sortKey];
      const vb: any = (b as any)[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), "pt-BR") * dir;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
    setPage(1);
  };

  const kpis = useMemo(() => {
    const total = filtered.length;
    const itens = filtered.reduce((s, r) => s + Number(r.quantidade_executada || 0), 0);
    const tempo = filtered.reduce((s, r) => s + Number(r.duracao_segundos || 0), 0);
    const horas = tempo / 3600;
    const prodHora = horas > 0 ? itens / horas : 0;
    return { total, itens, tempo, prodHora };
  }, [filtered]);

  const totais = useMemo(() => {
    return {
      qtdReq: filtered.reduce((s, r) => s + Number(r.quantidade_requerida || 0), 0),
      qtdExec: filtered.reduce((s, r) => s + Number(r.quantidade_executada || 0), 0),
      qtdCort: filtered.reduce((s, r) => s + Number(r.quantidade_cortada || 0), 0),
      duracao: filtered.reduce((s, r) => s + Number(r.duracao_segundos || 0), 0),
      esperaMedia: filtered.length
        ? filtered.reduce((s, r) => s + Number(r.espera_segundos || 0), 0) / filtered.length
        : 0,
    };
  }, [filtered]);

  const exportColumns: ExportColumn[] = [
    { key: "atribuido_em", label: "Atribuição", format: (r) => fmtDateTimeBR(r.atribuido_em) },
    { key: "concluido_em", label: "Execução", format: (r) => (r.concluido_em ? fmtDateTimeBR(r.concluido_em) : "") },
    { key: "tipo_tarefa_descricao", label: "Tipo Tarefa" },
    { key: "tarefa_id", label: "ID Tarefa", format: (r) => (r.tarefa_id || "").slice(0, 8) },
    { key: "produto_sku", label: "SKU", format: (r) => r.produto_sku || "" },
    { key: "produto_descricao", label: "Produto", format: (r) => r.produto_descricao || "" },
    { key: "quantidade_requerida", label: "Qtd Req.", align: "right", format: (r) => fmtNumberBR(r.quantidade_requerida) },
    { key: "quantidade_executada", label: "Qtd Exec.", align: "right", format: (r) => fmtNumberBR(r.quantidade_executada) },
    { key: "quantidade_cortada", label: "Qtd Cort.", align: "right", format: (r) => fmtNumberBR(r.quantidade_cortada) },
    { key: "duracao_segundos", label: "Duração", align: "right", format: (r) => formatDuracao(r.duracao_segundos) },
    { key: "espera_segundos", label: "Espera", align: "right", format: (r) => formatDuracao(r.espera_segundos) },
    { key: "endereco_origem", label: "Origem", format: (r) => r.endereco_origem || "" },
    { key: "endereco_destino", label: "Destino", format: (r) => r.endereco_destino || "" },
    { key: "status_execucao", label: "Status" },
    { key: "lote", label: "Lote", format: (r) => r.lote || "" },
  ];

  const activeFilters: Record<string, string> = {
    "Período": `${dataInicio} a ${dataFim}`,
  };
  if (tipoTarefaId) {
    const t = tiposTarefa.find((x) => x.id === tipoTarefaId);
    if (t) activeFilters["Tipo"] = t.descricao;
  }
  if (statusFiltro) activeFilters["Status"] = statusFiltro;
  if (buscaSku) activeFilters["Busca"] = buscaSku;

  const filenameBase = `tarefas_operador_${slugify(nomeOperador)}_${dataInicio}_${dataFim}`;
  const canExport = !loading && sorted.length > 0;

  const handleExcel = () => exportToExcel(filenameBase, exportColumns, sorted);
  const handlePdf = () =>
    exportToPdf(filenameBase, exportColumns, sorted, {
      title: `Tarefas — ${nomeOperador}`,
      generatedAt: generatedAt || nowDisplay(),
      usuario: usuarioNome || "—",
      total: sorted.length,
      filters: activeFilters,
    });

  const goBack = () => {
    if (onNavigate) onNavigate("/relatorios/produtividade");
    else window.location.hash = "/relatorios/produtividade";
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Voltar */}
      <button
        onClick={goBack}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Voltar para Produtividade Operacional
      </button>

      <ReportHeader
        title={nomeOperador}
        subtitle={`Detalhamento de Tarefas — ${dataInicio} a ${dataFim}`}
        generatedAt={generatedAt || "—"}
        total={sorted.length}
        filters={activeFilters}
        onExportExcel={canExport ? handleExcel : undefined}
        onExportPdf={canExport ? handlePdf : undefined}
        exportDisabled={!canExport}
      />

      {/* Filtros */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <Field label="Data início">
            <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Data fim">
            <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Tipo de tarefa">
            <select value={tipoTarefaId} onChange={(e) => setTipoTarefaId(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              {tiposTarefa.map((t) => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select value={statusFiltro} onChange={(e) => setStatusFiltro(e.target.value)} className={inputCls}>
              <option value="">Todos</option>
              <option value="CONCLUIDA">Concluída</option>
              <option value="CANCELADA">Cancelada</option>
              <option value="INICIADA">Iniciada</option>
              <option value="ATRIBUIDA">Atribuída</option>
            </select>
          </Field>
          <Field label="Buscar SKU / Produto">
            <input
              type="text"
              value={buscaSku}
              onChange={(e) => { setBuscaSku(e.target.value); setPage(1); }}
              placeholder="SKU ou descrição"
              className={inputCls}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={buscar}
            disabled={loading}
            className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-2"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={<CheckCircle size={16} className="text-primary" />} label="Total de Tarefas" value={fmtNumberBR(kpis.total)} />
        <Kpi icon={<Package size={16} className="text-blue-400" />} label="Itens Movimentados" value={fmtNumberBR(Math.round(kpis.itens))} />
        <Kpi icon={<Clock size={16} className="text-emerald-400" />} label="Tempo Produtivo" value={formatDuracao(kpis.tempo)} />
        <Kpi icon={<Zap size={16} className="text-yellow-400" />} label="Produtividade/Hora" value={kpis.prodHora.toFixed(1).replace(".", ",")} />
      </div>

      {/* Tabela */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 size={32} className="animate-spin text-blue-400" />
            <span className="text-sm text-muted-foreground">Carregando tarefas...</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-sm text-muted-foreground">
            Nenhuma tarefa encontrada para o período/filtros.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground uppercase tracking-wider">
                    <Th k="atribuido_em" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Atribuição</Th>
                    <Th k="concluido_em" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Execução</Th>
                    <Th k="tipo_tarefa_descricao" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Tipo Tarefa</Th>
                    <Th k="tarefa_id" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>ID</Th>
                    <Th k="produto_sku" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>SKU</Th>
                    <Th k="produto_descricao" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Produto</Th>
                    <Th k="quantidade_requerida" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Qtd Req.</Th>
                    <Th k="quantidade_executada" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Qtd Exec.</Th>
                    <Th k="quantidade_cortada" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Qtd Cort.</Th>
                    <Th k="duracao_segundos" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Duração</Th>
                    <Th k="espera_segundos" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right">Espera</Th>
                    <Th k="endereco_origem" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Origem</Th>
                    <Th k="endereco_destino" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Destino</Th>
                    <Th k="status_execucao" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="center">Status</Th>
                    <Th k="lote" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort}>Lote</Th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => {
                    const cortadaAlerta = Number(r.quantidade_cortada || 0) > 0;
                    const esperaAlerta = Number(r.espera_segundos || 0) > 300;
                    const statusCls = STATUS_COLORS[r.status_execucao] || "bg-muted text-muted-foreground border-border";
                    return (
                      <tr key={r.execucao_id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 text-foreground whitespace-nowrap">{formatDateTimeNaive(r.atribuido_em)}</td>
                        <td className="px-3 py-2 text-foreground whitespace-nowrap">{r.concluido_em ? formatDateTimeNaive(r.concluido_em) : "—"}</td>
                        <td className="px-3 py-2 text-foreground">{r.tipo_tarefa_descricao || r.tipo_tarefa_codigo || "—"}</td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{(r.tarefa_id || "").slice(0, 8)}</td>
                        <td className="px-3 py-2 font-mono text-foreground">{r.produto_sku || "—"}</td>
                        <td className="px-3 py-2 text-foreground" title={r.produto_descricao || undefined}>{truncar(r.produto_descricao, 40)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtNumberBR(r.quantidade_requerida)}</td>
                        <td className="px-3 py-2 text-right font-mono">{fmtNumberBR(r.quantidade_executada)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${cortadaAlerta ? "text-red-400 font-semibold" : ""}`}>{fmtNumberBR(r.quantidade_cortada)}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatDuracao(r.duracao_segundos)}</td>
                        <td className={`px-3 py-2 text-right font-mono ${esperaAlerta ? "text-yellow-400 font-semibold" : ""}`}>{formatDuracao(r.espera_segundos)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.endereco_origem || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.endereco_destino || "—"}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-medium ${statusCls}`}>
                            {r.status_execucao}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{r.lote || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/40 font-semibold text-foreground">
                    <td className="px-3 py-2" colSpan={6}>Totais ({fmtNumberBR(filtered.length)} registros)</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNumberBR(Math.round(totais.qtdReq))}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtNumberBR(Math.round(totais.qtdExec))}</td>
                    <td className={`px-3 py-2 text-right font-mono ${totais.qtdCort > 0 ? "text-red-400" : ""}`}>{fmtNumberBR(Math.round(totais.qtdCort))}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatDuracao(totais.duracao)}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground" title="Média">{formatDuracao(totais.esperaMedia)}</td>
                    <td className="px-3 py-2" colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-border">
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={(e) => { e.preventDefault(); setPage(Math.max(1, page - 1)); }}
                        className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => (
                      <PaginationItem key={i}>
                        <PaginationLink
                          isActive={page === i + 1}
                          onClick={(e) => { e.preventDefault(); setPage(i + 1); }}
                          className="cursor-pointer"
                        >
                          {i + 1}
                        </PaginationLink>
                      </PaginationItem>
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={(e) => { e.preventDefault(); setPage(Math.min(totalPages, page + 1)); }}
                        className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const inputCls = "h-9 px-3 rounded-md border border-border bg-background text-sm text-foreground w-full";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-2xl font-bold font-mono mt-1 text-foreground">{value}</div>
    </div>
  );
}

function Th({
  k, sortKey, sortDir, onClick, children, align = "left",
}: {
  k: SortKey; sortKey: SortKey; sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void; children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  const active = sortKey === k;
  const Icon = active ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`px-3 py-2 font-medium text-${align} whitespace-nowrap`}>
      <button onClick={() => onClick(k)} className={`inline-flex items-center gap-1 ${justify} w-full hover:text-foreground transition-colors`}>
        {children}
        <Icon size={10} className={active ? "text-primary" : "text-muted-foreground/60"} />
      </button>
    </th>
  );
}
