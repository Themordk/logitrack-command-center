import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { ChevronRight, Loader2 } from "lucide-react";
import { ProdutoImagemThumb } from "@/components/produto/ProdutoImagemThumb";

interface Props { onNavigate: (path: string) => void; }

interface SaldoRow {
  endereco_desc: string;
  tipo_endereco: string;
  tipo_estoque_desc: string;
  quantidade_disponivel: number;
  lote: string;
  data_validade: string;
  data_fabricacao: string;
}

export function ConsultaProdutoPage({ onNavigate }: Props) {
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [produtoNome, setProdutoNome] = useState("");
  const [produtoImg, setProdutoImg] = useState<string | null>(null);
  const [produtoFatorCaixa, setProdutoFatorCaixa] = useState(1);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [error, setError] = useState("");

  const handleScan = async (code: string) => {
    setScanned(code);
    setError("");
    setSaldos([]);
    setProdutoNome("");
    setProdutoImg(null);
    setProdutoFatorCaixa(1);
    setLoading(true);
    try {
      // Find produto by EAN
      const { data: emb } = await (supabase as any)
        .from("produto_embalagem")
        .select("produto_id, produto:produto_id(descricao, sku, url_imagem, fator_caixa)")
        .eq("ean", code)
        .limit(1);

      if (!emb || emb.length === 0) {
        setError("Produto não encontrado para este EAN.");
        setLoading(false);
        return;
      }

      const prodId = emb[0].produto_id;
      (window as any).__lastProdutoEmb = prodId;
      setProdutoNome(`${emb[0].produto?.sku} - ${emb[0].produto?.descricao}`);
      setProdutoImg(emb[0].produto?.url_imagem ?? null);
      setProdutoFatorCaixa(Number(emb[0].produto?.fator_caixa) || 1);

      // Fetch stock grouped by address
      const { data: estoque } = await (supabase as any)
        .from("estoque_geral")
        .select(`
          quantidade_disponivel, lote, data_validade, data_fabricacao, endereco_id,
          endereco:endereco_id(
            descricao,
            tipo_endereco,
            tipo_estoque:tipo_estoque_id(descricao)
          )
        `)
        .eq("produto_id", prodId)
        .gt("quantidade_disponivel", 0);

      const rows: SaldoRow[] = (estoque || []).map((e: any) => ({
        endereco_desc: e.endereco?.descricao || "—",
        tipo_endereco: e.endereco?.tipo_endereco || "—",
        tipo_estoque_desc: e.endereco?.tipo_estoque?.descricao || "—",
        quantidade_disponivel: Number(e.quantidade_disponivel) || 0,
        lote: e.lote || "",
        data_validade: e.data_validade || "",
        data_fabricacao: e.data_fabricacao || "",
      }));

      setSaldos(rows);
    } catch {
      setError("Erro ao consultar.");
    } finally {
      setLoading(false);
    }
  };

  const pulmao = saldos.filter(s => s.tipo_endereco === "PULMAO");
  const picking = saldos.filter(s => s.tipo_endereco === "PICKING");
  const outros = saldos.filter(s => s.tipo_endereco !== "PULMAO" && s.tipo_endereco !== "PICKING");

  return (
    <ColetorLayout title="Consulta Produto" onNavigate={onNavigate} showBack backPath="/coletor/consulta">
      <ScanField label="Escanear EAN do Produto" onScan={handleScan} lastScanned={scanned} />

      {loading && <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>}
      {error && <div className="bg-red-500/20 border border-red-500/50 rounded-xl p-3 text-red-300 text-sm text-center">{error}</div>}

      {produtoNome && !loading && (
        <div className="flex flex-col gap-2">
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
          <ActionButton
            variant="secondary"
            onClick={() => {
              const emb = (window as any).__lastProdutoEmb;
              if (emb) {
                sessionStorage.setItem("coletor_consulta_produto_id", emb);
                onNavigate("/coletor/consulta/produto/detalhe");
              }
            }}
          >
            Ver detalhes do produto <ChevronRight size={18} />
          </ActionButton>
        </div>
      )}

      {saldos.length > 0 && !loading && (
        <div className="flex flex-col gap-3">
          {pulmao.length > 0 && <SaldoSection title="Pulmão" items={pulmao} color="hsl(217,91%,50%)" fatorCaixa={produtoFatorCaixa} />}
          {picking.length > 0 && <SaldoSection title="Picking" items={picking} color="hsl(142,76%,36%)" fatorCaixa={produtoFatorCaixa} />}
          {outros.length > 0 && <SaldoSection title="Outros" items={outros} color="hsl(45,93%,47%)" fatorCaixa={produtoFatorCaixa} />}
        </div>
      )}

      {!loading && scanned && saldos.length === 0 && !error && (
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
