import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { Loader2, Package } from "lucide-react";
import { formatDate } from "@/utils/dateTime";

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
}

const STATUS_LABEL: Record<string, { text: string; className: string }> = {
  LIB_ARMAZENAGEM: { text: "LIBERADO", className: "bg-blue-500/20 text-blue-300" },
  ARMAZENAGEM_PARCIAL: { text: "PARCIAL", className: "bg-yellow-500/20 text-yellow-300" },
};

export function ArmazenagemMovimentosPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const [movimentos, setMovimentos] = useState<MovimentoArmazenagem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("rpc_coletor_armazenagem_listar_movimentos" as any, {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
      });
      if (error) throw error;
      setMovimentos((data || []) as MovimentoArmazenagem[]);
    } catch (err) {
      console.error(err);
      setMovimentos([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId]);

  useEffect(() => { load(); }, [load]);

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
          <RefreshListButton onRefresh={load} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[hsl(213,31%,55%)]">{movimentos.length} movimento(s) pendente(s)</p>
            <RefreshListButton onRefresh={load} />
          </div>

          {movimentos.map((mov) => {
            const status = STATUS_LABEL[mov.status_movimento] || { text: mov.status_movimento, className: "bg-gray-500/20 text-gray-300" };
            const pct = Math.min(mov.percentual_concluido ?? 0, 100);
            return (
              <div
                key={mov.movimento_entrada_id}
                onClick={() => handleSelectMovimento(mov)}
                className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-2 active:bg-[hsl(222,35%,16%)] active:scale-[0.98] transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-white">Movimento #{mov.numero_movimento}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.className}`}>{status.text}</span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-[hsl(213,31%,55%)]">
                  <span>Doca: <b className="text-[hsl(213,31%,85%)]">{mov.box_descricao || "—"}</b></span>
                  <span>{formatDate(mov.created_at)}</span>
                </div>

                <div className="space-y-1">
                  <div className="w-full h-2 rounded-full bg-[hsl(222,35%,18%)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[hsl(142,76%,36%)] transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-[hsl(213,31%,55%)]">
                    <span>{mov.itens_pendentes} pendente(s) | {mov.itens_armazenados} armazenado(s)</span>
                    <span>{pct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ColetorLayout>
  );
}
