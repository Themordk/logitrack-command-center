import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { Loader2, MapPin, CheckCircle, Archive, Database, X } from "lucide-react";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, type OverlayType } from "@/components/coletor/StatusOverlay";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useFeedback } from "@/hooks/useFeedback";
import {
  chamarRpcArmazenagem,
  buscarDashboardCancelamento,
  embalagensDoProduto,
  limparEanConfirmado,
  montarEanMap,
  registrarEanConfirmado,
  resolverLeituraArmazenagem,
  type EanMapArmazenagem,
} from "@/lib/armazenagemService";
import { definirOrigemArmazenagem, ZERO_UUID, calcularPrazo, type ArmazenagemOrigem } from "@/lib/armazenagemOrigem";
import type { CamposCancelamento } from "@/types/armazenagemCancelamento";
import { PrazoCancelamentoBadge } from "@/components/coletor/PrazoCancelamentoBadge";
import { formatDate } from "@/utils/dateTime";
import { QtdEmCaixa } from "@/components/coletor/QtdEmCaixa";
import { EtapaIndicador } from "@/components/coletor/EtapaIndicador";
import * as OfflineStore from "@/lib/offlineStore";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";

interface HUInfo { hu_id: string; codigo_hu: string; tipo_hu: string; tamanho: string; }

interface Props { onNavigate: (path: string) => void; origem?: ArmazenagemOrigem; }

interface ItemArmazenagem extends CamposCancelamento {
  tarefa_id: string;
  movimento_entrada_item_id: string;
  produto_id: string;
  sku: string;
  referencia: string;
  descricao: string;
  quantidade_requerida: number;
  quantidade_executada: number;
  qtd_restante: number;
  lote: string;
  validade: string | null;
  fabricacao: string | null;
  varios_pickings: boolean;
  picking_endereco_id: string | null;
  picking_endereco_desc: string | null;
  picking_rua: number | null;
  picking_predio: number | null;
  picking_nivel: number | null;
  picking_apto: number | null;
  saldo_picking: number;
  picking_est_minimo: number;
  picking_est_maximo: number;
  picking_ok: boolean | null;
  fator_caixa: number | null;
}

interface ItensPayload {
  habilitado?: boolean;
  itens: ItemArmazenagem[];
  huMap: Record<string, HUInfo>;
  /** EANs das embalagens dos produtos do movimento — permite bipar também offline. */
  eanMap?: EanMapArmazenagem;
}

/** Conferência feita pelo bipe na lista, repassada à tela /iniciar. */
interface ConferenciaLista { codigo: string; fator: number; }

/** Seleção de várias tarefas do mesmo código lido: o operador toca na correta. */
interface SelecaoLeitura {
  codigo: string;
  tipo: "EAN" | "HU";
  tarefaIds: string[];
  fatorPorProduto: Record<string, number>;
}

export function ArmazenagemItensPage({ onNavigate, origem = "ENTRADA" }: Props) {
  const { setFabVisivel, setContexto } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(true);
    setContexto({ etapa: "ARMAZENAGEM" });
    return () => setFabVisivel(false);
  }, [setFabVisivel, setContexto]);
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const cancelamento = origem === "CANCELAMENTO";
  const armazemId = localStorage.getItem("core_armazem_id");
  const [agora, setAgora] = useState(Date.now);
  const movimentoId = sessionStorage.getItem("coletor_armazenagem_movimento_id");
  const movimentoNumero = sessionStorage.getItem("coletor_armazenagem_movimento_numero") || "";

  const fetchItens = useCallback(async (): Promise<ItensPayload> => {
    if (!tenantId || !empresaId || (!cancelamento && !movimentoId)) return { itens: [], huMap: {}, eanMap: {} };
    const rows = await chamarRpcArmazenagem<ItemArmazenagem[]>(cancelamento ? "rpc_coletor_armz_cancelamento_itens" : "rpc_coletor_armazenagem_itens_movimento", {
      p_tenant_id: tenantId, p_empresa_id: empresaId,
      ...(cancelamento ? { p_armazem_id: armazemId } : { p_movimento_entrada_id: movimentoId }),
    }) || [];
    let habilitado: boolean | undefined;
    if (cancelamento) {
      const dashboard = await buscarDashboardCancelamento(tenantId, empresaId, armazemId);
      habilitado = dashboard.habilitado;
      rows.sort((a, b) => Number(a.ordem ?? 0) - Number(b.ordem ?? 0));
    }

    const tarefaIds = rows.map(i => i.tarefa_id);
    const map: Record<string, HUInfo> = {};
    if (cancelamento) {
      const ids = [...new Set(rows.map(i => i.hu_id).filter((id): id is string => !!id && id !== ZERO_UUID))];
      if (ids.length > 0) {
        const { data: hus, error } = await supabase.from("hu").select("id, codigo_hu, tipo_hu, tamanho").eq("tenant_id", tenantId).eq("empresa_id", empresaId).in("id", ids);
        if (error) throw error;
        for (const item of rows) {
          const hu = hus?.find(h => h.id === item.hu_id);
          if (hu) map[item.tarefa_id] = { hu_id: hu.id, codigo_hu: hu.codigo_hu || "", tipo_hu: hu.tipo_hu || "", tamanho: hu.tamanho || "" };
        }
      }
    } else if (tarefaIds.length > 0) {
      const { data: huData } = await (supabase as any)
        .from("tarefa_execucao")
        .select("tarefa_id, hu, hu_rel:hu(codigo_hu, tipo_hu, tamanho)")
        .in("tarefa_id", tarefaIds)
        .not("hu", "is", null)
        .neq("hu", "00000000-0000-0000-0000-000000000000");
      (huData || []).forEach((exec: any) => {
        if (exec.hu && exec.hu_rel && !map[exec.tarefa_id]) {
          map[exec.tarefa_id] = {
            hu_id: exec.hu,
            codigo_hu: exec.hu_rel.codigo_hu || "",
            tipo_hu: exec.hu_rel.tipo_hu || "",
            tamanho: exec.hu_rel.tamanho || "",
          };
        }
      });
    }

    let eanMap: EanMapArmazenagem = {};
    const produtoIds = Array.from(new Set(rows.map(i => i.produto_id).filter(Boolean)));
    if (produtoIds.length > 0) {
      const { data: embData, error: embErr } = await supabase
        .from("produto_embalagem")
        .select("produto_id, ean, fator, ativo")
        .in("produto_id", produtoIds);
      // Falha ao ler EANs não impede a lista: o bipe avisa e o toque no card segue funcionando.
      if (!embErr) eanMap = montarEanMap(embData || []);
    }
    return { itens: rows, huMap: map, eanMap, habilitado };
  }, [tenantId, empresaId, movimentoId, cancelamento, armazemId]);

  const { data, loading, isFromCache, refetch, error: erroLista } = useOfflineCache<ItensPayload>(
    cancelamento ? `armz_canc_itens_${empresaId}` : `armazenagem_itens_${movimentoId}`,
    fetchItens,
    15,
    cancelamento ? !!tenantId && !!empresaId : !!movimentoId,
  );

  useEffect(() => {
    if (!cancelamento) return;
    definirOrigemArmazenagem("CANCELAMENTO");
    const atualizar = () => { setAgora(Date.now()); if (navigator.onLine) void refetch(); };
    const intervalo = window.setInterval(atualizar, 60000);
    window.addEventListener("online", atualizar);
    if (sessionStorage.getItem("coletor_armazenagem_canc_refetch")) {
      sessionStorage.removeItem("coletor_armazenagem_canc_refetch");
      void refetch();
    }
    return () => { window.clearInterval(intervalo); window.removeEventListener("online", atualizar); };
  }, [cancelamento, refetch]);

  const itens = useMemo(() => data?.itens ?? [], [data]);
  const huMap = useMemo(() => data?.huMap ?? {}, [data]);
  const eanMap = useMemo(() => data?.eanMap ?? {}, [data]);

  const result = useResultDialog({ coletorMode: true });
  const feedback = useFeedback();
  const [lastScanned, setLastScanned] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");
  const [selecao, setSelecao] = useState<SelecaoLeitura | null>(null);
  const [pendente, setPendente] = useState<{ item: ItemArmazenagem; conferencia: ConferenciaLista | null } | null>(null);

  // Se a lista mudar (refresh) e as tarefas da seleção sumirem, desfaz o filtro.
  const itensSelecao = useMemo(
    () => (selecao ? itens.filter(i => selecao.tarefaIds.includes(i.tarefa_id)) : []),
    [itens, selecao],
  );
  useEffect(() => {
    if (selecao && itensSelecao.length === 0) setSelecao(null);
  }, [selecao, itensSelecao.length]);
  const itensVisiveis = selecao && itensSelecao.length > 0 ? itensSelecao : itens;

  const handleSelectItem = (item: ItemArmazenagem, conferencia: ConferenciaLista | null = null) => {
    sessionStorage.setItem("coletor_armazenagem_tarefa_id", item.tarefa_id);
    sessionStorage.setItem("coletor_armazenagem_produto_id", item.produto_id);
    sessionStorage.setItem("coletor_armazenagem_produto_desc", item.descricao);
    sessionStorage.setItem("coletor_armazenagem_produto_sku", item.sku || "");
    sessionStorage.setItem("coletor_armazenagem_qtd_restante", String(item.qtd_restante));
    sessionStorage.setItem("coletor_armazenagem_lote", item.lote || "");
    sessionStorage.setItem("coletor_armazenagem_validade", item.validade || "");
    sessionStorage.setItem("coletor_armazenagem_fabricacao", item.fabricacao || "");
    sessionStorage.setItem("coletor_armazenagem_picking_sugerido", item.picking_endereco_desc || "");
    sessionStorage.setItem("coletor_armazenagem_varios_pickings", item.varios_pickings ? "S" : "N");
    // Com EAN conferido na lista, vale o fator da embalagem lida (mesma regra da tela /iniciar).
    sessionStorage.setItem("coletor_armazenagem_fator", String(conferencia?.fator || item.fator_caixa || 1));
    if (conferencia) registrarEanConfirmado(item.tarefa_id, conferencia.codigo);
    else limparEanConfirmado();
    sessionStorage.setItem("coletor_armazenagem_qtd_requerida", String(item.quantidade_requerida ?? 0));
    sessionStorage.setItem("coletor_armazenagem_qtd_executada", String(item.quantidade_executada ?? 0));
    sessionStorage.setItem("coletor_armazenagem_movimento_item_id", item.movimento_entrada_item_id || "");
    definirOrigemArmazenagem(origem);
    if (cancelamento) {
      sessionStorage.setItem("coletor_armazenagem_movimento_item_id", "");
      sessionStorage.removeItem("coletor_armazenagem_movimento_id");
      sessionStorage.removeItem("coletor_armazenagem_movimento_numero");
      Object.entries({ origem_id: item.endereco_origem_id || "", origem_desc: item.endereco_origem_desc || "", status_prazo: item.status_prazo || "NO_PRAZO", entrada_em: item.entrada_em || "", saldo_origem: String(item.saldo_origem ?? 0), prazo_horas: String(item.prazo_horas ?? 2), horas_parado: String(item.horas_parado ?? 0) }).forEach(([chave, valor]) => sessionStorage.setItem(`coletor_armazenagem_canc_${chave}`, valor));
    }
    const hu = huMap[item.tarefa_id];
    if (hu) {
      sessionStorage.setItem("coletor_armazenagem_hu", hu.hu_id);
      sessionStorage.setItem("coletor_armazenagem_hu_codigo", hu.codigo_hu);
    } else {
      sessionStorage.removeItem("coletor_armazenagem_hu");
      sessionStorage.removeItem("coletor_armazenagem_hu_codigo");
    }
    onNavigate("/coletor/armazenagem/iniciar");
  };

  const conferenciaDaSelecao = (item: ItemArmazenagem): ConferenciaLista | null =>
    selecao?.tipo === "EAN"
      ? { codigo: selecao.codigo, fator: selecao.fatorPorProduto[item.produto_id] || 1 }
      : null;

  const handleTapItem = (item: ItemArmazenagem) => handleSelectItem(item, conferenciaDaSelecao(item));

  /** O mapa local só tem EANs deste movimento; online, confere se o EAN existe em outro produto. */
  const eanCadastradoForaDaLista = async (codigo: string): Promise<boolean> => {
    if (!navigator.onLine || !codigo) return false;
    try {
      const { data: emb, error } = await supabase
        .from("produto_embalagem")
        .select("produto_id")
        .eq("ean", codigo)
        .limit(1);
      return !error && Array.isArray(emb) && emb.length > 0;
    } catch {
      return false;
    }
  };

  const handleScan = async (code: string) => {
    setLastScanned(code);
    const r = resolverLeituraArmazenagem(code, itens, eanMap, huMap);

    if (r.tipo === "NAO_ENCONTRADO" || r.tipo === "FORA_DO_MOVIMENTO") {
      feedback.error();
      setSelecao(null);
      const foraDoMovimento = r.tipo === "FORA_DO_MOVIMENTO" || (await eanCadastradoForaDaLista(r.codigo));
      if (foraDoMovimento) {
        result.showWarning(cancelamento ? "Este produto não está no endereço de cancelamento" : `Produto não pertence ao Movimento #${movimentoNumero}`, {
          details: cancelamento ? `Código lido: ${code}` : `Código lido: ${code}\nEste produto não tem armazenagem pendente neste movimento.`,
          instruction: cancelamento ? "Confira o produto e atualize a lista." : "Confira se está com o produto certo ou volte e escolha o movimento correto.",
        });
      } else {
        result.showWarning(cancelamento ? "EAN não encontrado no endereço de cancelamento" : "EAN não encontrado neste movimento", {
          details: `Código lido: ${code}`,
          instruction: "Bipe o código de barras da embalagem (EAN). SKU e referência não são aceitos.",
        });
      }
      return;
    }

    const encontrados = itens.filter(i => r.tarefaIds.includes(i.tarefa_id));
    const fatorPorProduto = r.tipo === "EAN" ? r.fatorPorProduto : {};

    if (encontrados.length === 1) {
      const item = encontrados[0];
      setSelecao(null);
      setPendente({
        item,
        conferencia: r.tipo === "EAN" ? { codigo: r.codigo, fator: fatorPorProduto[item.produto_id] || 1 } : null,
      });
      setOverlay("success");
      setOverlayMsg(r.tipo === "EAN" ? `Produto confirmado: ${item.descricao}` : `HU ${r.codigo} → ${item.descricao}`);
      return;
    }

    setSelecao({ codigo: r.codigo, tipo: r.tipo, tarefaIds: r.tarefaIds, fatorPorProduto });
    setOverlay("warning");
    setOverlayMsg(`${encontrados.length} tarefas para este código. Toque na correta.`);
  };

  const handleOverlayDone = () => {
    setOverlay(null);
    if (pendente) {
      const { item, conferencia } = pendente;
      setPendente(null);
      handleSelectItem(item, conferencia);
    }
  };

  useEffect(() => {
    if (!data || !data.itens || data.itens.length === 0) return;
    for (const item of data.itens) {
      const cacheEntry = {
        tarefa_id: item.tarefa_id,
        produto_id: item.produto_id,
        sku: item.sku,
        descricao: item.descricao,
        qtd_conferida: item.quantidade_requerida || 0,
        qtd_armazenada: item.quantidade_executada || 0,
        qtd_a_armazenar: item.qtd_restante || 0,
        validade: item.validade || null,
        fabricacao: item.fabricacao || null,
        lote: item.lote || null,
        varios_pickings: item.varios_pickings ? "S" : null,
        enderecos_picking: item.picking_endereco_desc || null,
        fator_caixa: item.fator_caixa,
      };
      OfflineStore.cacheData(`armazenagem_tarefa_${item.sku}`, cacheEntry, 120).catch(() => {});
      const embs = embalagensDoProduto(data.eanMap ?? {}, item.produto_id);
      if (embs.length > 0) OfflineStore.cacheData(`ean_emb_produto_${item.produto_id}`, embs, 480).catch(() => {});
    }
  }, [data]);

  const title = cancelamento ? "Armazenar Cancelamentos" : `Movimento #${movimentoNumero}`;
  const vencidos = itens.filter(i => calcularPrazo(i.entrada_em, Number(i.horas_parado ?? 0), Number(i.prazo_horas ?? 2), agora).status === "VENCIDO").length;

  return (
    <ColetorLayout title={title} onNavigate={onNavigate} showBack backPath={cancelamento ? "/coletor/armazenagem" : "/coletor/armazenagem/movimentos"}>
      <StatusOverlay type={overlay} message={overlayMsg} onDone={handleOverlayDone} />
      <ResultDialog {...result.dialogProps} />
      <EtapaIndicador etapa={1} />
      {cancelamento && itens[0] && <div className="text-xs text-muted-foreground">Origem: {itens[0].endereco_origem_desc} · Prazo {itens[0].prazo_horas}h<br />{itens.length} item(ns) · {vencidos} vencido(s)</div>}
      {!loading && itens.length > 0 && (
        <ScanField
          compact
          label="Bipe o EAN do produto ou a HU"
          lastScanned={lastScanned}
          onScan={handleScan}
          disabled={!!pendente}
        />
      )}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" />
        </div>
      ) : cancelamento && erroLista ? (
        <div className="border border-destructive/40 rounded-lg p-4 space-y-3"><p className="text-sm text-destructive">Não foi possível carregar os itens.</p><ActionButton variant="secondary" onClick={refetch}>TENTAR NOVAMENTE</ActionButton></div>
      ) : cancelamento && data?.habilitado === false ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3"><p className="text-muted-foreground text-center">Fluxo desativado. Ative em Parâmetros &gt; Armazém.</p><RefreshListButton onRefresh={refetch} /></div>
      ) : itens.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <CheckCircle size={56} className="text-[#22C55E]" />
          <p className="text-base text-white font-semibold">{cancelamento ? "Endereço de cancelamento vazio. Nada para armazenar." : "Todos os itens foram armazenados!"}</p>
          {cancelamento ? <RefreshListButton onRefresh={refetch} /> : <ActionButton onClick={() => onNavigate("/coletor/armazenagem/movimentos")} variant="primary">
            VOLTAR AOS MOVIMENTOS
          </ActionButton>}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs text-[hsl(213,31%,55%)]">
                {selecao ? `${itensVisiveis.length} de ${itens.length} item(ns)` : `${itens.length} item(ns) pendente(s)`}
              </p>
              {isFromCache && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                  <Database size={10} /> Cache
                </span>
              )}
            </div>
            <RefreshListButton onRefresh={refetch} />
          </div>

          {selecao && (
            <div
              role="status"
              className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-1.5 text-[12px] bg-[hsl(217,91%,50%)]/12 border border-[hsl(217,91%,60%)]/35 text-[hsl(213,31%,85%)]"
            >
              <span className="min-w-0">
                <b className="font-mono">{selecao.codigo}</b>: {itensVisiveis.length} tarefas. Toque na correta (lote/HU).
              </span>
              <button
                type="button"
                onClick={() => setSelecao(null)}
                className="shrink-0 min-h-[32px] flex items-center gap-1 font-semibold text-[hsl(217,91%,65%)]"
              >
                <X size={14} /> Limpar
              </button>
            </div>
          )}

          {itensVisiveis.map((item) => (
            <div
              key={item.tarefa_id}
              data-testid="item-armazenagem"
              role="button" tabIndex={0}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleTapItem(item); } }}
              onClick={() => handleTapItem(item)}
              className={`rounded-xl bg-[hsl(222,40%,12%)] border ${selecao ? "border-[hsl(217,91%,60%)] ring-1 ring-[hsl(217,91%,60%)]/40" : "border-[hsl(222,35%,22%)]"} ${cancelamento && calcularPrazo(item.entrada_em, Number(item.horas_parado ?? 0), Number(item.prazo_horas ?? 2), agora).status === "VENCIDO" ? "border-l-4 border-l-destructive" : ""} p-3 space-y-2 active:bg-[hsl(222,35%,16%)] active:scale-[0.98] transition-all cursor-pointer`}
            >
              {cancelamento && <div className="flex justify-end"><PrazoCancelamentoBadge entrada={item.entrada_em} horas={Number(item.horas_parado ?? 0)} prazo={Number(item.prazo_horas ?? 2)} agora={agora} /></div>}
              {cancelamento && (item.lote || item.validade) && <p className="text-xs text-muted-foreground">{item.lote && `Lote: ${item.lote}`} {item.validade && `Val: ${formatDate(item.validade)}`}</p>}
              {/* Linha 1: Endereço de picking */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <MapPin size={18} className="text-[hsl(280,70%,55%)] shrink-0" />
                  <span className="text-lg font-bold text-white truncate">
                    {item.picking_endereco_desc || "Sem picking"}
                  </span>
                </div>
                {item.picking_ok === true && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-500/20 text-green-300 shrink-0">PICKING OK</span>
                )}
                {item.picking_ok === false && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 shrink-0">PICKING BAIXO</span>
                )}
                {item.picking_ok === null && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 shrink-0">SEM PICKING</span>
                )}
              </div>

              {/* Linha 2: saldo do picking */}
              {item.picking_endereco_id && (
                <div className="flex items-end justify-between gap-3 text-[11px] text-[hsl(213,31%,55%)]">
                  <div className="flex gap-3">
                    <span>Min: <b className="text-[hsl(213,31%,80%)]">{item.picking_est_minimo}</b></span>
                    <span>Max: <b className="text-[hsl(213,31%,80%)]">{item.picking_est_maximo}</b></span>
                  </div>
                  <div className="text-right">
                    <span className="block text-[10px] uppercase">Saldo picking</span>
                    <QtdEmCaixa qtd={Number(item.saldo_picking || 0)} fatorCaixa={item.fator_caixa} size="sm" />
                  </div>
                </div>
              )}

              <div className="border-t border-[hsl(222,35%,22%)]" />

              {/* SKU + referência */}
              <div className="flex gap-3">
                <span className="text-xs font-mono text-[hsl(217,91%,60%)]">{item.sku}</span>
                {item.referencia && (
                  <span className="text-xs text-[hsl(213,31%,55%)]">Ref: {item.referencia}</span>
                )}
              </div>

              {/* Descrição */}
              <p className="text-sm text-white font-medium leading-snug">{item.descricao}</p>

              {huMap[item.tarefa_id] && (
                <div className="flex items-center gap-1.5 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 px-2 py-1">
                  <Archive size={12} className="text-[hsl(45,93%,47%)] shrink-0" />
                  <span className="text-[11px] font-mono font-bold text-[hsl(45,93%,80%)]">{huMap[item.tarefa_id].codigo_hu}</span>
                  <span className="text-[10px] text-[hsl(45,93%,70%)]">
                    ({huMap[item.tarefa_id].tipo_hu} {huMap[item.tarefa_id].tamanho})
                  </span>
                </div>
              )}

              {/* Quantidades */}
              <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-[hsl(222,35%,22%)]">
                <div>
                  <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">A armazenar</span>
                  <span className="text-base font-bold text-white">{item.quantidade_requerida} UN</span>
                  {Number(item.fator_caixa) > 1 && (
                    <span className="block text-[10px] text-[hsl(217,91%,70%)]">
                      = {Math.floor(item.quantidade_requerida / Number(item.fator_caixa))} CX
                      {(item.quantidade_requerida % Number(item.fator_caixa)) > 0
                        ? ` + ${item.quantidade_requerida % Number(item.fator_caixa)} UN` : ""}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Armazenado</span>
                  <span className="text-base font-bold text-[#22C55E]">{item.quantidade_executada} UN</span>
                  {Number(item.fator_caixa) > 1 && (
                    <span className="block text-[10px] text-[hsl(217,91%,70%)]">
                      = {Math.floor(item.quantidade_executada / Number(item.fator_caixa))} CX
                      {(item.quantidade_executada % Number(item.fator_caixa)) > 0
                        ? ` + ${item.quantidade_executada % Number(item.fator_caixa)} UN` : ""}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Restante</span>
                  <span className="text-base font-bold text-[hsl(45,93%,47%)]">{item.qtd_restante} UN</span>
                  {Number(item.fator_caixa) > 1 && (
                    <span className="block text-[10px] text-[hsl(217,91%,70%)]">
                      = {Math.floor(item.qtd_restante / Number(item.fator_caixa))} CX
                      {(item.qtd_restante % Number(item.fator_caixa)) > 0
                        ? ` + ${item.qtd_restante % Number(item.fator_caixa)} UN` : ""}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ColetorLayout>
  );
}
