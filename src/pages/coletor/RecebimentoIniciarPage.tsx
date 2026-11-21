import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { Loader2, Database } from "lucide-react";
import { toast } from "sonner";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { FilterListButton } from "@/components/coletor/FilterListButton";
import { FiltroRecebimentoSheet } from "@/components/coletor/FiltroRecebimentoSheet";
import { useRecebimentoFilter } from "@/hooks/useRecebimentoFilter";
import { parseError } from "@/lib/errorMapper";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";
import { MovimentoEntradaCard } from "@/components/coletor/MovimentoEntradaCard";
import { armazenagemEmParalelo } from "@/lib/recebimentoStatus";
import { useOffline } from "@/contexts/OfflineContext";
import { buscarAtribuicoesEntrada, type AtribuicaoEntrada } from "@/lib/entradaAtribuicoes";
import { useSairEtapaColetor } from "@/hooks/useSairEtapaColetor";
import type { ParamsSair, ResultadoSair } from "@/lib/sairEtapaService";


interface Props { onNavigate: (path: string) => void; }

interface MovimentoResumo {
  id: string;
  numero_movimento: number;
  status: string;
  tipo_entrada_id: string | null;
  tipo_entrada: string | null;
  prioridade: "URGENTE" | "ALTA" | "NORMAL" | "BAIXA";
  devolucao: boolean;
  crossdocking: boolean;
  parceiro: string | null;
  parceiro_busca: string | null;
  notas: string | null;
  qtd_documentos: number;
  box: string | null;
  placa_veiculo: string | null;
  confirma_volume: boolean;
  total_volume: number | null;
  total_volume_conferido: number | null;
  qtd_itens: number;
  qtd_itens_pendentes: number;
  conferencia_iniciada_em: string | null;
  conferente_nome: string | null;
  iniciado_pelo_usuario: boolean;
  created_at: string | null;
}

export function RecebimentoIniciarPage({ onNavigate }: Props) {
  const { setFabVisivel, setContexto } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(true);
    setContexto({ etapa: "RECEBIMENTO" });
    return () => setFabVisivel(false);
  }, [setFabVisivel, setContexto]);
  const result = useResultDialog({ coletorMode: true });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [filtroOpen, setFiltroOpen] = useState(false);
  const tenantId = localStorage.getItem("core_tenant_id");
  const usuarioId = localStorage.getItem("core_usuario_id");

  const fetchMovimentos = useCallback(async (): Promise<MovimentoResumo[]> => {
    const empresaId = localStorage.getItem("core_empresa_id");
    if (!tenantId || !empresaId) {
      throw new Error("Empresa não identificada.");
    }
    const { data, error } = await (supabase as any).rpc("recebimento_buscar_movimentos", {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_usuario_id: usuarioId,
      p_armazem_id: null,
    });
    if (error) throw error;
    return (data ?? []) as MovimentoResumo[];
  }, [tenantId, usuarioId]);

  const { data, loading, isFromCache, error, refetch } = useOfflineCache<MovimentoResumo[]>(
    "recebimento_movimentos_iniciar_v2",
    fetchMovimentos,
    30,
  );
  const movimentos = data ?? [];

  const { filters, setFilters, clear, activeCount, apply } =
    useRecebimentoFilter("coletor_filtro_recebimento_iniciar");
  const movimentosFiltrados = apply(movimentos);
  const tiposEntrada = [...new Set(movimentos.map((m) => (m.tipo_entrada || "").trim()).filter(Boolean))].sort();

  useEffect(() => {
    if (selectedId && !movimentosFiltrados.some((m) => m.id === selectedId)) setSelectedId(null);
  }, [selectedId, movimentosFiltrados]);

  useEffect(() => {
    if (error) result.showWarning(error === "Empresa não identificada." ? error : "Erro ao carregar movimentos.");
  }, [error]);

  // "Com você / Com" no card e o botão Sair, como na separação (regra no banco)
  const { isOnline } = useOffline();
  const [atribuicoes, setAtribuicoes] = useState<Record<string, AtribuicaoEntrada>>({});
  const carregarAtribuicoes = useCallback(async () => {
    if (!isOnline || !tenantId || !usuarioId || movimentos.length === 0) { setAtribuicoes({}); return; }
    try {
      setAtribuicoes(await buscarAtribuicoesEntrada(tenantId, usuarioId, movimentos.map((m) => m.id), "ENTR-CONF"));
    } catch { setAtribuicoes({}); }
  }, [isOnline, tenantId, usuarioId, data]);
  useEffect(() => { void carregarAtribuicoes(); }, [carregarAtribuicoes]);

  const loadMovimentos = async () => { await refetch(); };

  const empresaIdLs = localStorage.getItem("core_empresa_id");
  const atribSel = selectedId ? atribuicoes[selectedId] : undefined;
  const paramsSair: ParamsSair | null = selectedId && tenantId && usuarioId && empresaIdLs
    ? { tenantId, empresaId: empresaIdLs, usuarioId, contextoTipo: "MOVIMENTO_ENTRADA", contextoId: selectedId, etapa: "ENTR-CONF" }
    : null;
  const sairEtapa = useSairEtapaColetor(paramsSair, {
    onSaiu: (r: ResultadoSair) => {
      if (sessionStorage.getItem("coletor_movimento_id") === selectedId) sessionStorage.removeItem("coletor_recebimento_tarefas");
      result.showSuccess(r.mensagem || "Você saiu da conferência. As tarefas voltaram para a fila.");
      setSelectedId(null);
      void refetch();
      void carregarAtribuicoes();
    },
    onErro: (e) => result.showError(e, { context: "recebimento-sair" }),
  });

  const handleConfirmStart = async () => {
    if (!selectedId || !tenantId || !usuarioId) return;
    const empresaId = localStorage.getItem("core_empresa_id");
    if (!empresaId) {
      result.showWarning("Empresa não identificada.");
      return;
    }
    setConfirming(true);
    try {
      // Marca início da conferência no movimento — só na primeira vez.
      // Um segundo conferente (ou a recontagem com armazenagem em paralelo)
      // não sobrescreve quem iniciou nem quando.
      const { error: updErr } = await (supabase as any)
        .from("movimento_entrada")
        .update({
          conferencia_iniciada_em: new Date().toISOString(),
          conferencia_iniciada_por: usuarioId,
        })
        .eq("id", selectedId)
        .is("conferencia_iniciada_em", null);

      if (updErr) throw updErr;

      // Atribui as tarefas ao usuário e busca a lista planejada
      const { data: tarefasData, error: rpcErr } = await (supabase as any).rpc(
        "entrada_conferencia_buscar_tarefas",
        {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
          p_usuario_id: usuarioId,
          p_movimento_entrada_id: selectedId,
        }
      );
      if (rpcErr) throw rpcErr;

      const tarefas = Array.isArray(tarefasData)
        ? tarefasData
        : typeof tarefasData === "string"
        ? JSON.parse(tarefasData)
        : [];

      sessionStorage.setItem("coletor_movimento_id", selectedId);
      sessionStorage.setItem("coletor_recebimento_tarefas", JSON.stringify(tarefas));

      const selectedMov = movimentos.find((m) => m.id === selectedId);
      const needsVolumeCheck = selectedMov?.confirma_volume === true && !selectedMov?.total_volume_conferido;
      if (needsVolumeCheck) {
        toast.success("Conferência iniciada! Confirme os volumes.");
        onNavigate("/coletor/recebimento/volumes");
      } else {
        toast.success(`Conferência iniciada! ${tarefas.length} tarefa(s) atribuída(s).`);
        onNavigate("/coletor/recebimento/execucao");
      }
    } catch (err: any) {
      const parsed = parseError(err, "recebimento-iniciar");
      result.showParsedError(parsed);
    } finally {
      setConfirming(false);
    }
  };

  return (
    <ColetorLayout title="Selecionar Movimento" onNavigate={onNavigate} showBack backPath="/coletor/recebimento">
      <ResultDialog {...result.dialogProps} />
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="text-xs text-[hsl(213,31%,55%)] truncate">Selecione um movimento para iniciar a conferência</p>
            {isFromCache && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                <Database size={10} /> Cache
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <FilterListButton onClick={() => setFiltroOpen(true)} activeCount={activeCount} />
            <RefreshListButton onRefresh={loadMovimentos} />
          </div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
        ) : movimentos.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <span className="text-lg text-[hsl(213,31%,55%)]">Nenhum movimento disponível</span>
          </div>
        ) : movimentosFiltrados.length === 0 ? (
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
            {movimentosFiltrados.map((m) => {
              const at = atribuicoes[m.id];
              return (
                <MovimentoEntradaCard
                  key={m.id}
                  numero={m.numero_movimento}
                  status={m.status}
                  prioridade={m.prioridade}
                  tipoEntrada={m.tipo_entrada}
                  parceiro={m.parceiro}
                  notas={m.notas}
                  qtdDocumentos={m.qtd_documentos}
                  box={m.box}
                  placa={m.placa_veiculo}
                  itensPendentes={m.qtd_itens_pendentes}
                  itensTotal={m.qtd_itens}
                  volume={m.total_volume}
                  devolucao={m.devolucao}
                  crossdocking={m.crossdocking}
                  operadorNome={at?.operador_nome ?? null}
                  atribuidoAoUsuario={at?.atribuido_ao_usuario === true}
                  selecionado={selectedId === m.id}
                  onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}
                  rodape={armazenagemEmParalelo(m.status) ? (
                    <p className="text-xs text-violet-300">Armazenagem em andamento — conferência dos itens pendentes liberada</p>
                  ) : undefined}
                />
              );
            })}
          </div>
        )}

        <div className="shrink-0 pt-1 flex flex-col gap-2">
          {isOnline && atribSel?.atribuido_ao_usuario && (
            <ActionButton variant="secondary" onClick={sairEtapa.sair} loading={sairEtapa.saindo} disabled={confirming}>
              Sair da etapa
            </ActionButton>
          )}
          {sairEtapa.folha}
          <ActionButton onClick={handleConfirmStart} loading={confirming} disabled={!selectedId || sairEtapa.saindo}>
            {atribSel?.atribuido_ao_usuario ? "Continuar conferência" : "Assumir e iniciar conferência"}
          </ActionButton>
        </div>
      </div>

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
