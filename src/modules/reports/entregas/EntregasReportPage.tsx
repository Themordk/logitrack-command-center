import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { colTextoLongo } from "../components/reportColumns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, ChevronLeft, ChevronRight, Filter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateTimeBR, type ExportColumn } from "../utils/exporters";
import {
  ENTREGAS_PAGE_SIZE,
  ROTULO_RESULTADO,
  fetchEntregasTentativasAll,
  fetchEntregasTentativasPage,
  pctTexto,
  textoResultado,
  type EntregaTentativaRow,
  type EntregasTentativasFiltro,
  type EntregasTentativasResumo,
  type ResultadoEntregaRelatorio,
} from "./entregas.service";
import { EntregasFiltrosBase, SelectOpcao } from "./EntregasFiltros";
import { filtrosIniciais, rotuloOpcao, useOpcoesFiltroEntregas } from "./filtrosEntregas";

const OPCOES_RESULTADO = (Object.keys(ROTULO_RESULTADO) as ResultadoEntregaRelatorio[])
  .map((value) => ({ value, label: ROTULO_RESULTADO[value] }));

const TOM_RESULTADO: Record<ResultadoEntregaRelatorio, string> = {
  ENTREGUE: "bg-[hsl(var(--status-free))]/15 text-[hsl(var(--status-free))]",
  NAO_ENTREGUE: "bg-destructive/15 text-destructive",
  PENDENTE: "bg-[hsl(var(--status-busy))]/15 text-[hsl(var(--status-busy))]",
  NAO_VISITADA: "bg-muted text-muted-foreground",
};

export function EntregasReportPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const opcoes = useOpcoesFiltroEntregas(tenantId, empresaId, empresaVersion);

  const [base, setBase] = useState(filtrosIniciais);
  const [resultado, setResultado] = useState("");
  const [motivoId, setMotivoId] = useState("");
  const [incluirEstornadas, setIncluirEstornadas] = useState(false);

  const [data, setData] = useState<EntregaTentativaRow[]>([]);
  const [resumo, setResumo] = useState<EntregasTentativasResumo | null>(null);
  const [aplicado, setAplicado] = useState<EntregasTentativasFiltro | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => {
    setData([]); setResumo(null); setAplicado(null); setPage(0); setGenerated(false);
    setBase(filtrosIniciais()); setResultado(""); setMotivoId("");
  }, [empresaId, empresaVersion]);

  const loadPage = async (f: EntregasTentativasFiltro, p: number) => {
    setLoading(true);
    try {
      const r = await fetchEntregasTentativasPage(f, p);
      setData(r.rows); setResumo(r.resumo); setPage(p);
      return true;
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao gerar relatório.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!empresaId) { toast.error("Selecione uma empresa para gerar o relatório."); return; }
    if (base.dataInicio && base.dataFim && base.dataFim < base.dataInicio) {
      toast.error("A data final não pode ser anterior à data inicial.");
      return;
    }
    const f: EntregasTentativasFiltro = {
      tenant_id: tenantId, empresa_id: empresaId,
      data_inicio: base.dataInicio || undefined, data_fim: base.dataFim || undefined,
      usuario_id: base.usuarioId || undefined, veiculo_id: base.veiculoId || undefined,
      parceiro_id: base.parceiroId || undefined,
      resultado: (resultado || undefined) as ResultadoEntregaRelatorio | undefined,
      motivo_id: motivoId || undefined,
      incluir_estornadas: incluirEstornadas,
    };
    if (await loadPage(f, 0)) { setAplicado(f); setGeneratedAt(nowDisplay()); setGenerated(true); }
  };

  const handleClear = () => { setBase(filtrosIniciais()); setResultado(""); setMotivoId(""); setIncluirEstornadas(false); };

  const nada = <span className="text-muted-foreground">—</span>;
  const columns: ReportColumn[] = [
    { key: "data_evento", label: "Data/hora", width: "120px", render: (v) => formatDateTime(v) },
    {
      key: "resultado", label: "Resultado", width: "130px",
      render: (_v, r: EntregaTentativaRow) => (
        <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold", TOM_RESULTADO[r.resultado], r.estornada && "line-through opacity-70")}
          title={r.estornada ? `Estornada${r.motivo_estorno ? `: ${r.motivo_estorno}` : ""}` : undefined}>
          {textoResultado(r)}
        </span>
      ),
    },
    { key: "numero_carga", label: "Carga", width: "70px", render: (v) => <span className="font-mono">{v}</span> },
    { key: "numero_saida", label: "Saída", width: "55px", align: "center", render: (v) => `${v}ª` },
    { key: "sequencia_parada", label: "Parada", width: "60px", align: "center" },
    { key: "numero_tentativa", label: "Tent.", width: "50px", align: "center", render: (v) => (v ? `${v}ª` : nada) },
    { key: "numero_pedido", label: "Pedido", width: "90px", render: (v) => <span className="font-mono">{v || "—"}</span> },
    { key: "numero_nf", label: "NF", width: "80px", render: (v) => <span className="font-mono">{v || "—"}</span> },
    colTextoLongo({ key: "cliente", label: "Cliente", minWidth: 170, maxWidth: 240 }),
    { key: "cidade", label: "Cidade", width: "110px", render: (v, r) => [r.bairro, v].filter(Boolean).join(" · ") || "—" },
    { key: "entregador", label: "Entregador", width: "130px", render: (v) => v || "—" },
    { key: "veiculo", label: "Veículo", width: "120px", render: (v) => v || "—" },
    colTextoLongo({ key: "motivo", label: "Motivo", minWidth: 150, maxWidth: 220 }),
    colTextoLongo({ key: "ressalvas", label: "Ressalvas", minWidth: 130, maxWidth: 200 }),
    { key: "ocorrencia_numero", label: "Ocorrência", width: "80px", render: (v) => (v ? <span className="font-mono">#{v}</span> : nada) },
    { key: "recebedor_nome", label: "Recebedor", width: "120px", render: (v) => v || "—" },
    { key: "tem_foto", label: "Foto", width: "50px", align: "center", render: (v, r) => (r.tipo_linha === "TENTATIVA" ? (v ? "Sim" : "Não") : nada) },
    { key: "fora_de_ordem", label: "Fora de ordem", width: "80px", align: "center", render: (v) => (v ? "Sim" : "") },
    { key: "estornada_por", label: "Estorno", width: "140px", render: (_v, r) => (r.estornada ? `${r.estornada_por ?? "—"} · ${formatDateTime(r.estornada_em)}` : "") },
  ];

  const total = resumo?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / ENTREGAS_PAGE_SIZE));

  const activeFilters: Record<string, string> = {};
  if (base.dataInicio || base.dataFim) {
    activeFilters["Período"] = `${base.dataInicio ? formatDate(base.dataInicio) : "…"} a ${base.dataFim ? formatDate(base.dataFim) : "…"}`;
  }
  if (base.usuarioId) activeFilters["Entregador"] = rotuloOpcao(opcoes.entregadores, base.usuarioId);
  if (base.veiculoId) activeFilters["Veículo"] = rotuloOpcao(opcoes.veiculos, base.veiculoId);
  if (base.parceiroId) activeFilters["Cliente"] = base.parceiroNome || base.parceiroId;
  if (resultado) activeFilters["Resultado"] = ROTULO_RESULTADO[resultado as ResultadoEntregaRelatorio];
  if (motivoId) activeFilters["Motivo"] = rotuloOpcao(opcoes.motivos, motivoId);
  if (incluirEstornadas) activeFilters["Estornadas"] = "Incluídas";

  const exportColumns: ExportColumn[] = [
    { key: "data_evento", label: "Data/hora", format: (r) => fmtDateTimeBR(r.data_evento) },
    { key: "resultado", label: "Resultado", format: (r) => textoResultado(r) },
    { key: "numero_carga", label: "Carga" },
    { key: "numero_saida", label: "Saída", align: "center" },
    { key: "sequencia_parada", label: "Parada", align: "center" },
    { key: "numero_tentativa", label: "Tentativa", align: "center" },
    { key: "numero_pedido", label: "Pedido" },
    { key: "numero_nf", label: "NF" },
    { key: "cliente", label: "Cliente" },
    { key: "bairro", label: "Bairro" },
    { key: "cidade", label: "Cidade" },
    { key: "entregador", label: "Entregador" },
    { key: "veiculo", label: "Veículo" },
    { key: "motivo", label: "Motivo" },
    { key: "ressalvas", label: "Ressalvas" },
    { key: "ocorrencia_numero", label: "Ocorrência" },
    { key: "recebedor_nome", label: "Recebedor" },
    { key: "tem_foto", label: "Foto", format: (r) => (r.tipo_linha === "TENTATIVA" ? (r.tem_foto ? "Sim" : "Não") : "") },
    { key: "fora_de_ordem", label: "Fora de ordem", format: (r) => (r.fora_de_ordem ? "Sim" : "") },
    { key: "atribuida_em", label: "Atribuída em", format: (r) => fmtDateTimeBR(r.atribuida_em) },
    { key: "aceita_em", label: "Aceita em", format: (r) => fmtDateTimeBR(r.aceita_em) },
    { key: "estornada_em", label: "Estornada em", format: (r) => fmtDateTimeBR(r.estornada_em) },
    { key: "estornada_por", label: "Estornada por" },
    { key: "motivo_estorno", label: "Motivo do estorno" },
  ];

  const canExport = generated && total > 0 && !exporting;
  const loadAll = async (): Promise<EntregaTentativaRow[] | null> => {
    if (!aplicado) return null;
    if (total <= data.length) return data;
    setExporting(true);
    try { return await fetchEntregasTentativasAll(aplicado, total); }
    catch (err: any) { console.error(err); toast.error(err?.message || "Erro ao carregar dados para exportação."); return null; }
    finally { setExporting(false); }
  };
  const handleExcel = async () => { const rows = await loadAll(); if (rows) exportToExcel("entregas_tentativas", exportColumns, rows); };
  const handlePdf = async () => {
    const rows = await loadAll();
    if (rows) exportToPdf("entregas_tentativas", exportColumns, rows, {
      title: "Saídas e Tentativas de Entrega", generatedAt, usuario: usuarioNome || "—", total: rows.length, filters: activeFilters,
    });
  };

  const fmt = (v: number) => v.toLocaleString("pt-BR");
  const cards = resumo ? [
    { label: "Tentativas", value: fmt(resumo.tentativas), sub: `${fmt(resumo.pedidos)} pedidos`, tone: "text-foreground" },
    { label: "Entregues", value: fmt(resumo.entregues), sub: `${pctTexto(resumo.entregues, resumo.tentativas)} das tentativas`, tone: "text-[hsl(var(--status-free))]" },
    { label: "Não entregues", value: fmt(resumo.nao_entregues), sub: `${pctTexto(resumo.nao_entregues, resumo.tentativas)} das tentativas`, tone: resumo.nao_entregues > 0 ? "text-destructive" : "text-foreground" },
    { label: "1ª tentativa", value: pctTexto(resumo.entregues_primeira, resumo.pedidos_entregues), sub: `${fmt(resumo.entregues_primeira)} de ${fmt(resumo.pedidos_entregues)} entregues`, tone: "text-foreground", hint: "Pedidos entregues já na primeira tentativa" },
    { label: "Pendentes / não visitadas", value: `${fmt(resumo.pendentes)} / ${fmt(resumo.nao_visitadas)}`, sub: "em rota · saída cancelada", tone: "text-[hsl(var(--status-busy))]", hint: "Paradas sem tentativa: ainda em rota, ou de saída cancelada/encerrada sem passar no cliente" },
    { label: "Com ressalva", value: fmt(resumo.com_ressalva), sub: `${fmt(resumo.fora_de_ordem)} fora de ordem${resumo.estornadas ? ` · ${fmt(resumo.estornadas)} estornadas` : ""}`, tone: "text-foreground" },
  ] : [];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Saídas e Tentativas de Entrega"
        subtitle="Todas as tentativas na porta do cliente, deram certo ou não, e as paradas que ficaram sem visita"
        generatedAt={generated ? generatedAt : "—"}
        total={generated ? total : undefined}
        filters={generated ? activeFilters : undefined}
        onExportExcel={canExport ? handleExcel : undefined}
        onExportPdf={canExport ? handlePdf : undefined}
        onPrint={canExport ? () => window.print() : undefined}
        exportDisabled={!canExport}
      />

      <div className="border border-border rounded-lg bg-card overflow-hidden print:hidden">
        <button onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-secondary/50 transition-colors">
          <span className="flex items-center gap-2"><Filter size={14} /> Filtros</span>
          <span className="text-muted-foreground">{showFilters ? "Ocultar" : "Mostrar"}</span>
        </button>
        {showFilters && (
          <div className="border-t border-border p-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <EntregasFiltrosBase valor={base} onChange={setBase} opcoes={opcoes} tenantId={tenantId} empresaId={empresaId} />
              <SelectOpcao label="Resultado" value={resultado} onChange={setResultado} opcoes={OPCOES_RESULTADO} />
              <SelectOpcao label="Motivo (falha ou ressalva)" value={motivoId} onChange={setMotivoId} opcoes={opcoes.motivos} />
              <div className="space-y-1.5">
                <Label className="text-xs">Tentativas estornadas</Label>
                <div className="flex items-center gap-2 h-8">
                  <Switch checked={incluirEstornadas} onCheckedChange={setIncluirEstornadas} />
                  <span className="text-xs text-muted-foreground">{incluirEstornadas ? "Mostrar" : "Ocultar"}</span>
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cada registro na porta do cliente é uma linha e nunca é apagado. Estornos ficam marcados; reentregas aparecem como 2ª, 3ª tentativa.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={loading}><Search size={14} />{loading ? "Gerando..." : "Gerar Relatório"}</Button>
              <Button size="sm" variant="outline" onClick={handleClear}><X size={14} />Limpar</Button>
              {onNavigate && <Button size="sm" variant="outline" onClick={() => onNavigate("/")}><ArrowLeft size={14} />Voltar</Button>}
            </div>
          </div>
        )}
      </div>

      {generated && resumo && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 print:hidden">
          {cards.map((c) => (
            <div key={c.label} className="border border-border rounded-lg bg-card px-3 py-2" title={c.hint}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
              <div className={cn("text-sm font-bold tabular-nums", c.tone)}>{c.value}</div>
              {c.sub && <div className="text-[10px] text-muted-foreground tabular-nums truncate">{c.sub}</div>}
            </div>
          ))}
        </div>
      )}

      {generated && <ReportTable columns={columns} data={data} loading={loading || exporting} />}

      {generated && total > ENTREGAS_PAGE_SIZE && aplicado && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground print:hidden">
          <span>
            {(page * ENTREGAS_PAGE_SIZE + 1).toLocaleString("pt-BR")}–{Math.min((page + 1) * ENTREGAS_PAGE_SIZE, total).toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={loading || page === 0} onClick={() => loadPage(aplicado, page - 1)}><ChevronLeft size={14} /></Button>
          <span>Página {page + 1} de {totalPaginas}</span>
          <Button size="sm" variant="outline" className="h-7 px-2" disabled={loading || page + 1 >= totalPaginas} onClick={() => loadPage(aplicado, page + 1)}><ChevronRight size={14} /></Button>
        </div>
      )}
    </div>
  );
}
