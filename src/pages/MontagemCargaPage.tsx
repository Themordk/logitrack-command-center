/**
 * Fluxo de Expedição · F6 — Montagem de Carga.
 * Segue o padrão visual das telas de criação de movimento (Gerar Saída): cabeçalho com ações,
 * abas em pílula, barra de filtros, grid com seleção/ordenação/paginação e modal para concluir a ação.
 * Regras (elegibilidade, veículo/transportadora/box) ficam nas RPCs carga_*; aqui só filtro, ordem e seleção.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Boxes, ChevronLeft, ChevronRight, Eraser, Eye, FileText, Loader2, MoreHorizontal, PackageCheck, Printer,
  RefreshCcw, Route, Star, Truck, UserCog,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { parseError } from "@/lib/errorMapper";
import { cargaService, type CargaResumo, type CargaStatus, type OndaSugerida, type PrioridadeCarga } from "@/lib/cargaService";
import {
  CARGA_STATUS_LABEL, FILTROS_CARGAS_VAZIOS, FILTROS_ONDAS_VAZIOS, MODALIDADE_LABEL, filtrarCargas, type FiltrosCargas, PRIORIDADES_CARGA, PRIORIDADE_TOM, TRANSPORTE_VAZIO, descreverTransporte, filtrarOndas,
  formatarNumero, ordenarOndas, type ColunaOnda, type DirecaoOrdem, type FiltrosOndas, type TransporteValor,
} from "@/lib/cargaExibicao";
import { useCargaCadastros } from "@/hooks/useCargaCadastros";
import { CargaStatusBadge } from "@/components/carga/CargaStatusBadge";
import { CapacidadeVeiculo } from "@/components/carga/CapacidadeVeiculo";
import { CargaDetalheSheet } from "@/components/carga/CargaDetalheSheet";
import { TransporteCampos } from "@/components/carga/TransporteCampos";
import { SeletorBusca } from "@/components/carga/SeletorBusca";
import { CargaAcompanhamentoSheet } from "@/components/carga/CargaAcompanhamentoSheet";
import { CargaResponsaveisDialog } from "@/components/carga/CargaResponsaveisDialog";
import { imprimirRomaneio } from "@/lib/romaneioPdf";
import { abrirJanelaImpressao } from "@/modules/reports/utils/exporters";

const MODULO = "web.atividades.montagem-carga";
const POR_PAGINA = 20;
const FILTROS_CARGA: { valor: string; rotulo: string; status: CargaStatus[] | null }[] = [
  { valor: "ativas", rotulo: "Em aberto", status: ["EM_MONTAGEM", "LIBERADA", "EM_CARREGAMENTO"] },
  { valor: "EM_MONTAGEM", rotulo: "Em montagem", status: ["EM_MONTAGEM"] },
  { valor: "LIBERADA", rotulo: "Liberada", status: ["LIBERADA"] },
  { valor: "EM_CARREGAMENTO", rotulo: "Em carregamento", status: ["EM_CARREGAMENTO"] },
  { valor: "FECHADA", rotulo: "Fechada", status: ["FECHADA"] },
  { valor: "CANCELADA", rotulo: "Cancelada", status: ["CANCELADA"] },
  { valor: "todas", rotulo: "Todas", status: null },
];
const dataHora = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

// Classes do padrão das telas de movimento (Gerar Saída)
const filtroInput = "h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary";
const filtroLabel = "text-[11px] font-medium text-muted-foreground uppercase";
const th = "px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase bg-secondary whitespace-nowrap";
const td = "px-4 py-2.5";
const pilula = (ativo: boolean) => `px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
  ativo ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"}`;

const COLUNAS: { chave: ColunaOnda; rotulo: string; alinhar?: "right" | "center" }[] = [
  { chave: "numero_onda", rotulo: "Nº Movimento" },
  { chave: "pedidos", rotulo: "Nº Documento" },
  { chave: "parceiros", rotulo: "Parceiro" },
  { chave: "rota", rotulo: "Rota" },
  { chave: "cidades", rotulo: "Cidade" },
  { chave: "bairros", rotulo: "Bairro" },
  { chave: "tipo_saida", rotulo: "Tipo Saída" },
  { chave: "transporte", rotulo: "Transporte" },
  { chave: "volumes", rotulo: "Volumes", alinhar: "center" },
  { chave: "peso_total", rotulo: "Peso (kg)", alinhar: "right" },
  { chave: "m3", rotulo: "m³", alinhar: "right" },
];

export function MontagemCargaPage(_props: { onNavigate?: (path: string) => void } = {}) {
  const { tenantId, empresaId, usuarioId } = useTenant();
  const { can } = usePermissions();
  const podeEditar = can(MODULO, "UPDATE") || can(MODULO, "CREATE");
  const qc = useQueryClient();
  const { veiculos, boxes, transportadoras } = useCargaCadastros(tenantId, empresaId);

  const [aba, setAba] = useState<"ondas" | "cargas">("ondas");
  const [filtroCarga, setFiltroCarga] = useState("ativas");
  const [filtrosCargas, setFiltrosCargas] = useState<FiltrosCargas>(FILTROS_CARGAS_VAZIOS);
  const [cargaAberta, setCargaAberta] = useState<string | null>(null);
  const [acompanhando, setAcompanhando] = useState<string | null>(null);
  const [menuCarga, setMenuCarga] = useState<string | null>(null);
  // Menu fixo na tela (não é cortado pela rolagem do grid); abre para cima perto do rodapé.
  const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const abrirMenu = (id: string, el: HTMLElement) => {
    if (menuCarga === id) { setMenuCarga(null); return; }
    const r = el.getBoundingClientRect();
    const right = window.innerWidth - r.right;
    setMenuPos(window.innerHeight - r.bottom < 280 ? { bottom: window.innerHeight - r.top + 4, right } : { top: r.bottom + 4, right });
    setMenuCarga(id);
  };
  const [prioridadeCarga, setPrioridadeCarga] = useState<{ carga: CargaResumo; valor: PrioridadeCarga } | null>(null);
  const [limparCarga, setLimparCarga] = useState<CargaResumo | null>(null);
  const [motivoLimpeza, setMotivoLimpeza] = useState("");
  const [responsaveisCarga, setResponsaveisCarga] = useState<CargaResumo | null>(null);
  const [acaoCarga, setAcaoCarga] = useState(false);

  const recarregarCargas = () => {
    void qc.invalidateQueries({ queryKey: ["cargas", tenantId, empresaId] });
    void qc.invalidateQueries({ queryKey: ["carga-acompanhamento"] });
    void qc.invalidateQueries({ queryKey: ["carga"] });
  };
  const executarAcao = async (fn: () => Promise<{ mensagem?: string }>, fechar: () => void, contexto: string) => {
    setAcaoCarga(true);
    try {
      const r = await fn();
      toast.success(r.mensagem ?? "Feito.");
      fechar();
      recarregarCargas();
    } catch (e) {
      const p = parseError(e, contexto);
      toast.error(p.title, { description: p.instruction || p.details });
    } finally {
      setAcaoCarga(false);
    }
  };

  const imprimirRomaneioCarga = async (id: string) => {
    setMenuCarga(null);
    const janela = abrirJanelaImpressao(); // reservada no clique para não ser bloqueada
    try {
      imprimirRomaneio(await cargaService.romaneio(tenantId as string, id), janela);
    } catch (e) {
      janela?.close();
      const p = parseError(e, "carga-romaneio");
      toast.error(p.title, { description: p.instruction || p.details });
    }
  };
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [filtros, setFiltros] = useState<FiltrosOndas>(FILTROS_ONDAS_VAZIOS);
  const [ordem, setOrdem] = useState<{ coluna: ColunaOnda; direcao: DirecaoOrdem }>({ coluna: "sugestao", direcao: "asc" });
  const [pagina, setPagina] = useState(1);
  const [modalAberto, setModalAberto] = useState(false);
  const [transporte, setTransporte] = useState<TransporteValor>(TRANSPORTE_VAZIO);
  const [modalidadeEscolhida, setModalidadeEscolhida] = useState(false);
  const [boxId, setBoxId] = useState("");

  const pronto = !!tenantId && !!empresaId;

  const sugestao = useQuery({
    queryKey: ["carga-sugestao", tenantId, empresaId],
    enabled: pronto,
    queryFn: () => cargaService.sugerir(tenantId as string, empresaId as string),
    refetchInterval: 60_000,
  });

  const statusFiltro = FILTROS_CARGA.find((f) => f.valor === filtroCarga)?.status ?? null;
  const cargas = useQuery({
    queryKey: ["cargas", tenantId, empresaId, filtroCarga],
    enabled: pronto,
    queryFn: () => cargaService.listar(tenantId as string, empresaId as string, statusFiltro),
    refetchInterval: 30_000,
  });

  const cargasVisiveis = useMemo(() => filtrarCargas(cargas.data ?? [], filtrosCargas), [cargas.data, filtrosCargas]);
  const temFiltroCargas = filtroCarga !== "ativas" || Object.values(filtrosCargas).some(Boolean);
  const mudarFiltroCarga = (campo: keyof FiltrosCargas, valor: string) => setFiltrosCargas((f) => ({ ...f, [campo]: valor }));

  const todasOndas = useMemo(() => sugestao.data?.ondas ?? [], [sugestao.data]);
  const tiposSaida = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of todasOndas) if (o.tipo_saida_id) m.set(o.tipo_saida_id, o.tipo_saida ?? "—");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  }, [todasOndas]);
  const visiveis = useMemo(
    () => ordenarOndas(filtrarOndas(todasOndas, filtros), ordem.coluna, ordem.direcao),
    [todasOndas, filtros, ordem],
  );
  const totalPaginas = Math.max(1, Math.ceil(visiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const linhas = visiveis.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA);
  const temFiltro = Object.values(filtros).some(Boolean);

  // Onda que saiu da lista (montada por outra pessoa, por exemplo) sai também da seleção.
  useEffect(() => {
    const ids = new Set(todasOndas.map((o) => o.movimento_saida_id));
    setSelecionadas((s) => { const n = new Set([...s].filter((id) => ids.has(id))); return n.size === s.size ? s : n; });
  }, [todasOndas]);

  const ondasSel: OndaSugerida[] = useMemo(() => todasOndas.filter((o) => selecionadas.has(o.movimento_saida_id)), [todasOndas, selecionadas]);
  const totais = useMemo(() => ({
    peso: ondasSel.reduce((s, o) => s + Number(o.peso_total ?? 0), 0),
    m3: ondasSel.reduce((s, o) => s + Number(o.m3 ?? 0), 0),
    pedidos: ondasSel.reduce((s, o) => s + Number(o.documentos ?? 0), 0),
    volumes: ondasSel.reduce((s, o) => s + Number(o.volumes ?? 0), 0),
  }), [ondasSel]);

  // Veículo/transportadora/box herdados das ondas: o backend recusa se divergirem; aqui só antecipamos o aviso.
  const veiculosOndas = [...new Set(ondasSel.map((o) => o.veiculo_id).filter(Boolean))] as string[];
  const transpOndas = [...new Set(ondasSel.map((o) => o.transportadora_id).filter(Boolean))] as string[];
  const boxesOndas = [...new Set(ondasSel.map((o) => o.box_id).filter(Boolean))] as string[];
  const modalidade = modalidadeEscolhida ? transporte.modalidade
    : transpOndas.length > 0 && veiculosOndas.length === 0 ? "TERCEIRO" : "PROPRIA";
  const transporteExibido: TransporteValor = { ...transporte, modalidade };
  const terceiro = modalidade === "TERCEIRO";
  const veiculoSel = veiculos.find((v) => v.id === (transporte.veiculoId || veiculosOndas[0] || ""));
  const nomeTranspOndas = transpOndas.length === 1 ? ondasSel.find((o) => o.transportadora_id === transpOndas[0])?.transportadora : null;
  const variasTransp = transpOndas.length > 1 || ondasSel.some((o) => o.transportadoras > 1);
  const divergenteVeiculo = !terceiro && (veiculosOndas.length > 1 || (!!transporte.veiculoId && veiculosOndas.some((v) => v !== transporte.veiculoId)));
  const divergenteBox = boxesOndas.length > 1 || (!!boxId && boxesOndas.some((b) => b !== boxId));
  const divergente = variasTransp || divergenteVeiculo || divergenteBox;
  const transpDiferenteErp = terceiro && !!transporte.transportadoraId && transpOndas.length === 1 && transpOndas[0] !== transporte.transportadoraId;

  const alterarTransporte = (v: TransporteValor) => {
    if (v.modalidade !== modalidade) setModalidadeEscolhida(true);
    setTransporte(v);
  };
  const alternar = (id: string) => setSelecionadas((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todasVisiveisMarcadas = visiveis.length > 0 && visiveis.every((o) => selecionadas.has(o.movimento_saida_id));
  const alternarTodas = () => setSelecionadas((s) => {
    const n = new Set(s);
    for (const o of visiveis) { if (todasVisiveisMarcadas) n.delete(o.movimento_saida_id); else n.add(o.movimento_saida_id); }
    return n;
  });
  const mudarFiltro = (campo: keyof FiltrosOndas, valor: string) => { setFiltros((f) => ({ ...f, [campo]: valor })); setPagina(1); };
  const ordenarPor = (coluna: ColunaOnda) => setOrdem((o) => (
    o.coluna === coluna ? { coluna, direcao: o.direcao === "asc" ? "desc" : "asc" } : { coluna, direcao: "asc" }));

  const montar = useMutation({
    mutationFn: () => cargaService.montar({
      tenantId: tenantId as string, empresaId: empresaId as string, usuarioId: usuarioId as string,
      ondas: [...selecionadas], modalidade, boxId: boxId || null, motorista: transporte.motorista,
      veiculoId: terceiro ? null : transporte.veiculoId || null,
      transportadoraId: terceiro ? transporte.transportadoraId || null : null,
      placa: terceiro ? transporte.placa : null, motoristaDocumento: terceiro ? transporte.motoristaDocumento : null,
    }),
    onSuccess: (r) => {
      toast.success(r.mensagem ?? "Carga montada.");
      for (const a of r.avisos ?? []) toast.warning(a.mensagem);
      setSelecionadas(new Set());
      setTransporte(TRANSPORTE_VAZIO); setModalidadeEscolhida(false); setBoxId("");
      setModalAberto(false);
      void qc.invalidateQueries({ queryKey: ["carga-sugestao", tenantId, empresaId] });
      void qc.invalidateQueries({ queryKey: ["cargas", tenantId, empresaId] });
      if (r.dados?.id) setCargaAberta(r.dados.id);
    },
    onError: (e) => {
      const p = parseError(e, "montagem-carga");
      toast.error(p.title, { description: p.instruction || p.details });
      void qc.invalidateQueries({ queryKey: ["carga-sugestao", tenantId, empresaId] });
    },
  });

  if (!pronto) {
    return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-muted-foreground" /></div>;
  }

  const atualizando = sugestao.isFetching || cargas.isFetching;
  const iconeOrdem = (c: ColunaOnda) => (ordem.coluna !== c ? <ArrowUpDown size={12} className="opacity-40" />
    : ordem.direcao === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />);

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Montagem de Carga</h1>
          <p className="text-xs text-muted-foreground">
            {aba === "ondas"
              ? "Selecione os movimentos de saída que aguardam embarque para montar uma carga (veículo próprio ou transportadora)"
              : "Cargas montadas: abra uma carga para definir a ordem, liberar para o coletor, fechar ou imprimir o romaneio"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { void sugestao.refetch(); void cargas.refetch(); }} disabled={atualizando}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            title="Atualizar dados">
            <RefreshCcw size={14} className={atualizando ? "animate-spin" : ""} /> Atualizar Dados
          </button>
          {aba === "ondas" && (
            <button type="button" onClick={() => setModalAberto(true)} disabled={!podeEditar || selecionadas.size === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              <Truck size={14} /> Montar Carga ({selecionadas.size})
            </button>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2" role="tablist" aria-label="Montagem de carga">
        <button type="button" role="tab" aria-selected={aba === "ondas"} onClick={() => setAba("ondas")} className={pilula(aba === "ondas")}>
          Ondas para embarque{sugestao.data ? ` (${todasOndas.length})` : ""}
        </button>
        <button type="button" role="tab" aria-selected={aba === "cargas"} onClick={() => setAba("cargas")} className={pilula(aba === "cargas")}>
          Cargas
        </button>
      </div>

      {aba === "ondas" ? (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-border bg-secondary/30">
            {([
              ["movimento", "Nº Movimento", "Número da onda...", "w-36"],
              ["documento", "Nº Documento", "Número do pedido...", "w-40"],
              ["parceiro", "Parceiro", "Nome do parceiro...", "w-52"],
              ["rota", "Rota", "Rota...", "w-40"],
              ["cidade", "Cidade", "Cidade...", "w-40"],
              ["bairro", "Bairro", "Bairro...", "w-40"],
            ] as const).map(([campo, rotulo, ph, largura]) => (
              <div key={campo} className="flex flex-col gap-1">
                <label htmlFor={`filtro-${campo}`} className={filtroLabel}>{rotulo}</label>
                <input id={`filtro-${campo}`} type="text" placeholder={ph} value={filtros[campo]}
                  onChange={(e) => mudarFiltro(campo, e.target.value)} className={`${filtroInput} ${largura}`} />
              </div>
            ))}
            <div className="flex flex-col gap-1">
              <label htmlFor="filtro-tipo" className={filtroLabel}>Tipo Saída</label>
              <select id="filtro-tipo" value={filtros.tipoSaidaId} onChange={(e) => mudarFiltro("tipoSaidaId", e.target.value)} className={`${filtroInput} w-44`}>
                <option value="">Todos</option>
                {tiposSaida.map(([id, d]) => <option key={id} value={id}>{d}</option>)}
              </select>
            </div>
            {temFiltro && (
              <button type="button" onClick={() => { setFiltros(FILTROS_ONDAS_VAZIOS); setPagina(1); }}
                className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                Limpar filtros
              </button>
            )}
          </div>

          {/* Grid de movimentos */}
          <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">
            {sugestao.isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
            ) : sugestao.isError ? (
              <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
                {parseError(sugestao.error, "carga-sugestao").title}
              </div>
            ) : visiveis.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center px-4">
                <PackageCheck size={32} className="mb-2 opacity-40" aria-hidden="true" />
                <p className="text-sm">{temFiltro ? "Nenhum movimento encontrado com esses filtros." : "Nenhum movimento de saída aguardando embarque."}</p>
                {!temFiltro && (
                  <p className="text-xs mt-1 max-w-md">Aparecem aqui as ondas cujo tipo de saída realiza embarque e que já terminaram a conferência (ou a separação, quando não há conferência).</p>
                )}
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-secondary backdrop-blur">
                      <th className={`${th} text-left w-10`}>
                        <input type="checkbox" checked={todasVisiveisMarcadas} onChange={alternarTodas} disabled={!podeEditar}
                          className="rounded border-border" aria-label="Selecionar todos os movimentos filtrados" />
                      </th>
                      {COLUNAS.map((c) => (
                        <th key={c.chave} className={`${th} ${c.alinhar === "right" ? "text-right" : c.alinhar === "center" ? "text-center" : "text-left"}`}
                          aria-sort={ordem.coluna === c.chave ? (ordem.direcao === "asc" ? "ascending" : "descending") : "none"}>
                          <button type="button" onClick={() => ordenarPor(c.chave)}
                            className={`inline-flex items-center gap-1 uppercase hover:text-foreground ${ordem.coluna === c.chave ? "text-foreground" : ""}`}>
                            {c.rotulo} {iconeOrdem(c.chave)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((o) => {
                      const marcado = selecionadas.has(o.movimento_saida_id);
                      return (
                        <tr key={o.movimento_saida_id} onClick={() => podeEditar && alternar(o.movimento_saida_id)}
                          className={`border-b border-border/50 table-row-hover ${podeEditar ? "cursor-pointer" : ""} ${marcado ? "bg-primary/5" : ""}`}>
                          <td className={td}>
                            <input type="checkbox" checked={marcado} disabled={!podeEditar} onChange={() => alternar(o.movimento_saida_id)}
                              onClick={(e) => e.stopPropagation()} className="rounded border-border" aria-label={`Selecionar movimento ${o.numero_onda}`} />
                          </td>
                          <td className={`${td} font-mono text-xs text-foreground`}>{o.numero_onda}</td>
                          <td className={`${td} font-mono text-xs text-foreground max-w-[160px] truncate`} title={o.pedidos ?? undefined}>{o.pedidos ?? "—"}</td>
                          <td className={`${td} text-foreground max-w-[220px] truncate`} title={o.parceiros ?? undefined}>{o.parceiros ?? "—"}</td>
                          <td className={`${td} text-xs text-foreground whitespace-nowrap`}>{o.rota ?? "—"}</td>
                          <td className={`${td} text-xs text-foreground`}>{o.cidades ?? "—"}</td>
                          <td className={`${td} text-xs text-muted-foreground`}>{o.bairros ?? "—"}</td>
                          <td className={`${td} text-xs text-foreground`}>{o.tipo_saida ?? "—"}</td>
                          <td className={`${td} text-xs whitespace-nowrap`}>
                            {o.transportadoras > 1 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border bg-yellow-500/15 text-yellow-400 border-yellow-500/30">
                                VÁRIAS TRANSPORTADORAS
                              </span>
                            ) : o.transportadora ? <span className="text-foreground">{o.transportadora}</span>
                              : o.veiculo ? <span className="text-foreground">{o.veiculo}{o.placa ? ` - ${o.placa}` : ""}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`${td} text-center ${Number(o.volumes) > 0 ? "text-muted-foreground" : "text-yellow-400"}`}
                            title={Number(o.volumes) > 0 ? "Volumes de expedição gerados" : "Sem volume: os volumes serão gerados no embarque"}>
                            {o.volumes}
                          </td>
                          <td className={`${td} text-right font-mono text-foreground`}>{formatarNumero(o.peso_total)}</td>
                          <td className={`${td} text-right font-mono text-muted-foreground`}>{formatarNumero(o.m3, 2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 border-t border-border bg-secondary/20">
              <span className="text-xs text-muted-foreground">
                {visiveis.length} movimento{visiveis.length === 1 ? "" : "s"}{temFiltro ? " (filtrado)" : ""}
                {selecionadas.size > 0 && (
                  <> · <b className="text-foreground">{selecionadas.size} selecionado(s)</b>: {totais.pedidos} pedido(s), {totais.volumes} volume(s),{" "}
                    {formatarNumero(totais.peso)} kg, {formatarNumero(totais.m3, 2)} m³</>
                )}
              </span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={paginaAtual === 1}
                  className="p-1.5 rounded hover:bg-secondary disabled:opacity-30" aria-label="Página anterior"><ChevronLeft size={14} /></button>
                <span className="text-xs text-muted-foreground px-2">{paginaAtual} / {totalPaginas}</span>
                <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas}
                  className="p-1.5 rounded hover:bg-secondary disabled:opacity-30" aria-label="Próxima página"><ChevronRight size={14} /></button>
              </div>
            </div>
          </div>
          {sugestao.data && ordem.coluna === "sugestao" && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 -mt-2">
              <Route size={12} aria-hidden="true" />
              Ordenado pela sugestão de agrupamento ({sugestao.data.criterio === "ROTA" ? "rota" : sugestao.data.criterio === "PARCEIRO" ? "parceiro" : "transportadora ou veículo e box"}). Clique numa coluna para mudar a ordem.
            </p>
          )}
        </>
      ) : (
        <>
          {/* Filtros das cargas */}
          <div className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-border bg-secondary/30">
            <div className="flex flex-col gap-1">
              <label htmlFor="filtro-carga-numero" className={filtroLabel}>Nº Carga</label>
              <input id="filtro-carga-numero" type="text" inputMode="numeric" placeholder="Número da carga..." value={filtrosCargas.numero}
                onChange={(e) => mudarFiltroCarga("numero", e.target.value)} className={`${filtroInput} w-36`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="filtro-carga-situacao" className={filtroLabel}>Situação</label>
              <select id="filtro-carga-situacao" value={filtroCarga} onChange={(e) => setFiltroCarga(e.target.value)} className={`${filtroInput} w-40`}>
                {FILTROS_CARGA.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="filtro-carga-prioridade" className={filtroLabel}>Prioridade</label>
              <select id="filtro-carga-prioridade" value={filtrosCargas.prioridade} onChange={(e) => mudarFiltroCarga("prioridade", e.target.value)} className={`${filtroInput} w-32`}>
                <option value="">Todas</option>
                {PRIORIDADES_CARGA.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="filtro-carga-veiculo" className={filtroLabel}>Veículo / Transportadora</label>
              <input id="filtro-carga-veiculo" type="text" placeholder="Veículo, placa ou transportadora..." value={filtrosCargas.veiculo}
                onChange={(e) => mudarFiltroCarga("veiculo", e.target.value)} className={`${filtroInput} w-60`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="filtro-carga-box" className={filtroLabel}>Box</label>
              <input id="filtro-carga-box" type="text" placeholder="Box..." value={filtrosCargas.box}
                onChange={(e) => mudarFiltroCarga("box", e.target.value)} className={`${filtroInput} w-32`} />
            </div>
            <div className="flex flex-col gap-1">
              <span id="filtro-carga-periodo" className={filtroLabel}>Criada em</span>
              <div className="flex items-center gap-1.5" role="group" aria-labelledby="filtro-carga-periodo">
                <input type="date" aria-label="Criada a partir de" value={filtrosCargas.criadaDe} max={filtrosCargas.criadaAte || undefined}
                  onChange={(e) => mudarFiltroCarga("criadaDe", e.target.value)} className={`${filtroInput} w-36`} />
                <span className="text-xs text-muted-foreground">até</span>
                <input type="date" aria-label="Criada até" value={filtrosCargas.criadaAte} min={filtrosCargas.criadaDe || undefined}
                  onChange={(e) => mudarFiltroCarga("criadaAte", e.target.value)} className={`${filtroInput} w-36`} />
              </div>
            </div>
            {temFiltroCargas && (
              <button type="button" onClick={() => { setFiltrosCargas(FILTROS_CARGAS_VAZIOS); setFiltroCarga("ativas"); }}
                className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                Limpar filtros
              </button>
            )}
          </div>

          <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">
            {cargas.isLoading ? (
              <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
            ) : cargasVisiveis.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Truck size={32} className="mb-2 opacity-40" aria-hidden="true" />
                <p className="text-sm">{temFiltroCargas ? "Nenhuma carga encontrada com esses filtros." : "Nenhuma carga em aberto."}</p>
              </div>
            ) : (
              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-secondary backdrop-blur">
                      <th className={`${th} text-left`}>Nº Carga</th>
                      <th className={`${th} text-left`}>Situação</th>
                      <th className={`${th} text-left`}>Prioridade</th>
                      <th className={`${th} text-left`}>Transporte</th>
                      <th className={`${th} text-left`}>Box</th>
                      <th className={`${th} text-center`}>Ondas</th>
                      <th className={`${th} text-center`}>Pedidos</th>
                      <th className={`${th} text-left w-44`}>Embarque</th>
                      <th className={`${th} text-left`}>Criada em</th>
                      <th className={`${th} text-right w-24`}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cargasVisiveis.map((c) => {
                      const pct = c.unidades_total > 0 ? (c.unidades_embarcadas / c.unidades_total) * 100 : 0;
                      return (
                        <tr key={c.id} className="border-b border-border/50 table-row-hover cursor-pointer" onClick={() => setCargaAberta(c.id)}>
                          <td className={`${td} font-mono text-xs text-foreground`}>{c.numero_carga}</td>
                          <td className={td}><CargaStatusBadge status={c.status} /></td>
                          <td className={td}>
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium border ${PRIORIDADE_TOM[c.prioridade ?? "NORMAL"]}`}>{c.prioridade ?? "NORMAL"}</span>
                          </td>
                          <td className={`${td} text-xs`}>
                            <span className="block text-foreground">{descreverTransporte(c)}</span>
                            <span className="block text-[11px] text-muted-foreground">{MODALIDADE_LABEL[c.modalidade]}</span>
                            {(c.responsaveis ?? []).length > 0 && (
                              <span className="block text-[11px] text-primary truncate max-w-[220px]" title={c.responsaveis.map((r) => r.nome).join(", ")}>
                                Responsável: {c.responsaveis.map((r) => r.nome).join(", ")}
                              </span>
                            )}
                          </td>
                          <td className={`${td} text-xs text-muted-foreground`}>{c.box ?? "—"}</td>
                          <td className={`${td} text-center text-muted-foreground`}>{c.ondas}</td>
                          <td className={`${td} text-center text-muted-foreground`}>{c.documentos}</td>
                          <td className={td}>
                            {c.unidades_total > 0 ? (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 rounded-full bg-secondary overflow-hidden">
                                  <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs font-mono text-muted-foreground">{c.unidades_embarcadas}/{c.unidades_total}</span>
                              </div>
                            ) : <span className="text-xs text-muted-foreground">{c.status === "EM_MONTAGEM" ? "Não liberada" : "—"}</span>}
                          </td>
                          <td className={`${td} text-xs text-muted-foreground`}>{dataHora(c.created_at)}</td>
                          <td className={td} onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1 relative">
                              <button type="button" onClick={() => setAcompanhando(c.id)}
                                className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                                title="Acompanhar carregamento" aria-label={`Acompanhar carregamento da carga ${c.numero_carga}`}>
                                <Eye size={13} />
                              </button>
                              <button type="button" onClick={(e) => abrirMenu(c.id, e.currentTarget)}
                                className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
                                title="Opções" aria-label={`Opções da carga ${c.numero_carga} (${CARGA_STATUS_LABEL[c.status]})`}
                                aria-haspopup="menu" aria-expanded={menuCarga === c.id}>
                                <MoreHorizontal size={13} />
                              </button>
                              {menuCarga === c.id && (
                                <>
                                  <div className="fixed inset-0 z-20" onClick={() => setMenuCarga(null)} />
                                  <div role="menu" style={menuPos} className="fixed z-30 w-64 bg-popover border border-border rounded-lg shadow-lg py-1">
                                    <button type="button" role="menuitem" onClick={() => { setMenuCarga(null); setCargaAberta(c.id); }}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary flex items-center gap-2 text-foreground">
                                      <FileText size={12} className="text-blue-400" /> Dados da carga
                                    </button>
                                    <button type="button" role="menuitem" onClick={() => void imprimirRomaneioCarga(c.id)}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary flex items-center gap-2 text-foreground">
                                      <Printer size={12} className="text-muted-foreground" /> Imprimir romaneio
                                    </button>
                                    <div className="border-t border-border my-1" />
                                    <button type="button" role="menuitem" disabled={!podeEditar || !["LIBERADA", "EM_CARREGAMENTO"].includes(c.status) || c.unidades_embarcadas === 0}
                                      onClick={() => { setMenuCarga(null); setMotivoLimpeza(""); setLimparCarga(c); }}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 text-foreground">
                                      <Eraser size={12} /> Limpar conferência do carregamento
                                    </button>
                                    <div className="border-t border-border my-1" />
                                    <button type="button" role="menuitem" disabled={!podeEditar || ["FECHADA", "CANCELADA"].includes(c.status)}
                                      onClick={() => { setMenuCarga(null); setPrioridadeCarga({ carga: c, valor: c.prioridade ?? "NORMAL" }); }}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 text-foreground">
                                      <Star size={12} /> Prioridade da carga
                                    </button>
                                    <button type="button" role="menuitem" disabled={!podeEditar || ["FECHADA", "CANCELADA"].includes(c.status)}
                                      onClick={() => { setMenuCarga(null); setResponsaveisCarga(c); }}
                                      className="w-full px-3 py-2 text-left text-xs hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 text-foreground">
                                      <UserCog size={12} /> Responsáveis pelo carregamento
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="px-4 py-2.5 border-t border-border bg-secondary/20">
              <span className="text-xs text-muted-foreground">{cargasVisiveis.length} carga(s){temFiltroCargas ? " (filtrado)" : ""}</span>
            </div>
          </div>
        </>
      )}

      {/* Modal: montar carga (mesmo padrão do Gerar Onda) */}
      <Dialog open={modalAberto} onOpenChange={(o) => { if (!montar.isPending) setModalAberto(o); }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Montar Carga</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <TransporteCampos
              idPrefixo="nova"
              valor={transporteExibido}
              onChange={alterarTransporte}
              veiculos={veiculos}
              transportadoras={transportadoras}
              desabilitado={!podeEditar}
              rotuloVeiculoVazio={veiculosOndas.length === 1 ? "Usar o veículo das ondas" : "Selecione…"}
              rotuloTransportadoraVazio={nomeTranspOndas ? `Usar a dos pedidos (${nomeTranspOndas})` : "Selecione…"}
            />
            <div>
              <label htmlFor="nova-box" className="block text-xs font-medium text-muted-foreground mb-1.5">Box / doca</label>
              <SeletorBusca
                id="nova-box"
                value={boxId}
                onChange={setBoxId}
                options={boxes.map((b) => ({ value: b.id, label: b.descricao }))}
                vazio={boxesOndas.length === 1 ? "Usar o box das ondas" : "Sem box"}
                searchPlaceholder="Nome do box ou doca..."
                disabled={!podeEditar}
              />
            </div>
            {!terceiro && (
              <CapacidadeVeiculo medidas={[
                { rotulo: "Peso", usado: totais.peso, limite: veiculoSel?.peso_total, unidade: "kg" },
                { rotulo: "Volume", usado: totais.m3, limite: veiculoSel?.m3, unidade: "m³", casas: 2 },
              ]} />
            )}
            {divergente && (
              <p className="text-xs text-yellow-400 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2" role="alert">
                {variasTransp ? "Os pedidos selecionados são de transportadoras diferentes. Monte uma carga por transportadora."
                  : divergenteVeiculo ? "Os movimentos selecionados indicam veículos diferentes. Uma carga sai num veículo só."
                  : "Os movimentos selecionados indicam boxes diferentes."}
              </p>
            )}
            {transpDiferenteErp && !divergente && (
              <p className="text-xs text-muted-foreground rounded-md border border-border bg-secondary/30 px-3 py-2">
                A transportadora escolhida é diferente da que veio do ERP ({nomeTranspOndas}). A carga será montada com a sua escolha.
              </p>
            )}
            <div className="p-3 rounded-lg bg-secondary/50 border border-border space-y-1">
              <p className="text-xs text-muted-foreground">
                {ondasSel.length} movimento(s) · {totais.pedidos} pedido(s) · {totais.volumes} volume(s) · {formatarNumero(totais.peso)} kg · {formatarNumero(totais.m3, 2)} m³
              </p>
              <p className="text-[11px] text-muted-foreground/80">Depois de montar, abra a carga para definir a ordem dos pedidos e liberar para o coletor.</p>
            </div>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setModalAberto(false)} disabled={montar.isPending}
              className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button type="button" onClick={() => montar.mutate()} disabled={!podeEditar || ondasSel.length === 0 || divergente || montar.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {montar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Boxes size={14} />} Montar Carga
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Prioridade da carga (mesmo padrão da onda) */}
      <Dialog open={!!prioridadeCarga} onOpenChange={(v) => !v && !acaoCarga && setPrioridadeCarga(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Prioridade da carga #{prioridadeCarga?.carga.numero_carga}</DialogTitle>
            <DialogDescription>Define a ordem da carga na lista do embarque no coletor.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 mt-2" role="radiogroup" aria-label="Prioridade">
            {PRIORIDADES_CARGA.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={prioridadeCarga?.valor === p}
                onClick={() => setPrioridadeCarga((x) => (x ? { ...x, valor: p } : x))}
                className={`px-4 py-3 rounded-lg border text-sm font-medium text-left transition-colors ${
                  prioridadeCarga?.valor === p ? "border-primary bg-primary/10 text-primary" : "border-border bg-secondary/30 text-foreground hover:bg-secondary"}`}>
                {p}
              </button>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setPrioridadeCarga(null)} disabled={acaoCarga}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button type="button" disabled={acaoCarga}
              onClick={() => prioridadeCarga && void executarAcao(
                () => cargaService.definirPrioridade(tenantId as string, usuarioId ?? "", prioridadeCarga.carga.id, prioridadeCarga.valor),
                () => setPrioridadeCarga(null), "carga-prioridade")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {acaoCarga && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Limpar conferência do carregamento */}
      <Dialog open={!!limparCarga} onOpenChange={(v) => !v && !acaoCarga && setLimparCarga(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Limpar conferência do carregamento</DialogTitle>
            <DialogDescription>
              Os {limparCarga?.unidades_embarcadas ?? 0} volume(s) já carregados da carga #{limparCarga?.numero_carga} voltam a aguardar carregamento
              e o veículo precisa ser confirmado de novo. O histórico de quem carregou fica registrado.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label htmlFor="motivo-limpeza" className="block text-xs font-medium text-muted-foreground mb-1.5">Motivo *</label>
            <textarea id="motivo-limpeza" value={motivoLimpeza} onChange={(e) => setMotivoLimpeza(e.target.value)} rows={3} maxLength={300}
              placeholder="Ex.: volumes carregados no veículo errado"
              className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary resize-none" />
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" onClick={() => setLimparCarga(null)} disabled={acaoCarga}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button type="button" disabled={acaoCarga || !motivoLimpeza.trim()}
              onClick={() => limparCarga && void executarAcao(
                () => cargaService.limparConferencia(tenantId as string, usuarioId ?? "", limparCarga.id, motivoLimpeza.trim()),
                () => setLimparCarga(null), "carga-limpar-conferencia")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors">
              {acaoCarga && <Loader2 size={14} className="animate-spin" />} Confirmar
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <CargaResponsaveisDialog carga={responsaveisCarga} tenantId={tenantId as string} usuarioId={usuarioId ?? ""}
        onClose={() => setResponsaveisCarga(null)} onSuccess={recarregarCargas} />

      <CargaAcompanhamentoSheet cargaId={acompanhando} tenantId={tenantId as string} onClose={() => setAcompanhando(null)} />

      <CargaDetalheSheet
        cargaId={cargaAberta}
        onClose={() => setCargaAberta(null)}
        tenantId={tenantId as string}
        empresaId={empresaId as string}
        usuarioId={usuarioId ?? ""}
        podeEditar={podeEditar}
        veiculos={veiculos}
        boxes={boxes}
        transportadoras={transportadoras}
      />
    </div>
  );
}
