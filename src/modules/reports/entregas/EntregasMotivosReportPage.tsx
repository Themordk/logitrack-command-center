import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Filter, Search, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDate, nowDisplay } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateBR, type ExportColumn } from "../utils/exporters";
import {
  fetchEntregasMotivos,
  pctTexto,
  type EntregaGrupoLinha,
  type EntregaMotivoLinha,
  type EntregasFiltro,
  type EntregasMotivosRelatorio,
} from "./entregas.service";
import { EntregasFiltrosBase } from "./EntregasFiltros";
import { filtrosIniciais, rotuloOpcao, useOpcoesFiltroEntregas } from "./filtrosEntregas";

type Visao = "MOTIVO" | "ENTREGADOR" | "CLIENTE" | "DIA";
const VISOES: { id: Visao; label: string }[] = [
  { id: "MOTIVO", label: "Por motivo" },
  { id: "ENTREGADOR", label: "Por entregador" },
  { id: "CLIENTE", label: "Por cliente" },
  { id: "DIA", label: "Por dia" },
];

const fmt = (v: number) => v.toLocaleString("pt-BR");

function Barra({ valor, max, tom }: { valor: number; max: number; tom: string }) {
  const w = max > 0 ? Math.max(2, Math.round((valor / max) * 100)) : 0;
  return (
    <div className="h-2 w-full rounded bg-muted overflow-hidden">
      <div className={cn("h-full rounded", tom)} style={{ width: `${w}%` }} />
    </div>
  );
}

export function EntregasMotivosReportPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const { tenantId, empresaId, empresaVersion, usuarioNome } = useTenant();
  const opcoes = useOpcoesFiltroEntregas(tenantId, empresaId, empresaVersion);
  const [base, setBase] = useState(filtrosIniciais);
  const [rel, setRel] = useState<EntregasMotivosRelatorio | null>(null);
  const [visao, setVisao] = useState<Visao>("MOTIVO");
  const [loading, setLoading] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [showFilters, setShowFilters] = useState(true);

  useEffect(() => { setRel(null); setBase(filtrosIniciais()); }, [empresaId, empresaVersion]);

  const handleGenerate = async () => {
    if (!tenantId) return;
    if (!empresaId) { toast.error("Selecione uma empresa para gerar o relatório."); return; }
    if (base.dataInicio && base.dataFim && base.dataFim < base.dataInicio) {
      toast.error("A data final não pode ser anterior à data inicial.");
      return;
    }
    const f: EntregasFiltro = {
      tenant_id: tenantId, empresa_id: empresaId,
      data_inicio: base.dataInicio || undefined, data_fim: base.dataFim || undefined,
      usuario_id: base.usuarioId || undefined, veiculo_id: base.veiculoId || undefined, parceiro_id: base.parceiroId || undefined,
    };
    setLoading(true);
    try {
      setRel(await fetchEntregasMotivos(f));
      setGeneratedAt(nowDisplay());
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "Erro ao gerar relatório.");
    } finally {
      setLoading(false);
    }
  };

  const activeFilters: Record<string, string> = {};
  if (base.dataInicio || base.dataFim) {
    activeFilters["Período"] = `${base.dataInicio ? formatDate(base.dataInicio) : "…"} a ${base.dataFim ? formatDate(base.dataFim) : "…"}`;
  }
  if (base.usuarioId) activeFilters["Entregador"] = rotuloOpcao(opcoes.entregadores, base.usuarioId);
  if (base.veiculoId) activeFilters["Veículo"] = rotuloOpcao(opcoes.veiculos, base.veiculoId);
  if (base.parceiroId) activeFilters["Cliente"] = base.parceiroNome || base.parceiroId;
  activeFilters["Visão"] = VISOES.find((v) => v.id === visao)!.label;

  const r = rel?.resumo;
  const falhas = rel?.motivos.filter((m) => m.tipo === "FALHA") ?? [];
  const ressalvas = rel?.motivos.filter((m) => m.tipo === "RESSALVA") ?? [];
  const maxFalha = Math.max(0, ...falhas.map((m) => m.quantidade));
  const maxRessalva = Math.max(0, ...ressalvas.map((m) => m.quantidade));

  // ---------- colunas por visão ----------
  const colsMotivo = (max: number, tom: string): ReportColumn[] => [
    { key: "motivo", label: "Motivo", width: "240px", wrap: true },
    { key: "quantidade", label: "Ocorrências", width: "90px", align: "right", render: (v) => fmt(v) },
    { key: "pct", label: "% das falhas", width: "90px", align: "right", render: (v) => (v == null ? "—" : `${String(v).replace(".", ",")}%`) },
    { key: "barra", label: "", width: "160px", render: (_v, m: EntregaMotivoLinha) => <Barra valor={m.quantidade} max={max} tom={tom} /> },
    { key: "pedidos", label: "Pedidos", width: "70px", align: "right", render: (v) => fmt(v) },
    { key: "clientes", label: "Clientes", width: "70px", align: "right", render: (v) => fmt(v) },
    { key: "entregadores", label: "Entregadores", width: "90px", align: "right", render: (v) => fmt(v) },
  ];
  const colsGrupo = (rotulo: string, extra: ReportColumn[]): ReportColumn[] => [
    { key: "nome", label: rotulo, width: "220px", wrap: true },
    { key: "tentativas", label: "Tentativas", width: "80px", align: "right", render: (v) => fmt(v) },
    { key: "entregues", label: "Entregues", width: "80px", align: "right", render: (v) => fmt(v) },
    { key: "nao_entregues", label: "Não entregues", width: "90px", align: "right",
      render: (v) => <span className={cn(v > 0 && "text-destructive font-semibold")}>{fmt(v)}</span> },
    { key: "sucesso", label: "% sucesso", width: "80px", align: "right", render: (_v, g: EntregaGrupoLinha) => pctTexto(g.entregues, g.tentativas) },
    ...extra,
    { key: "principal_motivo", label: "Principal motivo de falha", width: "200px", wrap: true, render: (v) => v || "—" },
  ];
  const colsEntregador = colsGrupo("Entregador", [
    { key: "entregues_primeira", label: "Entregues na 1ª", width: "90px", align: "right", render: (v) => fmt(v ?? 0) },
    { key: "com_ressalva", label: "Com ressalva", width: "80px", align: "right", render: (v) => fmt(v ?? 0) },
  ]);
  const colsCliente = colsGrupo("Cliente", [
    { key: "pedidos", label: "Pedidos", width: "70px", align: "right", render: (v) => fmt(v ?? 0) },
  ]);
  const colsDia: ReportColumn[] = [
    { key: "dia", label: "Dia", width: "100px", render: (v) => formatDate(v) },
    { key: "tentativas", label: "Tentativas", width: "80px", align: "right", render: (v) => fmt(v) },
    { key: "entregues", label: "Entregues", width: "80px", align: "right", render: (v) => fmt(v) },
    { key: "nao_entregues", label: "Não entregues", width: "90px", align: "right", render: (v) => fmt(v) },
    { key: "sucesso", label: "% sucesso", width: "80px", align: "right", render: (_v, d) => pctTexto(d.entregues, d.tentativas) },
  ];

  // ---------- exportação (a visão aberta) ----------
  const exportar = (): { cols: ExportColumn[]; rows: any[]; nome: string } | null => {
    if (!rel) return null;
    const pctExp = (g: any) => pctTexto(g.entregues, g.tentativas);
    if (visao === "MOTIVO") return {
      nome: "entregas_por_motivo",
      rows: rel.motivos,
      cols: [
        { key: "tipo", label: "Tipo", format: (m) => (m.tipo === "FALHA" ? "Falha (não entregue)" : "Ressalva (entregue)") },
        { key: "motivo", label: "Motivo" },
        { key: "quantidade", label: "Ocorrências", align: "right" },
        { key: "pct", label: "% das falhas", align: "right", format: (m) => (m.pct == null ? "" : `${String(m.pct).replace(".", ",")}%`) },
        { key: "pedidos", label: "Pedidos", align: "right" },
        { key: "clientes", label: "Clientes", align: "right" },
        { key: "entregadores", label: "Entregadores", align: "right" },
      ],
    };
    if (visao === "DIA") return {
      nome: "entregas_por_dia", rows: rel.por_dia,
      cols: [
        { key: "dia", label: "Dia", format: (d) => fmtDateBR(d.dia) },
        { key: "tentativas", label: "Tentativas", align: "right" },
        { key: "entregues", label: "Entregues", align: "right" },
        { key: "nao_entregues", label: "Não entregues", align: "right" },
        { key: "sucesso", label: "% sucesso", align: "right", format: pctExp },
      ],
    };
    const ent = visao === "ENTREGADOR";
    return {
      nome: ent ? "entregas_por_entregador" : "entregas_por_cliente",
      rows: ent ? rel.por_entregador : rel.por_cliente,
      cols: [
        { key: "nome", label: ent ? "Entregador" : "Cliente" },
        { key: "tentativas", label: "Tentativas", align: "right" },
        { key: "entregues", label: "Entregues", align: "right" },
        { key: "nao_entregues", label: "Não entregues", align: "right" },
        { key: "sucesso", label: "% sucesso", align: "right", format: pctExp },
        ...(ent
          ? [{ key: "entregues_primeira", label: "Entregues na 1ª", align: "right" as const },
             { key: "com_ressalva", label: "Com ressalva", align: "right" as const }]
          : [{ key: "pedidos", label: "Pedidos", align: "right" as const }]),
        { key: "principal_motivo", label: "Principal motivo de falha" },
      ],
    };
  };
  const linhasVisao = !rel ? 0 : visao === "MOTIVO" ? rel.motivos.length : visao === "DIA" ? rel.por_dia.length
    : visao === "ENTREGADOR" ? rel.por_entregador.length : rel.por_cliente.length;
  const canExport = !!rel && linhasVisao > 0;
  const handleExcel = () => { const e = exportar(); if (e) exportToExcel(e.nome, e.cols, e.rows); };
  const handlePdf = () => {
    const e = exportar();
    if (e) exportToPdf(e.nome, e.cols, e.rows, {
      title: "Entregas por Motivo", generatedAt, usuario: usuarioNome || "—", total: e.rows.length, filters: activeFilters,
    });
  };

  const cards = r ? [
    { label: "Tentativas", value: fmt(r.tentativas), sub: `${fmt(r.pedidos)} pedidos · ${fmt(r.clientes)} clientes`, tone: "text-foreground" },
    { label: "Deram certo", value: fmt(r.entregues), sub: `${pctTexto(r.entregues, r.tentativas)} das tentativas`, tone: "text-[hsl(var(--status-free))]" },
    { label: "Deram errado", value: fmt(r.nao_entregues), sub: `${pctTexto(r.nao_entregues, r.tentativas)} das tentativas`, tone: r.nao_entregues > 0 ? "text-destructive" : "text-foreground" },
    { label: "Entregue na 1ª", value: pctTexto(r.entregues_primeira, r.pedidos_entregues), sub: `${fmt(r.entregues_primeira)} de ${fmt(r.pedidos_entregues)} pedidos entregues`, tone: "text-foreground", hint: "Pedidos entregues sem precisar de reentrega" },
    { label: "Com ressalva", value: fmt(r.com_ressalva), sub: `${pctTexto(r.com_ressalva, r.entregues)} das entregas`, tone: "text-foreground", hint: "Entregas que tiveram ocorrência informativa (ex.: avaria parcial)" },
    { label: "Não visitadas", value: fmt(r.nao_visitadas), sub: `${fmt(r.fora_de_ordem)} fora de ordem`, tone: r.nao_visitadas > 0 ? "text-[hsl(var(--status-busy))]" : "text-foreground", hint: "Paradas de saídas canceladas/encerradas sem nenhuma tentativa" },
  ] : [];

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <ReportHeader
        title="Entregas por Motivo"
        subtitle="Quantas deram certo, quantas deram errado e por quê (tentativas estornadas não entram)"
        generatedAt={rel ? generatedAt : "—"}
        total={rel ? r!.tentativas : undefined}
        filters={rel ? activeFilters : undefined}
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
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleGenerate} disabled={loading}><Search size={14} />{loading ? "Gerando..." : "Gerar Relatório"}</Button>
              <Button size="sm" variant="outline" onClick={() => setBase(filtrosIniciais())}><X size={14} />Limpar</Button>
              {onNavigate && <Button size="sm" variant="outline" onClick={() => onNavigate("/")}><ArrowLeft size={14} />Voltar</Button>}
            </div>
          </div>
        )}
      </div>

      {rel && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((c) => (
              <div key={c.label} className="border border-border rounded-lg bg-card px-3 py-2" title={c.hint}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <div className={cn("text-sm font-bold tabular-nums", c.tone)}>{c.value}</div>
                <div className="text-[10px] text-muted-foreground tabular-nums truncate">{c.sub}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 print:hidden" role="tablist">
            {VISOES.map((v) => (
              <Button key={v.id} size="sm" role="tab" aria-selected={visao === v.id}
                variant={visao === v.id ? "default" : "outline"} className="h-8 text-xs" onClick={() => setVisao(v.id)}>
                {v.label}
              </Button>
            ))}
          </div>

          {visao === "MOTIVO" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-foreground">Motivos de não entrega ({fmt(r!.nao_entregues)})</h3>
                <ReportTable columns={colsMotivo(maxFalha, "bg-destructive")} data={falhas} loading={loading}
                  emptyMessage="Nenhuma tentativa sem sucesso no período." />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-xs font-semibold text-foreground">Ressalvas em entregas realizadas ({fmt(ressalvas.reduce((s, m) => s + m.quantidade, 0))})</h3>
                <ReportTable columns={colsMotivo(maxRessalva, "bg-[hsl(var(--status-busy))]")} data={ressalvas} loading={loading}
                  emptyMessage="Nenhuma ressalva registrada no período." />
              </div>
            </div>
          )}
          {visao === "ENTREGADOR" && <ReportTable columns={colsEntregador} data={rel.por_entregador} loading={loading} />}
          {visao === "CLIENTE" && <ReportTable columns={colsCliente} data={rel.por_cliente} loading={loading} />}
          {visao === "DIA" && <ReportTable columns={colsDia} data={rel.por_dia} loading={loading} />}
        </>
      )}
    </div>
  );
}
