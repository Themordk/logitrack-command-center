/**
 * Atividades › HU (Plano HU — H5). Lista, cards, filtros e busca vêm de rpc_hus_listar; o detalhe de rpc_hu_detalhe.
 * Gerar, editar, fechar, reabrir, desmontar e descartar passam pelas rpc_hu_* (huService), que conferem permissão,
 * status e motivo e gravam o histórico. A tela não grava nas tabelas.
 */
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Eye, Loader2, Package, Plus, Printer, RefreshCcw, Save, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { parseError } from "@/lib/errorMapper";
import { exportToExcel, type ExportColumn } from "@/modules/reports/utils/exporters";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PrintEtiquetaHUModal } from "@/components/etiqueta/PrintEtiquetaHUModal";
import { HUDetalheSheet, type AcaoHU } from "@/components/hu/HUDetalheSheet";
import { huService, HuRpcError, type FiltrosHU, type HULinha, type SituacaoHU, type StatusHU } from "@/lib/huService";
import {
  CARDS_RESUMO_HU, EVENTO_HU_LABEL, SITUACAO_HU_LABEL, STATUS_HU, motivoDivergencia, textoConteudo, textoEtiquetaHU, textoIdade,
} from "@/lib/huExibicao";

const MODULO = "web.atividades.hus";
const TAMANHO = 50;
const filtroInput = "h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary";
const filtroLabel = "text-[11px] font-medium text-muted-foreground uppercase";
const th = "px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase bg-secondary whitespace-nowrap text-left";
const td = "px-3 py-2.5 align-top";

const FILTROS_VAZIOS: FiltrosHU = {
  status: "", situacao: "", tipo_hu: "", movimento: "", nf: "", fornecedor: "", sku: "", endereco: "", data_de: "", data_ate: "", busca: "",
};

const Selo = ({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) => (
  <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${cls}`}>{children}</span>
);

const dataHora = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

const COLUNAS_EXPORT: ExportColumn[] = [
  { key: "codigo_hu", label: "HU" },
  { key: "tipo_hu", label: "Tipo" },
  { key: "tamanho", label: "Tamanho" },
  { key: "status", label: "Status", format: (r) => STATUS_HU[r.status as StatusHU]?.label ?? r.status },
  { key: "qtd_skus", label: "SKUs" },
  { key: "qtd_total", label: "Quantidade" },
  { key: "sku_principal", label: "SKU (se único)" },
  { key: "numero_movimento", label: "Recebimento" },
  { key: "nfs", label: "NF(s)" },
  { key: "fornecedores", label: "Fornecedor(es)" },
  { key: "armazem", label: "Armazém" },
  { key: "endereco", label: "Endereço" },
  { key: "divergencia", label: "Divergência", format: (r) => motivoDivergencia(r as HULinha) ?? "" },
  { key: "etiqueta", label: "Etiqueta", format: (r) => textoEtiquetaHU(r as HULinha).texto },
  { key: "ultimo_evento", label: "Último evento", format: (r) => (r.ultimo_evento ? EVENTO_HU_LABEL[r.ultimo_evento] ?? r.ultimo_evento : "") },
  { key: "ultimo_evento_em", label: "Último evento em", format: (r) => dataHora(r.ultimo_evento_em) },
  { key: "peso_bruto", label: "Peso (kg)" },
  { key: "m3", label: "Cubagem (m³)" },
  { key: "created_at", label: "Criada em", format: (r) => dataHora(r.created_at) },
  { key: "criado_por_nome", label: "Criada por" },
];

type FormHU = { tipo_hu: string; tamanho: string; altura: string; peso_bruto: string; m3: string; quantidade: string };
const FORM_VAZIO: FormHU = { tipo_hu: "", tamanho: "", altura: "", peso_bruto: "", m3: "", quantidade: "1" };

const TEXTO_ACAO: Record<Exclude<AcaoHU, "fechar">, { titulo: string; descricao: string; botao: string; perigo?: boolean }> = {
  reabrir: { titulo: "Reabrir HU", descricao: "A HU volta a aceitar itens na conferência. O motivo fica no histórico.", botao: "Reabrir" },
  desmontar: {
    titulo: "Desmontar HU",
    descricao: "Os itens saem da HU e continuam conferidos; serão armazenados avulsos. A HU é encerrada. O motivo fica no histórico.",
    botao: "Desmontar", perigo: true,
  },
  descartar: {
    titulo: "Descartar HU",
    descricao: "Só HU aberta e vazia. Ela deixa de poder ser usada (etiqueta perdida, danificada…). O motivo fica no histórico.",
    botao: "Descartar", perigo: true,
  },
};

export function HUsPage({ onNavigate }: { onNavigate?: (path: string) => void } = {}) {
  const { empresaId, armazemId } = useTenant();
  const { can } = usePermissions();
  const permissoes = { criar: can(MODULO, "CREATE"), editar: can(MODULO, "UPDATE"), imprimir: can(MODULO, "READ") };
  const qc = useQueryClient();

  const [filtros, setFiltros] = useState<FiltrosHU>(FILTROS_VAZIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosHU>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Map<string, HULinha>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => { setFiltrosAplicados(filtros); setPagina(1); }, 400);
    return () => clearTimeout(t);
  }, [filtros]);

  const lista = useQuery({
    queryKey: ["hus", empresaId, filtrosAplicados, pagina],
    queryFn: () => huService.listar(empresaId ?? null, filtrosAplicados, pagina, TAMANHO),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const dados = lista.data;
  const linhas = dados?.linhas ?? [];
  const totalPaginas = Math.max(1, Math.ceil((dados?.total ?? 0) / TAMANHO));
  const resumo = dados?.resumo;

  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState<HULinha[] | null>(null);
  const [exportando, setExportando] = useState(false);
  const [form, setForm] = useState<FormHU | null>(null);
  const [editando, setEditando] = useState<HULinha | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [acao, setAcao] = useState<{ tipo: Exclude<AcaoHU, "fechar">; hu: HULinha } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [executando, setExecutando] = useState(false);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["hus"] });
    void qc.invalidateQueries({ queryKey: ["hu-detalhe"] });
  };
  const erroTexto = (e: unknown, ctx: string) => (e instanceof HuRpcError ? e.message : parseError(e, ctx).title);

  const mudar = (campo: keyof FiltrosHU, valor: string) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const aplicarCard = (situacao?: SituacaoHU, status?: StatusHU) => {
    const novo: FiltrosHU = { ...filtros, situacao: situacao ?? "", status: status ?? "" };
    const igual = (filtros.situacao || "") === (novo.situacao || "") && (filtros.status || "") === (novo.status || "");
    const final = igual ? { ...filtros, situacao: "", status: "" } as FiltrosHU : novo;
    setFiltros(final); setFiltrosAplicados(final); setPagina(1); setSelecionados(new Map());
  };
  const temFiltro = Object.values(filtros).some((v) => (v ?? "").trim() !== "");

  const selecionavel = (h: HULinha) => !h.encerrada;
  const alternar = (h: HULinha) => setSelecionados((s) => { const n = new Map(s); if (n.has(h.id)) n.delete(h.id); else n.set(h.id, h); return n; });
  const selecionaveisPagina = linhas.filter(selecionavel);
  const todosPagina = selecionaveisPagina.length > 0 && selecionaveisPagina.every((h) => selecionados.has(h.id));
  const alternarPagina = () => setSelecionados((s) => {
    const n = new Map(s);
    if (todosPagina) selecionaveisPagina.forEach((h) => n.delete(h.id)); else selecionaveisPagina.forEach((h) => n.set(h.id, h));
    return n;
  });
  const listaSelecionados = useMemo(() => [...selecionados.values()], [selecionados]);

  const exportar = async () => {
    setExportando(true);
    try {
      const todas = await huService.listarTodos(empresaId ?? null, filtrosAplicados);
      if (todas.length === 0) { toast.info("Nada para exportar com esses filtros."); return; }
      exportToExcel("hus", COLUNAS_EXPORT, todas);
      toast.success(`${todas.length} HU(s) exportada(s).`);
    } catch (e) { toast.error(erroTexto(e, "exportar-hus")); } finally { setExportando(false); }
  };

  /* ── Gerar / editar ── */
  const abrirGerar = () => { setEditando(null); setForm({ ...FORM_VAZIO }); setErros({}); };
  const abrirEditar = (h: HULinha) => {
    setEditando(h);
    setForm({ tipo_hu: h.tipo_hu ?? "", tamanho: h.tamanho ?? "", altura: h.altura?.toString() ?? "", peso_bruto: h.peso_bruto?.toString() ?? "",
      m3: h.m3?.toString() ?? "", quantidade: "1" });
    setErros({});
  };
  const setCampo = (k: keyof FormHU, v: string) => { setForm((f) => (f ? { ...f, [k]: v } : f)); setErros((e) => { const n = { ...e }; delete n[k]; return n; }); };
  const salvar = async () => {
    if (!form) return;
    const errs: Record<string, string> = {};
    if (!form.tipo_hu) errs.tipo_hu = "Campo obrigatório";
    if (!form.tamanho) errs.tamanho = "Campo obrigatório";
    const qtd = parseInt(form.quantidade, 10);
    if (!editando && (!qtd || qtd < 1 || qtd > 500)) errs.quantidade = "Entre 1 e 500";
    if (Object.keys(errs).length) { setErros(errs); return; }
    setSalvando(true);
    try {
      const dadosForm = { tipo_hu: form.tipo_hu, tamanho: form.tamanho, altura: form.altura, peso_bruto: form.peso_bruto, m3: form.m3 };
      if (editando) {
        await huService.editar(editando.id, dadosForm);
        toast.success("HU atualizada.");
      } else {
        if (!empresaId) throw new Error("Selecione a empresa antes de gerar HUs.");
        const r = await huService.gerar({ ...dadosForm, quantidade: qtd, empresa_id: empresaId, armazem_id: armazemId });
        toast.success(r.mensagem || `${qtd} HU(s) gerada(s).`, {
          action: r.hus?.length ? { label: "Imprimir etiquetas", onClick: () => setImprimir(r.hus.map((x) => ({ id: x.hu_id, codigo_hu: x.codigo_hu, tipo_hu: form.tipo_hu, tamanho: form.tamanho }) as HULinha)) } : undefined,
          duration: 10000,
        });
      }
      setForm(null); recarregar();
    } catch (e) { toast.error(erroTexto(e, "salvar-hu")); } finally { setSalvando(false); }
  };

  /* ── Ações do ciclo de vida ── */
  const executarAcao = async (tipo: AcaoHU, h: HULinha) => {
    if (tipo !== "fechar") { setMotivo(""); setAcao({ tipo, hu: h }); return; }
    try { const r = await huService.fechar(h.id); toast.success(r.mensagem || "HU fechada."); recarregar(); }
    catch (e) { toast.error(erroTexto(e, "fechar-hu")); }
  };
  const confirmarAcao = async () => {
    if (!acao || !motivo.trim()) return;
    setExecutando(true);
    try {
      const fn = acao.tipo === "reabrir" ? huService.reabrir : acao.tipo === "desmontar" ? huService.desmontar : huService.descartar;
      const r = await fn(acao.hu.id, motivo);
      toast.success(r.mensagem || "Feito.");
      setAcao(null); recarregar();
    } catch (e) { toast.error(erroTexto(e, `${acao.tipo}-hu`)); } finally { setExecutando(false); }
  };

  const fieldClass = (name: string) => cn(
    "w-full h-10 px-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
    erros[name] ? "border-destructive" : "border-border", "focus:border-primary focus:ring-1 focus:ring-primary/30",
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Unidades de Movimentação (HU)</h1>
          <p className="text-xs text-muted-foreground">Conteúdo, origem, endereço e histórico de cada HU, do recebimento ao estoque</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={recarregar} disabled={lista.isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
            <RefreshCcw size={14} className={lista.isFetching ? "animate-spin" : ""} /> Atualizar
          </button>
          <button type="button" onClick={() => void exportar()} disabled={exportando || !dados?.total}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Exportar Excel
          </button>
          {selecionados.size > 0 && (
            <button type="button" onClick={() => setImprimir(listaSelecionados)} disabled={!permissoes.imprimir}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-primary/50 text-primary text-sm font-medium hover:bg-primary/10 disabled:opacity-40">
              <Printer size={14} /> Imprimir selecionadas ({selecionados.size})
            </button>
          )}
          <button type="button" onClick={abrirGerar} disabled={!permissoes.criar}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
            <Plus size={14} /> Gerar HU
          </button>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {CARDS_RESUMO_HU.map((c) => {
          const valor = resumo ? resumo[c.chave] ?? 0 : null;
          const ativo = (c.situacao && filtrosAplicados.situacao === c.situacao) || (c.status && filtrosAplicados.status === c.status);
          const clicavel = !!(c.situacao || c.status);
          return (
            <button key={c.chave} type="button" title={c.hint} disabled={!clicavel}
              onClick={() => clicavel && aplicarCard(c.situacao, c.status)} aria-pressed={clicavel ? !!ativo : undefined}
              className={`text-left border rounded-lg bg-card px-3 py-2 transition-colors ${ativo ? "border-primary ring-1 ring-primary/40" : "border-border"} ${clicavel ? "hover:border-primary/50" : "cursor-default"}`}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">{c.label}</div>
              <div className={`text-lg font-bold tabular-nums ${valor && c.alerta ? c.alerta : "text-foreground"}`}>
                {valor == null ? "—" : valor.toLocaleString("pt-BR")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-border bg-secondary/30">
        <div className="flex flex-col gap-1">
          <label htmlFor="hu-busca" className={filtroLabel}>Código da HU</label>
          <input id="hu-busca" value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} placeholder="HU-..." className={`${filtroInput} w-40`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hu-status" className={filtroLabel}>Status</label>
          <select id="hu-status" value={filtros.status} onChange={(e) => mudar("status", e.target.value)} className={`${filtroInput} w-36`}>
            <option value="">Em uso</option>
            {(Object.keys(STATUS_HU) as StatusHU[]).map((s) => <option key={s} value={s}>{STATUS_HU[s].label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hu-situacao" className={filtroLabel}>Situação</label>
          <select id="hu-situacao" value={filtros.situacao} onChange={(e) => mudar("situacao", e.target.value)} className={`${filtroInput} w-52`}>
            <option value="">Todas</option>
            {(Object.keys(SITUACAO_HU_LABEL) as SituacaoHU[]).map((s) => <option key={s} value={s}>{SITUACAO_HU_LABEL[s]}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hu-tipo" className={filtroLabel}>Tipo</label>
          <select id="hu-tipo" value={filtros.tipo_hu} onChange={(e) => mudar("tipo_hu", e.target.value)} className={`${filtroInput} w-28`}>
            <option value="">Todos</option>
            {["PALLET", "CAIXA", "VOLUME", "OUTRO"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {([
          ["movimento", "Recebimento", "Nº", "w-24", true],
          ["nf", "NF", "Nº da NF", "w-28", true],
          ["fornecedor", "Fornecedor", "Nome", "w-44", false],
          ["sku", "Produto", "SKU ou descrição", "w-44", false],
          ["endereco", "Endereço", "R01-P01...", "w-32", false],
        ] as const).map(([campo, r, ph, w, numerico]) => (
          <div key={campo} className="flex flex-col gap-1">
            <label htmlFor={`hu-${campo}`} className={filtroLabel}>{r}</label>
            <input id={`hu-${campo}`} value={filtros[campo]} onChange={(e) => mudar(campo, e.target.value)} placeholder={ph}
              inputMode={numerico ? "numeric" : undefined} className={`${filtroInput} ${w}`} />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="hu-de" className={filtroLabel}>Criada de</label>
          <input id="hu-de" type="date" value={filtros.data_de} onChange={(e) => mudar("data_de", e.target.value)} className={`${filtroInput} w-36`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="hu-ate" className={filtroLabel}>Até</label>
          <input id="hu-ate" type="date" value={filtros.data_ate} onChange={(e) => mudar("data_ate", e.target.value)} className={`${filtroInput} w-36`} />
        </div>
        {temFiltro && (
          <button type="button" onClick={() => { setFiltros(FILTROS_VAZIOS); setFiltrosAplicados(FILTROS_VAZIOS); setPagina(1); }}
            className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">
        {lista.isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : lista.isError ? (
          <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">{erroTexto(lista.error, "hus-listar")}</div>
        ) : linhas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center px-4">
            <Package size={32} className="mb-2 opacity-40" aria-hidden="true" />
            <p className="text-sm">{temFiltro ? "Nenhuma HU encontrada com esses filtros." : "Nenhuma HU em uso."}</p>
            {!temFiltro && <p className="text-xs mt-1 max-w-md">Gere HUs aqui (etiquetas pré-impressas) ou crie no coletor durante a conferência de entrada. HUs encerradas aparecem filtrando pelo status.</p>}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border">
                  <th className={`${th} w-10`}>
                    <input type="checkbox" checked={todosPagina} onChange={alternarPagina} disabled={selecionaveisPagina.length === 0}
                      className="rounded border-border" aria-label="Selecionar as HUs desta página" />
                  </th>
                  <th className={th}>HU</th>
                  <th className={th}>Conteúdo</th>
                  <th className={th}>Origem</th>
                  <th className={th}>Onde está</th>
                  <th className={th}>Etiqueta</th>
                  <th className={th}>Status</th>
                  <th className={th}>Último evento</th>
                  <th className={`${th} w-10`}><span className="sr-only">Detalhe</span></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((h) => {
                  const marcado = selecionados.has(h.id);
                  const st = STATUS_HU[h.status] ?? { label: h.status, cls: "" };
                  const etq = textoEtiquetaHU(h);
                  const div = motivoDivergencia(h);
                  return (
                    <tr key={h.id} onClick={() => setDetalheId(h.id)}
                      className={`border-b border-border/50 table-row-hover cursor-pointer ${marcado ? "bg-primary/5" : ""}`}>
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        {selecionavel(h) && (
                          <input type="checkbox" checked={marcado} onChange={() => alternar(h)} className="rounded border-border"
                            aria-label={`Selecionar HU ${h.codigo_hu}`} />
                        )}
                      </td>
                      <td className={td}>
                        <div className="font-mono text-xs text-foreground">{h.codigo_hu}</div>
                        <div className="text-[11px] text-muted-foreground">{[h.tipo_hu, h.tamanho].filter(Boolean).join(" ") || "—"}</div>
                      </td>
                      <td className={`${td} max-w-[240px]`}>
                        <div className={`text-xs ${h.qtd_skus ? "text-foreground" : "text-muted-foreground"}`}>{textoConteudo(h)}</div>
                        {h.sku_principal && <div className="text-[11px] text-muted-foreground truncate" title={h.descricao_principal ?? undefined}>{h.sku_principal} · {h.descricao_principal}</div>}
                      </td>
                      <td className={`${td} max-w-[220px]`}>
                        {h.numero_movimento ? (
                          <>
                            <div className="text-xs text-foreground">Receb. <span className="font-mono">{h.numero_movimento}</span>{h.nfs ? <> · NF <span className="font-mono">{h.nfs}</span></> : null}</div>
                            <div className="text-[11px] text-muted-foreground truncate" title={h.fornecedores ?? undefined}>{h.fornecedores ?? "—"}</div>
                          </>
                        ) : <span className="text-xs text-muted-foreground">Sem recebimento</span>}
                      </td>
                      <td className={`${td} text-xs`}>
                        <div className="font-mono text-foreground">{h.endereco ?? "—"}</div>
                        {div && (
                          <Selo cls="bg-red-500/15 text-red-400 border-red-500/30" title={div}>
                            <AlertTriangle size={10} className="mr-1" aria-hidden="true" /> Divergente
                          </Selo>
                        )}
                      </td>
                      <td className={`${td} text-xs ${etq.cls}`}>{etq.texto}</td>
                      <td className={td}>
                        <div className="flex flex-col gap-1 items-start">
                          <Selo cls={st.cls}>{st.label}</Selo>
                          {h.parada && <Selo cls="bg-yellow-500/15 text-yellow-400 border-yellow-500/30" title="Com itens e sem movimento há mais de 24 h">Parada</Selo>}
                        </div>
                      </td>
                      <td className={`${td} text-xs text-muted-foreground whitespace-nowrap`}>
                        <div className="text-foreground">{h.ultimo_evento ? EVENTO_HU_LABEL[h.ultimo_evento] ?? h.ultimo_evento : "—"}</div>
                        <div>há {textoIdade(h.horas_parada)}</div>
                      </td>
                      <td className={td}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setDetalheId(h.id); }}
                          className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
                          aria-label={`Ver detalhe da HU ${h.codigo_hu}`}>
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
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-secondary/20">
          <span className="text-xs text-muted-foreground">
            {(dados?.total ?? 0).toLocaleString("pt-BR")} HU{dados?.total === 1 ? "" : "s"}{temFiltro ? " (filtrado)" : ""}
            {selecionados.size > 0 && <> · <b className="text-foreground">{selecionados.size} selecionada(s)</b>
              <button type="button" onClick={() => setSelecionados(new Map())} className="ml-2 underline hover:text-foreground">limpar seleção</button></>}
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina === 1}
              className="p-1.5 rounded hover:bg-secondary disabled:opacity-30" aria-label="Página anterior"><ChevronLeft size={14} /></button>
            <span className="text-xs text-muted-foreground px-2">{pagina} / {totalPaginas}</span>
            <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
              className="p-1.5 rounded hover:bg-secondary disabled:opacity-30" aria-label="Próxima página"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      <HUDetalheSheet huId={detalheId} onClose={() => setDetalheId(null)} onImprimir={(hs) => setImprimir(hs)}
        onEditar={abrirEditar} onAcao={(t, h) => void executarAcao(t, h)} />

      {/* Gerar / editar */}
      <Sheet open={!!form} onOpenChange={(v) => !v && !salvando && setForm(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl !p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle>{editando ? `Editar ${editando.codigo_hu}` : "Gerar HU"}</SheetTitle>
          </SheetHeader>
          {form && (
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {([["tipo_hu", "Tipo HU", ["PALLET", "CAIXA", "VOLUME", "OUTRO"]], ["tamanho", "Tamanho", ["P", "M", "G", "GG", "EG"]]] as const).map(([k, rot, ops]) => (
                  <div key={k}>
                    <label htmlFor={`form-${k}`} className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">{rot}<span className="text-destructive ml-0.5">*</span></label>
                    <select id={`form-${k}`} value={form[k]} onChange={(e) => setCampo(k, e.target.value)} className={cn(fieldClass(k), "cursor-pointer")}>
                      <option value="">Selecionar...</option>
                      {ops.map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    {erros[k] && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {erros[k]}</p>}
                  </div>
                ))}
                {([["altura", "Altura", "cm"], ["peso_bruto", "Peso bruto", "kg"], ["m3", "Cubagem", "m³"]] as const).map(([k, rot, ph]) => (
                  <div key={k}>
                    <label htmlFor={`form-${k}`} className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">{rot}</label>
                    <input id={`form-${k}`} type="number" step="any" min={0} value={form[k]} onChange={(e) => setCampo(k, e.target.value)} placeholder={ph} className={fieldClass(k)} />
                  </div>
                ))}
                {!editando && (
                  <div className="md:col-span-2">
                    <label htmlFor="form-quantidade" className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Quantidade a gerar<span className="text-destructive ml-0.5">*</span></label>
                    <input id="form-quantidade" type="number" min={1} max={500} step={1} value={form.quantidade} onChange={(e) => setCampo("quantidade", e.target.value)} className={fieldClass("quantidade")} />
                    {erros.quantidade && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {erros.quantidade}</p>}
                    <p className="text-xs text-muted-foreground mt-1">Os códigos saem da sequência do sistema. As HUs nascem abertas e vazias, prontas para a conferência.</p>
                  </div>
                )}
              </div>
            </div>
          )}
          <SheetFooter className="px-6 py-4 border-t border-border shrink-0 flex-row justify-end gap-2">
            <button onClick={() => setForm(null)} disabled={salvando}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary">Cancelar</button>
            <button onClick={() => void salvar()} disabled={salvando}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
              {salvando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {editando ? "Salvar" : "Gerar"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Ações com motivo */}
      <Dialog open={!!acao} onOpenChange={(v) => { if (!v && !executando) setAcao(null); }}>
        <DialogContent>
          {acao && (
            <>
              <DialogHeader>
                <DialogTitle>{TEXTO_ACAO[acao.tipo].titulo} {acao.hu.codigo_hu}</DialogTitle>
                <DialogDescription>{TEXTO_ACAO[acao.tipo].descricao}</DialogDescription>
              </DialogHeader>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (obrigatório)" aria-label="Motivo" rows={3} />
              <DialogFooter>
                <button onClick={() => setAcao(null)} disabled={executando}
                  className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary">Cancelar</button>
                <button onClick={() => void confirmarAcao()} disabled={executando || !motivo.trim()}
                  className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50",
                    TEXTO_ACAO[acao.tipo].perigo ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
                  {executando && <Loader2 size={14} className="animate-spin" />} {TEXTO_ACAO[acao.tipo].botao}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <PrintEtiquetaHUModal
        open={!!imprimir}
        onClose={() => { setImprimir(null); setSelecionados(new Map()); recarregar(); }}
        hus={(imprimir ?? []).map((h) => ({ id: h.id, codigo_hu: h.codigo_hu, tipo_hu: h.tipo_hu ?? undefined, tamanho: h.tamanho ?? undefined }))}
        onNavigate={onNavigate}
      />
    </div>
  );
}
