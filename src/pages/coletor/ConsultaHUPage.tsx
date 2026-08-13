import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, Archive, Package, Database } from "lucide-react";
import { formatDateTime, formatDate as fmtDateUtil } from "@/utils/dateTime";
import { QtdEmCaixa } from "@/components/coletor/QtdEmCaixa";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useOffline } from "@/contexts/OfflineContext";

interface Props { onNavigate: (path: string) => void; }

interface ConsultaHUData {
  huInfo: any;
  estoqueInfo: any[];
  execInfo: any[];
  huItensInfo: any[];
}

export function ConsultaHUPage({ onNavigate }: Props) {
  const { tenantId, empresaId } = useTenant();
  const [scanned, setScanned] = useState("");
  const { isOnline } = useOffline();

  const fetchConsulta = useCallback(async (): Promise<ConsultaHUData> => {
    const { data: hus } = await (supabase as any)
      .from("hu")
      .select("id, codigo_hu, tipo_hu, tamanho, disponibilidade, peso_bruto, status")
      .eq("codigo_hu", scanned)
      .limit(1);

    if (!hus || hus.length === 0) {
      throw new Error("HU_NAO_ENCONTRADA");
    }

    const hu = hus[0];

    let estoqueQuery = (supabase as any)
      .from("estoque_geral")
      .select("quantidade_disponivel, quantidade_total, lote, data_validade, data_fabricacao, endereco:endereco_id(descricao, tipo_endereco), produto:produto_id(sku, descricao, fator_caixa)")
      .eq("hu_id", hu.id);

    if (tenantId) estoqueQuery = estoqueQuery.eq("tenant_id", tenantId);
    if (empresaId) estoqueQuery = estoqueQuery.eq("empresa_id", empresaId);

    const { data: estoque } = await estoqueQuery;

    const { data: huItens } = await (supabase as any).rpc("listar_itens_hu", {
      p_tenant_id: tenantId,
      p_hu_id: hu.id,
    });
    const itensResult = typeof huItens === "string" ? JSON.parse(huItens) : huItens;

    const { data: execs } = await (supabase as any)
      .from("tarefa_execucao")
      .select("id, status, concluido_em, endereco_destino_id, endereco_origem_id, quantidade_executada")
      .eq("hu", hu.id)
      .order("concluido_em", { ascending: false })
      .limit(3);

    return {
      huInfo: hu,
      estoqueInfo: estoque || [],
      execInfo: execs || [],
      huItensInfo: itensResult?.itens || [],
    };
  }, [scanned, tenantId, empresaId]);

  const { data, loading, isFromCache, error } = useOfflineCache<ConsultaHUData>(
    `consulta_hu_${scanned}`,
    fetchConsulta,
    60,
    !!scanned,
  );

  const huInfo = data?.huInfo ?? null;
  const estoqueInfo = data?.estoqueInfo ?? [];
  const execInfo = data?.execInfo ?? [];
  const huItensInfo = data?.huItensInfo ?? [];

  const handleScan = (code: string) => {
    setScanned(code);
  };

  const semConexaoESemCache = !!scanned && !loading && !data && !isOnline;
  const errorMessage = error === "HU_NAO_ENCONTRADA"
    ? "HU não encontrada."
    : error
      ? "Erro ao consultar."
      : "";

  const dispLabel: Record<string, string> = {
    DISPONIVEL: "Disponível",
    OCUPADO: "Ocupado",
    BLOQUEADO: "Bloqueado",
  };

  const dispColor: Record<string, string> = {
    DISPONIVEL: "text-green-400",
    OCUPADO: "text-yellow-400",
    BLOQUEADO: "text-red-400",
  };

  const formatDate = (d: string | null) => {
    if (!d || d === "1900-01-01") return "—";
    return fmtDateUtil(d);
  };

  return (
    <ColetorLayout title="Consulta HU" onNavigate={onNavigate} showBack backPath="/coletor/consulta">
      <ScanField label="Escanear Código HU" onScan={handleScan} lastScanned={scanned} />

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}

      {!loading && semConexaoESemCache && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-8">
          Sem conexão e sem dados em cache para esta consulta.
        </div>
      )}

      {!loading && !semConexaoESemCache && errorMessage && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{errorMessage}</div>
      )}

      {huInfo && !loading && (
        <div className="flex flex-col gap-3">
          {isFromCache && (
            <span className="self-start flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
              <Database size={10} /> Cache
            </span>
          )}
          {/* HU Details */}
          <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3">
            <div className="flex items-center gap-3 mb-2">
              <Archive size={24} className="text-[hsl(45,93%,47%)]" />
              <span className="text-base font-bold text-white">{huInfo.codigo_hu}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Tipo</span><p className="text-xs text-white">{huInfo.tipo_hu || "—"}</p></div>
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Tamanho</span><p className="text-xs text-white">{huInfo.tamanho || "—"}</p></div>
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Peso Bruto</span><p className="text-xs text-white">{huInfo.peso_bruto ?? "—"}</p></div>
              <div>
                <span className="text-[10px] text-[hsl(213,31%,55%)]">Status</span>
                <p className="text-xs font-bold text-white">{huInfo.status || "—"}</p>
              </div>
              <div className="col-span-2">
                <span className="text-[10px] text-[hsl(213,31%,55%)]">Disponibilidade</span>
                <p className={`text-xs font-bold ${dispColor[huInfo.disponibilidade] || "text-white"}`}>
                  {dispLabel[huInfo.disponibilidade] || huInfo.disponibilidade || "—"}
                </p>
              </div>
            </div>
          </div>

          {huItensInfo.length > 0 && (
            <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-[hsl(222,35%,22%)] flex items-center gap-2">
                <Package size={16} className="text-[hsl(45,93%,47%)]" />
                <span className="text-sm font-bold text-white">Itens Agrupados ({huItensInfo.length})</span>
              </div>
              {huItensInfo.map((it: any, i: number) => (
                <div key={i} className="px-3 py-2 border-b border-[hsl(222,35%,18%)] last:border-0">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-mono text-[hsl(217,91%,60%)]">{it.sku || it.produto_sku}</span>
                    <QtdEmCaixa qtd={Number(it.quantidade)} fatorCaixa={it.fator_caixa ?? null} size="sm" />
                  </div>
                  <p className="text-[11px] text-[hsl(213,31%,80%)] truncate">{it.descricao || it.produto_descricao}</p>
                </div>
              ))}
            </div>
          )}

          {/* Products in HU */}
          {estoqueInfo.length > 0 && (
            <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-[hsl(222,35%,22%)] flex items-center gap-2">
                <Package size={16} className="text-[hsl(217,91%,60%)]" />
                <span className="text-sm font-bold text-white">Produtos na HU</span>
              </div>
              {estoqueInfo.map((e: any, i: number) => (
                <div key={i} className="px-3 py-2.5 border-b border-[hsl(222,35%,18%)] last:border-0">
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{e.produto?.sku} - {e.produto?.descricao}</p>
                    </div>
                    <div className="ml-2 shrink-0"><QtdEmCaixa qtd={Number(e.quantidade_disponivel)} fatorCaixa={e.produto?.fator_caixa ?? null} size="md" /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-1 mt-1">
                    <div>
                      <span className="text-[10px] text-[hsl(213,31%,50%)]">Lote</span>
                      <p className="text-[11px] text-[hsl(213,31%,80%)] font-medium">{e.lote || "—"}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-[hsl(213,31%,50%)]">Validade</span>
                      <p className="text-[11px] text-[hsl(213,31%,80%)] font-medium">{formatDate(e.data_validade)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-[hsl(213,31%,50%)]">Fabricação</span>
                      <p className="text-[11px] text-[hsl(213,31%,80%)] font-medium">{formatDate(e.data_fabricacao)}</p>
                    </div>
                  </div>
                  {e.endereco && (
                    <div className="mt-1.5 flex items-center gap-1">
                      <span className="text-[10px] text-[hsl(213,31%,50%)]">Endereço:</span>
                      <span className="text-[11px] text-[hsl(45,93%,47%)] font-bold">{e.endereco.descricao}</span>
                      <span className="text-[10px] text-[hsl(213,31%,50%)]">({e.endereco.tipo_endereco})</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Last executions */}
          {execInfo.length > 0 && (
            <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-[hsl(222,35%,22%)]">
                <span className="text-sm font-bold text-white">Últimas Execuções</span>
              </div>
              {execInfo.map((e: any, i: number) => (
                <div key={i} className="px-3 py-2 border-b border-[hsl(222,35%,18%)] last:border-0 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-white">{e.status}</p>
                    <p className="text-[10px] text-[hsl(213,31%,55%)]">Qtd: {e.quantidade_executada ?? "—"}</p>
                  </div>
                  <span className="text-[10px] text-[hsl(213,31%,55%)]">{formatDateTime(e.concluido_em)}</span>
                </div>
              ))}
            </div>
          )}

          {estoqueInfo.length === 0 && execInfo.length === 0 && (
            <div className="text-center text-sm text-[hsl(213,31%,55%)] py-4">Nenhum registro de estoque ou execução.</div>
          )}
        </div>
      )}
    </ColetorLayout>
  );
}
