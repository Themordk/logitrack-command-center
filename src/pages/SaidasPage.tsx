import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, FileText, ChevronLeft, ChevronRight, Truck, Plus, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { fetchOptions } from "@/hooks/useCrud";
import { CadastroDocSaidaPage } from "./CadastroDocSaidaPage";
import { DocSaidaDetalhePage } from "./DocSaidaDetalhePage";
import { BotaoImportarERP } from "@/components/erp/ImportarDoERPModal";
import { ImportarPedidoSaidaModal } from "@/components/erp/ImportarPedidoSaidaModal";

interface DocSaida {
  id: string;
  numero_pedido: number;
  data_emissao: string;
  parceiro_id: string;
  valor_pedido: number;
  parceiro_nome?: string;
  total_skus?: number;
}

export function SaidasPage() {
  const { tenantId, empresaId, armazemId } = useTenant();
  const [docs, setDocs] = useState<DocSaida[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 20;
  const [showCadastro, setShowCadastro] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const [showModal, setShowModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [boxOptions, setBoxOptions] = useState<{ value: string; label: string }[]>([]);
  const [rotaOptions, setRotaOptions] = useState<{ value: string; label: string }[]>([]);
  const [veiculoOptions, setVeiculoOptions] = useState<{ value: string; label: string }[]>([]);
  const [formData, setFormData] = useState({
    box_id: "",
    rota_id: "",
    veiculo_id: "",
    observacao: "",
    prioridade: "NORMAL",
  });

  const fetchDocs = useCallback(async () => {
    if (!tenantId || !empresaId) return;
    setLoading(true);
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await (supabase as any)
        .from("documento_saida")
        .select(
          `id, numero_pedido, data_emissao, parceiro_id, valor_pedido,
           parceiro:parceiro_id ( razaosocial ),
           itens:documento_saida_item ( count )`,
          { count: "exact" }
        )
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("status", 0)
        .order("data_emissao", { ascending: false })
        .range(from, to);
      if (error) throw error;

      const enriched: DocSaida[] = (data || []).map((doc: any) => ({
        id: doc.id,
        numero_pedido: doc.numero_pedido,
        data_emissao: doc.data_emissao,
        parceiro_id: doc.parceiro_id,
        valor_pedido: doc.valor_pedido,
        parceiro_nome: doc.parceiro?.razaosocial || "—",
        total_skus: doc.itens?.[0]?.count ?? 0,
      }));
      setDocs(enriched);
      setTotal(count || 0);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [tenantId, empresaId, page]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  useEffect(() => { setPage(1); }, [empresaId, armazemId]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const toggleAll = () => {
    setSelected(selected.size === docs.length ? new Set() : new Set(docs.map((d) => d.id)));
  };

  const openModal = async () => {
    if (tenantId) {
      const [bx, rt, vc] = await Promise.all([
        fetchOptions("box", tenantId, "descricao", { armazem_id: armazemId }),
        fetchOptions("rotas", tenantId, "descricao", { empresa_id: empresaId, armazem_id: armazemId }),
        fetchOptions("veiculos", tenantId, "descricao", { empresa_id: empresaId }),
      ]);
      setBoxOptions(bx);
      setRotaOptions(rt);
      setVeiculoOptions(vc);
    }
    setFormData({ box_id: "", rota_id: "", veiculo_id: "", observacao: "", prioridade: "NORMAL" });
    setShowModal(true);
  };

  const handleGenerate = async () => {
    if (!formData.prioridade) {
      toast.error("Preencha o campo Prioridade.");
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await (supabase as any).rpc("gerar_onda_separacao", {
        p_tenant_id: tenantId,
        p_empresa_id: empresaId,
        p_box_id: formData.box_id || null,
        p_rota_id: formData.rota_id || null,
        p_veiculo_id: formData.veiculo_id || null,
        p_prioridade: formData.prioridade,
        p_documentos: Array.from(selected),
      });
      if (error) throw error;
      toast.success(data || "Onda de carregamento gerada com sucesso!");
      setShowModal(false);
      setSelected(new Set());
      fetchDocs();
    } catch (err: any) {
      toast.error(`Erro ao gerar: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);
  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary";

  if (showCadastro) {
    return <CadastroDocSaidaPage onBack={() => { setShowCadastro(false); fetchDocs(); }} />;
  }

  if (detalheId) {
    return <DocSaidaDetalhePage documentoId={detalheId} onBack={() => { setDetalheId(null); fetchDocs(); }} />;
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">Documentos de Saída Pendentes</h1>
          <p className="text-xs text-muted-foreground">Selecione documentos para gerar uma onda de carregamento</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCadastro(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors">
            <Plus size={14} /> Novo Documento
          </button>
          <BotaoImportarERP onClick={() => setImportOpen(true)} />
          <button onClick={openModal} disabled={selected.size === 0} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <Truck size={14} /> Gerar Onda ({selected.size})
          </button>
        </div>
      </div>

      <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-muted-foreground" /></div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText size={32} className="mb-2 opacity-40" />
            <p className="text-sm">Nenhum documento de saída pendente.</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-secondary backdrop-blur">
                  <th className="px-4 py-2.5 text-left w-10 bg-secondary">
                    <input type="checkbox" checked={selected.size === docs.length && docs.length > 0} onChange={toggleAll} className="rounded border-border" />
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Nº Pedido</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Data Emissão</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Parceiro</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase bg-secondary">SKUs</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase bg-secondary">Valor</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase w-16 bg-secondary">Ações</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr key={doc.id} className="border-b border-border/50 table-row-hover cursor-pointer" onClick={() => toggleSelect(doc.id)}>
                    <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} onClick={(e) => e.stopPropagation()} className="rounded border-border" /></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{doc.numero_pedido}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{new Date(doc.data_emissao).toLocaleDateString("pt-BR")}</td>
                    <td className="px-4 py-2.5 text-foreground">{doc.parceiro_nome}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{doc.total_skus}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">{doc.valor_pedido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
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
          </div>
        )}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-secondary/20">
          <span className="text-xs text-muted-foreground">{total} documento{total === 1 ? "" : "s"}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span className="text-xs text-muted-foreground px-2">{page} / {Math.max(1, totalPages)}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Gerar Onda de Carregamento</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Box</label>
                <select value={formData.box_id} onChange={(e) => setFormData({ ...formData, box_id: e.target.value })} className={inputClass}>
                  <option value="">Selecione...</option>
                  {boxOptions.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Rota</label>
                <select value={formData.rota_id} onChange={(e) => setFormData({ ...formData, rota_id: e.target.value })} className={inputClass}>
                  <option value="">Selecione...</option>
                  {rotaOptions.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Veículo</label>
                <select value={formData.veiculo_id} onChange={(e) => setFormData({ ...formData, veiculo_id: e.target.value })} className={inputClass}>
                  <option value="">Selecione...</option>
                  {veiculoOptions.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Prioridade *</label>
                <select value={formData.prioridade} onChange={(e) => setFormData({ ...formData, prioridade: e.target.value })} className={inputClass}>
                  {["BAIXA", "NORMAL", "ALTA", "URGENTE"].map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase">Observação</label>
              <textarea value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })} rows={2} className="w-full px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm text-foreground outline-none focus:border-primary resize-none" />
            </div>
            <div className="p-3 rounded-lg bg-secondary/50 border border-border">
              <p className="text-xs text-muted-foreground">{selected.size} documento(s) selecionado(s)</p>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={handleGenerate} disabled={generating} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {generating && <Loader2 size={14} className="animate-spin" />}
              Gerar Onda
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ImportarPedidoSaidaModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => fetchDocs()}
      />
    </div>
  );
}
