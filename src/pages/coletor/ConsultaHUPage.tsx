import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, Archive, Package } from "lucide-react";
import { formatDateTime, formatDate as fmtDateUtil } from "@/utils/dateTime";

interface Props { onNavigate: (path: string) => void; }

export function ConsultaHUPage({ onNavigate }: Props) {
  const { tenantId, empresaId } = useTenant();
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [error, setError] = useState("");
  const [huInfo, setHuInfo] = useState<any>(null);
  const [estoqueInfo, setEstoqueInfo] = useState<any[]>([]);
  const [execInfo, setExecInfo] = useState<any[]>([]);
  const [huItensInfo, setHuItensInfo] = useState<any[]>([]);

  const handleScan = async (code: string) => {
    setScanned(code);
    setError("");
    setHuInfo(null);
    setEstoqueInfo([]);
    setExecInfo([]);
    setLoading(true);
    try {
      const { data: hus } = await (supabase as any)
        .from("hu")
        .select("id, codigo_hu, tipo_hu, tamanho, disponibilidade, peso_bruto")
        .eq("codigo_hu", code)
        .limit(1);

      if (!hus || hus.length === 0) {
        setError("HU não encontrada.");
        setLoading(false);
        return;
      }

      const hu = hus[0];
      setHuInfo(hu);

      // Fetch stock with product details, lote, validade, fabricacao and address
      let estoqueQuery = (supabase as any)
        .from("estoque_geral")
        .select("quantidade_disponivel, quantidade_total, lote, data_validade, data_fabricacao, endereco:endereco_id(descricao, tipo_endereco), produto:produto_id(sku, descricao)")
        .eq("hu_id", hu.id);

      if (tenantId) estoqueQuery = estoqueQuery.eq("tenant_id", tenantId);
      if (empresaId) estoqueQuery = estoqueQuery.eq("empresa_id", empresaId);

      const { data: estoque } = await estoqueQuery;
      setEstoqueInfo(estoque || []);

      // Last executions
      const { data: execs } = await (supabase as any)
        .from("tarefa_execucao")
        .select("id, status, concluido_em, endereco_destino_id, endereco_origem_id, quantidade_executada")
        .eq("hu", hu.id)
        .order("concluido_em", { ascending: false })
        .limit(3);

      setExecInfo(execs || []);
    } catch {
      setError("Erro ao consultar.");
    } finally {
      setLoading(false);
    }
  };

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
      {error && <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{error}</div>}

      {huInfo && !loading && (
        <div className="flex flex-col gap-3">
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
                <span className="text-[10px] text-[hsl(213,31%,55%)]">Disponibilidade</span>
                <p className={`text-xs font-bold ${dispColor[huInfo.disponibilidade] || "text-white"}`}>
                  {dispLabel[huInfo.disponibilidade] || huInfo.disponibilidade || "—"}
                </p>
              </div>
            </div>
          </div>

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
                    <span className="text-sm font-bold text-[hsl(217,91%,60%)] ml-2 whitespace-nowrap">{e.quantidade_disponivel}</span>
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
