import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { OnlineOnlyNotice, useOnlineOnlyBlocked } from "@/components/coletor/OnlineOnlyNotice";
import { ScanField } from "@/components/coletor/ScanField";
import { ResultDialog } from "@/components/feedback/ResultDialog";
import { useResultDialog } from "@/hooks/useResultDialog";
import { Loader2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

export function TransferenciaOrigemPage({ onNavigate }: Props) {
  const offlineBlocked = useOnlineOnlyBlocked();
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState("");
  const result = useResultDialog({ coletorMode: true });
  const [fromConsulta, setFromConsulta] = useState<{ produtoId: string; produtoNome: string; scannedEan: string } | null>(null);
  const fromConsultaRef = useRef<{ produtoId: string; produtoNome: string; scannedEan: string } | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("transf_from_consulta");
    if (raw) {
      sessionStorage.removeItem("transf_from_consulta");
      try {
        const parsed = JSON.parse(raw);
        fromConsultaRef.current = parsed;
        setFromConsulta(parsed);
      } catch { /* ignore */ }
    }
  }, []);

  const handleScan = async (code: string) => {
    setScanned(code);
    setLoading(true);
    try {
      const { data } = await (supabase as any)
        .from("endereco")
        .select("id, descricao, tipo_endereco, situacao")
        .or(`descricao.eq.${code},codigo_endereco.eq.${code}`)
        .limit(1);

      if (!data || data.length === 0) {
        result.showWarning("Endereço não encontrado.");
        return;
      }

      if (!["LIVRE", "OCUPADO"].includes(data[0].situacao)) {
        result.showWarning(`Endereço ${data[0].descricao} está ${data[0].situacao}. Movimentações não são permitidas. Procure a supervisão.`);
        return;
      }

      sessionStorage.setItem("transf_origem_id", data[0].id);
      sessionStorage.setItem("transf_origem_desc", data[0].descricao);

      // Produto pré-carregado da Consulta: chave principal é produtoId (EAN opcional)
      const consulta = fromConsultaRef.current;
      if (consulta?.produtoId) {
        try {
          const [{ data: prod }, { data: embs }, { data: estoque }] = await Promise.all([
            (supabase as any).from("produto").select("sku, descricao").eq("id", consulta.produtoId).limit(1),
            (supabase as any).from("produto_embalagem").select("fator, embalagem, ean")
              .eq("produto_id", consulta.produtoId).order("fator", { ascending: true }),
            (supabase as any).from("estoque_geral")
              .select("id, quantidade_disponivel, lote, data_validade, data_fabricacao")
              .eq("produto_id", consulta.produtoId)
              .eq("endereco_id", data[0].id)
              .gt("quantidade_disponivel", 0)
              .limit(1),
          ]);
          const emb = (embs || [])[0];

          if (estoque && estoque.length > 0) {
            sessionStorage.removeItem("transf_hu_id");
            sessionStorage.removeItem("transf_hu_codigo");
            sessionStorage.setItem("transf_produto_id", consulta.produtoId);
            sessionStorage.setItem("transf_produto_sku", prod?.[0]?.sku || "");
            sessionStorage.setItem("transf_produto_desc", prod?.[0]?.descricao || "");
            sessionStorage.setItem("transf_saldo_disponivel", String(estoque[0].quantidade_disponivel));
            sessionStorage.setItem("transf_lote", estoque[0].lote || "");
            sessionStorage.setItem("transf_validade", estoque[0].data_validade || "");
            sessionStorage.setItem("transf_fabricacao", estoque[0].data_fabricacao || "");
            sessionStorage.setItem("transf_fator", String(emb?.fator || 1));
            sessionStorage.setItem("transf_embalagem", emb?.embalagem || "UN");
            onNavigate("/coletor/movimentos/transferencia/detalhe");
            return;
          }

          if (consulta.scannedEan) {
            sessionStorage.setItem("transf_produto_ean", consulta.scannedEan);
            result.showWarning(`Produto ${consulta.produtoNome} sem saldo neste endereço. Escaneie outro produto.`);
            onNavigate("/coletor/movimentos/transferencia/produto");
          } else {
            result.showWarning(`Produto ${consulta.produtoNome} sem saldo neste endereço. Escaneie outro endereço de origem.`);
          }
          return;
        } catch (err) {
          result.showWarning("Erro ao verificar estoque. Escaneie o produto manualmente.");
        }
      }

      onNavigate("/coletor/movimentos/transferencia/produto");
    } catch {
      result.showError(new Error("Erro ao buscar endereço."), { context: "transferencia" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ColetorLayout title="Transferência - Origem" onNavigate={onNavigate} showBack backPath="/coletor/movimentos">
      <OnlineOnlyNotice flow="Transferência" />
      <ResultDialog {...result.dialogProps} />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 1 de 4</span>
        <p className="text-sm font-bold text-white">Escanear o endereço de ORIGEM</p>
      </div>

      {fromConsulta && (
        <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
          <span className="text-xs text-[hsl(213,31%,55%)]">Produto (da consulta)</span>
          <p className="text-sm font-bold text-white">{fromConsulta.produtoNome}</p>
        </div>
      )}

      <ScanField label="Escanear Endereço Origem" onScan={handleScan} lastScanned={scanned} disabled={loading || offlineBlocked} />
      {loading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={28} /></div>}
    </ColetorLayout>
  );
}
