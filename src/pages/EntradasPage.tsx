import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { Loader2, FileText, ChevronLeft, ChevronRight, Truck, Plus, Eye, Trash2 } from "lucide-react";
import { CadastroDocEntradaPage } from "./CadastroDocEntradaPage";
import { DocEntradaDetalhePage } from "./DocEntradaDetalhePage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BotaoImportarERP } from "@/components/erp/ImportarDoERPModal";
import { ImportarNfeChaveModal } from "@/components/erp/ImportarNfeChaveModal";
import { ExcluirDocumentosModal } from "@/components/documentos/ExcluirDocumentosModal";
import { formatDate, formatDateTime } from "@/utils/dateTime";



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
  excluido_em?: string | null;
  excluido_por_nome?: string | null;
}

export function EntradasPage() {
  const { tenantId, empresaId, armazemId, usuarioId } = useTenant();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [aba, setAba] = useState<"pendentes" | "excluidos">("pendentes");
  const isExcluidos = aba === "excluidos";
  const [showExcluir, setShowExcluir] = useState(false);
  const [showCadastro, setShowCadastro] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);


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

  useEffect(() => { setPage(1); }, [empresaId, armazemId]);

  // Deep-link: /atividades/entradas?detalhe=<uuid> abre direto o detalhe
  useEffect(() => {
    const detalheParam = getRouteParam("detalhe");
    if (detalheParam) {
      setDetalheId(detalheParam);
      clearRouteParam("detalhe");
    }
  }, []);


  const listQuery = useQuery({
    queryKey: ["entradas-lista", aba, tenantId, empresaId, armazemId, page],
    queryFn: async () => {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      let query = (supabase as any)
        .from("documento_entrada")
        .select(
          `id, numero_nota, data_emissao, parceiro_id, tipo_entrada_id, valor_total_nota, qtd_volume,
           excluido_em, excluido_por,
           parceiro:parceiro_id ( razaosocial ),
           tipo_entrada:tipo_entrada_id ( descricao ),
           itens:documento_entrada_item ( count )`,
          { count: "exact" }
        )
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("status", isExcluidos ? 99 : 0)
        .order(isExcluidos ? "excluido_em" : "data_emissao", { ascending: false })
        .range(from, to);
      if (armazemId) query = query.or(`armazem_id.eq.${armazemId},armazem_id.is.null`);
      const { data, error, count } = await query;
      if (error) throw error;

      const usuarioMap = new Map<string, string>();
      if (isExcluidos) {
        const ids = Array.from(new Set((data || []).map((d: any) => d.excluido_por).filter(Boolean)));
        if (ids.length > 0) {
          const { data: users } = await (supabase as any).from("usuario").select("id, nome").in("id", ids);
          (users || []).forEach((u: any) => usuarioMap.set(u.id, u.nome));
        }
      }

      const enriched: DocEntry[] = (data || []).map((doc: any) => ({
        id: doc.id,
        numero_nota: doc.numero_nota,
        data_emissao: doc.data_emissao,
        parceiro_id: doc.parceiro_id,
        tipo_entrada_id: doc.tipo_entrada_id,
        valor_total_nota: doc.valor_total_nota,
        qtd_volume: doc.qtd_volume,
        parceiro_nome: doc.parceiro?.razaosocial || "—",
        tipo_entrada_descricao: doc.tipo_entrada?.descricao || "—",
        total_skus: doc.itens?.[0]?.count ?? 0,
        excluido_em: doc.excluido_em ?? null,
        excluido_por_nome: doc.excluido_por ? usuarioMap.get(doc.excluido_por) || "—" : null,
      }));
      return { rows: enriched, count: count || 0 };
    },
    enabled: !!tenantId && !!empresaId,
    staleTime: 30_000,
  });


  const docs = listQuery.data?.rows ?? [];
  const total = listQuery.data?.count ?? 0;
  const loading = listQuery.isLoading;
  const fetchDocs = useCallback(() => { listQuery.refetch(); }, [listQuery]);

  useEffect(() => {
    if (listQuery.error) toast.error(`Erro: ${(listQuery.error as Error).message}`);
  }, [listQuery.error]);


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
    // Fetch boxes (filtra por armazém ativo se houver) e armazens (por empresa ativa) em paralelo
    let boxQuery = (supabase as any)
      .from("box")
      .select("id, descricao, armazem_id")
      .eq("tenant_id", tenantId)
      .eq("ativo", true)
      .order("descricao");
    if (armazemId) boxQuery = boxQuery.eq("armazem_id", armazemId);

    const [boxRes, armRes] = await Promise.all([
      boxQuery,
      (supabase as any)
        .from("armazem")
        .select("id, descricao")
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("descricao"),
    ]);
    if (boxRes.error) toast.error(`Erro ao carregar boxes: ${boxRes.error.message}`);
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
      const { error } = await (supabase as any).rpc("gerar_movimento_entrada", {
        p_tenant_id: tenantId,
        p_usuario_id: usuarioId,
        p_documento_entrada_ids: Array.from(selected),
        p_box_id: formData.box_id,
        p_armazem_id: formData.armazem_id || armazemId || null,
        p_placa_veiculo: formData.placa_veiculo || null,
        p_valor_descarga: formData.valor_descarga ? parseFloat(formData.valor_descarga) : null,
        p_confirma_volume: formData.confirma_volume,
        p_crossdocking: formData.crossdocking,
        p_observacao: formData.observacao || null,
      });
      if (error) throw error;

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
          <h1 className="text-lg font-bold text-foreground">Documentos de Entrada {isExcluidos ? "Excluídos" : "Pendentes"}</h1>
          <p className="text-xs text-muted-foreground">{isExcluidos ? "Documentos excluídos com rastreabilidade de ocorrência" : "Selecione documentos para gerar um movimento de entrada"}</p>
        </div>

        <div className="flex items-center gap-2">
          {!isExcluidos && (
            <>
              <button
                onClick={() => setShowCadastro(true)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-secondary transition-colors"
              >
                <Plus size={14} />
                Novo Documento
              </button>
              <BotaoImportarERP onClick={() => setImportOpen(true)} />
              <button
                onClick={() => setShowExcluir(true)}
                disabled={selected.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Trash2 size={14} />
                Excluir Selecionados ({selected.size})
              </button>
              <button
                onClick={openModal}
                disabled={selected.size === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Truck size={14} />
                Gerar Movimento ({selected.size})
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["pendentes", "excluidos"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setAba(t); setPage(1); setSelected(new Set()); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              aba === t
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            {t === "pendentes" ? "Pendentes" : "Excluídos"}
          </button>
        ))}
      </div>

      <div className="card-surface flex flex-col flex-1 min-h-0 overflow-hidden">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText size={32} className="mb-2 opacity-40" />
            <p className="text-sm">{isExcluidos ? "Nenhum documento excluído encontrado." : "Nenhum documento pendente encontrado."}</p>
          </div>

        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-secondary backdrop-blur">
                  {!isExcluidos && (
                    <th className="px-4 py-2.5 text-left w-10 bg-secondary">
                      <input type="checkbox" checked={selected.size === docs.length && docs.length > 0} onChange={toggleAll} className="rounded border-border" />
                    </th>
                  )}
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Nº Nota</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Data Emissão</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Parceiro</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Tipo Entrada</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase bg-secondary">SKUs</th>
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase bg-secondary">Volumes</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase bg-secondary">Valor Total</th>
                  {isExcluidos && (
                    <>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Excluído em</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase bg-secondary">Excluído por</th>
                      <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase bg-secondary">Status</th>
                    </>
                  )}
                  <th className="px-4 py-2.5 text-center text-xs font-medium text-muted-foreground uppercase w-16 bg-secondary">Ações</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`border-b border-border/50 table-row-hover ${isExcluidos ? "" : "cursor-pointer"}`}
                    onClick={() => { if (!isExcluidos) toggleSelect(doc.id); }}
                  >
                    {!isExcluidos && (
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={selected.has(doc.id)} onChange={() => toggleSelect(doc.id)} onClick={(e) => e.stopPropagation()} className="rounded border-border" />
                      </td>
                    )}
                    <td className="px-4 py-2.5 font-mono text-xs text-foreground">{doc.numero_nota}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatDate(doc.data_emissao)}</td>
                    <td className="px-4 py-2.5 text-foreground">{doc.parceiro_nome}</td>
                    <td className="px-4 py-2.5 text-foreground text-xs">{doc.tipo_entrada_descricao}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{doc.total_skus}</td>
                    <td className="px-4 py-2.5 text-center text-muted-foreground">{doc.qtd_volume ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">
                      {doc.valor_total_nota.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </td>
                    {isExcluidos && (
                      <>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{doc.excluido_em ? formatDateTime(doc.excluido_em) : "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{doc.excluido_por_nome || "—"}</td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border bg-red-500/15 text-red-400 border-red-500/30">EXCLUÍDO</span>
                        </td>
                      </>
                    )}
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
          <span className="text-xs text-muted-foreground">
            {total} documento{total === 1 ? "" : "s"}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span className="text-xs text-muted-foreground px-2">{page} / {Math.max(1, totalPages)}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 rounded hover:bg-secondary disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
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
      <ImportarNfeChaveModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => fetchDocs()}
      />
      <ExcluirDocumentosModal
        isOpen={showExcluir}
        onClose={() => setShowExcluir(false)}
        onSuccess={() => { setSelected(new Set()); fetchDocs(); }}
        documentoIds={Array.from(selected)}
        tipoDocumento="entrada"
      />
    </div>
  );
}
