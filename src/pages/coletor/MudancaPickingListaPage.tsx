import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay, OverlayType } from "@/components/coletor/StatusOverlay";
import { Loader2, Package } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface ItemEstoque {
  id: string;
  produto_id: string;
  sku: string;
  descricao: string;
  quantidade_disponivel: number;
  lote: string | null;
  data_validade: string | null;
  data_fabricacao: string | null;
}

export function MudancaPickingListaPage({ onNavigate }: Props) {
  const origemId = sessionStorage.getItem("mudpick_origem_id") || "";
  const origemDesc = sessionStorage.getItem("mudpick_origem_desc") || "";

  const [loading, setLoading] = useState(true);
  const [itens, setItens] = useState<ItemEstoque[]>([]);
  const [overlay, setOverlay] = useState<OverlayType>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("estoque_geral")
          .select("id, produto_id, quantidade_disponivel, lote, data_validade, data_fabricacao, produto:produto_id(sku, descricao)")
          .eq("endereco_id", origemId)
          .gt("quantidade_disponivel", 0);
        if (error) throw error;
        const list: ItemEstoque[] = (data || []).map((r: any) => ({
          id: r.id,
          produto_id: r.produto_id,
          sku: r.produto?.sku || "—",
          descricao: r.produto?.descricao || "",
          quantidade_disponivel: Number(r.quantidade_disponivel || 0),
          lote: r.lote,
          data_validade: r.data_validade,
          data_fabricacao: r.data_fabricacao,
        }));
        setItens(list);
      } catch {
        setOverlay("error");
        setOverlayMsg("Erro ao buscar itens do endereço.");
      } finally {
        setLoading(false);
      }
    })();
  }, [origemId]);

  const handleConfirm = () => {
    sessionStorage.setItem("mudpick_itens", JSON.stringify(itens));
    onNavigate("/coletor/movimentos/mudanca-picking/destino");
  };

  const qtdTotal = itens.reduce((s, i) => s + i.quantidade_disponivel, 0);

  return (
    <ColetorLayout title="Mudança de Picking - Itens" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/mudanca-picking/origem">
      <StatusOverlay type={overlay} message={overlayMsg} onDone={() => setOverlay(null)} />

      <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3 mb-2">
        <span className="text-xs text-[hsl(213,31%,55%)]">Passo 2 de 3</span>
        <p className="text-sm font-bold text-white">Conferir itens do endereço</p>
        <p className="text-xs text-[hsl(213,31%,55%)] mt-1">Origem: <span className="text-white font-mono">{origemDesc}</span></p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[hsl(280,80%,60%)]" size={32} /></div>
      ) : itens.length === 0 ? (
        <div className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-6 text-center">
          <p className="text-sm text-[hsl(213,31%,75%)]">Nenhum saldo disponível neste endereço.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] text-[hsl(213,31%,55%)]">{itens.length} {itens.length === 1 ? "item" : "itens"}</span>
            <span className="text-[11px] text-[hsl(213,31%,55%)]">Total: <span className="text-white font-bold">{qtdTotal}</span></span>
          </div>
          <div className="flex flex-col gap-2 max-h-[calc(100vh-320px)] overflow-y-auto">
            {itens.map((it) => (
              <div key={it.id} className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-xl p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <Package size={18} className="text-[hsl(280,80%,60%)] mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-[hsl(217,91%,60%)]">{it.sku}</p>
                      <p className="text-xs text-white truncate">{it.descricao}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-white shrink-0">{it.quantidade_disponivel}</span>
                </div>
                {(it.lote || it.data_validade) && (
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {it.lote && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[hsl(222,35%,16%)] text-[hsl(213,31%,75%)]">
                        Lote: <span className="text-white">{it.lote}</span>
                      </span>
                    )}
                    {it.data_validade && it.data_validade !== "1900-01-01" && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-[hsl(222,35%,16%)] text-[hsl(213,31%,75%)]">
                        Val: <span className="text-white">{it.data_validade.split("-").reverse().join("/")}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <ActionButton onClick={handleConfirm} disabled={itens.length === 0}>Confirmar Mudança</ActionButton>
        </>
      )}
    </ColetorLayout>
  );
}
