import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Save, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ProdutoSearchInput, ProdutoSearchResult } from "@/components/produto/ProdutoSearchInput";


interface DocItem {
  produto_id: string;
  produto_nome?: string;
  quantidade: number;
  valor_unit: number;
  valor_total: number;
}




export function CadastroDocSaidaPage({ onBack }: { onBack?: () => void }) {
  const { tenantId, empresaId, empresaVersion } = useTenant();

  const [numeroPedido, setNumeroPedido] = useState("");
  const [dataEmissao, setDataEmissao] = useState(new Date().toISOString().slice(0, 10));
  const [parceiroId, setParceiroId] = useState("");
  const [tipoPedidoId, setTipoPedidoId] = useState("");
  const [rotaId, setRotaId] = useState("");
  const [vendedor, setVendedor] = useState("");
  const [transportador, setTransportador] = useState("");
  const [observacao, setObservacao] = useState("");

  const [parceiros, setParceiros] = useState<{ id: string; razaosocial: string }[]>([]);
  const [tiposSaida, setTiposSaida] = useState<{ id: string; descricao: string }[]>([]);
  const [rotas, setRotas] = useState<{ id: string; descricao: string }[]>([]);

  const [items, setItems] = useState<DocItem[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const emptyForm = (): DocItem => ({ produto_id: "", quantidade: 0, valor_unit: 0, valor_total: 0 });
  const [itemForm, setItemForm] = useState<DocItem>(emptyForm());
  const [itemProduto, setItemProduto] = useState<ProdutoSearchResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!tenantId || !empresaId) {
      setParceiros([]); setTiposSaida([]); setRotas([]);
      return;
    }
    // Reset seleções ao trocar empresa
    setParceiroId(""); setTipoPedidoId(""); setRotaId(""); setItems([]);
    Promise.all([
      (supabase as any).from("parceiro").select("id, razaosocial").eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("razaosocial"),
      (supabase as any).from("tipo_saida").select("id, descricao").eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao"),
      (supabase as any).from("rotas").select("id, descricao").eq("tenant_id", tenantId).eq("empresa_id", empresaId).eq("ativo", true).order("descricao"),
    ]).then(([pRes, tRes, rRes]) => {
      setParceiros(pRes.data || []);
      setTiposSaida(tRes.data || []);
      setRotas(rRes.data || []);
    });
  }, [tenantId, empresaId, empresaVersion]);

  const valorTotalPedido = items.reduce((s, i) => s + i.valor_total, 0);

  const resetItemForm = () => {
    setItemProduto(null);
    setItemForm(emptyForm());
  };

  const addItem = (keepOpen = false) => {
    if (!itemProduto || itemForm.quantidade <= 0) {
      toast.error("Selecione um produto e informe a quantidade.");
      return;
    }
    const unit = Number(itemProduto.preco_custo ?? 0);
    const total = unit * itemForm.quantidade;
    setItems((prev) => [
      ...prev,
      {
        produto_id: itemProduto.id,
        produto_nome: `${itemProduto.sku} - ${itemProduto.descricao}`,
        quantidade: itemForm.quantidade,
        valor_unit: unit,
        valor_total: total,
      },
    ]);
    resetItemForm();
    if (!keepOpen) setShowItemModal(false);
  };



  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!numeroPedido || !parceiroId || !tipoPedidoId) {
      toast.error("Preencha os campos obrigatórios: Nº Pedido, Parceiro e Tipo de Saída.");
      return;
    }
    if (items.length === 0) {
      toast.error("Adicione pelo menos um item.");
      return;
    }
    setSaving(true);
    try {
      const { data: doc, error: docErr } = await (supabase as any)
        .from("documento_saida")
        .insert({
          tenant_id: tenantId,
          empresa_id: empresaId,
          numero_pedido: Number(numeroPedido),
          data_emissao: dataEmissao,
          parceiro_id: parceiroId,
          tipo_pedido_id: tipoPedidoId,
          rota_id: rotaId || null,
          vendedor: vendedor || null,
          transportador: transportador || null,
          observacao: observacao || null,
          valor_pedido: valorTotalPedido,
          status: 0,
        })
        .select("id")
        .single();
      if (docErr) throw docErr;

      const docItems = items.map((item) => ({
        tenant_id: tenantId,
        documento_saida_id: doc.id,
        produto_id: item.produto_id,
        quantidade: item.quantidade,
        valor_unit: item.valor_unit,
        valor_total: item.valor_total,
      }));
      const { error: itemErr } = await (supabase as any).from("documento_saida_item").insert(docItems);
      if (itemErr) throw itemErr;

      toast.success("Documento de saída registrado com sucesso!");
      if (onBack) onBack();
      else {
        setNumeroPedido("");
        setParceiroId("");
        setTipoPedidoId("");
        setRotaId("");
        setVendedor("");
        setTransportador("");
        setObservacao("");
        setItems([]);
      }
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-lg hover:bg-secondary transition-colors">
              <ArrowLeft size={16} className="text-muted-foreground" />
            </button>
          )}
          <div>
            <h1 className="text-lg font-bold text-foreground">Novo Documento de Saída</h1>
            <p className="text-xs text-muted-foreground">Preencha o cabeçalho e adicione itens</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar Documento
        </button>
      </div>

      {/* Header form */}
      <div className="card-surface p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Dados do Documento</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Nº Pedido *</label>
            <input value={numeroPedido} onChange={(e) => setNumeroPedido(e.target.value)} className={inputClass} placeholder="000000" />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Data Emissão *</label>
            <input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Parceiro *</label>
            <select value={parceiroId} onChange={(e) => setParceiroId(e.target.value)} className={inputClass}>
              <option value="">Selecione...</option>
              {parceiros.map((p) => <option key={p.id} value={p.id}>{p.razaosocial}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Tipo de Saída *</label>
            <select value={tipoPedidoId} onChange={(e) => setTipoPedidoId(e.target.value)} className={inputClass}>
              <option value="">Selecione...</option>
              {tiposSaida.map((t) => <option key={t.id} value={t.id}>{t.descricao}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Rota</label>
            <select value={rotaId} onChange={(e) => setRotaId(e.target.value)} className={inputClass}>
              <option value="">Selecione...</option>
              {rotas.map((r) => <option key={r.id} value={r.id}>{r.descricao}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Vendedor</label>
            <input value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Transportador</label>
            <input value={transportador} onChange={(e) => setTransportador(e.target.value)} className={inputClass} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Observação</label>
            <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className={inputClass} />
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="card-surface overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">Itens do Documento</h2>
          <button
            onClick={() => { resetItemForm(); setShowItemModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={13} /> Adicionar Item
          </button>

        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">Nenhum item adicionado.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Produto</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Quantidade</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Valor Unit.</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Valor Total</th>
                <th className="px-4 py-2.5 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-border/50">
                  <td className="px-4 py-2.5 text-foreground">{item.produto_nome}</td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">{item.quantidade}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">{item.valor_unit.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">{item.valor_total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-destructive/10 transition-colors">
                      <Trash2 size={13} className="text-destructive" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-secondary/20">
                <td colSpan={3} className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Total Pedido</td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold text-foreground">{valorTotalPedido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Add Item Modal */}
      <Dialog open={showItemModal} onOpenChange={setShowItemModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar Item</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Produto *</label>
              <select value={itemForm.produto_id} onChange={(e) => setItemForm({ ...itemForm, produto_id: e.target.value })} className={inputClass}>
                <option value="">Selecione...</option>
                {produtos.map((p) => <option key={p.id} value={p.id}>{p.sku} - {p.descricao}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Quantidade *</label>
                <input type="number" value={itemForm.quantidade || ""} onChange={(e) => {
                  const qty = Number(e.target.value);
                  setItemForm({ ...itemForm, quantidade: qty, valor_total: qty * itemForm.valor_unit });
                }} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Valor Unit.</label>
                <input type="number" step="0.01" value={itemForm.valor_unit || ""} onChange={(e) => {
                  const val = Number(e.target.value);
                  setItemForm({ ...itemForm, valor_unit: val, valor_total: itemForm.quantidade * val });
                }} className={inputClass} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Valor Total</label>
                <input type="number" step="0.01" value={itemForm.valor_total || ""} onChange={(e) => setItemForm({ ...itemForm, valor_total: Number(e.target.value) })} className={inputClass} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowItemModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={addItem} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">Adicionar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
