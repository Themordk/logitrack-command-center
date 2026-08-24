import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2, Database, Search, Info, MapPin, ArrowLeftRight } from "lucide-react";
import { ProdutoImagemThumb } from "@/components/produto/ProdutoImagemThumb";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useOffline } from "@/contexts/OfflineContext";

interface Props { onNavigate: (path: string) => void; }

interface SaldoRow {
  endereco_id: string;
  endereco_desc: string;
  tipo_endereco: string;
  tipo_estoque_desc: string;
  quantidade_disponivel: number;
  lote: string;
  data_validade: string;
  data_fabricacao: string;
}

interface ConsultaProdutoData {
  produtoId: string;
  produtoNome: string;
  produtoImg: string | null;
  produtoFatorCaixa: number;
  saldos: SaldoRow[];
  pickingMapeadoIds: string[];
}

export function ConsultaProdutoPage({ onNavigate }: Props) {
  const [scanned, setScanned] = useState("");
  const [notFound, setNotFound] = useState(false);
  const { isOnline } = useOffline();

  const fetchConsulta = useCallback(async (): Promise<ConsultaProdutoData> => {
    // Find produto by EAN
    const { data: emb } = await (supabase as any)
      .from("produto_embalagem")
      .select("produto_id, produto:produto_id(descricao, sku, url_imagem, fator_caixa)")
      .eq("ean", scanned)
      .limit(1);

    if (!emb || emb.length === 0) {
      throw new Error("PRODUTO_NAO_ENCONTRADO");
    }

    const prodId = emb[0].produto_id;
    const produtoNome = `${emb[0].produto?.sku} - ${emb[0].produto?.descricao}`;
    const produtoImg = emb[0].produto?.url_imagem ?? null;
    const produtoFatorCaixa = Number(emb[0].produto?.fator_caixa) || 1;

    // Fetch stock grouped by address
    // Sem FK entre endereco e tipo_estoque: resolvemos a descrição em consulta separada.
    const { data: estoque } = await (supabase as any)
      .from("estoque_geral")
      .select(`
        quantidade_disponivel, lote, data_validade, data_fabricacao, endereco_id,
        endereco:endereco_id(
          descricao,
          tipo_endereco,
          tipo_estoque_id
        )
      `)
      .eq("produto_id", prodId)
      .gt("quantidade_disponivel", 0);

    const tipoIds = Array.from(
      new Set((estoque || []).map((e: any) => e.endereco?.tipo_estoque_id).filter(Boolean)),
    );
    const tipoMap = new Map<string, string>();
    if (tipoIds.length > 0) {
      const { data: tipos } = await (supabase as any)
        .from("tipo_estoque")
        .select("id, descricao")
        .in("id", tipoIds);
      (tipos || []).forEach((t: any) => tipoMap.set(t.id, t.descricao));
    }

    const saldos: SaldoRow[] = (estoque || []).map((e: any) => ({
      endereco_desc: e.endereco?.descricao || "—",
      tipo_endereco: e.endereco?.tipo_endereco || "—",
      tipo_estoque_desc: tipoMap.get(e.endereco?.tipo_estoque_id) || "—",
      quantidade_disponivel: Number(e.quantidade_disponivel) || 0,
      lote: e.lote || "",
      data_validade: e.data_validade || "",
      data_fabricacao: e.data_fabricacao || "",
    }));

    return { produtoId: prodId, produtoNome, produtoImg, produtoFatorCaixa, saldos };
  }, [scanned]);

  const { data, loading, isFromCache, error, refetch } = useOfflineCache<ConsultaProdutoData>(
    `consulta_produto_${scanned}`,
    fetchConsulta,
    60,
    !!scanned,
  );

  const produtoId = data?.produtoId ?? "";
  const produtoNome = data?.produtoNome ?? "";
  const produtoImg = data?.produtoImg ?? null;
  const produtoFatorCaixa = data?.produtoFatorCaixa ?? 1;
  const saldos = data?.saldos ?? [];

  const handleScan = (code: string) => {
    setNotFound(false);
    setScanned(code);
  };

  // Auto-load product coming from the text search page
  useEffect(() => {
    const eanFromSearch = sessionStorage.getItem("coletor_busca_ean");
    if (eanFromSearch) {
      sessionStorage.removeItem("coletor_busca_ean");
      handleScan(eanFromSearch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const semConexaoESemCache = !!scanned && !loading && !data && !isOnline;
  const errorMessage = error === "PRODUTO_NAO_ENCONTRADO"
    ? "Produto não encontrado para este EAN."
    : error
      ? "Erro ao consultar."
      : "";
  void refetch;
  void notFound;

  const pulmao = saldos.filter(s => s.tipo_endereco === "PULMAO");
  const picking = saldos.filter(s => s.tipo_endereco === "PICKING");
  const outros = saldos.filter(s => s.tipo_endereco !== "PULMAO" && s.tipo_endereco !== "PICKING");

  return (
    <ColetorLayout title="Consulta Produto" onNavigate={onNavigate} showBack backPath="/coletor/consulta">
      <div className="flex items-stretch gap-2">
        <div className="flex-1 min-w-0">
          <ScanField label="Escanear EAN do Produto" onScan={handleScan} lastScanned={scanned} />
        </div>
        <button
          onClick={() => onNavigate("/coletor/consulta/produto/busca")}
          className="w-14 rounded-xl bg-[hsl(217,91%,50%)] text-white flex flex-col items-center justify-center gap-1 shrink-0 active:scale-[0.95] active:bg-[hsl(217,91%,40%)] transition-all border-2 border-dashed border-[hsl(217,91%,60%)]"
          aria-label="Buscar produto por texto"
          title="Buscar por descrição, SKU ou referência"
        >
          <Search size={20} />
          <span className="text-[9px] font-bold">Buscar</span>
        </button>
      </div>

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}

      {!loading && semConexaoESemCache && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-8">
          Sem conexão e sem dados em cache para esta consulta.
        </div>
      )}

      {!loading && !semConexaoESemCache && errorMessage && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{errorMessage}</div>
      )}

      {produtoNome && !loading && (
        <div className="flex flex-col gap-2">
          {isFromCache && (
            <span className="self-start flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
              <Database size={10} /> Cache
            </span>
          )}
          <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 w-full flex items-center gap-3">
            <ProdutoImagemThumb
              url={produtoImg}
              alt={produtoNome}
              caption={produtoNome}
              size={56}
              variant="coletor"
            />
            <div className="flex-1">
              <span className="text-xs text-[hsl(213,31%,55%)]">Produto</span>
              <p className="text-sm font-bold text-white">{produtoNome}</p>
              {produtoFatorCaixa > 1 && (
                <p className="text-[11px] text-[hsl(217,91%,60%)] font-bold">Fator Cx: {produtoFatorCaixa} UN por CX</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                if (produtoId) {
                  sessionStorage.setItem("coletor_consulta_produto_id", produtoId);
                  onNavigate("/coletor/consulta/produto/detalhe");
                }
              }}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[hsl(222,35%,20%)] border border-[hsl(222,35%,28%)] text-[hsl(213,31%,91%)] active:bg-[hsl(222,35%,16%)] active:scale-[0.96] transition-all"
            >
              <Info size={20} className="text-[hsl(217,91%,60%)]" />
              <span className="text-[11px] font-bold">Detalhes</span>
            </button>

            <button
              onClick={() => {
                if (produtoId) {
                  sessionStorage.setItem("mapear_from_consulta", JSON.stringify({
                    produtoId,
                    produtoNome,
                    scannedEan: scanned,
                  }));
                  onNavigate("/coletor/consulta/mapear-picking");
                }
              }}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[hsl(222,35%,20%)] border border-[hsl(222,35%,28%)] text-[hsl(213,31%,91%)] active:bg-[hsl(222,35%,16%)] active:scale-[0.96] transition-all"
            >
              <MapPin size={20} className="text-[hsl(142,76%,45%)]" />
              <span className="text-[11px] font-bold">Mapear</span>
            </button>

            <button
              onClick={() => {
                if (produtoId) {
                  sessionStorage.setItem("transf_from_consulta", JSON.stringify({
                    produtoId,
                    produtoNome,
                    scannedEan: scanned,
                  }));
                  onNavigate("/coletor/movimentos/transferencia/origem");
                }
              }}
              className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl bg-[hsl(222,35%,20%)] border border-[hsl(222,35%,28%)] text-[hsl(213,31%,91%)] active:bg-[hsl(222,35%,16%)] active:scale-[0.96] transition-all"
            >
              <ArrowLeftRight size={20} className="text-[hsl(45,93%,55%)]" />
              <span className="text-[11px] font-bold">Transferir</span>
            </button>
          </div>
        </div>
      )}

      {saldos.length > 0 && !loading && (
        <div className="flex flex-col gap-3">
          {pulmao.length > 0 && <SaldoSection title="Pulmão" items={pulmao} color="hsl(217,91%,50%)" fatorCaixa={produtoFatorCaixa} />}
          {picking.length > 0 && <SaldoSection title="Picking" items={picking} color="hsl(142,76%,36%)" fatorCaixa={produtoFatorCaixa} />}
          {outros.length > 0 && <SaldoSection title="Outros" items={outros} color="hsl(45,93%,47%)" fatorCaixa={produtoFatorCaixa} />}
        </div>
      )}

      {!loading && scanned && data && saldos.length === 0 && !error && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-8">Nenhum saldo encontrado.</div>
      )}
    </ColetorLayout>
  );
}

function SaldoSection({ title, items, color, fatorCaixa }: { title: string; items: SaldoRow[]; color: string; fatorCaixa: number }) {
  const total = items.reduce((a, b) => a + b.quantidade_disponivel, 0);
  const showCx = fatorCaixa > 1;
  const totalCx = showCx ? Math.floor(total / fatorCaixa) : 0;
  const totalResto = showCx ? total % fatorCaixa : 0;

  return (
    <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(222,35%,22%)]" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
        <span className="text-sm font-bold text-white">{title}</span>
        <div className="text-right">
          <p className="text-sm font-bold" style={{ color }}>Total: {total} UN</p>
          {showCx && <p className="text-[10px] text-[hsl(213,31%,55%)]">= {totalCx} CX + {totalResto} UN</p>}
        </div>
      </div>
      {items.map((item, i) => {
        const cx = showCx ? Math.floor(item.quantidade_disponivel / fatorCaixa) : 0;
        const resto = showCx ? item.quantidade_disponivel % fatorCaixa : 0;
        return (
          <div key={i} className="px-3 py-2 border-b border-[hsl(222,35%,18%)] last:border-0 flex justify-between items-center gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs text-white font-mono">{item.endereco_desc}</p>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-[hsl(222,35%,20%)] text-[hsl(213,31%,70%)] border border-[hsl(222,35%,28%)]">
                  {item.tipo_estoque_desc}
                </span>
              </div>
              {item.lote && <p className="text-[10px] text-[hsl(213,31%,55%)]">Lote: {item.lote}</p>}
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-white">{item.quantidade_disponivel} UN</p>
              {showCx && <p className="text-[10px] text-[hsl(213,31%,55%)]">= {cx} CX + {resto} UN</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
