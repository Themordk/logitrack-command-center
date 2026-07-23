import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { Loader2 } from "lucide-react";
import { ProdutoImagemThumb } from "@/components/produto/ProdutoImagemThumb";

interface Props { onNavigate: (path: string) => void; }

interface SaldoRow {
  endereco_desc: string;
  tipo_endereco: string;
  quantidade_disponivel: number;
  lote: string;
  data_validade: string;
  data_fabricacao: string;
}

export function ConsultaProdutoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id");
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [produtoNome, setProdutoNome] = useState("");
  const [produtoImg, setProdutoImg] = useState<string | null>(null);
  const [saldos, setSaldos] = useState<SaldoRow[]>([]);
  const [error, setError] = useState("");

  const handleScan = async (code: string) => {
    setScanned(code);
    setError("");
    setSaldos([]);
    setProdutoNome("");
    setProdutoImg(null);
    setLoading(true);
    try {
      // Find produto by EAN
      const { data: emb } = await (supabase as any)
        .from("produto_embalagem")
        .select("produto_id, produto:produto_id(descricao, sku, url_imagem)")
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

      // Fetch stock grouped by address
      const { data: estoque } = await (supabase as any)
        .from("estoque_geral")
        .select("quantidade_disponivel, lote, data_validade, data_fabricacao, endereco_id, endereco:endereco_id(descricao, tipo_endereco)")
        .eq("produto_id", prodId)
        .gt("quantidade_disponivel", 0);

      const rows: SaldoRow[] = (estoque || []).map((e: any) => ({
        endereco_desc: e.endereco?.descricao || "—",
        tipo_endereco: e.endereco?.tipo_endereco || "—",
        quantidade_disponivel: e.quantidade_disponivel,
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
        <button
          onClick={() => {
            // Find produto_id from last scan embalagem lookup
            const emb = (window as any).__lastProdutoEmb;
            if (emb) {
              sessionStorage.setItem("coletor_consulta_produto_id", emb);
              onNavigate("/coletor/consulta/produto/detalhe");
            }
          }}
          className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 w-full text-left active:bg-[hsl(222,35%,16%)] transition-all"
        >
          <span className="text-xs text-[hsl(213,31%,55%)]">Produto <span className="text-[hsl(217,91%,60%)] ml-1">→ Ver detalhes</span></span>
          <p className="text-sm font-bold text-white">{produtoNome}</p>
        </button>
      )}

      {saldos.length > 0 && !loading && (
        <div className="flex flex-col gap-3">
          {pulmao.length > 0 && <SaldoSection title="Pulmão" items={pulmao} color="hsl(217,91%,50%)" />}
          {picking.length > 0 && <SaldoSection title="Picking" items={picking} color="hsl(142,76%,36%)" />}
          {outros.length > 0 && <SaldoSection title="Outros" items={outros} color="hsl(45,93%,47%)" />}
        </div>
      )}

      {!loading && scanned && saldos.length === 0 && !error && (
        <div className="text-center text-sm text-[hsl(213,31%,55%)] py-8">Nenhum saldo encontrado.</div>
      )}
    </ColetorLayout>
  );
}

function SaldoSection({ title, items, color }: { title: string; items: SaldoRow[]; color: string }) {
  const total = items.reduce((a, b) => a + b.quantidade_disponivel, 0);
  return (
    <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[hsl(222,35%,22%)]" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
        <span className="text-sm font-bold text-white">{title}</span>
        <span className="text-sm font-bold" style={{ color }}>Total: {total}</span>
      </div>
      {items.map((item, i) => (
        <div key={i} className="px-3 py-2 border-b border-[hsl(222,35%,18%)] last:border-0 flex justify-between items-center">
          <div>
            <p className="text-xs text-white font-mono">{item.endereco_desc}</p>
            {item.lote && <p className="text-[10px] text-[hsl(213,31%,55%)]">Lote: {item.lote}</p>}
          </div>
          <span className="text-sm font-bold text-white">{item.quantidade_disponivel}</span>
        </div>
      ))}
    </div>
  );
}
