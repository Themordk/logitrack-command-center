import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { Layers, Loader2, CheckCircle2 } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface LoteDisponivel {
  lote: string;
  validade: string | null;
  fabricacao: string | null;
  hu_id: string | null;
  saldo_disponivel: number;
}

const INVALID_DATE = "1900-01-01";

function fmtDate(iso: string | null): string {
  if (!iso || iso === INVALID_DATE) return "—";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function SeparacaoLotePage({ onNavigate }: Props) {
  const [tarefa, setTarefa] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [lotes, setLotes] = useState<LoteDisponivel[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";
  const tenantId = localStorage.getItem("core_tenant_id");

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_separacao_tarefa_atual");
    if (!raw) {
      setLoading(false);
      return;
    }
    const t = JSON.parse(raw);
    setTarefa(t);
    loadLotes(t);
  }, []);

  const loadLotes = async (t: any) => {
    setLoading(true);
    try {
      // Resolve produto_id
      let produtoId = t.produto_id;
      if (!produtoId && t.sku) {
        const { data } = await (supabase as any)
          .from("produto")
          .select("id")
          .eq("sku", t.sku)
          .limit(1);
        if (data && data.length > 0) produtoId = data[0].id;
      }

      // Resolve endereco_id (alternativo tem prioridade)
      let enderecoId = t.endereco_alternativo_id || t.endereco_id;
      if (!enderecoId && t.endereco) {
        const { data } = await (supabase as any)
          .from("endereco")
          .select("id")
          .eq("descricao", t.endereco)
          .limit(1);
        if (data && data.length > 0) enderecoId = data[0].id;
      }

      if (!produtoId || !enderecoId) {
        toast.error("Produto ou endereço não identificado.");
        setLotes([]);
        return;
      }

      let query = (supabase as any)
        .from("estoque_geral")
        .select("lote, data_validade, data_fabricacao, hu_id, quantidade_disponivel")
        .eq("produto_id", produtoId)
        .eq("endereco_id", enderecoId)
        .gt("quantidade_disponivel", 0)
        .limit(200);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por lote + validade + fabricacao + hu_id
      const map = new Map<string, LoteDisponivel>();
      (data || []).forEach((r: any) => {
        const key = `${r.lote || ""}|${r.data_validade || ""}|${r.data_fabricacao || ""}|${r.hu_id || ""}`;
        const existing = map.get(key);
        const saldo = Number(r.quantidade_disponivel || 0);
        if (existing) {
          existing.saldo_disponivel += saldo;
        } else {
          map.set(key, {
            lote: r.lote || "",
            validade: r.data_validade || null,
            fabricacao: r.data_fabricacao || null,
            hu_id: r.hu_id || null,
            saldo_disponivel: saldo,
          });
        }
      });

      // PVPS: validade asc, fabricacao asc, lote asc
      const lista = Array.from(map.values()).sort((a, b) => {
        const va = a.validade || "9999-12-31";
        const vb = b.validade || "9999-12-31";
        if (va !== vb) return va.localeCompare(vb);
        const fa = a.fabricacao || "9999-12-31";
        const fb = b.fabricacao || "9999-12-31";
        if (fa !== fb) return fa.localeCompare(fb);
        return a.lote.localeCompare(b.lote);
      });

      setLotes(lista);
      if (lista.length > 0) setSelectedIdx(0); // PVPS pré-selecionado
    } catch (err: any) {
      toast.error(err.message || "Erro ao carregar lotes.");
      setLotes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmar = () => {
    if (selectedIdx === null) {
      toast.error("Selecione um lote para continuar.");
      return;
    }
    const sel = lotes[selectedIdx];
    sessionStorage.setItem("coletor_separacao_lote_selecionado", JSON.stringify(sel));
    toast.success("Lote selecionado.");
    onNavigate("/coletor/separacao/produto");
  };

  if (!tarefa) {
    return (
      <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/endereco">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa ativa.</p>
          <ActionButton onClick={() => onNavigate("/coletor/separacao/iniciar")}>Voltar</ActionButton>
        </div>
      </ColetorLayout>
    );
  }

  return (
    <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/endereco">
      <div className="flex flex-col gap-3 flex-1 pb-24">
        {/* Produto info */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <Layers size={18} className="text-[hsl(217,91%,60%)]" />
            <span className="text-sm font-bold text-white">Selecionar Lote</span>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">SKU: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.sku || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Produto: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.produto || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Endereço: <span className="font-bold text-[hsl(213,31%,91%)] font-mono">{tarefa.endereco_alternativo_desc || tarefa.endereco || "—"}</span></div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={28} className="animate-spin text-[hsl(217,91%,60%)]" />
          </div>
        )}

        {/* Lista vazia */}
        {!loading && lotes.length === 0 && (
          <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-6 text-center">
            <p className="text-sm text-[hsl(213,31%,55%)]">Sem saldo neste endereço.</p>
          </div>
        )}

        {/* Lista de lotes */}
        {!loading && lotes.length > 0 && (
          <div className="flex flex-col gap-2">
            {lotes.map((l, idx) => {
              const isSelected = selectedIdx === idx;
              const isPvps = idx === 0;
              return (
                <button
                  key={`${l.lote}-${l.validade}-${l.fabricacao}-${l.hu_id}-${idx}`}
                  onClick={() => setSelectedIdx(idx)}
                  className={`flex flex-col gap-1 p-3 rounded-xl border transition-all text-left ${
                    isSelected
                      ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                      : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white font-mono">Lote: {l.lote || "—"}</span>
                    <div className="flex items-center gap-2">
                      {isPvps && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[hsl(142,71%,45%)]/15 text-[hsl(142,71%,55%)] border border-[hsl(142,71%,45%)]/30 font-bold">
                          PVPS
                        </span>
                      )}
                      {isSelected && <CheckCircle2 size={18} className="text-[hsl(217,91%,60%)]" />}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[hsl(213,31%,55%)]">
                    <span>Val: <span className="font-bold text-[hsl(213,31%,91%)]">{fmtDate(l.validade)}</span></span>
                    <span>Fab: <span className="font-bold text-[hsl(213,31%,91%)]">{fmtDate(l.fabricacao)}</span></span>
                    <span>Saldo: <span className="font-bold text-[hsl(142,71%,45%)]">{l.saldo_disponivel}</span></span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Botão Confirmar */}
      <div className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto">
        <ActionButton onClick={handleConfirmar} disabled={selectedIdx === null || lotes.length === 0} variant="success">
          Confirmar Lote
        </ActionButton>
      </div>
    </ColetorLayout>
  );
}
