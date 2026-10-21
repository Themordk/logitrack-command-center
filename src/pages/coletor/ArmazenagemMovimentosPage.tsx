import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { FilterListButton } from "@/components/coletor/FilterListButton";
import { FiltroRecebimentoSheet } from "@/components/coletor/FiltroRecebimentoSheet";
import { MovimentoEntradaChips } from "@/components/coletor/MovimentoEntradaChips";
import { useRecebimentoFilter } from "@/hooks/useRecebimentoFilter";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { Loader2, Package, Database } from "lucide-react";
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

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  LIB_ARMAZENAGEM: { text: "LIBERADO", className: "text-[#22C55E]" },
  ARMAZENAGEM_PARCIAL: { text: "ARMAZ. PARCIAL", className: "text-[#A78BFA]" },
};

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

  const handleSelectMovimento = (mov: MovimentoArmazenagem) => {
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
          <RefreshListButton onRefresh={refetch} />
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
              <RefreshListButton onRefresh={refetch} />
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
            <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
              {movimentosFiltrados.map((mov) => {
                const status = STATUS_LABEL[mov.status_movimento] || { text: mov.status_movimento?.replace(/_/g, " "), className: "text-[hsl(213,31%,55%)]" };
                const pct = Math.min(mov.percentual_concluido ?? 0, 100);
                const parceiro = mov.parceiro ?? mov.parceiro_nome;
                return (
                  <button
                    type="button"
                    key={mov.movimento_entrada_id}
                    onClick={() => handleSelectMovimento(mov)}
                    className="w-full text-left p-3 rounded-xl border shrink-0 bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)] active:bg-[hsl(222,35%,16%)] active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-bold text-lg text-white">#{mov.numero_movimento}</span>
                      <span className={`text-xs font-bold uppercase ${status.className}`}>{status.text}</span>
                    </div>

                    <MovimentoEntradaChips
                      tipoEntrada={mov.tipo_entrada}
                      prioridade={mov.prioridade}
                      devolucao={mov.devolucao}
                      crossdocking={mov.crossdocking}
                    />

                    <p className="text-sm text-[hsl(213,31%,70%)] truncate">{parceiro || "—"}</p>

                    {mov.notas && (
                      <p className="text-xs text-[hsl(213,31%,55%)] truncate mt-0.5">
                        NF: {mov.notas}
                        {mov.qtd_documentos > 1 && <span> (+{mov.qtd_documentos} docs)</span>}
                      </p>
                    )}

                    <div className="flex items-center gap-1.5 mt-1 text-xs text-[hsl(213,31%,50%)] min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                        <span>Box: {mov.box_descricao || "—"}</span>
                        <span>·</span>
                        <span>Itens: {mov.itens_pendentes}/{mov.total_itens} pend.</span>
                        {mov.placa_veiculo && (
                          <>
                            <span>·</span>
                            <span>Placa: {mov.placa_veiculo}</span>
                          </>
                        )}
                      </div>
                      <span className="ml-auto shrink-0">{formatDate(mov.created_at)}</span>
                    </div>

                    <div className="space-y-1 mt-2">
                      <div className="w-full h-2 rounded-full bg-[hsl(222,35%,18%)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[hsl(142,76%,36%)] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[hsl(213,31%,55%)]">
                        <span>{mov.itens_armazenados} armazenado(s)</span>
                        <span>{pct.toFixed(0)}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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
