import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { Loader2, Archive, MapPin, ArrowDownToLine, PackageCheck, Database } from "lucide-react";
import { toast } from "sonner";
import { parseError } from "@/lib/errorMapper";
import { useOfflineCache } from "@/hooks/useOfflineCache";

interface Props { onNavigate: (path: string) => void; }

interface TarefaAbastecimento {
  tarefa_id: string;
  produto_id: string;
  sku: string;
  referencia: string;
  descricao: string;
  quantidade_requerida: number;
  quantidade_executada: number;
  qtd_restante: number;
  status_tarefa: string;
  prioridade_tarefa: string;
  criado_em: string;
  endereco_origem_id: string;
  endereco_origem_desc: string;
  origem_rua: number;
  origem_predio: number;
  origem_nivel: number;
  origem_apto: number;
  saldo_origem: number;
  endereco_destino_id: string;
  endereco_destino_desc: string;
  destino_rua: number;
  destino_predio: number;
  destino_nivel: number;
  destino_apto: number;
  coleta_pendente: boolean;
  qtd_coletada: number;
  tarefa_execucao_id: string | null;
}

export function AbastecimentoListPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const [huMap, setHuMap] = useState<Record<string, string>>({});
  const [fase, setFase] = useState<"coleta" | "entrega">("coleta");

  const fetchTarefas = useCallback(async (): Promise<TarefaAbastecimento[]> => {
    if (!tenantId || !empresaId) return [];
    const { data, error } = await supabase.rpc("rpc_coletor_abastecimento_listar_tarefas" as any, {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
    });
    if (error) throw error;
    const rows = (data as TarefaAbastecimento[]) || [];

    const chaves = Array.from(new Set(rows.map(r => `${r.produto_id}__${r.endereco_origem_id}`)));
    if (chaves.length > 0) {
      const produtoIds = Array.from(new Set(rows.map(r => r.produto_id)));
      const origemIds = Array.from(new Set(rows.map(r => r.endereco_origem_id)));
      const { data: est } = await (supabase as any)
        .from("estoque_geral")
        .select("produto_id, endereco_id, hu_id, hu:hu_id(codigo_hu)")
        .in("produto_id", produtoIds)
        .in("endereco_id", origemIds)
        .not("hu_id", "is", null)
        .gt("quantidade_disponivel", 0);
      const map: Record<string, string> = {};
      (est || []).forEach((e: any) => {
        const k = `${e.produto_id}__${e.endereco_id}`;
        if (e.hu?.codigo_hu && !map[k]) map[k] = e.hu.codigo_hu;
      });
      setHuMap(map);
    } else {
      setHuMap({});
    }

    return rows;
  }, [tenantId, empresaId]);

  const { data, loading, isFromCache, error, refetch } = useOfflineCache<TarefaAbastecimento[]>(
    `abastecimento_tarefas_${empresaId}`,
    fetchTarefas,
    30,
  );
  const tarefas = data ?? [];
  const loadTarefas = refetch;

  useEffect(() => {
    if (error) {
      const parsed = parseError(error, "abastecimento-lista");
      const fallbackToRaw = !parsed.errorCode && parsed.title === "Ocorreu um erro inesperado.";
      toast.error(fallbackToRaw ? "Erro ao carregar tarefas" : parsed.title);
    }
  }, [error]);

  const itensColeta = useMemo(() => tarefas.filter(t => !t.coleta_pendente), [tarefas]);
  const itensEntrega = useMemo(() =>
    tarefas
      .filter(t => t.coleta_pendente)
      .sort((a, b) =>
        (a.destino_rua - b.destino_rua) ||
        (a.destino_predio - b.destino_predio) ||
        (a.destino_nivel - b.destino_nivel) ||
        (a.destino_apto - b.destino_apto)
      ),
  [tarefas]);

  const itensFase = fase === "coleta" ? itensColeta : itensEntrega;

  const handleSelectItem = (item: TarefaAbastecimento) => {
    sessionStorage.setItem("abast_tarefa_id", item.tarefa_id);
    sessionStorage.setItem("abast_produto_id", item.produto_id);
    sessionStorage.setItem("abast_produto_sku", item.sku);
    sessionStorage.setItem("abast_produto_ref", item.referencia || "");
    sessionStorage.setItem("abast_produto_desc", item.descricao);
    sessionStorage.setItem("abast_qtd_restante", String(item.qtd_restante));
    sessionStorage.setItem("abast_endereco_origem_id", item.endereco_origem_id);
    sessionStorage.setItem("abast_endereco_origem_desc", item.endereco_origem_desc);
    sessionStorage.setItem("abast_endereco_destino_id", item.endereco_destino_id);
    sessionStorage.setItem("abast_endereco_destino_desc", item.endereco_destino_desc);
    sessionStorage.setItem("abast_saldo_origem", String(item.saldo_origem));
    const huCod = huMap[`${item.produto_id}__${item.endereco_origem_id}`];
    if (huCod) {
      sessionStorage.setItem("abast_hu_codigo", huCod);
    } else {
      sessionStorage.removeItem("abast_hu_codigo");
    }

    if (fase === "coleta") {
      onNavigate("/coletor/movimentos/abastecimento/coleta");
    } else {
      sessionStorage.setItem("abast_tarefa_execucao_id", item.tarefa_execucao_id || "");
      sessionStorage.setItem("abast_qtd_coletada", String(item.qtd_coletada));
      onNavigate("/coletor/movimentos/abastecimento/destino");
    }
  };

  const prioridadeBadge = (p: string) =>
    p === "URGENTE" ? "bg-red-500/20 text-red-300" :
    p === "ALTA" ? "bg-orange-500/20 text-orange-300" :
    "bg-blue-500/20 text-blue-300";

  return (
    <ColetorLayout title="Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      <div className="flex rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-1 gap-1">
        <button
          onClick={() => setFase("coleta")}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            fase === "coleta" ? "bg-[hsl(217,91%,50%)] text-white" : "text-[hsl(213,31%,55%)]"
          }`}
        >
          Coleta ({itensColeta.length})
        </button>
        <button
          onClick={() => setFase("entrega")}
          className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
            fase === "entrega" ? "bg-[hsl(142,76%,36%)] text-white" : "text-[hsl(213,31%,55%)]"
          }`}
        >
          Entrega ({itensEntrega.length})
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} />
        </div>
      ) : itensFase.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          {fase === "coleta" ? (
            <>
              <ArrowDownToLine size={40} className="text-[hsl(213,31%,55%)]" />
              <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa pendente de coleta.</p>
            </>
          ) : (
            <>
              <PackageCheck size={40} className="text-[hsl(213,31%,55%)]" />
              <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum item coletado para entregar.</p>
            </>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 mt-2">
          <div className="flex items-center gap-2">
            <p className="text-xs text-[hsl(213,31%,55%)]">
              {itensFase.length} item{itensFase.length > 1 ? "ns" : ""}
            </p>
            {isFromCache && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                <Database size={10} /> Cache
              </span>
            )}
            <RefreshListButton onRefresh={loadTarefas} />
          </div>

          {itensFase.map(item => (
            <div
              key={`${item.tarefa_id}-${fase}`}
              onClick={() => handleSelectItem(item)}
              className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-2 active:bg-[hsl(222,35%,16%)] active:scale-[0.98] transition-all cursor-pointer"
            >
              {fase === "coleta" ? (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Archive size={18} className="text-[hsl(217,91%,60%)] shrink-0" />
                      <span className="text-lg font-bold text-white truncate">{item.endereco_origem_desc}</span>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${prioridadeBadge(item.prioridade_tarefa)}`}>
                      {item.prioridade_tarefa}
                    </span>
                  </div>
                  <div className="text-[11px] text-[hsl(213,31%,55%)]">
                    Saldo disponível: <b className="text-white">{item.saldo_origem}</b>
                  </div>
                  {huMap[`${item.produto_id}__${item.endereco_origem_id}`] && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-[hsl(45,93%,47%)]/10 border border-[hsl(45,93%,47%)]/30 px-2 py-1 -mt-1">
                      <Archive size={12} className="text-[hsl(45,93%,47%)] shrink-0" />
                      <span className="text-[11px] font-mono font-bold text-[hsl(45,93%,80%)]">
                        HU: {huMap[`${item.produto_id}__${item.endereco_origem_id}`]}
                      </span>
                    </div>
                  )}
                  <div className="border-t border-[hsl(222,35%,22%)]" />
                  <div className="flex gap-3">
                    <span className="text-xs font-mono text-[hsl(217,91%,60%)]">{item.sku}</span>
                    {item.referencia && (
                      <span className="text-xs text-[hsl(213,31%,55%)]">Ref: {item.referencia}</span>
                    )}
                  </div>
                  <p className="text-sm text-white font-medium leading-snug">{item.descricao}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-[hsl(213,31%,55%)]">
                    <MapPin size={12} className="text-[hsl(280,70%,55%)] shrink-0" />
                    <span>Destino: <b className="text-[hsl(280,70%,65%)]">{item.endereco_destino_desc}</b></span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-[hsl(222,35%,22%)]">
                    <div>
                      <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Requerida</span>
                      <span className="text-base font-bold text-white">{item.quantidade_requerida}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Executada</span>
                      <span className="text-base font-bold text-[#22C55E]">{item.quantidade_executada}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-[hsl(213,31%,55%)] uppercase block">Restante</span>
                      <span className="text-base font-bold text-[hsl(45,93%,47%)]">{item.qtd_restante}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin size={18} className="text-[hsl(280,70%,55%)] shrink-0" />
                      <span className="text-lg font-bold text-white truncate">{item.endereco_destino_desc}</span>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-green-500/20 text-green-300">
                      COLETADO
                    </span>
                  </div>
                  <div className="text-[11px] text-[hsl(213,31%,55%)]">
                    Qtd coletada: <b className="text-white">{item.qtd_coletada}</b>
                  </div>
                  <div className="border-t border-[hsl(222,35%,22%)]" />
                  <div className="flex gap-3">
                    <span className="text-xs font-mono text-[hsl(217,91%,60%)]">{item.sku}</span>
                    {item.referencia && (
                      <span className="text-xs text-[hsl(213,31%,55%)]">Ref: {item.referencia}</span>
                    )}
                  </div>
                  <p className="text-sm text-white font-medium leading-snug">{item.descricao}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-[hsl(213,31%,55%)]">
                    <Archive size={12} className="text-[hsl(217,91%,60%)] shrink-0" />
                    <span>Coletado de: <b className="text-white">{item.endereco_origem_desc}</b></span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </ColetorLayout>
  );
}
