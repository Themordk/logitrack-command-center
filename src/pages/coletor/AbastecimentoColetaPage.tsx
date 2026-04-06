import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ScanField } from "@/components/coletor/ScanField";
import { ActionButton } from "@/components/coletor/ActionButton";
import { StatusOverlay } from "@/components/coletor/StatusOverlay";
import { Loader2, PackageCheck, Truck } from "lucide-react";
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

export function AbastecimentoColetaPage({ onNavigate }: Props) {
  const tenantId = localStorage.getItem("core_tenant_id") || "";
  const empresaId = localStorage.getItem("core_empresa_id") || "";
  const [loading, setLoading] = useState(true);
  const [tarefas, setTarefas] = useState<TarefaInfo[]>([]);
  const [overlayType, setOverlayType] = useState<"success" | "error" | null>(null);

  // Scan state
  const [enderecoScanned, setEnderecoScanned] = useState<string | null>(null);
  const [enderecoId, setEnderecoId] = useState<string | null>(null);
  const [produtoScanned, setProdutoScanned] = useState<string | null>(null);
  const [quantidade, setQuantidade] = useState("");
  const [coletas, setColetas] = useState<Coleta[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("abast_tarefas");
    if (!raw) { onNavigate("/coletor/movimentos/abastecimento"); return; }
    try {
      const parsed = JSON.parse(raw) as TarefaInfo[];
      setTarefas(parsed);
      const existingColetas = sessionStorage.getItem("abast_coletas");
      if (existingColetas) setColetas(JSON.parse(existingColetas));
    } catch { onNavigate("/coletor/movimentos/abastecimento"); }
    setLoading(false);
  }, []);

  const getRemainingQty = (t: TarefaInfo) => {
    const coletado = coletas
      .filter(c => c.produto_id === t.produto_id && c.endereco_origem_id === t.endereco_origem_id)
      .reduce((s, c) => s + c.quantidade, 0);
    return t.quantidade_requerida - t.quantidade_executada - coletado;
  };

  const pendingTarefas = tarefas.filter(t => getRemainingQty(t) > 0);
  const currentTarefa = pendingTarefas[0] || null;

  const handleScanEndereco = async (code: string) => {
    const { data } = await (supabase as any)
      .from("endereco")
      .select("id, descricao")
      .eq("tenant_id", tenantId)
      .eq("descricao", code)
      .limit(1)
      .maybeSingle();

    if (!data) { toast.error("Endereço não encontrado"); return; }

    const matchesTarefa = pendingTarefas.some(t => t.endereco_origem_id === data.id);
    if (!matchesTarefa) { toast.error("Endereço não corresponde a nenhuma tarefa pendente"); return; }

    setEnderecoScanned(data.descricao);
    setEnderecoId(data.id);
    setProdutoScanned(null);
    setQuantidade("");
  };

  const handleScanProduto = async (code: string) => {
    if (!enderecoId) return;

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

    const tarefa = pendingTarefas.find(t => t.produto_id === prodId && t.endereco_origem_id === enderecoId);
    if (!tarefa) { toast.error("Produto não esperado neste endereço"); return; }

    setProdutoScanned(tarefa.produto_sku);
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

      const { error } = await (supabase as any)
        .from("estoque_geral")
        .update({
          quantidade_bloqueada: Number(estoque.quantidade_bloqueada) + qty,
          quantidade_disponivel: Number(estoque.quantidade_disponivel) - qty,
        })
        .eq("id", estoque.id);

      if (error) throw error;

      const newColeta: Coleta = {
        endereco_origem_id: enderecoId,
        endereco_origem_desc: enderecoScanned || "",
        produto_id: tarefa.produto_id,
        produto_sku: tarefa.produto_sku,
        quantidade: qty,
        estoque_id: estoque.id,
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

  if (loading) {
    return (
      <ColetorLayout title="Coleta" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento">
        <div className="flex justify-center py-12"><Loader2 className="animate-spin text-primary" size={32} /></div>
      </ColetorLayout>
    );
  }

  return (
    <ColetorLayout title="Coleta Abastecimento" onNavigate={onNavigate} showBack backPath="/coletor/movimentos/abastecimento">
      <StatusOverlay type={overlayType} message="Coleta registrada!" />

      {/* Current task info */}
      {currentTarefa && !enderecoScanned && (
        <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3 mb-3">
          <p className="text-xs text-[hsl(213,31%,55%)]">Próximo Endereço</p>
          <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{currentTarefa.endereco_origem_desc}</p>
        </div>
      )}

      {/* Step 1: Scan endereço */}
      {!enderecoScanned && (
        <ScanField label="Escanear Endereço Origem" onScan={handleScanEndereco} />
      )}

      {/* Step 2: Scan produto */}
      {enderecoScanned && !produtoScanned && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-xs text-[hsl(213,31%,55%)]">Endereço Origem</p>
            <p className="text-lg font-bold text-[hsl(213,31%,91%)]">{enderecoScanned}</p>
          </div>
          <ScanField label="Escanear Produto" onScan={handleScanProduto} />
        </div>
      )}

      {/* Step 3: Confirm qty */}
      {enderecoScanned && produtoScanned && (
        <div className="space-y-3">
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-xs text-[hsl(213,31%,55%)]">Endereço Origem</p>
            <p className="font-bold text-[hsl(213,31%,91%)]">{enderecoScanned}</p>
          </div>
          <div className="rounded-xl bg-[hsl(222,40%,12%)] border border-[hsl(222,35%,22%)] p-3">
            <p className="text-xs text-[hsl(213,31%,55%)]">Produto</p>
            <p className="font-bold text-[hsl(213,31%,91%)]">{produtoScanned}</p>
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
