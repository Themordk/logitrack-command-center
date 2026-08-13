import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, Database } from "lucide-react";
import { QtdEmCaixa } from "@/components/coletor/QtdEmCaixa";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useOffline } from "@/contexts/OfflineContext";

interface Props { onNavigate: (path: string) => void; }

interface EstoqueRow {
  sku: string;
  descricao: string;
  quantidade_disponivel: number;
  fator_caixa: number | null;
  lote: string;
  data_validade: string;
  data_fabricacao: string;
}

interface ConsultaEnderecoData {
  enderecoDesc: string;
  enderecoId: string;
  items: EstoqueRow[];
}

export function ConsultaEnderecoPage({ onNavigate }: Props) {
  const [scanned, setScanned] = useState("");
  const { isOnline } = useOffline();

  const fetchConsulta = useCallback(async (): Promise<ConsultaEnderecoData> => {
    // Find endereco by descricao or codigo_endereco
    const { data: enderecos } = await (supabase as any)
      .from("endereco")
      .select("id, descricao")
      .or(`descricao.eq.${scanned},codigo_endereco.eq.${scanned}`)
      .limit(1);

    if (!enderecos || enderecos.length === 0) {
      throw new Error("ENDERECO_NAO_ENCONTRADO");
    }

    const endId = enderecos[0].id;

    const { data: estoque } = await (supabase as any)
      .from("estoque_geral")
      .select("quantidade_disponivel, lote, data_validade, data_fabricacao, produto:produto_id(sku, descricao, fator_caixa)")
      .eq("endereco_id", endId)
      .gt("quantidade_disponivel", 0);

    const items: EstoqueRow[] = (estoque || []).map((e: any) => ({
      sku: e.produto?.sku || "—",
      descricao: e.produto?.descricao || "—",
      quantidade_disponivel: e.quantidade_disponivel,
      fator_caixa: e.produto?.fator_caixa ?? null,
      lote: e.lote || "",
      data_validade: e.data_validade || "",
      data_fabricacao: e.data_fabricacao || "",
    }));

    return { enderecoDesc: enderecos[0].descricao, enderecoId: endId, items };
  }, [scanned]);

  const { data, loading, isFromCache, error } = useOfflineCache<ConsultaEnderecoData>(
    `consulta_endereco_${scanned}`,
    fetchConsulta,
    60,
    !!scanned,
  );

  const enderecoDesc = data?.enderecoDesc ?? "";
  const enderecoId = data?.enderecoId ?? "";
  const items = data?.items ?? [];

  const handleScan = (code: string) => {
    setScanned(code);
  };

  const semConexaoESemCache = !!scanned && !loading && !data && !isOnline;
  const errorMessage = error === "ENDERECO_NAO_ENCONTRADO"
    ? "Endereço não encontrado."
    : error
      ? "Erro ao consultar."
      : "";

  const fmtDate = (d: string) => {
    if (!d || d === "1900-01-01") return "—";
    const parts = d.split("-");
    return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
  };

  const handleVerDetalhes = () => {
    if (!enderecoId) return;
    sessionStorage.setItem("coletor_consulta_endereco_id", enderecoId);
    sessionStorage.setItem("coletor_consulta_endereco_back", "/coletor/consulta/endereco");
    onNavigate("/coletor/consulta/endereco/detalhe");
  };

  return (
    <ColetorLayout title="Consulta Endereço" onNavigate={onNavigate} showBack backPath="/coletor/consulta">
      <ScanField label="Escanear Endereço" onScan={handleScan} lastScanned={scanned} />

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}

      {!loading && semConexaoESemCache && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-8">
          Sem conexão e sem dados em cache para esta consulta.
        </div>
      )}

      {!loading && !semConexaoESemCache && errorMessage && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{errorMessage}</div>
      )}

      {isFromCache && enderecoDesc && !loading && (
        <span className="self-start flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
          <Database size={10} /> Cache
        </span>
      )}

      {enderecoDesc && !loading && (
        <button
          onClick={handleVerDetalhes}
          className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 w-full text-left active:bg-[hsl(222,35%,16%)] transition-all"
        >
          <span className="text-xs text-[hsl(213,31%,55%)]">Endereço <span className="text-[hsl(217,91%,60%)] ml-1">→ Ver detalhes</span></span>
          <p className="text-sm font-bold text-white">{enderecoDesc}</p>
        </button>
      )}

      {items.length > 0 && !loading && (
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{item.sku}</p>
                  <p className="text-sm text-white truncate">{item.descricao}</p>
                </div>
                <div className="ml-2 shrink-0"><QtdEmCaixa qtd={item.quantidade_disponivel} fatorCaixa={item.fator_caixa} size="md" /></div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-[hsl(222,35%,18%)]">
                <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Lote</span><p className="text-xs text-white">{item.lote || "—"}</p></div>
                <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Validade</span><p className="text-xs text-white">{fmtDate(item.data_validade)}</p></div>
                <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Fabricação</span><p className="text-xs text-white">{fmtDate(item.data_fabricacao)}</p></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && scanned && data && items.length === 0 && !error && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-8">Nenhum saldo neste endereço.</div>
      )}
    </ColetorLayout>
  );
}
