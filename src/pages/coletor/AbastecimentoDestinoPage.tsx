import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay } from "@/components/coletor/StatusOverlay";
import { Loader2, PackageCheck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface Props { onNavigate: (path: string) => void; }

interface TarefaInfo {
  id: string;
  produto_id: string;
  produto_sku: string;
  produto_desc: string;
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
}

export function AbastecimentoDestinoPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const usuarioId = localStorage.getItem("core_usuario_id") || "";

  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<TarefaInfo[]>([]);
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [overlayType, setOverlayType] = useState<"success" | "error" | null>(null);
  const [overlayMsg, setOverlayMsg] = useState("");

  const [enderecoScanned, setEnderecoScanned] = useState<string | null>(null);
  const [produtoScanned, setProdutoScanned] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [processing, setProcessing] = useState(false);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    const rawTarefas = sessionStorage.getItem("abast_tarefas");
    const rawColetas = sessionStorage.getItem("abast_coletas");
    if (!rawTarefas || !rawColetas) { onNavigate("/coletor/movimentos/abastecimento"); return; }
    try {
      setTarefas(JSON.parse(rawTarefas));
      setColetas(JSON.parse(rawColetas));
    } catch { onNavigate("/coletor/movimentos/abastecimento"); }
    setLoading(false);
  }, []);

  const coletasByProduto = coletas.reduce((acc, c) => {
    if (!acc[c.produto_id]) acc[c.produto_id] = { total: 0, items: [] };
    acc[c.produto_id].total += c.quantidade;
    acc[c.produto_id].items.push(c);
    return acc;
  }, {} as Record<string, { total: number; items: Coleta[] }>);

  const pendingDestinos = tarefas
    .filter(t => {
      const coletaTotal = coletasByProduto[t.produto_id]?.total || 0;
      return coletaTotal > 0 && (t.quantidade_requerida - t.quantidade_executada) > 0;
    })
    .sort((a, b) => (a.endereco_destino_rua || 0) - (b.endereco_destino_rua || 0));

  const currentDestino = pendingDestinos[0] || null;

  const handleScanEndereco = async (code: string) => {
    if (!currentDestino) return;
    const { data } = await (supabase as any)
      .from("endereco")
      .select("id, descricao, codigo_endereco")
      .eq("tenant_id", tenantId)
      .eq("codigo_endereco", code)
      .limit(1)
      .maybeSingle();

    if (!data) { toast.error("Endereço não encontrado"); return; }
    if (data.id !== currentDestino.endereco_destino_id) {
      toast.error("Endereço não corresponde ao destino esperado"); return;
    }

    setEnderecoScanned(data.descricao);
    setProdutoScanned(null);
    setQuantidade("");
  };

  const handleScanProduto = async (code: string) => {
    if (!currentDestino) return;

    const { data: emb } = await (supabase as any)
      .from("produto_embalagem")
      .select("produto_id")
      .eq("tenant_id", tenantId)
      .eq("ean", code)
      .limit(1)
      .maybeSingle();

    let prodId = emb?.produto_id;
    if (!prodId) {
      const { data: prod } = await (supabase as any)
        .from("produto")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("sku", code)
        .limit(1)
        .maybeSingle();
      prodId = prod?.id;
    }

    if (!prodId) { toast.error("Produto não encontrado"); return; }
    if (prodId !== currentDestino.produto_id) { toast.error("Produto não esperado neste destino"); return; }

    setProdutoScanned(currentDestino.produto_sku);
    const remaining = currentDestino.quantidade_requerida - currentDestino.quantidade_executada;
    const available = coletasByProduto[prodId]?.total || 0;
    setQuantidade(String(Math.min(remaining, available)));
  };

  const handleConfirmarAbastecimento = async () => {
    if (!currentDestino || !enderecoScanned || !produtoScanned || !quantidade) return;
    const qty = Number(quantidade);
    if (qty <= 0) { toast.error("Quantidade inválida"); return; }

    setProcessing(true);
    try {
      // 1. Create tarefa_execucao
      const { error: execError } = await (supabase as any)
        .from("tarefa_execucao")
        .insert({
          tenant_id: tenantId,
          tarefa_id: currentDestino.id,
          usuario_id: usuarioId,
          status: "CONCLUIDA",
          iniciado_em: new Date().toISOString(),
          concluido_em: new Date().toISOString(),
          quantidade_executada: qty,
          endereco_origem_id: currentDestino.endereco_origem_id,
          endereco_destino_id: currentDestino.endereco_destino_id,
        });
      if (execError) throw execError;

      // 2. Update local coleta tracking (stock operations handled by DB trigger)
      const coletaItems = coletasByProduto[currentDestino.produto_id]?.items || [];
      let remaining = qty;
      const updatedColetas = [...coletas];

      for (const coleta of coletaItems) {
        if (remaining <= 0) break;
        const debit = Math.min(remaining, coleta.quantidade);
        const idx = updatedColetas.findIndex(c => c.estoque_id === coleta.estoque_id && c.produto_id === coleta.produto_id);
        if (idx >= 0) {
          updatedColetas[idx] = { ...updatedColetas[idx], quantidade: updatedColetas[idx].quantidade - debit };
        }
        remaining -= debit;
      }

      const cleanedColetas = updatedColetas.filter(c => c.quantidade > 0);
      setColetas(cleanedColetas);
      sessionStorage.setItem("abast_coletas", JSON.stringify(cleanedColetas));

      // 3. Update tarefa
      const newExecutada = currentDestino.quantidade_executada + qty;
      const updateData: any = { quantidade_executada: newExecutada };
      if (newExecutada >= currentDestino.quantidade_requerida) {
        updateData.status = "CONCLUIDA";
        updateData.concluido_em = new Date().toISOString();
      }
      await (supabase as any)
        .from("tarefa")
        .update(updateData)
        .eq("id", currentDestino.id);

      // Update local state
      const newTarefas = tarefas.map(t =>
        t.id === currentDestino.id ? { ...t, quantidade_executada: newExecutada } : t
      );
      setTarefas(newTarefas);
      sessionStorage.setItem("abast_tarefas", JSON.stringify(newTarefas));

      // Check completion
      const remainingColetasQty = cleanedColetas.reduce((s, c) => s + c.quantidade, 0);
      const remainingTarefas = newTarefas.filter(t => (t.quantidade_requerida - t.quantidade_executada) > 0);

      if (remainingTarefas.length === 0 || remainingColetasQty === 0) {
        if (remainingTarefas.length > 0 && remainingColetasQty === 0) {
          toast.info("Coletas esgotadas. Retornando para coleta.");
          setTimeout(() => onNavigate("/coletor/movimentos/abastecimento/coleta"), 1500);
          return;
        }
        setAllDone(true);
        setOverlayType("success");
        setOverlayMsg("Abastecimento concluído!");
        sessionStorage.removeItem("abast_tarefas");
        sessionStorage.removeItem("abast_coletas");
        setTimeout(() => onNavigate("/coletor/movimentos/abastecimento"), 3000);
        return;
      }

      setOverlayType("success");
      setOverlayMsg("Abastecimento registrado!");
      setTimeout(() => {
        setOverlayType(null);
        setEnderecoScanned(null);
        setProdutoScanned(null);
        setQuantidade("");
      }, 1200);

    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <ColetorLayout title="Destino" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento/coleta">
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[hsl(217,91%,60%)]" size={32} /></div>
      </ColetorLayout>
    );
  }

  if (allDone) {
    return (
      <ColetorLayout title="Abastecimento" onNavigate={onNavigate}>
        <StatusOverlay type="success" message="Abastecimento concluído com sucesso!" />
      </ColetorLayout>
    );
  }

  return (
    <ColetorLayout title="Destino Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento/coleta">
      <StatusOverlay type={overlayType} message={overlayMsg} />

      {currentDestino && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-xs text-[hsl(213,31%,55%)]">Destino</p>
            <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{currentDestino.endereco_destino_desc}</p>
          </div>
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-xs text-[hsl(213,31%,55%)]">Produto</p>
            <p className="font-bold text-[hsl(213,31%,91%)]">{currentDestino.produto_sku} - {currentDestino.produto_desc}</p>
          </div>
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
              <p className="text-xs text-[hsl(213,31%,55%)]">Requerida</p>
              <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{currentDestino.quantidade_requerida}</p>
            </div>
            <div className="flex-1 rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
              <p className="text-xs text-[hsl(213,31%,55%)]">Executada</p>
              <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{currentDestino.quantidade_executada}</p>
            </div>
          </div>
          <p className="text-xs text-[hsl(213,31%,55%)]">{pendingDestinos.length} destino(s) pendente(s)</p>
        </div>
      )}

      {currentDestino && !enderecoScanned && (
        <div className="mt-3">
          <ScanField label="Escanear Endereço Destino" onScan={handleScanEndereco} />
        </div>
      )}

      {enderecoScanned && !produtoScanned && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[hsl(213,31%,55%)]">
            <CheckCircle2 size={14} className="text-[#22C55E]" />
            <span>Endereço: <span className="font-bold text-[hsl(213,31%,91%)]">{enderecoScanned}</span></span>
          </div>
          <ScanField label="Escanear Produto" onScan={handleScanProduto} />
        </div>
      )}

      {enderecoScanned && produtoScanned && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-[hsl(213,31%,55%)]">
            <CheckCircle2 size={14} className="text-[#22C55E]" />
            <span>Endereço: <span className="font-bold text-[hsl(213,31%,91%)]">{enderecoScanned}</span></span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[hsl(213,31%,55%)]">
            <CheckCircle2 size={14} className="text-[#22C55E]" />
            <span>Produto: <span className="font-bold text-[hsl(213,31%,91%)]">{produtoScanned}</span></span>
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
            onClick={handleConfirmarAbastecimento}
            disabled={processing || !quantidade || Number(quantidade) <= 0}
            loading={processing}
          >
            <PackageCheck size={20} /> Confirmar Abastecimento
          </ActionButton>
        </div>
      )}

      {!currentDestino && coletas.length > 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-[hsl(213,31%,55%)]">Nenhum destino pendente com coletas disponíveis.</p>
          <div className="mt-4">
            <ActionButton onClick={() => onNavigate("/coletor/movimentos/abastecimento/coleta")} variant="secondary">
              Voltar para Coleta
            </ActionButton>
          </div>
        </div>
      )}
    </ColetorLayout>
  );
}
