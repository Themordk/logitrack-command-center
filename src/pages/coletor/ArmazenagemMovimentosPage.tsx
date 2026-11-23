import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { FilterListButton } from "@/components/coletor/FilterListButton";
import { FiltroRecebimentoSheet } from "@/components/coletor/FiltroRecebimentoSheet";
import { MovimentoEntradaCard } from "@/components/coletor/MovimentoEntradaCard";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useOffline } from "@/contexts/OfflineContext";
import { buscarAtribuicoesEntrada, type AtribuicaoEntrada } from "@/lib/entradaAtribuicoes";
import { useSairEtapaColetor } from "@/hooks/useSairEtapaColetor";
import type { ParamsSair, ResultadoSair } from "@/lib/sairEtapaService";
import { useRecebimentoFilter } from "@/hooks/useRecebimentoFilter";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { Loader2, Package, Database } from "lucide-react";
import { definirOrigemArmazenagem } from "@/lib/armazenagemOrigem";
import { formatDate } from "@/utils/dateTime";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";

interface Props { onNavigate: (path: string) => void; }

interface MovimentoArmazenagem {
  movimento_entrada_id: string;
  numero_movimento: number;
  status_movimento: string;
  created_at: string;
  box_descricao: string;
  total_itens: number;
  itens_armazenados: number;
  itens_pendentes: number;
  qtd_total_requerida: number;
  qtd_total_executada: number;
  percentual_concluido: number;
  parceiro_nome: string | null;
  tipo_entrada_id: string | null;
  tipo_entrada: string | null;
  prioridade: "URGENTE" | "ALTA" | "NORMAL" | "BAIXA";
  devolucao: boolean;
  crossdocking: boolean;
  parceiro: string | null;
  parceiro_busca: string | null;
  notas: string | null;
  qtd_documentos: number;
  placa_veiculo: string | null;
}

export function ArmazenagemMovimentosPage({ onNavigate }: Props) {
  const { setFabVisivel, setContexto } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(true);
    setContexto({ etapa: "ARMAZENAGEM" });
    return () => setFabVisivel(false);
  }, [setFabVisivel, setContexto]);
  const [filtroOpen, setFiltroOpen] = useState(false);
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");

  const fetchMovimentos = useCallback(async (): Promise<MovimentoArmazenagem[]> => {
    if (!tenantId || !empresaId) return [];
    const { data, error } = await supabase.rpc("rpc_coletor_armazenagem_listar_movimentos" as any, {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_armazem_id: null,
    });
    if (error) throw error;
    return (data || []) as MovimentoArmazenagem[];
  }, [tenantId, empresaId]);

  const { data, loading, isFromCache, refetch } = useOfflineCache<MovimentoArmazenagem[]>(
    `armazenagem_movimentos_v3_${empresaId}`,
    fetchMovimentos,
    15,
  );
  const movimentos = data ?? [];

  const { filters, setFilters, clear, activeCount, apply } =
    useRecebimentoFilter("coletor_filtro_armazenagem_movimentos");
  const movimentosFiltrados = apply(movimentos);
  const tiposEntrada = [...new Set(movimentos.map((m) => (m.tipo_entrada || "").trim()).filter(Boolean))].sort();

  // Seleção + botões embaixo, como na separação; "Com você" e Sair vêm do banco
  const usuarioId = localStorage.getItem("core_usuario_id");
  const { isOnline } = useOffline();
  const result = useResultDialog({ coletorMode: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [atribuicoes, setAtribuicoes] = useState<Record<string, AtribuicaoEntrada>>({});
  const carregarAtribuicoes = useCallback(async () => {
    if (!isOnline || !tenantId || !usuarioId || movimentos.length === 0) { setAtribuicoes({}); return; }
    try {
      setAtribuicoes(await buscarAtribuicoesEntrada(tenantId, usuarioId, movimentos.map((m) => m.movimento_entrada_id), "ENTR-ARMZ"));
    } catch { setAtribuicoes({}); }
  }, [isOnline, tenantId, usuarioId, data]);
  useEffect(() => { void carregarAtribuicoes(); }, [carregarAtribuicoes]);
  useEffect(() => {
    if (selectedId && !movimentosFiltrados.some((m) => m.movimento_entrada_id === selectedId)) setSelectedId(null);
  }, [selectedId, movimentosFiltrados]);

  const atribSel = selectedId ? atribuicoes[selectedId] : undefined;
  const selecionado = movimentos.find((m) => m.movimento_entrada_id === selectedId) ?? null;
  const paramsSair: ParamsSair | null = selectedId && tenantId && empresaId && usuarioId
    ? { tenantId, empresaId, usuarioId, contextoTipo: "MOVIMENTO_ENTRADA", contextoId: selectedId, etapa: "ENTR-ARMZ" }
    : null;
  const sairEtapa = useSairEtapaColetor(paramsSair, {
    onSaiu: (r: ResultadoSair) => {
      result.showSuccess(r.mensagem || "Você saiu da armazenagem. As tarefas voltaram para a fila.");
      setSelectedId(null);
      void refetch();
      void carregarAtribuicoes();
    },
    onErro: (e) => result.showError(e, { context: "armazenagem-sair" }),
  });
  const atualizar = async () => { await refetch(); };

  const handleSelectMovimento = (mov: MovimentoArmazenagem) => {
    definirOrigemArmazenagem("ENTRADA");
    sessionStorage.setItem("coletor_armazenagem_movimento_id", mov.movimento_entrada_id);
    sessionStorage.setItem("coletor_armazenagem_movimento_numero", String(mov.numero_movimento));
    onNavigate("/coletor/armazenagem/itens");
  };

  return (
    <ColetorLayout title="Armazenagem" onNavigate={onNavigate} showBack backPath="/coletor/armazenagem">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" />
        </div>
      ) : movimentos.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <Package size={40} className="text-[hsl(213,31%,55%)]" />
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum movimento pendente de armazenagem.</p>
          <RefreshListButton onRefresh={atualizar} />
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs text-[hsl(213,31%,55%)] truncate">{movimentosFiltrados.length} movimento(s) pendente(s)</p>
              {isFromCache && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                  <Database size={10} /> Cache
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <FilterListButton onClick={() => setFiltroOpen(true)} activeCount={activeCount} />
              <RefreshListButton onRefresh={atualizar} />
            </div>
          </div>

          {movimentosFiltrados.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum movimento corresponde aos filtros.</p>
              <button
                type="button"
                onClick={clear}
                className="h-9 px-4 rounded-xl border border-amber-500/40 text-xs font-medium text-amber-400 active:scale-95 transition-all"
              >
                Limpar filtros
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto">
              {movimentosFiltrados.map((mov) => {
                const pct = Math.min(mov.percentual_concluido ?? 0, 100);
                const at = atribuicoes[mov.movimento_entrada_id];
                return (
                  <MovimentoEntradaCard
                    key={mov.movimento_entrada_id}
                    numero={mov.numero_movimento}
                    status={mov.status_movimento}
                    prioridade={mov.prioridade}
                    tipoEntrada={mov.tipo_entrada}
                    parceiro={mov.parceiro ?? mov.parceiro_nome}
                    notas={mov.notas}
                    qtdDocumentos={mov.qtd_documentos}
                    box={mov.box_descricao}
                    placa={mov.placa_veiculo}
                    itensPendentes={mov.itens_pendentes}
                    itensTotal={mov.total_itens}
                    devolucao={mov.devolucao}
                    crossdocking={mov.crossdocking}
                    operadorNome={at?.operador_nome ?? null}
                    atribuidoAoUsuario={at?.atribuido_ao_usuario === true}
                    selecionado={selectedId === mov.movimento_entrada_id}
                    onClick={() => setSelectedId(mov.movimento_entrada_id === selectedId ? null : mov.movimento_entrada_id)}
                    rodape={
                      <div className="space-y-1 mt-1">
                        <div className="w-full h-2 rounded-full bg-[hsl(222,35%,18%)] overflow-hidden">
                          <div className="h-full rounded-full bg-[hsl(142,76%,36%)] transition-all duration-500" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-[hsl(213,31%,55%)]">
                          <span>{mov.itens_armazenados} armazenado(s) · {formatDate(mov.created_at)}</span>
                          <span>{pct.toFixed(0)}%</span>
                        </div>
                      </div>
                    }
                  />
                );
              })}
            </div>
          )}

          <div className="shrink-0 pt-1 flex flex-col gap-2">
            {isOnline && atribSel?.atribuido_ao_usuario && (
              <ActionButton variant="secondary" onClick={sairEtapa.sair} loading={sairEtapa.saindo}>
                Sair da etapa
              </ActionButton>
            )}
            {sairEtapa.folha}
            <ActionButton onClick={() => selecionado && handleSelectMovimento(selecionado)} disabled={!selecionado || sairEtapa.saindo}>
              {atribSel?.atribuido_ao_usuario ? "Continuar armazenagem" : "Iniciar armazenagem"}
            </ActionButton>
          </div>
        </div>
      )}

      <ResultDialog {...result.dialogProps} />
      <FiltroRecebimentoSheet
        open={filtroOpen}
        onClose={() => setFiltroOpen(false)}
        filters={filters}
        tiposEntrada={tiposEntrada}
        onApply={setFilters}
        onClear={clear}
      />
    </ColetorLayout>
  );
}
