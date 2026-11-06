import { useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { Loader2, Package, RotateCcw, AlertTriangle, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
        <Button variant="outline" className="h-auto min-h-[120px] w-full whitespace-normal flex flex-col items-stretch gap-3 p-4 bg-card text-left border-primary/40" onClick={() => { definirOrigemArmazenagem("ENTRADA"); onNavigate("/coletor/armazenagem/movimentos"); }}>
          <span className="flex items-center gap-2 text-lg font-bold text-primary"><Package size={24} />Armazenar Entradas</span>
          {loading ? <Loader2 className="animate-spin text-primary" /> : <>
            <span className="text-sm text-muted-foreground">{Number(data?.documentos_pendentes ?? 0).toLocaleString("pt-BR")} movimento(s) · {Number(data?.produtos_pendentes ?? 0).toLocaleString("pt-BR")} produto(s)</span>
            <Progress value={Math.max(0, Math.min(Number(data?.percentual_concluido ?? 0), 100))} className="h-2" />
            <span className="text-xs text-muted-foreground">{Number(data?.percentual_concluido ?? 0).toLocaleString("pt-BR")}% armazenado</span>
          </>}
        </Button>
        <Button variant="outline" disabled={!cancelamentos.data?.habilitado || cancelamentos.loading} className="cancelamento-cartao h-auto min-h-[120px] w-full whitespace-normal flex flex-col items-stretch gap-3 p-4 bg-card text-left disabled:opacity-50" onClick={() => { definirOrigemArmazenagem("CANCELAMENTO"); onNavigate("/coletor/armazenagem/cancelamentos/itens"); }}>
          <span className="cancelamento-destaque flex items-center gap-2 text-lg font-bold"><RotateCcw size={24} />Armazenar Cancelamentos</span>
          {cancelamentos.loading ? <Loader2 className="animate-spin text-primary" /> : cancelamentos.error ? <span className="text-destructive">Não foi possível carregar. Tente atualizar.</span> : cancelamentos.data?.habilitado === false ? <span className="text-sm text-muted-foreground">Fluxo desativado. Ative em Parâmetros &gt; Armazém.</span> : <>
            <span className="text-sm text-muted-foreground">{Number(cancelamentos.data?.tarefas_pendentes ?? 0).toLocaleString("pt-BR")} item(ns) · {Number(cancelamentos.data?.total_a_armazenar ?? 0).toLocaleString("pt-BR")} UN</span>
            <span className="font-mono text-sm text-foreground">{cancelamentos.data?.endereco || "Sem endereço configurado"}</span>
            {Number(cancelamentos.data?.vencidos) > 0 && <span className="flex flex-wrap gap-2 items-center"><span className="prazo-vencido flex items-center gap-1 border rounded px-2 py-1 text-xs"><AlertTriangle size={13} />{cancelamentos.data?.vencidos} vencido(s)</span><span className="text-xs text-muted-foreground">Mais antigo: {formatarHorasParado(Number(cancelamentos.data?.mais_antigo_horas ?? 0))}</span></span>}
          </>}
        </Button>
      </div>
    </ColetorLayout>
  );
}

