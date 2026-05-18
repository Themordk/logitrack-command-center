import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { toast } from "sonner";
import { MapPin, SkipForward, MoreVertical, MapPinned, Loader2, XCircle } from "lucide-react";

interface Props { onNavigate: (path: string) => void; }

interface Tarefa {
  tarefa_id: string;
  produto_id?: string;
  sku?: string;
  produto?: string;
  referencia?: string;
  endereco?: string;
  endereco_id?: string;
  setor?: string;
  armazem?: string;
  quantidade_requerida: number;
  ordem_tarefa: number;
  separado?: number;
  status?: string;
  fator_caixa?: number;
  lote?: string;
  validade?: string;
  fabricacao?: string;
  tipo_controle?: string;
  [key: string]: any;
}

interface EnderecoAlternativo {
  endereco_id: string;
  endereco_descricao: string;
  quantidade_disponivel: number;
  lote: string;
  setor?: string;
}

export function SeparacaoEnderecoPage({ onNavigate }: Props) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [lastScanned, setLastScanned] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const [showOutrosEnderecos, setShowOutrosEnderecos] = useState(false);
  const [outrosEnderecos, setOutrosEnderecos] = useState<EnderecoAlternativo[]>([]);
  const [loadingEnderecos, setLoadingEnderecos] = useState(false);
  const [selectedEnderecoAlt, setSelectedEnderecoAlt] = useState<string | null>(null);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);
  const numeroOnda = sessionStorage.getItem("coletor_separacao_numero_onda") || "";

  useEffect(() => {
    const raw = sessionStorage.getItem("coletor_separacao_tarefas");
    const idx = Number(sessionStorage.getItem("coletor_separacao_tarefa_idx") || "0");
    if (raw) {
      const parsed = JSON.parse(raw) as Tarefa[];
      parsed.sort((a, b) => (a.ordem_tarefa || 0) - (b.ordem_tarefa || 0));

      // Enrich tarefas with produto_id if missing (lookup by sku)
      enrichTarefas(parsed).then((enriched) => {
        setTarefas(enriched);
        setCurrentIdx(idx);
      });
    }
  }, []);

  const enrichTarefas = async (tarefas: Tarefa[]): Promise<Tarefa[]> => {
    // Collect SKUs missing produto_id OR tipo_controle
    const skusToLookup = tarefas
      .filter((t) => (!t.produto_id || !t.tipo_controle) && t.sku)
      .map((t) => t.sku!);

    if (skusToLookup.length === 0) return tarefas;

    try {
      const uniqueSkus = [...new Set(skusToLookup)];
      const { data } = await (supabase as any)
        .from("produto")
        .select("id, sku, referencia, tipo_controle")
        .in("sku", uniqueSkus);

      if (data && data.length > 0) {
        const skuMap: Record<string, { id: string; referencia: string; tipo_controle: string }> = {};
        data.forEach((p: any) => { skuMap[p.sku] = { id: p.id, referencia: p.referencia, tipo_controle: p.tipo_controle }; });

        return tarefas.map((t) => {
          if (t.sku && skuMap[t.sku]) {
            return {
              ...t,
              produto_id: t.produto_id || skuMap[t.sku].id,
              referencia: t.referencia || skuMap[t.sku].referencia,
              tipo_controle: t.tipo_controle || skuMap[t.sku].tipo_controle,
            };
          }
          return t;
        });
      }
    } catch {
      // Non-blocking
    }
    return tarefas;
  };

  const requerLote = (tc?: string) => !!tc && ["LOTE", "VALIDADE", "LOTE_SERIE"].includes(tc);

  const tarefa = tarefas[currentIdx];

  const handleScan = async (code: string) => {
    if (!tarefa) return;
    setLastScanned(code);

    try {
      const { data, error } = await supabase.rpc("separacao_confirmar_endereco" as any, {
        p_tarefa_id: tarefa.tarefa_id,
        p_endereco_lido: code,
      });
      if (error) throw error;

      let result: any;
      if (typeof data === "string") {
        try { result = JSON.parse(data); } catch { result = data; }
      } else {
        result = data;
      }

      // Handle object result with sucesso field
      if (result && typeof result === "object" && result.sucesso === false) {
        setErrorDialog(result.mensagem || "Endereço incorreto! Escaneie o endereço informado.");
        return;
      }

      // Handle string error result
      if (typeof result === "string" && result.toLowerCase().includes("erro")) {
        setErrorDialog(result);
        return;
      }

      // Update tarefas in session with enriched data
      sessionStorage.setItem("coletor_separacao_tarefas", JSON.stringify(tarefas));
      sessionStorage.setItem("coletor_separacao_tarefa_idx", String(currentIdx));
      sessionStorage.setItem("coletor_separacao_tarefa_atual", JSON.stringify(tarefa));
      // Clear any stale lote selection from previous task
      sessionStorage.removeItem("coletor_separacao_lote_selecionado");
      toast.success("Endereço confirmado!");
      onNavigate(requerLote(tarefa.tipo_controle) ? "/coletor/separacao/lote" : "/coletor/separacao/produto");
    } catch (err: any) {
      setErrorDialog(err.message || "Erro ao confirmar endereço.");
    }
  };

  const handlePular = () => {
    if (!tarefas.length) return;
    const nextIdx = currentIdx + 1;
    if (nextIdx >= tarefas.length) {
      toast.info("Todos os endereços foram percorridos.");
      return;
    }
    setCurrentIdx(nextIdx);
    sessionStorage.setItem("coletor_separacao_tarefa_idx", String(nextIdx));
    setLastScanned("");
  };

  const loadOutrosEnderecos = async () => {
    if (!tarefa) return;
    
    let produtoId = tarefa.produto_id;
    
    // If produto_id is missing, look it up by sku
    if (!produtoId && tarefa.sku) {
      try {
        const { data } = await (supabase as any)
          .from("produto")
          .select("id")
          .eq("sku", tarefa.sku)
          .limit(1);
        if (data && data.length > 0) {
          produtoId = data[0].id;
          // Update tarefa with produto_id
          const updated = { ...tarefa, produto_id: produtoId };
          const newTarefas = [...tarefas];
          newTarefas[currentIdx] = updated;
          setTarefas(newTarefas);
        }
      } catch {
        toast.error("Erro ao buscar produto.");
        return;
      }
    }

    if (!produtoId) {
      toast.error("Produto não identificado.");
      return;
    }

    setLoadingEnderecos(true);
    setShowOutrosEnderecos(true);
    setShowOptions(false);
    try {
      const { data, error } = await (supabase as any)
        .from("estoque_geral")
        .select("id, endereco_id, quantidade_disponivel, lote")
        .eq("produto_id", produtoId)
        .gt("quantidade_disponivel", 0)
        .limit(50);
      if (error) throw error;

      if (!data || data.length === 0) {
        setOutrosEnderecos([]);
        setLoadingEnderecos(false);
        return;
      }

      // Get endereco descriptions
      const endIds = [...new Set(data.map((d: any) => d.endereco_id).filter(Boolean))];
      const { data: endData } = await (supabase as any)
        .from("endereco")
        .select("id, descricao, setor_id")
        .in("id", endIds);

      const endMap: Record<string, any> = {};
      (endData || []).forEach((e: any) => { endMap[e.id] = e; });

      const lista: EnderecoAlternativo[] = data
        .filter((d: any) => d.endereco_id)
        .map((d: any) => ({
          endereco_id: d.endereco_id,
          endereco_descricao: endMap[d.endereco_id]?.descricao || d.endereco_id,
          quantidade_disponivel: d.quantidade_disponivel,
          lote: d.lote || "—",
        }));

      setOutrosEnderecos(lista);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoadingEnderecos(false);
    }
  };

  const handleConfirmarEnderecoAlt = () => {
    if (!selectedEnderecoAlt || !tarefa) return;
    const endAlt = outrosEnderecos.find((e) => e.endereco_id === selectedEnderecoAlt);
    if (!endAlt) return;

    const updatedTarefa = {
      ...tarefa,
      endereco_alternativo_id: selectedEnderecoAlt,
      endereco_alternativo_desc: endAlt.endereco_descricao,
    };
    sessionStorage.setItem("coletor_separacao_tarefa_idx", String(currentIdx));
    sessionStorage.setItem("coletor_separacao_tarefa_atual", JSON.stringify(updatedTarefa));
    sessionStorage.removeItem("coletor_separacao_lote_selecionado");
    toast.success(`Endereço alternativo selecionado: ${endAlt.endereco_descricao}`);
    setShowOutrosEnderecos(false);
    onNavigate(requerLote(tarefa.tipo_controle) ? "/coletor/separacao/lote" : "/coletor/separacao/produto");
  };

  if (!tarefa) {
    return (
      <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/iniciar">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhuma tarefa pendente.</p>
          <ActionButton onClick={() => onNavigate("/coletor/separacao/iniciar")}>Voltar</ActionButton>
        </div>
      </ColetorLayout>
    );
  }

  const progress = `${currentIdx + 1}/${tarefas.length}`;

  return (
    <ColetorLayout title={`Separação #${numeroOnda}`} onNavigate={onNavigate} showBack backPath="/coletor/separacao/iniciar">
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
        {/* Progress */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-[hsl(213,31%,55%)]">Endereço {progress}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            Ordem: {tarefa.ordem_tarefa}
          </span>
        </div>

        {/* Address info */}
        <div className="bg-[hsl(222,40%,12%)] rounded-2xl border border-[hsl(222,35%,22%)] p-4 space-y-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-[hsl(217,91%,60%)]" />
              <span className="text-sm font-bold text-white">Endereço para Coleta</span>
            </div>
            {/* Options button */}
            <div className="relative">
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="p-2 rounded-lg hover:bg-[hsl(222,35%,20%)] transition-colors"
              >
                <MoreVertical size={18} className="text-[hsl(213,31%,55%)]" />
              </button>
              {showOptions && (
                <div className="absolute right-0 top-full mt-1 bg-[hsl(222,40%,14%)] border border-[hsl(222,35%,22%)] rounded-xl shadow-lg z-10 min-w-[200px]">
                  <button
                    onClick={loadOutrosEnderecos}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-white hover:bg-[hsl(222,35%,20%)] rounded-xl transition-colors"
                  >
                    <MapPinned size={16} className="text-[hsl(217,91%,60%)]" />
                    Outros Endereços do Produto
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Armazém: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.armazem || "—"}</span></div>
          <div className="text-xs text-[hsl(213,31%,55%)]">Setor: <span className="font-bold text-[hsl(213,31%,91%)]">{tarefa.setor || "—"}</span></div>
          {/* Highlighted address */}
          <div className="mt-2 py-3 px-4 bg-[hsl(217,91%,50%)]/10 rounded-xl border border-[hsl(217,91%,50%)]/30 text-center">
            <p className="text-2xl font-black text-white tracking-wide font-mono">{tarefa.endereco || "—"}</p>
          </div>
        </div>

        {/* Scan field */}
        <ScanField
          label="Confirmar Endereço"
          lastScanned={lastScanned}
          onScan={handleScan}
          placeholder="Escaneie o endereço para confirmar"
        />
      </div>

      {/* Floating skip button */}
      <div className="fixed bottom-6 left-4 right-4 z-50 max-w-lg mx-auto">
        <ActionButton onClick={handlePular} variant="secondary">
          <SkipForward size={18} /> Pular Endereço
        </ActionButton>
      </div>

      {/* Error Dialog */}
      {errorDialog && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[hsl(222,40%,10%)] border border-[hsl(222,35%,22%)] rounded-2xl p-6 space-y-4">
            <div className="flex flex-col items-center gap-3">
              <XCircle size={48} className="text-[#E02424]" />
              <h3 className="text-base font-bold text-white text-center">Endereço Incorreto</h3>
              <p className="text-sm text-[hsl(213,31%,75%)] text-center">{errorDialog}</p>
            </div>
            <ActionButton onClick={() => { setErrorDialog(null); setLastScanned(""); }} variant="primary">
              Fechar
            </ActionButton>
          </div>
        </div>
      )}

      {/* Outros Endereços Modal */}
      {showOutrosEnderecos && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center">
          <div className="w-full max-w-md bg-[hsl(222,40%,10%)] border-t border-[hsl(222,35%,22%)] rounded-t-3xl p-6 space-y-4 animate-slide-up max-h-[80vh] flex flex-col">
            <h3 className="text-base font-bold text-white">Outros Endereços do Produto</h3>
            <p className="text-xs text-[hsl(213,31%,55%)]">{tarefa.sku} - {tarefa.produto}</p>

            {loadingEnderecos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-[hsl(217,91%,60%)]" />
              </div>
            ) : outrosEnderecos.length === 0 ? (
              <p className="text-sm text-[hsl(213,31%,45%)] text-center py-4">Nenhum endereço com saldo encontrado.</p>
            ) : (
              <div className="flex flex-col gap-2 overflow-auto flex-1">
                {outrosEnderecos.map((end) => (
                  <button
                    key={`${end.endereco_id}-${end.lote}`}
                    onClick={() => setSelectedEnderecoAlt(end.endereco_id === selectedEnderecoAlt ? null : end.endereco_id)}
                    className={`flex flex-col gap-1 p-3 rounded-xl border transition-all text-left ${
                      selectedEnderecoAlt === end.endereco_id
                        ? "bg-[hsl(217,91%,50%)]/10 border-[hsl(217,91%,50%)]"
                        : "bg-[hsl(222,40%,12%)] border-[hsl(222,35%,22%)]"
                    }`}
                  >
                    <span className="text-sm font-bold text-white font-mono">{end.endereco_descricao}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[hsl(213,31%,55%)]">Saldo: <span className="font-bold text-[hsl(142,71%,45%)]">{end.quantidade_disponivel}</span></span>
                      <span className="text-xs text-[hsl(213,31%,55%)]">Lote: <span className="font-bold text-[hsl(213,31%,91%)]">{end.lote}</span></span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <ActionButton onClick={() => { setShowOutrosEnderecos(false); setSelectedEnderecoAlt(null); }} variant="secondary">
                Cancelar
              </ActionButton>
              <ActionButton onClick={handleConfirmarEnderecoAlt} disabled={!selectedEnderecoAlt}>
                Confirmar
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}
