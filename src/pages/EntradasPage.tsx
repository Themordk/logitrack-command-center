import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, FileText, ChevronLeft, ChevronRight, Truck, Plus, Eye } from "lucide-react";
import { CadastroDocEntradaPage } from "./CadastroDocEntradaPage";
import { DocEntradaDetalhePage } from "./DocEntradaDetalhePage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface DocEntry {
  id: string;
  numero_nota: string;
  data_emissao: string;
  parceiro_id: string;
  tipo_entrada_id: string;
  valor_total_nota: number;
  qtd_volume: number | null;
  parceiro_nome?: string;
  total_skus?: number;
  tipo_entrada_descricao?: string;
}

export function EntradasPage() {
  const { tenantId, empresaId, armazemId, usuarioId } = useTenant();
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;
  const [showCadastro, setShowCadastro] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [boxes, setBoxes] = useState<{ id: string; descricao: string }[]>([]);
  const [armazens, setArmazens] = useState<{ id: string; descricao: string }[]>([]);
  const [formData, setFormData] = useState({
    box_id: "",
    armazem_id: "",
    placa_veiculo: "",
    valor_descarga: "",
    confirma_volume: true,
    crossdocking: false,
    observacao: "",
  });
  const [generating, setGenerating] = useState(false);

  const fetchDocs = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = (supabase as any)
        .from("documento_entrada")
        .select("id, numero_nota, data_emissao, parceiro_id, tipo_entrada_id, valor_total_nota, qtd_volume", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("status", 0)
        .order("data_emissao", { ascending: false })
        .range(from, to);

      // armazem_id is optional filter
      if (armazemId) {
        query = query.eq("armazem_id", armazemId);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      // Fetch parceiro names and item counts
      const enriched = await Promise.all(
        (data || []).map(async (doc: any) => {
          const [parceiroRes, itemRes, tipoRes] = await Promise.all([
            (supabase as any).from("parceiro").select("razaosocial").eq("id", doc.parceiro_id).single(),
            (supabase as any).from("documento_entrada_item").select("id", { count: "exact" }).eq("documento_entrada_id", doc.id),
            doc.tipo_entrada_id ? (supabase as any).from("tipo_entrada").select("descricao").eq("id", doc.tipo_entrada_id).single() : Promise.resolve({ data: null }),
          ]);
          return {
            ...doc,
            parceiro_nome: parceiroRes.data?.razaosocial || "—",
            total_skus: itemRes.count || 0,
            tipo_entrada_descricao: tipoRes.data?.descricao || "—",
          };
        })
      );

      setDocs(enriched);
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId, armazemId, page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === docs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(docs.map((d) => d.id)));
    }
  };

  const openModal = async () => {
    // Fetch boxes and armazens in parallel
    const [boxRes, armRes] = await Promise.all([
      (supabase as any)
        .from("box")
        .select("id, descricao")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .order("descricao"),
      (supabase as any)
        .from("armazem")
        .select("id, descricao")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .order("descricao"),
    ]);
    setBoxes(boxRes.data || []);
    setArmazens(armRes.data || []);
    setFormData({
      box_id: "",
      armazem_id: armazemId || "",
      placa_veiculo: "",
      valor_descarga: "",
      confirma_volume: true,
      crossdocking: false,
      observacao: "",
    });
    setShowModal(true);
  };

  const handleGenerate = async () => {
    if (!formData.box_id) { toast.error("Selecione um Box."); return; }
    setGenerating(true);
    try {
      const docIds = Array.from(selected);

      // Calculate total_volume from selected documents
      const totalVolume = docs
        .filter((d) => selected.has(d.id))
        .reduce((sum, d) => sum + (Number(d.qtd_volume) || 0), 0);

      // 1. Create movimento_entrada
      const { data: mov, error: movError } = await (supabase as any)
        .from("movimento_entrada")
        .insert({
          tenant_id: tenantId,
          empresa_id: empresaId,
          armazem_id: formData.armazem_id || armazemId || null,
          box_id: formData.box_id,
          placa_veiculo: formData.placa_veiculo || null,
          valor_descarga: formData.valor_descarga ? parseFloat(formData.valor_descarga) : null,
          confirma_volume: formData.confirma_volume,
          crossdocking: formData.crossdocking,
          observacao: formData.observacao || null,
          total_volume: totalVolume || null,
          status: "GERADO",
          created_by: usuarioId,
        })
        .select("id")
        .single();

      if (movError) throw movError;

      const movId = mov.id;

      // 2. Link documents
      const docLinks = docIds.map((docId) => ({
        movimento_entrada_id: movId,
        documento_entrada_id: docId,
        tenant_id: tenantId,
      }));
      const { error: linkError } = await (supabase as any).from("movimento_entrada_documento").insert(docLinks);
      if (linkError) throw linkError;

      // 3. Fetch all items from selected documents, consolidate by produto_id
      const allItems: { produto_id: string; quantidade: number }[] = [];
      for (const docId of docIds) {
        const { data: items } = await (supabase as any)
          .from("documento_entrada_item")
          .select("produto_id, quantidade")
          .eq("documento_entrada_id", docId);
        if (items) allItems.push(...items);
      }

      // Group by produto_id and sum quantities
      const grouped = allItems.reduce<Record<string, number>>((acc, item) => {
        acc[item.produto_id] = (acc[item.produto_id] || 0) + Number(item.quantidade);
        return acc;
      }, {});

      const movItems = Object.entries(grouped).map(([produto_id, qtd_esperada]) => ({
        movimento_entrada_id: movId,
        produto_id,
        qtd_esperada,
        qtd_conferida: 0,
        tenant_id: tenantId,
      }));

      if (movItems.length > 0) {
        const { error: itemError } = await (supabase as any).from("movimento_entrada_item").insert(movItems);
        if (itemError) throw itemError;
      }

      // 4. Update documento_entrada status
      const { error: updError } = await (supabase as any)
        .from("documento_entrada")
        .update({ status: 1 })
        .in("id", docIds);
      if (updError) throw updError;

      toast.success("Movimento de entrada gerado com sucesso!");
      setShowModal(false);
      setSelected(new Set());
      fetchDocs();
    } catch (err: any) {
      toast.error(`Erro ao gerar movimento: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (showCadastro) {
    return <CadastroDocEntradaPage onBack={() => { setShowCadastro(false); fetchDocs(); }} />;
  }

  if (detalheId) {
    return <DocEntradaDetalhePage documentoId={detalheId} onBack={() => { setDetalheId(null); fetchDocs(); }} />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Documentos de Entrada Pendentes</h1>
          <p className="text-xs text-muted-foreground">Selecione documentos para gerar um movimento de entrada</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCadastro(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            <Plus size={14} />
            Novo Documento
          </button>
          <button
            onClick={openModal}
            disabled={selected.size === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Truck size={14} />
            Gerar Movimento ({selected.size})
          </button>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText size={32} className="mb-2 opacity-40" />
            <p className="text-sm">Nenhum documento pendente encontrado.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/30">
                <th className="px-4 py-2.5 text-left w-10">
                  <input type="checkbox" checked={selected.size === docs.length && docs.length > 0} onChange={toggleAll} className="rounded border-border" />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Nº Nota</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Data Emissão</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Parceiro</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Tipo Entrada</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">SKUs</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase">Volumes</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase">Valor Total</th>
                <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase w-16">Ações</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id} className="border-b border-border/50 table-row-hover cursor-pointer" onClick={() => toggleSelect(doc.id)}>
                  <td className="px-4 py-2.5">
                    <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} onClick={(e) => e.stopPropagation()} className="rounded border-border" />
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground">{doc.numero_nota}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(doc.data_emissao).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-2.5 text-foreground">{doc.parceiro_nome}</td>
                  <td className="px-4 py-2.5 text-foreground text-xs">{doc.tipo_entrada_descricao}</td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">{doc.total_skus}</td>
                  <td className="px-4 py-2.5 text-center text-muted-foreground">{doc.qtd_volume ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-foreground">
                    {doc.valor_total_nota.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDetalheId(doc.id); }}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                      title="Ver detalhes"
                    >
                      <Eye size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-secondary/20">
            <span className="text-xs text-muted-foreground">{total} documentos</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Gerar Movimento */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerar Movimento de Entrada</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Box *</label>
              <select
                value={formData.box_id}
                onChange={(e) => setFormData({ ...formData, box_id: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Selecione...</option>
                {boxes.map((b) => <option key={b.id} value={b.id}>{b.descricao}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Armazém</label>
              <select
                value={formData.armazem_id}
                onChange={(e) => setFormData({ ...formData, armazem_id: e.target.value })}
                className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">Selecione...</option>
                {armazens.map((a) => <option key={a.id} value={a.id}>{a.descricao}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Placa do Veículo</label>
                <input
                  value={formData.placa_veiculo}
                  onChange={(e) => setFormData({ ...formData, placa_veiculo: e.target.value })}
                  placeholder="ABC-1234"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Valor Descarga</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.valor_descarga}
                  onChange={(e) => setFormData({ ...formData, valor_descarga: e.target.value })}
                  placeholder="0,00"
                  className="w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={formData.confirma_volume} onChange={(e) => setFormData({ ...formData, confirma_volume: e.target.checked })} className="rounded border-border" />
                Confirma Volume
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                <input type="checkbox" checked={formData.crossdocking} onChange={(e) => setFormData({ ...formData, crossdocking: e.target.checked })} className="rounded border-border" />
                Crossdocking
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Observação</label>
              <textarea
                value={formData.observacao}
                onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary resize-none"
              />
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border">
              <p className="text-xs text-muted-foreground">{selected.size} documento(s) selecionado(s)</p>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || !formData.box_id}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {generating && <Loader2 size={14} className="animate-spin" />}
              Confirmar Geração
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
