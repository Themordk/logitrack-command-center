import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay } from "@/components/coletor/StatusOverlay";
import { Loader2, PackageCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { nowBrasilia } from "@/lib/dateUtils";

interface Props { onNavigate: (path: string) => void; }

interface TarefaInfo {
  id: string;
  produto_id: string;
  produto_sku: string;
  produto_desc: string;
  produto_referencia?: string;
  endereco_origem_id: string;
  endereco_origem_desc: string;
  endereco_destino_id: string;
  endereco_destino_desc: string;
  endereco_destino_rua: number;
  quantidade_requerida: number;
  quantidade_executada: number;
}

interface Coleta {
  endereco_origem_id: string;
  endereco_origem_desc: string;
  produto_id: string;
  produto_sku: string;
  quantidade: number;
  estoque_id: string;
  tarefa_id: string;
  tarefa_execucao_id?: string;
  fator?: number;
}

export function AbastecimentoColetaPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id") || "";
  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<TarefaInfo[]>([]);
  const [overlayType, setOverlayType] = useState<"success" | "error" | null>(null);

  // Scan state
  const [enderecoScanned, setEnderecoScanned] = useState<string | null>(null);
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [produtoScanned, setProdutoScanned] = useState<string | null>(null);
  const [produtoReferencia, setProdutoReferencia] = useState<string | null>(null);
  const [produtoDescricao, setProdutoDescricao] = useState<string | null>(null);
  const [produtoFator, setProdutoFator] = useState<number>(1);
  const [quantidade, setQuantidade] = useState("");
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [processing, setProcessing] = useState(false);

  // Load tarefas and enrich with referencia
  useEffect(() => {
    const loadTarefas = async () => {
      const raw = sessionStorage.getItem("abast_tarefas");
      if (!raw) { onNavigate("/coletor/movimentos/abastecimento"); return; }
      try {
        const parsed = JSON.parse(raw) as TarefaInfo[];

        // Enrich with referencia
        const produtoIds = [...new Set(parsed.map(t => t.produto_id))];
        const { data: produtos } = await (supabase as any)
          .from("produto")
          .select("id, referencia")
          .in("id", produtoIds);

        const refMap: Record<string, string> = {};
        (produtos || []).forEach((p: any) => { refMap[p.id] = p.referencia || ""; });

        const enriched = parsed.map(t => ({
          ...t,
          produto_referencia: refMap[t.produto_id] || "",
        }));
        setTarefas(enriched);

        // Load existing coletas from sessionStorage
        const existingColetas = sessionStorage.getItem("abast_coletas");
        if (existingColetas) {
          setColetas(JSON.parse(existingColetas));
        } else {
          // Check for pending tarefa_execucao in DB for these tarefas
          await loadPendingColetas(enriched);
        }
      } catch { onNavigate("/coletor/movimentos/abastecimento"); }
      setLoading(false);
    };
    loadTarefas();
  }, []);

  const loadPendingColetas = async (tarefaList: TarefaInfo[]) => {
    try {
      const tarefaIds = tarefaList.map(t => t.id);
      const { data } = await (supabase as any)
        .from("tarefa_execucao")
        .select("id, tarefa_id, quantidade_executada, endereco_origem_id")
        .in("tarefa_id", tarefaIds)
        .eq("usuario_id", usuarioId)
        .eq("status", "COLETA_PENDENTE");

      if (data && data.length > 0) {
        const restoredColetas: Coleta[] = data.map((exec: any) => {
          const tarefa = tarefaList.find(t => t.id === exec.tarefa_id);
          return {
            endereco_origem_id: exec.endereco_origem_id || "",
            endereco_origem_desc: tarefa?.endereco_origem_desc || "",
            produto_id: tarefa?.produto_id || "",
            produto_sku: tarefa?.produto_sku || "",
            quantidade: Number(exec.quantidade_executada),
            estoque_id: "",
            tarefa_id: exec.tarefa_id,
            tarefa_execucao_id: exec.id,
          };
        });
        setColetas(restoredColetas);
        sessionStorage.setItem("abast_coletas", JSON.stringify(restoredColetas));
        toast.info(`${restoredColetas.length} coleta(s) pendente(s) restaurada(s)`);
      }
    } catch (err) {
      console.error("Erro ao restaurar coletas:", err);
    }
  };

  const getRemainingQty = useCallback((t: TarefaInfo) => {
    const coletado = coletas
      .filter(c => c.produto_id === t.produto_id && (c.tarefa_id === t.id || c.endereco_origem_id === t.endereco_origem_id))
      .reduce((s, c) => s + c.quantidade, 0);
    return t.quantidade_requerida - t.quantidade_executada - coletado;
  }, [coletas]);

  const pendingTarefas = tarefas.filter(t => getRemainingQty(t) > 0);
  const currentTarefa = pendingTarefas[0] || null;

  const handleScanEndereco = async (code: string) => {
    const { data } = await (supabase as any)
      .from("endereco")
      .select("id, descricao, codigo_endereco, situacao")
      .eq("tenant_id", tenantId)
      .eq("codigo_endereco", code)
      .limit(1)
      .maybeSingle();

    if (!data) { toast.error("Endereço não encontrado"); return; }

    if (!["LIVRE", "OCUPADO"].includes(data.situacao)) {
      toast.error(`Endereço ${data.descricao} está ${data.situacao}. Movimentações não são permitidas. Procure a supervisão.`);
      return;
    }

    const matchesTarefa = pendingTarefas.some(t => t.endereco_origem_id === data.id);
    if (!matchesTarefa) { toast.error("Endereço não corresponde a nenhuma tarefa pendente"); return; }

    setEnderecoScanned(data.descricao);
    setEnderecoId(data.id);
    setProdutoScanned(null);
    setProdutoReferencia(null);
    setProdutoDescricao(null);
    setProdutoFator(1);
    setQuantidade("");
  };

  const handleScanProduto = async (code: string) => {
    if (!enderecoId) return;

    let prodId: string | null = null;
    let fator = 1;

    // Try EAN first
    const { data: emb } = await (supabase as any)
      .from("produto_embalagem")
      .select("produto_id, fator")
      .eq("tenant_id", tenantId)
      .eq("ean", code)
      .limit(1)
      .maybeSingle();

    if (emb) {
      prodId = emb.produto_id;
      fator = Number(emb.fator) || 1;
    } else {
      // Try SKU
      const { data: prod } = await (supabase as any)
        .from("produto")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("sku", code)
        .limit(1)
        .maybeSingle();
      prodId = prod?.id || null;
    }

    if (!prodId) { toast.error("Produto não encontrado"); return; }

    const tarefa = pendingTarefas.find(t => t.produto_id === prodId && t.endereco_origem_id === enderecoId);
    if (!tarefa) { toast.error("Produto não esperado neste endereço"); return; }

    setProdutoScanned(tarefa.produto_sku);
    setProdutoReferencia(tarefa.produto_referencia || "");
    setProdutoDescricao(tarefa.produto_desc);
    setProdutoFator(fator);
    const remaining = getRemainingQty(tarefa);
    setQuantidade(String(remaining));
  };

  const handleConfirmarColeta = async () => {
    if (!enderecoId || !produtoScanned || !quantidade) return;
    const qty = Number(quantidade);
    if (qty <= 0) { toast.error("Quantidade inválida"); return; }

    const tarefa = pendingTarefas.find(t => t.endereco_origem_id === enderecoId && t.produto_sku === produtoScanned);
    if (!tarefa) return;

    const remaining = getRemainingQty(tarefa);
    if (qty > remaining) { toast.error(`Quantidade máxima: ${remaining}`); return; }

    setProcessing(true);
    try {
      // Check for duplicate blocking - verify if there's already a pending coleta for this exact tarefa+endereco
      const existingColetaQty = coletas
        .filter(c => c.tarefa_id === tarefa.id && c.endereco_origem_id === enderecoId)
        .reduce((s, c) => s + c.quantidade, 0);

      if (existingColetaQty + qty > tarefa.quantidade_requerida - tarefa.quantidade_executada) {
        toast.error("Quantidade excede o requerido (coletas pendentes já existem)");
        setProcessing(false);
        return;
      }

      // Get stock and block
      const { data: estoque } = await (supabase as any)
        .from("estoque_geral")
        .select("id, quantidade_disponivel, quantidade_bloqueada")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("endereco_id", enderecoId)
        .eq("produto_id", tarefa.produto_id)
        .gt("quantidade_disponivel", 0)
        .limit(1)
        .maybeSingle();

      if (!estoque) { toast.error("Saldo insuficiente no endereço"); setProcessing(false); return; }
      if (Number(estoque.quantidade_disponivel) < qty) { toast.error(`Saldo disponível: ${estoque.quantidade_disponivel}`); setProcessing(false); return; }

      // Block stock
      const { error: errEstoque } = await (supabase as any)
        .from("estoque_geral")
        .update({
          quantidade_bloqueada: Number(estoque.quantidade_bloqueada) + qty,
          quantidade_disponivel: Number(estoque.quantidade_disponivel) - qty,
        })
        .eq("id", estoque.id);

      if (errEstoque) throw errEstoque;

      // Persist to tarefa_execucao
      let execId: string | undefined;
      try {
        const now = nowBrasilia();
        const { data: execData, error: errExec } = await (supabase as any)
          .from("tarefa_execucao")
          .insert({
            tenant_id: tenantId,
            tarefa_id: tarefa.id,
            usuario_id: usuarioId,
            status: "COLETA_PENDENTE",
            quantidade_executada: qty,
            endereco_origem_id: enderecoId,
            endereco_destino_id: tarefa.endereco_destino_id,
            iniciado_em: now,
          })
          .select("id")
          .single();
        if (!errExec && execData) execId = execData.id;
      } catch (e) {
        console.warn("Não foi possível persistir tarefa_execucao:", e);
      }

      const newColeta: Coleta = {
        endereco_origem_id: enderecoId,
        endereco_origem_desc: enderecoScanned || "",
        produto_id: tarefa.produto_id,
        produto_sku: tarefa.produto_sku,
        quantidade: qty,
        estoque_id: estoque.id,
        tarefa_id: tarefa.id,
        tarefa_execucao_id: execId,
        fator: produtoFator,
      };

      const updatedColetas = [...coletas, newColeta];
      setColetas(updatedColetas);
      sessionStorage.setItem("abast_coletas", JSON.stringify(updatedColetas));

      setOverlayType("success");
      setTimeout(() => {
        setOverlayType(null);
        setEnderecoScanned(null);
        setEnderecoId(null);
        setProdutoScanned(null);
        setProdutoReferencia(null);
        setProdutoDescricao(null);
        setProdutoFator(1);
        setQuantidade("");
      }, 1200);

      toast.success("Coleta confirmada");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAbastecer = () => {
    sessionStorage.setItem("abast_coletas", JSON.stringify(coletas));
    onNavigate("/coletor/movimentos/abastecimento/destino");
  };

  // Compute totals for current tarefa
  const getColetaStats = (tarefa: TarefaInfo | null) => {
    if (!tarefa) return { aAbastecer: 0, coletada: 0, abastecida: 0 };
    const coletada = coletas
      .filter(c => c.tarefa_id === tarefa.id)
      .reduce((s, c) => s + c.quantidade, 0);
    return {
      aAbastecer: tarefa.quantidade_requerida - tarefa.quantidade_executada,
      coletada,
      abastecida: tarefa.quantidade_executada,
    };
  };

  if (loading) {
    return (
      <ColetorLayout title="Coleta" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento">
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>
      </ColetorLayout>
    );
  }

  const stats = getColetaStats(currentTarefa);

  return (
    <ColetorLayout title="Coleta Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento">
      <StatusOverlay type={overlayType} message="Coleta registrada!" />

      {/* Current task info */}
      {currentTarefa && !enderecoScanned && (
        <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 mb-3 space-y-2">
          <p className="text-xs text-[hsl(213,31%,55%)]">Próximo Endereço</p>
          <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{currentTarefa.endereco_origem_desc}</p>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[hsl(222,35%,22%)]">
            <div><span className="text-[10px] text-[hsl(213,31%,55%)]">SKU</span><p className="text-xs font-mono text-[hsl(213,31%,91%)]">{currentTarefa.produto_sku}</p></div>
            <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Referência</span><p className="text-xs text-[hsl(213,31%,91%)]">{currentTarefa.produto_referencia || "—"}</p></div>
            <div className="col-span-2"><span className="text-[10px] text-[hsl(213,31%,55%)]">Descrição</span><p className="text-xs text-[hsl(213,31%,91%)]">{currentTarefa.produto_desc}</p></div>
          </div>
        </div>
      )}

      {/* Step 1: Scan endereço */}
      {!enderecoScanned && (
        <ScanField label="Escanear Endereço Origem" onScan={handleScanEndereco} />
      )}

      {/* Step 2: Scan produto - show expected item info */}
      {enderecoScanned && !produtoScanned && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-xs text-[hsl(213,31%,55%)]">Endereço Origem</p>
            <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{enderecoScanned}</p>
          </div>
          {/* Show expected product info */}
          {currentTarefa && currentTarefa.endereco_origem_id === enderecoId && (
            <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(217,91%,50%)]/20 p-3">
              <p className="text-[10px] text-[hsl(217,91%,60%)] font-medium mb-1">ITEM ESPERADO</p>
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-[10px] text-[hsl(213,31%,55%)]">SKU</span><p className="text-xs font-mono font-bold text-[hsl(213,31%,91%)]">{currentTarefa.produto_sku}</p></div>
                <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Referência</span><p className="text-xs text-[hsl(213,31%,91%)]">{currentTarefa.produto_referencia || "—"}</p></div>
                <div className="col-span-2"><span className="text-[10px] text-[hsl(213,31%,55%)]">Descrição</span><p className="text-xs text-[hsl(213,31%,91%)]">{currentTarefa.produto_desc}</p></div>
              </div>
            </div>
          )}
          <ScanField label="Escanear Produto" onScan={handleScanProduto} />
        </div>
      )}

      {/* Step 3: Confirm qty - show product detail + quantities */}
      {enderecoScanned && produtoScanned && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-xs text-[hsl(213,31%,55%)]">Endereço Origem</p>
            <p className="font-bold text-[hsl(213,31%,91%)]">{enderecoScanned}</p>
          </div>

          {/* Product detail container */}
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-[10px] text-[hsl(217,91%,60%)] font-medium mb-1">PRODUTO CONFIRMADO</p>
            <div className="grid grid-cols-2 gap-2">
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">SKU</span><p className="text-xs font-mono font-bold text-[hsl(213,31%,91%)]">{produtoScanned}</p></div>
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Referência</span><p className="text-xs text-[hsl(213,31%,91%)]">{produtoReferencia || "—"}</p></div>
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Descrição</span><p className="text-xs text-[hsl(213,31%,91%)]">{produtoDescricao || "—"}</p></div>
              <div><span className="text-[10px] text-[hsl(213,31%,55%)]">Fator</span><p className="text-xs font-bold text-[hsl(217,91%,60%)]">{produtoFator}</p></div>
            </div>
          </div>

          {/* Quantities container */}
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-[10px] text-[hsl(217,91%,60%)] font-medium mb-2">QUANTIDADES</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-[hsl(213,31%,55%)]">A Abastecer</p>
                <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{stats.aAbastecer}</p>
              </div>
              <div>
                <p className="text-[10px] text-[hsl(213,31%,55%)]">Coletada</p>
                <p className="text-lg font-bold text-[hsl(217,91%,60%)]">{stats.coletada}</p>
              </div>
              <div>
                <p className="text-[10px] text-[hsl(213,31%,55%)]">Abastecida</p>
                <p className="text-lg font-bold text-green-400">{stats.abastecida}</p>
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[hsl(213,31%,55%)] mb-1 block">Quantidade</label>
            <input
              type="number"
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => setQuantidade(e.target.value)}
              className="w-full h-12 rounded-xl border-2 border-[hsl(217,91%,50%)]/40 bg-[hsl(222,40%,12%)] text-center text-lg font-bold text-[hsl(213,31%,91%)] focus:outline-none focus:border-[hsl(217,91%,50%)]"
            />
          </div>
          <ActionButton
            onClick={handleConfirmarColeta}
            disabled={processing || !quantidade || Number(quantidade) <= 0}
            loading={processing}
          >
            <PackageCheck size={20} /> Confirmar Coleta
          </ActionButton>
        </div>
      )}

      {/* Coletas list */}
      {coletas.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-[hsl(213,31%,55%)]">{coletas.length} coleta(s) realizada(s)</p>
          {coletas.map((c, i) => (
            <div key={i} className="bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] rounded-lg p-2 flex justify-between items-center text-xs">
              <div>
                <span className="font-mono text-[hsl(217,91%,60%)]">{c.produto_sku}</span>
                <span className="text-[hsl(213,31%,55%)] ml-2">{c.endereco_origem_desc}</span>
              </div>
              <span className="font-bold text-[hsl(213,31%,91%)]">{c.quantidade}</span>
            </div>
          ))}
        </div>
      )}

      {/* Abastecer button */}
      {coletas.length > 0 && (
        <div className="mt-4">
          <ActionButton onClick={handleAbastecer} variant="secondary">
            <Truck size={20} /> Abastecer
          </ActionButton>
        </div>
      )}
    </ColetorLayout>
  );
}
