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
import { MovimentoEntradaChips } from "@/components/coletor/MovimentoEntradaChips";
import {
  armazenagemEmParalelo,
  recebimentoStatusColor,
  recebimentoStatusLabel,
} from "@/lib/recebimentoStatus";


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

  const loadMovimentos = refetch;

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
          <>
            <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
              {movimentosFiltrados.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelectedId(m.id === selectedId ? null : m.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all shrink-0 ${
                    selectedId === m.id
                      ? "bg-[hsl(217,91%,50%)]/15 border-[hsl(217,91%,50%)]"
                      : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono font-bold text-lg text-white">#{m.numero_movimento}</span>
                    <span className={`text-xs font-bold uppercase ${recebimentoStatusColor(m.status)}`}>{recebimentoStatusLabel(m.status)}</span>
                  </div>

                  <MovimentoEntradaChips
                    tipoEntrada={m.tipo_entrada}
                    prioridade={m.prioridade}
                    devolucao={m.devolucao}
                    crossdocking={m.crossdocking}
                  />

                  <p className="text-sm text-[hsl(213,31%,70%)] truncate">{m.parceiro || "—"}</p>

                  {m.notas && (
                    <p className="text-xs text-[hsl(213,31%,55%)] truncate mt-0.5">
                      NF: {m.notas}
                      {m.qtd_documentos > 1 && <span> (+{m.qtd_documentos} docs)</span>}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 mt-1 text-xs text-[hsl(213,31%,50%)] flex-wrap">
                    <span>Box: {m.box || "—"}</span>
                    <span>·</span>
                    <span>Itens: {m.qtd_itens_pendentes}/{m.qtd_itens} pend.</span>
                    {m.total_volume != null && (
                      <>
                        <span>·</span>
                        <span>Vol: {m.total_volume}</span>
                      </>
                    )}
                    {m.placa_veiculo && (
                      <>
                        <span>·</span>
                        <span>Placa: {m.placa_veiculo}</span>
                      </>
                    )}
                  </div>

                  {m.status === "EM_CONFERENCIA" && m.conferente_nome && (
                    <p className={`text-xs mt-1 ${m.iniciado_pelo_usuario ? "text-[hsl(217,91%,60%)]" : "text-[hsl(213,31%,55%)]"}`}>
                      {m.iniciado_pelo_usuario
                        ? "Você iniciou esta conferência"
                        : `Em conferência por ${m.conferente_nome}`}
                    </p>
                  )}

                  {armazenagemEmParalelo(m.status) && (
                    <p className="text-xs mt-1 text-[#A78BFA]">
                      Armazenagem em andamento — conferência dos itens pendentes liberada
                    </p>
                  )}
                </button>
              ))}
            </div>

            {selectedId && (
              <div className="pt-2 space-y-2 shrink-0">
                <ActionButton onClick={handleConfirmStart} loading={confirming} variant="success">
                  INICIAR CONFERÊNCIA
                </ActionButton>
                <ActionButton onClick={() => setSelectedId(null)} variant="secondary">
                  CANCELAR
                </ActionButton>
              </div>
            )}
          </>
        )}
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
