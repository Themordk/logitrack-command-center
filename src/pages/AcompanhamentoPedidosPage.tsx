/**
 * Operação › Acompanhamento de Pedidos (plano de status · S2).
 * Os três status de cada pedido lado a lado: etapa (onda/carga/embarque), entrega e integração com o ERP.
 * Lista, filtros, cartões e paginação vêm só de rpc_pedidos_acompanhamento; a tela só exibe.
 */
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ClipboardList, Download, Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import { exportToExcel, type ExportColumn } from "@/modules/reports/utils/exporters";
import {
  CARTOES_ACOMPANHAMENTO, ENTREGAS_ORDEM, ETAPAS_ORDEM, VISUAL_ENTREGA, VISUAL_ETAPA,
  type CartaoAcompanhamento, type EntregaPedido, type EtapaPedido,
} from "@/lib/situacaoPedido";
import { estadoIntegracao, linhaIntegracao, VISUAL_ESTADO } from "@/lib/integracaoStatus";
import {
  listarAcompanhamento, situacaoPedidoKeys, type FiltrosAcompanhamento, type PedidoAcompanhamento,
} from "@/lib/situacaoPedidoService";
import { EntregaPedidoBadge, EtapaPedidoBadge } from "@/components/situacao/SituacaoPedidoBadges";
import { IntegracaoDocumentoStatus } from "@/components/integracao/IntegracaoDocumentoStatus";
import { DocSaidaDetalhePage } from "@/pages/DocSaidaDetalhePage";

const TAMANHO = 50;
const filtroInput = "h-9 px-3 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary";
const filtroLabel = "text-[11px] font-medium text-muted-foreground uppercase";
const th = "px-3 py-2.5 text-xs font-medium text-muted-foreground uppercase bg-secondary whitespace-nowrap text-left";
const td = "px-3 py-2.5 align-top";

const fmtData = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Fortaleza", dateStyle: "short", timeStyle: "short" }) : "";
const fmtDia = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "";

const hojeMenos = (dias: number) => {
  const d = new Date(Date.now() - dias * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Fortaleza" });
};

interface FiltrosTela {
  busca: string; dataDe: string; dataAte: string; etapa: string; entrega: string; integracao: string;
}
const FILTROS_PADRAO: FiltrosTela = { busca: "", dataDe: hojeMenos(30), dataAte: "", etapa: "", entrega: "", integracao: "" };

const INTEGRACOES: { valor: string; rotulo: string }[] = [
  { valor: "erro", rotulo: "Erro no ERP" },
  { valor: "pendente", rotulo: "Aguardando envio" },
  { valor: "integrado", rotulo: "Integrado" },
  { valor: "ignorado", rotulo: "Não enviado (regra)" },
  { valor: "nao_integra", rotulo: "Não enviado (sem regra)" },
];

const COLUNAS_EXPORT: ExportColumn[] = [
  { key: "numero_pedido", label: "Pedido" },
  { key: "data_emissao", label: "Emissão", format: (r) => fmtDia(r.data_emissao) },
  { key: "cliente", label: "Cliente" },
  { key: "cidade", label: "Cidade / UF", format: (r) => [r.cidade, r.uf].filter(Boolean).join(" / ") },
  { key: "tipo_saida", label: "Tipo de saída" },
  { key: "numero_nf", label: "NF" },
  { key: "onda_numero", label: "Onda" },
  { key: "carga_numero", label: "Carga" },
  { key: "etapa", label: "Etapa", format: (r) => VISUAL_ETAPA[r.etapa as EtapaPedido]?.rotulo ?? r.etapa },
  { key: "etapa_em", label: "Etapa desde", format: (r) => fmtData(r.etapa_em) },
  { key: "entrega_status", label: "Entrega", format: (r) => VISUAL_ENTREGA[r.entrega_status as EntregaPedido]?.rotulo ?? r.entrega_status },
  { key: "entrega_em", label: "Entrega em", format: (r) => fmtData(r.entrega_em) },
  { key: "entrega_motivo", label: "Motivo da entrega" },
  { key: "entrega_tentativas", label: "Tentativas" },
  { key: "integracao", label: "Integração", format: (r) => linhaIntegracao(r.integracao) },
  { key: "integracao_erro", label: "Erro no ERP", format: (r) => r.integracao?.erro ?? "" },
];

interface Props { onNavigate?: (path: string) => void }

export function AcompanhamentoPedidosPage(_props: Props) {
  const { empresaId } = useTenant();
  const qc = useQueryClient();
  const [filtros, setFiltros] = useState<FiltrosTela>(FILTROS_PADRAO);
  const [aplicados, setAplicados] = useState<FiltrosTela>(FILTROS_PADRAO);
  const [cartao, setCartao] = useState<CartaoAcompanhamento | null>(null);
  const [pagina, setPagina] = useState(1);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const params: FiltrosAcompanhamento | null = useMemo(() => empresaId ? {
    empresaId,
    dataDe: aplicados.dataDe || null,
    dataAte: aplicados.dataAte || null,
    busca: aplicados.busca || null,
    etapas: aplicados.etapa ? [aplicados.etapa as EtapaPedido] : [],
    entregas: aplicados.entrega ? [aplicados.entrega as EntregaPedido] : [],
    integracoes: aplicados.integracao ? [aplicados.integracao] : [],
    cartao,
    pagina,
    tamanho: TAMANHO,
  } : null, [empresaId, aplicados, cartao, pagina]);

  const lista = useQuery({
    queryKey: params ? situacaoPedidoKeys.lista(params) : ["pedidos-acompanhamento", "sem-empresa"],
    queryFn: () => listarAcompanhamento(params!),
    enabled: !!params,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });

  const dados = lista.data;
  const linhas = dados?.linhas ?? [];
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / TAMANHO)) : 1;
  const temFiltro = JSON.stringify(aplicados) !== JSON.stringify(FILTROS_PADRAO) || !!cartao;

  const mudar = (campo: keyof FiltrosTela, valor: string) => setFiltros((f) => ({ ...f, [campo]: valor }));
  const filtrar = () => { setAplicados(filtros); setPagina(1); qc.invalidateQueries({ queryKey: situacaoPedidoKeys.todas }); };
  const limpar = () => { setFiltros(FILTROS_PADRAO); setAplicados(FILTROS_PADRAO); setCartao(null); setPagina(1); };
  const alternarCartao = (c: CartaoAcompanhamento) => { setCartao((atual) => (atual === c ? null : c)); setPagina(1); };

  const exportar = async () => {
    if (!params) return;
    setExportando(true);
    try {
      const todas: PedidoAcompanhamento[] = [];
      for (let p = 1; p <= 50; p++) {
        const r = await listarAcompanhamento({ ...params, pagina: p, tamanho: 200 });
        todas.push(...r.linhas);
        if (todas.length >= r.total || r.linhas.length === 0) break;
      }
      if (!todas.length) { toast.info("Nada para exportar com esses filtros."); return; }
      exportToExcel("acompanhamento_pedidos", COLUNAS_EXPORT, todas);
      toast.success(`${todas.length} pedido(s) exportado(s).`);
    } catch (e) {
      toast.error(parseError(e, "acompanhamento-exportar").title);
    } finally { setExportando(false); }
  };

  if (detalheId) {
    return (
      <DocSaidaDetalhePage documentoId={detalheId} backLabel="Voltar para o acompanhamento"
        onBack={() => { setDetalheId(null); void lista.refetch(); }} />
    );
  }

  const erro = lista.isError ? parseError(lista.error, "acompanhamento-listar") : null;

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-foreground">Acompanhamento de Pedidos</h1>
          <p className="text-xs text-muted-foreground">Etapa no armazém, entrega ao cliente e integração com o ERP de cada pedido de saída</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void lista.refetch()} disabled={lista.isFetching}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
            <RefreshCcw size={14} className={lista.isFetching ? "animate-spin" : ""} /> Atualizar
          </button>
          <button type="button" onClick={() => void exportar()} disabled={exportando || !dados?.total}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-50">
            {exportando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Exportar Excel
          </button>
        </div>
      </div>

      {/* Cartões: atenção do supervisor (clicar filtra) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {CARTOES_ACOMPANHAMENTO.map((c) => {
          const valor = dados?.cartoes?.[c.id];
          const ativo = cartao === c.id;
          return (
            <button key={c.id} type="button" onClick={() => alternarCartao(c.id)} aria-pressed={ativo}
              className={`text-left border rounded-lg bg-card px-3 py-2 transition-colors hover:border-primary/50 ${ativo ? "border-primary ring-1 ring-primary/40" : "border-border"}`}>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate" title={c.rotulo}>{c.rotulo}</div>
              <div className={`text-lg font-bold tabular-nums ${valor ? (c.tom === "vermelho" ? "text-rose-600 dark:text-rose-400" : "text-amber-600 dark:text-amber-400") : "text-foreground"}`}>
                {valor == null ? "—" : valor.toLocaleString("pt-BR")}
              </div>
            </button>
          );
        })}
        <div className="border border-border rounded-lg bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Em rota</div>
          <div className="text-lg font-bold tabular-nums text-foreground">{dados?.cartoes?.em_rota?.toLocaleString("pt-BR") ?? "—"}</div>
        </div>
        <div className="border border-border rounded-lg bg-card px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Entregues</div>
          <div className="text-lg font-bold tabular-nums text-foreground">{dados?.cartoes?.entregues?.toLocaleString("pt-BR") ?? "—"}</div>
        </div>
      </div>

      {/* Filtros */}
      <form className="flex flex-wrap items-end gap-3 p-4 rounded-lg border border-border bg-secondary/30"
        onSubmit={(e) => { e.preventDefault(); filtrar(); }}>
        <div className="flex flex-col gap-1">
          <label htmlFor="acp-busca" className={filtroLabel}>Buscar</label>
          <input id="acp-busca" value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)}
            placeholder="Pedido, NF, onda, carga ou cliente..." className={`${filtroInput} w-64`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="acp-de" className={filtroLabel}>Emissão de</label>
          <input id="acp-de" type="date" value={filtros.dataDe} onChange={(e) => mudar("dataDe", e.target.value)} className={`${filtroInput} w-36`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="acp-ate" className={filtroLabel}>Até</label>
          <input id="acp-ate" type="date" value={filtros.dataAte} onChange={(e) => mudar("dataAte", e.target.value)} className={`${filtroInput} w-36`} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="acp-etapa" className={filtroLabel}>Etapa</label>
          <select id="acp-etapa" value={filtros.etapa} onChange={(e) => mudar("etapa", e.target.value)} className={`${filtroInput} w-44`}>
            <option value="">Todas</option>
            {ETAPAS_ORDEM.map((e) => <option key={e} value={e}>{VISUAL_ETAPA[e].rotulo}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="acp-entrega" className={filtroLabel}>Entrega</label>
          <select id="acp-entrega" value={filtros.entrega} onChange={(e) => mudar("entrega", e.target.value)} className={`${filtroInput} w-48`}>
            <option value="">Todas</option>
            {ENTREGAS_ORDEM.map((e) => <option key={e} value={e}>{VISUAL_ENTREGA[e].rotulo}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="acp-int" className={filtroLabel}>Integração</label>
          <select id="acp-int" value={filtros.integracao} onChange={(e) => mudar("integracao", e.target.value)} className={`${filtroInput} w-48`}>
            <option value="">Todas</option>
            {INTEGRACOES.map((i) => <option key={i.valor} value={i.valor}>{i.rotulo}</option>)}
          </select>
        </div>
        <button type="submit" className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">Filtrar</button>
        {temFiltro && (
          <button type="button" onClick={limpar}
            className="h-9 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary">
            Limpar filtros
          </button>
        )}
      </form>

      {/* Tabela */}
      <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">
        {lista.isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : erro ? (
          <div className="m-4 rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-600 dark:text-red-300">
            <p className="font-medium">{erro.title}</p>
            {erro.details && <p className="text-xs mt-1">{erro.details}</p>}
          </div>
        ) : linhas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-center px-4">
            <ClipboardList size={32} className="mb-2 opacity-40" aria-hidden="true" />
            <p className="text-sm">{temFiltro ? "Nenhum pedido encontrado com esses filtros." : "Nenhum pedido emitido no período."}</p>
            <p className="text-xs mt-1 max-w-md">Cada pedido de saída aparece aqui com a etapa no armazém, a entrega e a integração com o ERP.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border">
                  <th className={th}>Pedido / Cliente</th>
                  <th className={th}>Emissão</th>
                  <th className={th}>Onda / Carga</th>
                  <th className={th}>Etapa</th>
                  <th className={th}>Entrega</th>
                  <th className={th}>Integração</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((p) => {
                  const estadoInt = estadoIntegracao(p.integracao?.estado) ?? "nao_integra";
                  return (
                    <tr key={p.id} onClick={() => setDetalheId(p.id)} className="border-b border-border/50 table-row-hover cursor-pointer">
                      <td className={`${td} max-w-[260px]`}>
                        <div className="font-mono text-xs text-foreground">{p.numero_pedido ?? "—"}{p.numero_nf ? <span className="text-muted-foreground"> · NF {p.numero_nf}</span> : null}</div>
                        <div className="text-xs text-muted-foreground truncate" title={p.cliente ?? undefined}>{p.cliente ?? "—"}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{[p.cidade, p.uf].filter(Boolean).join(" / ")}{p.tipo_saida ? ` · ${p.tipo_saida}` : ""}</div>
                      </td>
                      <td className={`${td} text-xs text-muted-foreground whitespace-nowrap`}>{fmtDia(p.data_emissao)}</td>
                      <td className={`${td} font-mono text-xs whitespace-nowrap`}>
                        <div>{p.onda_numero ? `Onda ${p.onda_numero}` : "—"}</div>
                        {p.carga_numero ? <div className="text-muted-foreground">Carga {p.carga_numero}</div> : null}
                      </td>
                      <td className={td}>
                        <EtapaPedidoBadge etapa={p.etapa} />
                        {p.etapa_em && <div className="text-[11px] text-muted-foreground mt-0.5">desde {fmtData(p.etapa_em)}</div>}
                      </td>
                      <td className={td}>
                        <EntregaPedidoBadge entrega={p.entrega_status} motivo={p.entrega_motivo} />
                        {p.entrega_em && <div className="text-[11px] text-muted-foreground mt-0.5">{fmtData(p.entrega_em)}</div>}
                        {p.entrega_motivo && (p.entrega_status === "nao_entregue" || p.entrega_status === "entrega_nao_gerada") && (
                          <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5 max-w-[240px] truncate" title={p.entrega_motivo}>{p.entrega_motivo}</div>
                        )}
                        {p.entrega_tentativas > 1 && <div className="text-[11px] text-muted-foreground">{p.entrega_tentativas} tentativas</div>}
                      </td>
                      <td className={td}>
                        {estadoInt === "nao_integra" ? (
                          <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-medium ${VISUAL_ESTADO.nao_integra.classe}`}
                            title="Nenhuma regra de retorno rodou para este pedido.">{VISUAL_ESTADO.nao_integra.rotulo}</span>
                        ) : (
                          <IntegracaoDocumentoStatus integracao={p.integracao} className="max-w-[300px]" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {dados && dados.total > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border text-xs text-muted-foreground">
            <span>{dados.total.toLocaleString("pt-BR")} pedido(s)</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1}
                className="p-1.5 rounded border border-border hover:bg-secondary disabled:opacity-40" aria-label="Página anterior"><ChevronLeft size={14} /></button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button type="button" onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))} disabled={pagina >= totalPaginas}
                className="p-1.5 rounded border border-border hover:bg-secondary disabled:opacity-40" aria-label="Próxima página"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AcompanhamentoPedidosPage;
