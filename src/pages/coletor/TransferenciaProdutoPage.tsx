import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function TransferenciaProdutoPage({ onNavigate }: Props) {
  const origemDesc = sessionStorage.getItem("transf_origem_desc") || "";
  const origemId = sessionStorage.getItem("transf_origem_id") || "";

  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const handleScan = async (code: string) => {
    setScanned(code);
    setLoading(true);
    try {
      // Find product by EAN
      const { data: emb } = await (supabase as any)
        .from("produto_embalagem")
        .select("produto_id, produto:produto_id(sku, descricao)")
        .eq("ean", code)
        .limit(1);

      if (!emb || emb.length === 0) {
        setOverlay("error");
        setOverlayMsg("Produto não encontrado.");
        return;
      }

      const prodId = emb[0].produto_id;

      // Check stock at origin
      const { data: estoque } = await (supabase as any)
        .from("estoque_geral")
        .select("id, quantidade_disponivel, lote, data_validade, data_fabricacao")
        .eq("produto_id", prodId)
        .eq("endereco_id", origemId)
        .gt("quantidade_disponivel", 0)
        .limit(1);

      if (!estoque || estoque.length === 0) {
        setOverlay("error");
        setOverlayMsg("Produto sem saldo neste endereço.");
        return;
      }

      sessionStorage.setItem("transf_produto_id", prodId);
      sessionStorage.setItem("transf_produto_sku", emb[0].produto?.sku || "");
      sessionStorage.setItem("transf_produto_desc", emb[0].produto?.descricao || "");
      sessionStorage.setItem("transf_saldo_disponivel", String(estoque[0].quantidade_disponivel));
      sessionStorage.setItem("transf_lote", estoque[0].lote || "");
      sessionStorage.setItem("transf_validade", estoque[0].data_validade || "");
      sessionStorage.setItem("transf_fabricacao", estoque[0].data_fabricacao || "");
      onNavigate("/coletor/movimentos/transferencia/detalhe");
    } catch {
      setOverlay("error");
      setOverlayMsg("Erro ao buscar produto.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout title="Transferência - Produto" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/transferencia/origem">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 2 de 4</span>
        <p className="text-sm font-bold text-white">Escanear o Produto</p>
        <p className="text-xs text-[hsl(213,31%,55%)] mt-1">Origem: <span className="text-white font-mono">{origemDesc}</span></p>
      </div>

      <ScanField label="Escanear EAN do Produto" onScan={handleScan} lastScanned={scanned} disabled={loading} />
      {loading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={28} /></div>}
    </ColetorLayout>
  );
}
