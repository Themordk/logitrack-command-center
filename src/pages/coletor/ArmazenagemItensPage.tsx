import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { RefreshListButton } from "@/components/coletor/RefreshListButton";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { Loader2, MapPin, CheckCircle, Archive, Database } from "lucide-react";
import { QtdEmCaixa } from "@/components/coletor/QtdEmCaixa";

interface HUInfo { hu_id: string; codigo_hu: string; tipo_hu: string; tamanho: string; }

interface Props { onNavigate: (path: string) => void; }

interface ItemArmazenagem {
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
  itens: ItemArmazenagem[];
  huMap: Record<string, HUInfo>;
}

export function ArmazenagemItensPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const empresaId = localStorage.getItem("core_empresa_id");
  const movimentoId = sessionStorage.getItem("coletor_armazenagem_movimento_id");
  const movimentoNumero = sessionStorage.getItem("coletor_armazenagem_movimento_numero") || "";

  const fetchItens = useCallback(async (): Promise<ItensPayload> => {
    if (!tenantId || !empresaId || !movimentoId) return { itens: [], huMap: {} };
    const { data, error } = await supabase.rpc("rpc_coletor_armazenagem_itens_movimento" as any, {
      p_tenant_id: tenantId,
      p_empresa_id: empresaId,
      p_movimento_entrada_id: movimentoId,
    });
    if (error) throw error;
    const rows = (data || []) as ItemArmazenagem[];

    const tarefaIds = rows.map(i => i.tarefa_id);
    const map: Record<string, HUInfo> = {};
    if (tarefaIds.length > 0) {
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
    return { itens: rows, huMap: map };
  }, [tenantId, empresaId, movimentoId]);

  const { data, loading, isFromCache, refetch } = useOfflineCache<ItensPayload>(
    `armazenagem_itens_${movimentoId}`,
    fetchItens,
    15,
    !!movimentoId,
  );

  const itens = useMemo(() => data?.itens ?? [], [data]);
  const huMap = useMemo(() => data?.huMap ?? {}, [data]);

  const handleSelectItem = (item: ItemArmazenagem) => {
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

  const title = `Movimento #${movimentoNumero}`;

  return (
    <ColetorLayout title={title} onNavigate={onNavigate} showBack backPath="/coletor/armazenagem/movimentos">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-[hsl(217,91%,60%)]" />
        </div>
      ) : itens.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center">
          <CheckCircle size={56} className="text-[#22C55E]" />
          <p className="text-base text-white font-semibold">Todos os itens foram armazenados!</p>
          <ActionButton onClick={() => onNavigate("/coletor/armazenagem/movimentos")} variant="primary">
            VOLTAR AOS MOVIMENTOS
          </ActionButton>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-xs text-[hsl(213,31%,55%)]">{itens.length} item(ns) pendente(s)</p>
              {isFromCache && (
                <span className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                  <Database size={10} /> Cache
                </span>
              )}
            </div>
            <RefreshListButton onRefresh={refetch} />
          </div>

          {itens.map((item) => (
            <div
              key={item.tarefa_id}
              onClick={() => handleSelectItem(item)}
              className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 space-y-2 active:bg-[hsl(222,35%,16%)] active:scale-[0.98] transition-all cursor-pointer"
            >
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
