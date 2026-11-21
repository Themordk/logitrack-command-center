import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { Loader2, Package, RotateCcw, AlertTriangle, Database, ChevronRight } from "lucide-react";
import { buscarDashboardCancelamento } from "@/lib/armazenagemService";
import { definirOrigemArmazenagem, formatarHorasParado } from "@/lib/armazenagemOrigem";
import { useOcorrenciaColetorContext } from "@/contexts/OcorrenciaColetorContext";

interface Props { onNavigate: (path: string) => void; }

interface DashData {
  documentos_pendentes: number;
  produtos_pendentes: number;
  total_a_armazenar: number;
  total_armazenado: number;
  percentual_concluido: number;
}

export function ArmazenagemDashboardPage({ onNavigate }: Props) {
  const { setFabVisivel, setContexto } = useOcorrenciaColetorContext();
  useEffect(() => {
    setFabVisivel(true);
    setContexto({ etapa: "ARMAZENAGEM" });
    return () => setFabVisivel(false);
  }, [setFabVisivel, setContexto]);
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");

  const fetchDashboard = useCallback(async (): Promise<DashData> => {
    if (!tenantId || !empresaId) {
      return { documentos_pendentes: 0, produtos_pendentes: 0, total_a_armazenar: 0, total_armazenado: 0, percentual_concluido: 0 };
    }
    const { data: result, error } = await supabase.rpc("rpc_coletor_armazenagem_dashboard" as any, {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
    });
    if (error) throw error;
    if (result && result.length > 0) {
      return result[0] as DashData;
    }
    return { documentos_pendentes: 0, produtos_pendentes: 0, total_a_armazenar: 0, total_armazenado: 0, percentual_concluido: 0 };
  }, [tenantId, empresaId]);

  const { data, loading, isFromCache, refetch } = useOfflineCache<DashData>(
    `armazenagem_dashboard_${empresaId}`,
    fetchDashboard,
    15,
  );

  const armazemId = localStorage.getItem("core_armazem_id");
  const carregarCancelamentos = useCallback(async () => {
    if (!tenantId || !empresaId) throw new Error("Selecione uma empresa.");
    return buscarDashboardCancelamento(tenantId, empresaId, armazemId);
  }, [tenantId, empresaId, armazemId]);
  const cancelamentos = useOfflineCache(`armz_canc_dashboard_${empresaId}`, carregarCancelamentos, 15);
  const atualizar = async () => { await Promise.all([refetch(), cancelamentos.refetch()]); };
  return (
    <ColetorLayout title="Armazenagem" onNavigate={onNavigate} showBack backPath="/coletor/home">
      <div className="flex items-center justify-between gap-2">
        {(isFromCache || cancelamentos.isFromCache) && <span className="prazo-atencao flex items-center gap-1 text-xs rounded border px-2 py-1"><Database size={13} /> Cache</span>}
        <div className="flex-1" /><RefreshListButton onRefresh={atualizar} />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {/* Cards no padrão do coletor: fundo escuro fixo, borda colorida e contraste alto em hover, foco e toque */}
        <button
          type="button"
          onClick={() => { definirOrigemArmazenagem("ENTRADA"); onNavigate("/coletor/armazenagem/movimentos"); }}
          className="group w-full text-left flex flex-col gap-3 p-4 rounded-2xl border transition-all bg-[hsl(222,40%,12%)] border-[hsl(217,91%,60%)]/40 hover:border-[hsl(217,91%,60%)] hover:bg-[hsl(222,40%,14%)] active:scale-[0.98] active:bg-[hsl(222,40%,16%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(217,91%,60%)]"
        >
          <span className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-[hsl(217,91%,60%)]/15 text-[hsl(217,91%,65%)] shrink-0">
              <Package size={22} />
            </span>
            <span className="flex-1 text-lg font-bold text-white">Armazenar Entradas</span>
            <ChevronRight size={20} className="text-[hsl(213,31%,55%)] group-hover:text-white transition-colors" />
          </span>
          {loading ? <Loader2 className="animate-spin text-[hsl(217,91%,60%)]" /> : <>
            <span className="text-sm text-[hsl(213,31%,75%)]">
              <span className="font-bold text-white">{Number(data?.documentos_pendentes ?? 0).toLocaleString("pt-BR")}</span> movimento(s) ·{" "}
              <span className="font-bold text-white">{Number(data?.produtos_pendentes ?? 0).toLocaleString("pt-BR")}</span> produto(s)
            </span>
            <span className="w-full h-2 rounded-full bg-[hsl(222,35%,20%)] overflow-hidden" aria-hidden>
              <span className="block h-full rounded-full bg-[hsl(142,76%,36%)] transition-all duration-500"
                style={{ width: `${Math.max(0, Math.min(Number(data?.percentual_concluido ?? 0), 100))}%` }} />
            </span>
            <span className="text-xs text-[hsl(213,31%,65%)]">{Number(data?.percentual_concluido ?? 0).toLocaleString("pt-BR")}% armazenado</span>
          </>}
        </button>

        <button
          type="button"
          disabled={!cancelamentos.data?.habilitado || cancelamentos.loading}
          onClick={() => { definirOrigemArmazenagem("CANCELAMENTO"); onNavigate("/coletor/armazenagem/cancelamentos/itens"); }}
          className="group w-full text-left flex flex-col gap-3 p-4 rounded-2xl border transition-all bg-[hsl(222,40%,12%)] cancelamento-cartao enabled:hover:border-[hsl(var(--armazenagem-cancelamento))] enabled:hover:bg-[hsl(222,40%,14%)] enabled:active:scale-[0.98] enabled:active:bg-[hsl(222,40%,16%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--armazenagem-cancelamento))] disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <span className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl flex items-center justify-center bg-[hsl(var(--armazenagem-cancelamento)/0.15)] cancelamento-destaque shrink-0">
              <RotateCcw size={22} />
            </span>
            <span className="flex-1 text-lg font-bold text-white">Armazenar Cancelamentos</span>
            {cancelamentos.data?.habilitado && <ChevronRight size={20} className="text-[hsl(213,31%,55%)] group-hover:text-white transition-colors" />}
          </span>
          {cancelamentos.loading ? <Loader2 className="animate-spin text-[hsl(217,91%,60%)]" /> : cancelamentos.error ? <span className="text-sm text-red-300">Não foi possível carregar. Tente atualizar.</span> : cancelamentos.data?.habilitado === false ? <span className="text-sm text-[hsl(213,31%,70%)]">Fluxo desativado. Ative em Parâmetros &gt; Armazém.</span> : <>
            <span className="text-sm text-[hsl(213,31%,75%)]">
              <span className="font-bold text-white">{Number(cancelamentos.data?.tarefas_pendentes ?? 0).toLocaleString("pt-BR")}</span> item(ns) ·{" "}
              <span className="font-bold text-white">{Number(cancelamentos.data?.total_a_armazenar ?? 0).toLocaleString("pt-BR")}</span> UN
            </span>
            <span className="font-mono text-sm text-white">{cancelamentos.data?.endereco || "Sem endereço configurado"}</span>
            {Number(cancelamentos.data?.vencidos) > 0 && <span className="flex flex-wrap gap-2 items-center"><span className="prazo-vencido flex items-center gap-1 border rounded px-2 py-1 text-xs"><AlertTriangle size={13} />{cancelamentos.data?.vencidos} vencido(s)</span><span className="text-xs text-[hsl(213,31%,65%)]">Mais antigo: {formatarHorasParado(Number(cancelamentos.data?.mais_antigo_horas ?? 0))}</span></span>}
          </>}
        </button>
      </div>
    </ColetorLayout>
  );
}

