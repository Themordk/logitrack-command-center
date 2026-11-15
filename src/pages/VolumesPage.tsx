/**
 * Atividades › Volumes (Fase 4 do plano de etiqueta de volume: A7, A18–A23).
 * Lista, cards, filtros e busca vêm de rpc_volumes_listar; ações pelas RPCs de volumesService.
 */
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Download, Eye, Loader2, Package, Printer, RefreshCcw, Ruler,
} from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { parseError } from "@/lib/errorMapper";
import { exportToExcel, type ExportColumn } from "@/modules/reports/utils/exporters";
import {
  volumesService, VolumeRpcError, type FiltrosVolumes, type SituacaoVolume, type StatusVolume, type VolumeLinha,
} from "@/lib/volumesService";
import {
  CARDS_RESUMO, SITUACAO_LABEL, STATUS_VOLUME, cidadeUf, identificacaoVolume, selecionavel, textoEmbarque, textoEtiqueta, textoNf,
} from "@/lib/volumesExibicao";
import { ImprimirVolumesDialog } from "@/components/volumes/ImprimirVolumesDialog";
import { VolumeDetalheSheet } from "@/components/volumes/VolumeDetalheSheet";
import {
  AcrescentarVolumesDialog, CancelarVolumeDialog, MedidasVolumeDialog, VincularPedidoDialog,
} from "@/components/volumes/VolumeAcoesDialogs";
import type { DetalheVolume } from "@/lib/volumesService";

const MODULO = "web.atividades.volumes";
const TAMANHO = 50;
const filtroInput = "h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary";
const filtroLabel = "text-[11px] font-medium text-muted-foreground uppercase";
const th = "px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase bg-secondary whitespace-nowrap text-left";
const td = "px-3 py-2.5 align-top";

const FILTROS_VAZIOS: FiltrosVolumes = {
  status: "", situacao: "", numero_onda: "", pedido: "", nf: "", cliente: "", numero_carga: "", data_de: "", data_ate: "", busca: "",
};

const Selo = ({ cls, children, title }: { cls: string; children: React.ReactNode; title?: string }) => (
  <span title={title} className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap ${cls}`}>{children}</span>
);

const dataHora = (v: string | null | undefined) => (v ? new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "");

const COLUNAS_EXPORT: ExportColumn[] = [
  { key: "codigo_volume", label: "Volume" },
  { key: "identificacao", label: "Nº / Total", format: (r) => identificacaoVolume(r) },
  { key: "status", label: "Status", format: (r) => STATUS_VOLUME[r.status as StatusVolume]?.label ?? r.status },
  { key: "numero_onda", label: "Onda" },
  { key: "numero_pedido", label: "Pedido" },
  { key: "parceiro_nome", label: "Cliente" },
  { key: "cidade", label: "Cidade / UF", format: (r) => cidadeUf(r.parceiro_cidade, r.parceiro_uf) },
  { key: "nf", label: "NF", format: (r) => textoNf(r.nf_numero, r.nf_serie) },
  { key: "nf_qtd_volumes", label: "Volumes na NF" },
  { key: "nf_divergente", label: "Divergente da NF", format: (r) => (r.nf_divergente ? "Sim" : "") },
  { key: "numero_carga", label: "Carga" },
  { key: "embarque", label: "Embarque", format: (r) => (r.embarque_status === "EMBARCADA" ? "Embarcado" : r.embarque_status ? "Aguardando" : "") },
  { key: "etiqueta", label: "Etiqueta", format: (r) => textoEtiqueta(r).texto },
  { key: "peso_bruto", label: "Peso (kg)" },
  { key: "m3", label: "Cubagem (m³)" },
  { key: "created_at", label: "Criado em", format: (r) => dataHora(r.created_at) },
  { key: "criado_por_nome", label: "Criado por" },
  { key: "motivo_cancelamento", label: "Motivo do cancelamento" },
];

export function VolumesPage({ onNavigate: _onNavigate }: { onNavigate?: (path: string) => void } = {}) {
  const { empresaId } = useTenant();
  const { can } = usePermissions();
  const permissoes = {
    imprimir: can(MODULO, "READ"), editar: can(MODULO, "UPDATE"), criar: can(MODULO, "CREATE"), cancelar: can(MODULO, "DELETE"),
  };
  const qc = useQueryClient();

  const [filtros, setFiltros] = useState<FiltrosVolumes>(FILTROS_VAZIOS);
  const [filtrosAplicados, setFiltrosAplicados] = useState<FiltrosVolumes>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [selecionados, setSelecionados] = useState<Map<string, VolumeLinha>>(new Map());

  // Busca de texto com 400 ms de espera; selects e datas aplicam na hora
  useEffect(() => {
    const t = setTimeout(() => { setFiltrosAplicados(filtros); setPagina(1); }, 400);
    return () => clearTimeout(t);
  }, [filtros]);

  const lista = useQuery({
    queryKey: ["volumes", empresaId, filtrosAplicados, pagina],
    queryFn: () => volumesService.listar(empresaId ?? null, filtrosAplicados, pagina, TAMANHO),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
  const dados = lista.data;
  const linhas = dados?.linhas ?? [];
  const totalPaginas = Math.max(1, Math.ceil((dados?.total ?? 0) / TAMANHO));
  const cancelados = filtrosAplicados.status === "CANCELADO";

  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [imprimir, setImprimir] = useState<VolumeLinha[] | null>(null);
  const [cancelar, setCancelar] = useState<{ id: string; codigo_volume: string; numero_pedido: number | null } | null>(null);
  const [acrescentar, setAcrescentar] = useState<{ movimentoSaidaId: string; documentoSaidaId: string; numeroPedido: number | null; atuais: number } | null>(null);
  const [vincular, setVincular] = useState<{ volumeId: string; codigoVolume: string; pedidos: DetalheVolume["pedidos_da_onda"] } | null>(null);
  const [medidas, setMedidas] = useState<string[] | null>(null);
  const [exportando, setExportando] = useState(false);

  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["volumes"] });
    void qc.invalidateQueries({ queryKey: ["volume-detalhe"] });
  };

  const mudar = (campo: keyof FiltrosVolumes, valor: string) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const aplicarCard = (situacao?: SituacaoVolume, status?: StatusVolume) => {
    const novo: FiltrosVolumes = { ...filtros, situacao: situacao ?? "", status: status ?? "" };
    const igual = (filtros.situacao || "") === (novo.situacao || "") && (filtros.status || "") === (novo.status || "");
    const final = igual ? { ...filtros, situacao: "", status: "" } as FiltrosVolumes : novo;
    setFiltros(final); setFiltrosAplicados(final); setPagina(1); setSelecionados(new Map());
  };
  const temFiltro = Object.values(filtros).some((v) => (v ?? "").trim() !== "");

  const alternar = (v: VolumeLinha) => setSelecionados((s) => {
    const n = new Map(s);
    if (n.has(v.id)) n.delete(v.id); else n.set(v.id, v);
    return n;
  });
  const selecionaveisPagina = linhas.filter(selecionavel);
  const todosPagina = selecionaveisPagina.length > 0 && selecionaveisPagina.every((v) => selecionados.has(v.id));
  const alternarPagina = () => setSelecionados((s) => {
    const n = new Map(s);
    if (todosPagina) selecionaveisPagina.forEach((v) => n.delete(v.id)); else selecionaveisPagina.forEach((v) => n.set(v.id, v));
    return n;
  });
  const listaSelecionados = useMemo(() => [...selecionados.values()], [selecionados]);

  const exportar = async () => {
    setExportando(true);
    try {
      const todas = await volumesService.listarTodos(empresaId ?? null, filtrosAplicados);
      if (todas.length === 0) { toast.info("Nada para exportar com esses filtros."); return; }
      exportToExcel(cancelados ? "volumes_cancelados" : "volumes", COLUNAS_EXPORT, todas);
      toast.success(`${todas.length} volume(s) exportado(s).`);
    } catch (e) {
      toast.error(e instanceof VolumeRpcError ? e.message : parseError(e, "exportar-volumes").title);
    } finally { setExportando(false); }
  };

  /** Depois de cancelar ou acrescentar, o total do pedido mudou: oferece reimprimir as etiquetas do pedido. */
  const oferecerReimpressao = async (ids: string[], numeroPedido: number | null) => {
    recarregar();
    if (ids.length === 0) return;
    try {
      const r = await volumesService.listar(empresaId ?? null, numeroPedido ? { pedido: String(numeroPedido) } : {}, 1, 500);
      const doPedido = r.linhas.filter((l) => ids.includes(l.id));
      if (doPedido.length) {
        toast.info("O total de volumes do pedido mudou.", {
          description: "As etiquetas já impressas mostram o total antigo.",
          action: { label: "Reimprimir etiquetas", onClick: () => setImprimir(doPedido) },
          duration: 12000,
        });
      }
    } catch { /* só a sugestão falhou; a ação já foi concluída */ }
  };

  const resumo = dados?.resumo;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Volumes de Expedição</h1>
          <p className="text-xs text-muted-foreground">Etiquetas, pedido, nota fiscal e embarque de cada volume gerado na expedição</p>
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
            <>
              <button type="button" onClick={() => setMedidas(listaSelecionados.map((v) => v.id))} disabled={!permissoes.editar}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary disabled:opacity-40">
                <Ruler size={14} /> Peso e cubagem ({selecionados.size})
              </button>
              <button type="button" onClick={() => setImprimir(listaSelecionados)} disabled={!permissoes.imprimir}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40">
                <Printer size={14} /> Imprimir selecionados ({selecionados.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {CARDS_RESUMO.map((c) => {
          const valor = resumo ? resumo[c.chave] ?? 0 : null;
          const ativo = (c.situacao && filtrosAplicados.situacao === c.situacao) || (c.status && filtrosAplicados.status === c.status);
          const clicavel = !!(c.situacao || c.status);
          return (
            <button key={c.chave} type="button" title={c.hint} disabled={!clicavel}
              onClick={() => clicavel && aplicarCard(c.situacao, c.status)}
              aria-pressed={clicavel ? !!ativo : undefined}
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
          <label htmlFor="vol-busca" className={filtroLabel}>Buscar</label>
          <input id="vol-busca" value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)}
            placeholder="Volume, pedido, cliente ou NF..." className={`${filtroInput} w-64`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="vol-status" className={filtroLabel}>Status</label>
          <select id="vol-status" value={filtros.status} onChange={(e) => { mudar("status", e.target.value); }} className={`${filtroInput} w-36`}>
            <option value="">Ativos</option>
            {(Object.keys(STATUS_VOLUME) as StatusVolume[]).map((s) => <option key={s} value={s}>{STATUS_VOLUME[s].label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="vol-situacao" className={filtroLabel}>Situação</label>
          <select id="vol-situacao" value={filtros.situacao} onChange={(e) => mudar("situacao", e.target.value)} disabled={filtros.status === "CANCELADO"}
            className={`${filtroInput} w-48`}>
            <option value="">Todas</option>
            {(Object.keys(SITUACAO_LABEL) as SituacaoVolume[]).map((s) => <option key={s} value={s}>{SITUACAO_LABEL[s]}</option>)}
          </select>
        </div>
        {([
          ["numero_onda", "Onda", "Nº", "w-24"],
          ["pedido", "Pedido", "Nº do pedido", "w-32"],
          ["nf", "NF", "Nº da NF", "w-28"],
          ["cliente", "Cliente", "Nome do cliente", "w-48"],
          ["numero_carga", "Carga", "Nº", "w-24"],
        ] as const).map(([campo, r, ph, w]) => (
          <div key={campo} className="flex flex-col gap-1">
            <label htmlFor={`vol-${campo}`} className={filtroLabel}>{r}</label>
            <input id={`vol-${campo}`} value={filtros[campo]} onChange={(e) => mudar(campo, e.target.value)} placeholder={ph}
              inputMode={campo === "cliente" ? undefined : "numeric"} className={`${filtroInput} ${w}`} />
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <label htmlFor="vol-de" className={filtroLabel}>{cancelados ? "Cancelado de" : "Criado de"}</label>
          <input id="vol-de" type="date" value={filtros.data_de} onChange={(e) => mudar("data_de", e.target.value)} className={`${filtroInput} w-36`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="vol-ate" className={filtroLabel}>Até</label>
          <input id="vol-ate" type="date" value={filtros.data_ate} onChange={(e) => mudar("data_ate", e.target.value)} className={`${filtroInput} w-36`} />
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
          <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-300">
            {lista.error instanceof VolumeRpcError ? lista.error.message : parseError(lista.error, "volumes-listar").title}
          </div>
        ) : linhas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center px-4">
            <Package size={32} className="mb-2 opacity-40" aria-hidden="true" />
            <p className="text-sm">{temFiltro ? "Nenhum volume encontrado com esses filtros." : "Nenhum volume de expedição gerado ainda."}</p>
            {!temFiltro && <p className="text-xs mt-1 max-w-md">Os volumes aparecem aqui quando são gerados na separação, na conferência ou no embarque, conforme o tipo de saída.</p>}
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border">
                  <th className={`${th} w-10`}>
                    <input type="checkbox" checked={todosPagina} onChange={alternarPagina} disabled={cancelados || selecionaveisPagina.length === 0}
                      className="rounded border-border" aria-label="Selecionar os volumes desta página" />
                  </th>
                  <th className={th}>Volume</th>
                  <th className={th}>Pedido / Cliente</th>
                  <th className={th}>Onda</th>
                  <th className={th}>NF</th>
                  <th className={th}>{cancelados ? "Cancelamento" : "Carga / Embarque"}</th>
                  <th className={th}>Etiqueta</th>
                  <th className={th}>Status</th>
                  <th className={th}>Criado</th>
                  <th className={`${th} w-10`}><span className="sr-only">Detalhe</span></th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((v) => {
                  const marcado = selecionados.has(v.id);
                  const etq = textoEtiqueta(v);
                  const st = STATUS_VOLUME[v.status] ?? { label: v.status, cls: "" };
                  return (
                    <tr key={v.id} onClick={() => setDetalheId(v.id)}
                      className={`border-b border-border/50 table-row-hover cursor-pointer ${marcado ? "bg-primary/5" : ""}`}>
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        {selecionavel(v) && (
                          <input type="checkbox" checked={marcado} onChange={() => alternar(v)} className="rounded border-border"
                            aria-label={`Selecionar volume ${v.codigo_volume}`} />
                        )}
                      </td>
                      <td className={td}>
                        <div className="font-mono text-xs text-foreground">{v.codigo_volume}</div>
                        <div className="text-[11px] text-muted-foreground">Volume {identificacaoVolume(v)}</div>
                      </td>
                      <td className={`${td} max-w-[240px]`}>
                        {v.numero_pedido ? (
                          <>
                            <div className="font-mono text-xs text-foreground">{v.numero_pedido}</div>
                            <div className="text-xs text-muted-foreground truncate" title={v.parceiro_nome ?? undefined}>{v.parceiro_nome ?? "—"}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{cidadeUf(v.parceiro_cidade, v.parceiro_uf)}</div>
                          </>
                        ) : <Selo cls="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">Sem pedido</Selo>}
                      </td>
                      <td className={`${td} font-mono text-xs`}>{v.numero_onda ?? "—"}</td>
                      <td className={td}>
                        {v.nf_numero ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-xs text-foreground">{textoNf(v.nf_numero, v.nf_serie)}</span>
                            {v.nf_divergente && (
                              <Selo cls="bg-red-500/15 text-red-400 border-red-500/30" title={`NF informa ${v.nf_qtd_volumes} volume(s); o pedido tem ${v.total_volumes_pedido}`}>
                                <AlertTriangle size={10} className="mr-1" aria-hidden="true" /> NF {v.nf_qtd_volumes} vol.
                              </Selo>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">{v.documento_saida_id ? "Sem NF" : "—"}</span>}
                      </td>
                      <td className={`${td} text-xs`}>
                        {cancelados ? (
                          <div className="max-w-[220px]">
                            <div className="text-foreground truncate" title={v.motivo_cancelamento}>{v.motivo_cancelamento}</div>
                            <div className="text-muted-foreground">{dataHora(v.cancelado_em)} · {v.cancelado_por_nome ?? "—"}</div>
                          </div>
                        ) : textoEmbarque(v) ? (
                          <span className={v.embarque_status === "EMBARCADA" ? "text-green-400" : "text-foreground"}>{textoEmbarque(v)}</span>
                        ) : <span className="text-muted-foreground">Fora de carga</span>}
                      </td>
                      <td className={`${td} text-xs ${etq.cls}`}>{cancelados ? "—" : etq.texto}</td>
                      <td className={td}><Selo cls={st.cls}>{st.label}</Selo></td>
                      <td className={`${td} text-xs text-muted-foreground whitespace-nowrap`}>
                        <div>{dataHora(v.created_at)}</div>
                        {v.criado_por_nome && <div className="truncate max-w-[140px]">{v.criado_por_nome}</div>}
                      </td>
                      <td className={td}>
                        <button type="button" onClick={(e) => { e.stopPropagation(); setDetalheId(v.id); }}
                          className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
                          aria-label={`Ver detalhe do volume ${v.codigo_volume}`}>
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
            {(dados?.total ?? 0).toLocaleString("pt-BR")} volume{dados?.total === 1 ? "" : "s"}{temFiltro ? " (filtrado)" : ""}
            {selecionados.size > 0 && <> · <b className="text-foreground">{selecionados.size} selecionado(s)</b>
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

      <VolumeDetalheSheet
        volumeId={detalheId}
        onClose={() => setDetalheId(null)}
        permissoes={permissoes}
        onImprimir={(vs) => setImprimir(vs)}
        onCancelar={setCancelar}
        onAcrescentar={setAcrescentar}
        onVincular={setVincular}
        onMedidas={setMedidas}
      />

      <ImprimirVolumesDialog
        open={!!imprimir}
        volumes={imprimir ?? []}
        onClose={() => setImprimir(null)}
        onImpresso={() => { setSelecionados(new Map()); recarregar(); }}
      />
      <CancelarVolumeDialog
        volume={cancelar}
        onClose={() => setCancelar(null)}
        onFeito={(restantes) => {
          const id = cancelar?.id;
          const pedido = cancelar?.numero_pedido ?? null;
          setCancelar(null);
          setSelecionados((s) => { const n = new Map(s); if (id) n.delete(id); return n; });
          if (id === detalheId) setDetalheId(null);
          void oferecerReimpressao(restantes, pedido);
        }}
      />
      <AcrescentarVolumesDialog
        alvo={acrescentar}
        onClose={() => setAcrescentar(null)}
        onFeito={(ids) => { const pedido = acrescentar?.numeroPedido ?? null; setAcrescentar(null); void oferecerReimpressao(ids, pedido); }}
      />
      <VincularPedidoDialog alvo={vincular} onClose={() => setVincular(null)} onFeito={() => { setVincular(null); recarregar(); }} />
      <MedidasVolumeDialog volumeIds={medidas} onClose={() => setMedidas(null)} onFeito={() => { setMedidas(null); recarregar(); }} />
    </div>
  );
}
