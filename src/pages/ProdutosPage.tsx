import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useDebounce } from "@/hooks/useDebounce";
import { fetchOptions } from "@/hooks/useCrud";
import { useProdutoListagem } from "@/hooks/useProdutoListagem";
import {
  fetchAllProdutoListagem,
  fetchProdutoGruposFiltro,
  stripListagemFields,
  type GrupoFiltroOption,
  type ProdutoListagemFilters,
} from "@/modules/produtos/produtoListagem.service";
import { SearchableSelectFilter } from "@/components/filters/SearchableSelectFilter";
import { ParceiroSearchInput } from "@/components/parceiro/ParceiroSearchInput";
import { ExportActions } from "@/modules/reports/components/ExportActions";
import {
  exportToExcel,
  exportToPdf,
  printPdf,
  abrirJanelaImpressao,
  type ExportColumn,
} from "@/modules/reports/utils/exporters";
import { nowDisplay } from "@/utils/dateTime";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { ImportarDoERPModal, BotaoImportarERP } from "@/components/erp/ImportarDoERPModal";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, AlertCircle, Plus, Edit2, Trash2, Package, Printer, AlertTriangle } from "lucide-react";
import { PrintEtiquetaProdutoModal } from "@/components/etiqueta/PrintEtiquetaProdutoModal";
import type { EtiquetaProdutoItem } from "@/components/etiqueta/EtiquetaProdutoPreview";
import { EnderecoSearchInput } from "@/components/armazem/EnderecoSearchInput";
import { parseError } from "@/lib/errorMapper";
import { ProdutoImagemThumb } from "@/components/produto/ProdutoImagemThumb";
import { useRegrasPadraoProduto, PadraoCampoIndicador } from "@/pages/integracao/PadraoCampoIndicador";
import { CAMPOS_PADRAO_PRODUTO } from "@/pages/integracao/produtoPadroes.types";
import { getRouteParam, clearRouteParam } from "@/lib/deepLinkParam";
import { DescricaoCell } from "@/components/DescricaoCell";

const TIPO_PICKING_OPTIONS = [
  { value: "MASTER", label: "Master" },
  { value: "FRACIONADO", label: "Fracionado" },
  { value: "PDV", label: "PDV" },
];
const formatTipoPicking = (v?: string) =>
  TIPO_PICKING_OPTIONS.find((o) => o.value === v)?.label ?? (v ?? "—");

// ─── Produto Detail Modal with Tabs ────────────────────────────────
function ProdutoDetailModal({
  open, onClose, produto, tenantId, armazemId, empresaId, usuarioId, onSaved,
  grupoOptions, subgrupoOptions, parceiroOptions, onNavigate, abaInicial = "cadastro",
}: {
  open: boolean; onClose: () => void; produto: any | null;
  tenantId: string; armazemId: string | null; empresaId: string | null;
  usuarioId: string | null;
  onSaved: () => void;
  grupoOptions: { value: string; label: string }[];
  subgrupoOptions: { value: string; label: string }[];
  parceiroOptions: { value: string; label: string }[];
  onNavigate?: (path: string) => void;
  abaInicial?: string;
}) {
  const [tab, setTab] = useState("cadastro");
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const isEdit = !!produto;

  // Embalagens state
  const [embalagens, setEmbalagens] = useState<any[]>([]);
  const [embLoading, setEmbLoading] = useState(false);
  const [embModalOpen, setEmbModalOpen] = useState(false);
  const [editEmb, setEditEmb] = useState<any>(null);
  const [embForm, setEmbForm] = useState<Record<string, any>>({});
  const [embSaving, setEmbSaving] = useState(false);
  const [embSelected, setEmbSelected] = useState<Set<string>>(new Set());
  const [embPrintOpen, setEmbPrintOpen] = useState(false);
  const [embPrintItems, setEmbPrintItems] = useState<EtiquetaProdutoItem[]>([]);

  const buildEmbItems = (embs: any[]): EtiquetaProdutoItem[] => embs.map((e) => ({
    produto_id: produto?.id,
    sku: produto?.sku || "",
    descricao: produto?.descricao || "",
    marca: produto?.marca,
    referencia: produto?.referencia,
    embalagem_id: e.id,
    ean: e.ean,
    embalagem: e.embalagem,
    fator: e.fator,
    altura: e.altura,
    largura: e.largura,
    comprimento: e.comprimento,
    peso_bruto: e.peso_bruto,
    peso_liquido: e.peso_liquido,
    m3: e.m3,
  }));

  const openPrintForEmbs = (embs: any[]) => {
    if (!embs.length) { toast.error("Nenhuma embalagem para imprimir"); return; }
    setEmbPrintItems(buildEmbItems(embs));
    setEmbPrintOpen(true);
  };

  // Picking state
  const [pickings, setPickings] = useState<any[]>([]);
  const [pickLoading, setPickLoading] = useState(false);
  const [pickModalOpen, setPickModalOpen] = useState(false);
  const [editPick, setEditPick] = useState<any>(null);
  const [pickForm, setPickForm] = useState<Record<string, any>>({});
  const [pickSaving, setPickSaving] = useState(false);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (open) {
      setTab(abaInicial);
      if (produto) {
        setForm({ ...produto });
      } else {
        setForm({
          sku: "", descricao: "", referencia: "", marca: "", parceiro_id: "",
          grupo_id: "", subgrupo_id: "", curva_venda: "", curva_acesso: "",
          preco_custo: "", ativo: true, tipo_controle: "", peso_variavel: false,
          tolerancia: "", peso_bruto: "", peso_liquido: "", url_imagem: "",
          dias_shelf: "", shelf_entrada: "", shelf_devolucao: "",
          lastro: "", camada: "", fator_caixa: "", usa_picking: true,
          tipo_separacao: "", varios_pickings: false, foto: "",
        });
      }
      setErrors({});
    }
  }, [open, produto, abaInicial]);

  // Load embalagens when tab changes
  useEffect(() => {
    if (tab === "embalagens" && produto?.id) loadEmbalagens();
    if (tab === "picking" && produto?.id) { loadPickings(); loadArmazens(); }
  }, [tab, produto?.id]);

  // Reload addresses when warehouse selection changes in picking form
  useEffect(() => {
    // No-op kept for compatibility; EnderecoSearchInput handles its own queries.
  }, [pickForm.armazem_id, pickModalOpen, tab]);

  const loadEmbalagens = async () => {
    if (!produto?.id) return;
    setEmbLoading(true);
    const { data } = await (supabase as any).from("produto_embalagem")
      .select("*").eq("produto_id", produto.id).eq("tenant_id", tenantId).order("embalagem");
    setEmbalagens(data || []);
    setEmbLoading(false);
  };

  const loadPickings = async () => {
    if (!produto?.id) return;
    setPickLoading(true);
    const { data } = await (supabase as any).from("picking_produto")
      .select("*, endereco:endereco_id(descricao, codigo_endereco)")
      .eq("produto_id", produto.id).eq("tenant_id", tenantId).order("tipo_picking");
    setPickings(data || []);
    setPickLoading(false);
  };

  const loadArmazens = async () => {
    if (!tenantId) return;
    let q = (supabase as any).from("armazem").select("id, descricao")
      .eq("tenant_id", tenantId).eq("ativo", true).order("descricao");
    if (empresaId) q = q.eq("empresa_id", empresaId);
    const { data } = await q;
    setArmazemOptions((data || []).map((a: any) => ({ value: a.id, label: a.descricao })));
  };

  const set = (name: string, value: any) => {
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((e) => { const n = { ...e }; delete n[name]; return n; });
  };

  const handleSaveProduto = async () => {
    const requiredFields = ["sku", "descricao", "referencia", "parceiro_id", "tipo_controle", "tipo_separacao"];
    const errs: Record<string, string> = {};
    requiredFields.forEach((f) => {
      if (!form[f]) errs[f] = "Campo obrigatório";
    });
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }
    setSaving(true);

    const cleanData: Record<string, any> = { ...form };
    // Remove read-only / computed fields
    delete cleanData.id;
    delete cleanData.tenant_id;
    delete cleanData.tem_ean;
    delete cleanData.parceiro_nome;
    delete cleanData.grupo_descricao;
    delete cleanData.subgrupo_descricao;
    delete cleanData.total_count;
    // Ensure empresa_id
    cleanData.empresa_id = empresaId;
    // Number conversions
    ["preco_custo", "tolerancia", "peso_bruto", "peso_liquido", "dias_shelf", "shelf_entrada", "shelf_devolucao", "lastro", "camada", "fator_caixa"]
      .forEach((f) => { cleanData[f] = cleanData[f] ? Number(cleanData[f]) : null; });
    // Null out empty selects / texts
    ["grupo_id", "subgrupo_id", "curva_venda", "curva_acesso", "url_imagem"].forEach((f) => {
      if (!cleanData[f]) cleanData[f] = null;
    });

    try {
      if (isEdit) {
        // Rastreabilidade: quem editou e quando
        cleanData.updated_at = new Date().toISOString();
        cleanData.updated_by = usuarioId;
        const { error } = await (supabase as any).from("produto").update(cleanData).eq("id", produto.id);
        if (error) throw error;
        toast.success("Produto atualizado!");
      } else {
        cleanData.tenant_id = tenantId;
        cleanData.updated_by = usuarioId;
        const { error } = await (supabase as any).from("produto").insert(cleanData);
        if (error) throw error;
        toast.success("Produto criado!");
      }
      onSaved();
      onClose();
    } catch (err: any) {
      const parsed = parseError(err, "salvar produto");
      toast.error(parsed.title);
    } finally {
      setSaving(false);
    }
  };

  // ── Embalagem CRUD ──
  const openEmbModal = (emb?: any) => {
    setEditEmb(emb || null);
    setEmbForm(emb ? { ...emb } : { ean: "", fator: 1, embalagem: "", altura: "", largura: "", comprimento: "", peso_bruto: "", peso_liquido: "", m3: "", ativo: true });
    setEmbModalOpen(true);
  };
  const saveEmb = async () => {
    if (!embForm.ean || !embForm.embalagem) { toast.error("EAN e Embalagem são obrigatórios."); return; }
    setEmbSaving(true);
    const data: any = { ...embForm };
    delete data.id; delete data.tenant_id; delete data.produto_id; delete data.empresa_id;
    ["fator", "altura", "largura", "comprimento", "peso_bruto", "peso_liquido", "m3"].forEach((f) => { data[f] = data[f] ? Number(data[f]) : null; });
    data.fator = data.fator || 1;
    try {
      if (editEmb) {
        const { error } = await (supabase as any).from("produto_embalagem").update(data).eq("id", editEmb.id);
        if (error) throw error;
      } else {
        data.produto_id = produto.id; data.tenant_id = tenantId; data.empresa_id = empresaId;
        const { error } = await (supabase as any).from("produto_embalagem").insert(data);
        if (error) throw error;
      }
      toast.success("Embalagem salva!");
      setEmbModalOpen(false);
      loadEmbalagens();
    } catch (err: any) { toast.error(parseError(err, "produtos-page").title); } finally { setEmbSaving(false); }
  };
  const deleteEmb = async (id: string) => {
    const { error } = await (supabase as any).from("produto_embalagem").update({ ativo: false }).eq("id", id);
    if (error) toast.error(parseError(error, "produtos-page").title); else { toast.success("Removido!"); loadEmbalagens(); }
  };

  // ── Picking CRUD ──
  const openPickModal = (pick?: any) => {
    setEditPick(pick || null);
    setPickForm(pick ? { ...pick } : { armazem_id: armazemId || "", endereco_id: "", tipo_picking: "", est_minimo: 0, est_maximo: 0, ativo: true });
    setPickModalOpen(true);
  };
  const savePick = async () => {
    if (!pickForm.armazem_id || !pickForm.endereco_id || !pickForm.tipo_picking) { toast.error("Armazém, Endereço e Tipo são obrigatórios."); return; }
    setPickSaving(true);
    const data: any = { ...pickForm };
    delete data.id; delete data.tenant_id; delete data.produto_id; delete data.endereco; delete data.tipo_alocacao;
    data.est_minimo = Number(data.est_minimo) || 0;
    data.est_maximo = Number(data.est_maximo) || 0;
    try {
      if (editPick) {
        const { error } = await (supabase as any).from("picking_produto").update(data).eq("id", editPick.id);
        if (error) throw error;
      } else {
        // Resolve empresa_id a partir do armazém selecionado (garante coerência)
        const { data: arm, error: armErr } = await (supabase as any)
          .from("armazem")
          .select("empresa_id")
          .eq("id", pickForm.armazem_id)
          .maybeSingle();
        if (armErr || !arm?.empresa_id) {
          toast.error("Não foi possível resolver a empresa do armazém selecionado.");
          setPickSaving(false);
          return;
        }
        data.produto_id = produto.id;
        data.tenant_id = tenantId;
        data.empresa_id = arm.empresa_id;
        const { error } = await (supabase as any).from("picking_produto").insert(data);
        if (error) throw error;
      }
      toast.success("Picking salvo!");
      setPickModalOpen(false);
      loadPickings();
    } catch (err: any) { toast.error(parseError(err, "produtos-page").title); } finally { setPickSaving(false); }
  };
  const deletePick = async (id: string) => {
    const { error } = await (supabase as any).from("picking_produto").delete().eq("id", id);
    if (error) toast.error(parseError(error, "produtos-page").title); else { toast.success("Picking removido!"); loadPickings(); }
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";
  const labelClass = "block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide";
  const padroes = useRegrasPadraoProduto(empresaId ?? null, open);
  const ind = (k: string) => <PadraoCampoIndicador regra={padroes.regra(k)} onNavigate={onNavigate} />;
  const lk = (k: string) => padroes.bloqueado(k);

  // Preenche campos com regra de padrão na CRIAÇÃO (uma vez por abertura),
  // pois campos com modo SEMPRE ficam desabilitados e o usuário não os altera.
  const padroesAplicadosRef = useRef(false);
  useEffect(() => {
    if (!open) { padroesAplicadosRef.current = false; return; }
    if (isEdit || padroesAplicadosRef.current || !padroes.carregado) return;
    padroesAplicadosRef.current = true;
    const patch: Record<string, any> = {};
    for (const def of CAMPOS_PADRAO_PRODUTO) {
      const regra = padroes.regra(def.chave);
      if (!regra || regra.valor === null || regra.valor === undefined) continue;
      if (def.tipo === "boolean") patch[def.chave] = !!regra.valor;
      else patch[def.chave] = String(regra.valor);
    }
    if (Object.keys(patch).length) setForm((p) => ({ ...p, ...patch }));
  }, [open, isEdit, padroes]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? `Editar Produto – ${produto?.sku}` : "Novo Produto"}</SheetTitle>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="cadastro" className="flex-1">Cadastro</TabsTrigger>
            <TabsTrigger value="embalagens" className="flex-1" disabled={!isEdit}>Embalagens</TabsTrigger>
            <TabsTrigger value="picking" className="flex-1" disabled={!isEdit}>Picking</TabsTrigger>
          </TabsList>

          {/* ── ABA CADASTRO ── */}
          <TabsContent value="cadastro" className="space-y-6 py-4">
            {/* Seção 1 — Informações Básicas */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Informações Básicas</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>SKU *</label><input value={form.sku || ""} onChange={(e) => set("sku", e.target.value)} className={inputClass} placeholder="ELT-001" /></div>
                <div className="md:col-span-2"><label className={labelClass}>Descrição *</label><input value={form.descricao || ""} onChange={(e) => set("descricao", e.target.value)} className={inputClass} placeholder="Descrição do produto" /></div>
                <div><label className={labelClass}>Referência *</label><input value={form.referencia || ""} onChange={(e) => set("referencia", e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Marca</label><input value={form.marca || ""} onChange={(e) => set("marca", e.target.value)} className={inputClass} /></div>
                <div>
                  <label className={labelClass}>Parceiro (Fornecedor) *</label>
                  <select value={form.parceiro_id || ""} onChange={(e) => set("parceiro_id", e.target.value)} className={inputClass}>
                    <option value="">Selecionar...</option>
                    {parceiroOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Grupo</label>
                  <select value={form.grupo_id || ""} onChange={(e) => set("grupo_id", e.target.value)} className={inputClass}>
                    <option value="">Selecionar...</option>
                    {grupoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Subgrupo</label>
                  <select value={form.subgrupo_id || ""} onChange={(e) => set("subgrupo_id", e.target.value)} className={inputClass}>
                    <option value="">Selecionar...</option>
                    {subgrupoOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Curva Venda</label>
                  <select value={form.curva_venda || ""} onChange={(e) => set("curva_venda", e.target.value)} className={inputClass}>
                    <option value="">Selecionar...</option>
                    {["A", "B", "C", "D"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Curva Acesso</label>
                  <select value={form.curva_acesso || ""} onChange={(e) => set("curva_acesso", e.target.value)} className={inputClass}>
                    <option value="">Selecionar...</option>
                    {["A", "B", "C", "D"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div><label className={labelClass}>Preço de Custo</label><input type="number" step="0.01" value={form.preco_custo ?? ""} onChange={(e) => set("preco_custo", e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Peso Bruto (kg)</label><input type="number" step="0.001" value={form.peso_bruto ?? ""} onChange={(e) => set("peso_bruto", e.target.value)} className={inputClass} /></div>
                <div><label className={labelClass}>Peso Líquido (kg)</label><input type="number" step="0.001" value={form.peso_liquido ?? ""} onChange={(e) => set("peso_liquido", e.target.value)} className={inputClass} /></div>
                <div className="md:col-span-3">
                  <label className={labelClass}>URL da Imagem</label>
                  <div className="flex items-start gap-3">
                    <input
                      type="url"
                      value={form.url_imagem ?? ""}
                      onChange={(e) => set("url_imagem", e.target.value)}
                      className={inputClass}
                      placeholder="https://..."
                    />
                    <ProdutoImagemThumb
                      url={form.url_imagem}
                      alt={form.sku || "Produto"}
                      caption={form.sku ? `${form.sku} — ${form.descricao || ""}` : undefined}
                      size={80}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3 md:col-span-3">
                  <Switch checked={!!form.ativo} onCheckedChange={(v) => set("ativo", v)} />
                  <label className="text-sm text-foreground">Ativo</label>
                </div>
              </div>
            </div>

            {/* Seção 2 — Controle de Estoque */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Controle de Estoque</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Tipo de Controle *{ind("tipo_controle")}</label>
                  <select value={form.tipo_controle || ""} onChange={(e) => set("tipo_controle", e.target.value)} className={inputClass} disabled={lk("tipo_controle")}>
                    <option value="">Selecionar...</option>
                    {["UNIDADE", "LOTE", "VALIDADE", "SERIE", "METROS"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.peso_variavel} onCheckedChange={(v) => set("peso_variavel", v)} disabled={lk("peso_variavel")} />
                  <label className="text-sm text-foreground">Peso Variável{ind("peso_variavel")}</label>
                </div>
                <div><label className={labelClass}>Tolerância{ind("tolerancia")}</label><input type="number" step="0.01" value={form.tolerancia ?? ""} onChange={(e) => set("tolerancia", e.target.value)} className={inputClass} disabled={lk("tolerancia")} /></div>
              </div>
            </div>

            {/* Seção 3 — Controle de Vencimento */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Controle de Vencimento</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Dias Shelf{ind("dias_shelf")}</label><input type="number" value={form.dias_shelf ?? ""} onChange={(e) => set("dias_shelf", e.target.value)} className={inputClass} disabled={lk("dias_shelf")} /></div>
                <div><label className={labelClass}>Shelf Entrada{ind("shelf_entrada")}</label><input type="number" step="0.01" value={form.shelf_entrada ?? ""} onChange={(e) => set("shelf_entrada", e.target.value)} className={inputClass} disabled={lk("shelf_entrada")} /></div>
                <div><label className={labelClass}>Shelf Devolução{ind("shelf_devolucao")}</label><input type="number" step="0.01" value={form.shelf_devolucao ?? ""} onChange={(e) => set("shelf_devolucao", e.target.value)} className={inputClass} disabled={lk("shelf_devolucao")} /></div>
              </div>
            </div>

            {/* Seção 4 — Empilhamento */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Empilhamento</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className={labelClass}>Lastro{ind("lastro")}</label><input type="number" value={form.lastro ?? ""} onChange={(e) => set("lastro", e.target.value)} className={inputClass} disabled={lk("lastro")} /></div>
                <div><label className={labelClass}>Camada{ind("camada")}</label><input type="number" value={form.camada ?? ""} onChange={(e) => set("camada", e.target.value)} className={inputClass} disabled={lk("camada")} /></div>
                <div><label className={labelClass}>Fator Caixa{ind("fator_caixa")}</label><input type="number" value={form.fator_caixa ?? ""} onChange={(e) => set("fator_caixa", e.target.value)} className={inputClass} disabled={lk("fator_caixa")} /></div>
              </div>
            </div>

            {/* Seção 5 — Expedição */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">Expedição</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.usa_picking} onCheckedChange={(v) => set("usa_picking", v)} disabled={lk("usa_picking")} />
                  <label className="text-sm text-foreground">Usa Picking{ind("usa_picking")}</label>
                </div>
                <div>
                  <label className={labelClass}>Tipo de Separação *{ind("tipo_separacao")}</label>
                  <select value={form.tipo_separacao || ""} onChange={(e) => set("tipo_separacao", e.target.value)} className={inputClass} disabled={lk("tipo_separacao")}>
                    <option value="">Selecionar...</option>
                    {["FRACIONADO", "EMBALAGEM_TOTAL", "CAIXARIA"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.varios_pickings} onCheckedChange={(v) => set("varios_pickings", v)} disabled={lk("varios_pickings")} />
                  <label className="text-sm text-foreground">Vários Pickings{ind("varios_pickings")}</label>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── ABA EMBALAGENS ── */}
          <TabsContent value="embalagens" className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Embalagens do Produto</h3>
              <div className="flex items-center gap-2">
                {embSelected.size > 0 && (
                  <button
                    onClick={() => openPrintForEmbs(embalagens.filter((e) => embSelected.has(e.id)))}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs font-medium hover:bg-secondary/80 transition-colors border border-border"
                  >
                    <Printer size={12} /> Imprimir Selecionadas ({embSelected.size})
                  </button>
                )}
                <button onClick={() => openEmbModal()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                  <Plus size={12} /> Nova Embalagem
                </button>
              </div>
            </div>
            {embLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : embalagens.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhuma embalagem cadastrada.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-primary"
                        checked={embalagens.length > 0 && embalagens.every((e) => embSelected.has(e.id))}
                        onChange={(ev) => {
                          const n = new Set(embSelected);
                          if (ev.target.checked) embalagens.forEach((e) => n.add(e.id));
                          else embalagens.forEach((e) => n.delete(e.id));
                          setEmbSelected(n);
                        }}
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">EAN</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Embalagem</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Fator</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Peso Bruto</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">M³</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {embalagens.map((e) => (
                    <tr key={e.id} className="border-b border-border/50 table-row-hover">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 accent-primary"
                          checked={embSelected.has(e.id)}
                          onChange={() => {
                            const n = new Set(embSelected);
                            if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
                            setEmbSelected(n);
                          }}
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{e.ean}</td>
                      <td className="px-3 py-2 text-xs">{e.embalagem}</td>
                      <td className="px-3 py-2 text-center text-xs">{e.fator}</td>
                      <td className="px-3 py-2 text-center text-xs">{e.peso_bruto ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{e.m3 ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openPrintForEmbs([e])} title="Imprimir etiqueta" className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-primary flex items-center justify-center"><Printer size={12} /></button>
                          <button onClick={() => openEmbModal(e)} className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"><Edit2 size={12} /></button>
                          <button onClick={() => deleteEmb(e.id)} className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>

          {/* ── ABA PICKING ── */}
          <TabsContent value="picking" className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Picking do Produto</h3>
              <button onClick={() => openPickModal()} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors">
                <Plus size={12} /> Novo Picking
              </button>
            </div>
            {pickLoading ? (
              <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
            ) : pickings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum picking cadastrado.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/30">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Endereço</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Tipo</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Mínimo</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground uppercase">Máximo</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pickings.map((p) => (
                    <tr key={p.id} className="border-b border-border/50 table-row-hover">
                      <td className="px-3 py-2 font-mono text-xs">{p.endereco?.codigo_endereco ?? p.endereco?.descricao ?? "—"}</td>
                      <td className="px-3 py-2 text-center text-xs">{formatTipoPicking(p.tipo_picking)}</td>
                      <td className="px-3 py-2 text-center text-xs">{p.est_minimo}</td>
                      <td className="px-3 py-2 text-center text-xs">{p.est_maximo}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => openPickModal(p)} className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"><Edit2 size={12} /></button>
                          <button onClick={() => deletePick(p.id)} className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-destructive flex items-center justify-center"><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>
        </Tabs>

        {tab === "cadastro" && (
          <SheetFooter>
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">Cancelar</button>
            <button onClick={handleSaveProduto} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </SheetFooter>
        )}
      </SheetContent>

      {/* Embalagem sub-modal */}
      <Sheet open={embModalOpen} onOpenChange={(v) => !v && setEmbModalOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editEmb ? "Editar Embalagem" : "Nova Embalagem"}</SheetTitle></SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div><label className={labelClass}>EAN *</label><input value={embForm.ean || ""} onChange={(e) => setEmbForm({ ...embForm, ean: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Embalagem *</label><input value={embForm.embalagem || ""} onChange={(e) => setEmbForm({ ...embForm, embalagem: e.target.value })} className={inputClass} placeholder="CX, UN, PCT..." /></div>
            <div><label className={labelClass}>Fator</label><input type="number" value={embForm.fator ?? 1} onChange={(e) => setEmbForm({ ...embForm, fator: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Altura</label><input type="number" step="0.01" value={embForm.altura ?? ""} onChange={(e) => setEmbForm({ ...embForm, altura: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Largura</label><input type="number" step="0.01" value={embForm.largura ?? ""} onChange={(e) => setEmbForm({ ...embForm, largura: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Comprimento</label><input type="number" step="0.01" value={embForm.comprimento ?? ""} onChange={(e) => setEmbForm({ ...embForm, comprimento: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Peso Bruto</label><input type="number" step="0.01" value={embForm.peso_bruto ?? ""} onChange={(e) => setEmbForm({ ...embForm, peso_bruto: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Peso Líquido</label><input type="number" step="0.01" value={embForm.peso_liquido ?? ""} onChange={(e) => setEmbForm({ ...embForm, peso_liquido: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>M³</label><input type="number" step="0.001" value={embForm.m3 ?? ""} onChange={(e) => setEmbForm({ ...embForm, m3: e.target.value })} className={inputClass} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={!!embForm.ativo} onCheckedChange={(v) => setEmbForm({ ...embForm, ativo: v })} />
              <label className="text-sm text-foreground">Ativo</label>
            </div>
          </div>
          <SheetFooter>
            <button onClick={() => setEmbModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={saveEmb} disabled={embSaving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {embSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Picking sub-modal */}
      <Sheet open={pickModalOpen} onOpenChange={(v) => !v && setPickModalOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editPick ? "Editar Picking" : "Novo Picking"}</SheetTitle></SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <label className={labelClass}>Armazém *</label>
              <select value={pickForm.armazem_id || ""} onChange={(e) => setPickForm({ ...pickForm, armazem_id: e.target.value, endereco_id: "" })} className={inputClass}>
                <option value="">Selecionar...</option>
                {armazemOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <EnderecoSearchInput
                label="Endereço *"
                value={pickForm.endereco_id || null}
                onChange={(id) => setPickForm({ ...pickForm, endereco_id: id || "" })}
                armazemId={pickForm.armazem_id || null}
                tenantId={tenantId}
                disabled={!pickForm.armazem_id}
                placeholder={pickForm.armazem_id ? "Digite o código do endereço..." : "Selecione o armazém primeiro"}
              />
            </div>
            <div>
              <label className={labelClass}>Tipo Picking *</label>
              <select value={pickForm.tipo_picking || ""} onChange={(e) => setPickForm({ ...pickForm, tipo_picking: e.target.value })} className={inputClass}>
                <option value="">Selecionar...</option>
                {TIPO_PICKING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><label className={labelClass}>Est. Mínimo</label><input type="number" value={pickForm.est_minimo ?? 0} onChange={(e) => setPickForm({ ...pickForm, est_minimo: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Est. Máximo</label><input type="number" value={pickForm.est_maximo ?? 0} onChange={(e) => setPickForm({ ...pickForm, est_maximo: e.target.value })} className={inputClass} /></div>
            <div className="flex items-center gap-3">
              <Switch checked={!!pickForm.ativo} onCheckedChange={(v) => setPickForm({ ...pickForm, ativo: v })} />
              <label className="text-sm text-foreground">Ativo</label>
            </div>
          </div>
          <SheetFooter>
            <button onClick={() => setPickModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={savePick} disabled={pickSaving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {pickSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <PrintEtiquetaProdutoModal open={embPrintOpen} onClose={() => setEmbPrintOpen(false)} items={embPrintItems} onNavigate={onNavigate} />
    </Sheet>
  );
}

// ─── Main Produtos Page ────────────────────────────────────────────
export function ProdutosPage({ onNavigate }: { onNavigate?: (path: string) => void } = {}) {
  const { tenantId, empresaId, armazemId, empresaVersion, usuarioId, usuarioNome } = useTenant();
  const [filterSemEan, setFilterSemEan] = useState(false);
  const [filterSku, setFilterSku] = useState("");
  const [filterDescricao, setFilterDescricao] = useState("");
  const [filterReferencia, setFilterReferencia] = useState("");
  const [filterEan, setFilterEan] = useState("");
  const [eanAplicado, setEanAplicado] = useState("");
  const [filterParceiroId, setFilterParceiroId] = useState<string | null>(null);
  const [filterParceiroNome, setFilterParceiroNome] = useState("");
  const [filterGrupoId, setFilterGrupoId] = useState<string | null>(null);
  const [filterSubgrupoId, setFilterSubgrupoId] = useState<string | null>(null);
  const [filterMarca, setFilterMarca] = useState<string | null>(null);
  const debSku = useDebounce(filterSku, 400);
  const debDescricao = useDebounce(filterDescricao, 400);
  const debReferencia = useDebounce(filterReferencia, 400);
  const debEan = useDebounce(filterEan, 400);
  useEffect(() => { setEanAplicado(debEan); }, [debEan]);
  const eanFiltro = useMemo(() => {
    const t = eanAplicado.replace(/\s+/g, "");
    return t.length >= 3 ? t : "";
  }, [eanAplicado]);
  const filters = useMemo<ProdutoListagemFilters>(() => ({
    sku: debSku,
    descricao: debDescricao,
    referencia: debReferencia,
    ean: eanFiltro,
    parceiroId: filterParceiroId,
    grupoId: filterGrupoId,
    subgrupoId: filterSubgrupoId,
    marca: filterMarca,
    semEan: filterSemEan,
  }), [debSku, debDescricao, debReferencia, eanFiltro, filterParceiroId, filterGrupoId, filterSubgrupoId, filterMarca, filterSemEan]);
  const lista = useProdutoListagem({ filters, pageSize: 15 });

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [abaInicial, setAbaInicial] = useState("cadastro");
  useEffect(() => {
    let cancelado = false;
    const lerProduto = async () => {
      const produtoId = getRouteParam("produto");
      if (!produtoId || !tenantId || !empresaId) return;
      const aba = getRouteParam("aba");
      try {
        const { data, error } = await supabase.from("produto").select("*").eq("id", produtoId).eq("tenant_id", tenantId).eq("empresa_id", empresaId).maybeSingle();
        if (error) throw error;
        if (cancelado) return;
        if (!data) { toast.warning("Produto não encontrado nesta empresa."); return; }
        setAbaInicial(aba === "picking" ? "picking" : "cadastro"); setEditItem(data); setModalOpen(true);
        clearRouteParam("produto"); clearRouteParam("aba");
      } catch (erro: unknown) { if (!cancelado) toast.error(parseError(erro, "produto-picking").title); }
    };
    void lerProduto();
    window.addEventListener("hashchange", lerProduto);
    return () => { cancelado = true; window.removeEventListener("hashchange", lerProduto); };
  }, [tenantId, empresaId, empresaVersion]);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [grupoOptions, setGrupoOptions] = useState<{ value: string; label: string }[]>([]);
  const [grupoFiltroOptions, setGrupoFiltroOptions] = useState<GrupoFiltroOption[]>([]);
  const [subgrupoOptions, setSubgrupoOptions] = useState<{ value: string; label: string }[]>([]);
  const [parceiroOptions, setParceiroOptions] = useState<{ value: string; label: string }[]>([]);
  const [subgrupoFiltroOptions, setSubgrupoFiltroOptions] = useState<{ value: string; label: string; grupoId: string | null }[]>([]);
  const [marcaOptions, setMarcaOptions] = useState<{ value: string; label: string }[]>([]);
  const [exportLoading, setExportLoading] = useState<"pdf" | "excel" | "print" | null>(null);
  const [confirmExcelOpen, setConfirmExcelOpen] = useState(false);
  const [confirmPdfOpen, setConfirmPdfOpen] = useState(false);
  const [pdfAcao, setPdfAcao] = useState<"pdf" | "print">("pdf");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [listPrintOpen, setListPrintOpen] = useState(false);
  const [listPrintItems, setListPrintItems] = useState<EtiquetaProdutoItem[]>([]);
  const [totalSemEan, setTotalSemEan] = useState<number | null>(null);

  // Totalizador global de produtos sem código de barras (escopo empresa).
  useEffect(() => {
    if (!tenantId || !empresaId) { setTotalSemEan(null); return; }
    (async () => {
      const { count, error } = await (supabase as any)
        .from("vw_produto_listagem")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .eq("tem_ean", false);
      if (!error) setTotalSemEan(count ?? 0);
    })();
  }, [tenantId, empresaId, empresaVersion, lista.total]);


  const handleImprimirSelecionados = async () => {
    if (!tenantId || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const { data, error } = await (supabase as any)
      .from("produto_embalagem")
      .select("id, produto_id, ean, embalagem, fator, altura, largura, comprimento, peso_bruto, peso_liquido, m3, produto:produto_id(sku, descricao, marca, referencia)")
      .in("produto_id", ids)
      .eq("tenant_id", tenantId)
      .eq("ativo", true);
    if (error) { toast.error(parseError(error, "produtos-page").title); return; }
    const rows = (data || []) as any[];
    if (!rows.length) { toast.error("Nenhuma embalagem ativa encontrada para os produtos selecionados"); return; }
    const items: EtiquetaProdutoItem[] = rows.map((e) => ({
      produto_id: e.produto_id,
      sku: e.produto?.sku || "",
      descricao: e.produto?.descricao || "",
      marca: e.produto?.marca,
      referencia: e.produto?.referencia,
      embalagem_id: e.id,
      ean: e.ean,
      embalagem: e.embalagem,
      fator: e.fator,
      altura: e.altura, largura: e.largura, comprimento: e.comprimento,
      peso_bruto: e.peso_bruto, peso_liquido: e.peso_liquido, m3: e.m3,
    }));
    const produtosSemEmb = ids.length - new Set(rows.map((r) => r.produto_id)).size;
    if (produtosSemEmb > 0) toast.info(`${produtosSemEmb} produto(s) sem embalagem ativa foram ignorados`);
    setListPrintItems(items);
    setListPrintOpen(true);
  };

  // Troca de empresa: limpa todos os filtros e recarrega as opções
  useEffect(() => {
    let cancelado = false;
    setGrupoFiltroOptions([]);
    setFilterSku("");
    setFilterDescricao("");
    setFilterReferencia("");
    setFilterEan("");
    setEanAplicado("");
    setFilterParceiroId(null);
    setFilterParceiroNome("");
    setFilterGrupoId(null);
    setFilterSubgrupoId(null);
    setFilterMarca(null);
    if (tenantId && empresaId) {
      const f = { empresa_id: empresaId };
      fetchOptions("grupo_produto", tenantId, "descricao", f).then(setGrupoOptions);
      fetchOptions("subgrupo_produto", tenantId, "descricao", f).then(setSubgrupoOptions);
      fetchOptions("parceiro", tenantId, "razaosocial", f).then(setParceiroOptions);
      void fetchProdutoGruposFiltro(tenantId, empresaId)
        .then((opcoes) => { if (!cancelado) setGrupoFiltroOptions(opcoes); })
        .catch((erro: unknown) => {
          if (!cancelado) toast.error(parseError(erro, "carregar grupos de produtos").title);
        });
      (async () => {
        const { data } = await (supabase as any)
          .from("subgrupo_produto")
          .select("id, descricao, grupo_id")
          .eq("tenant_id", tenantId)
          .eq("empresa_id", empresaId)
          .eq("ativo", true)
          .order("descricao");
        setSubgrupoFiltroOptions(
          (data || []).map((s: any) => ({ value: s.id, label: s.descricao, grupoId: s.grupo_id })),
        );
      })();
      (async () => {
        const { data } = await (supabase as any).rpc("fn_produto_marcas_distintas", {
          p_tenant_id: tenantId,
          p_empresa_id: empresaId,
        });
        setMarcaOptions((data || []).map((m: any) => ({ value: m.marca, label: m.marca })));
      })();
    } else {
      setGrupoOptions([]);
      setSubgrupoOptions([]);
      setParceiroOptions([]);
      setSubgrupoFiltroOptions([]);
      setMarcaOptions([]);
    }
    return () => { cancelado = true; };
  }, [tenantId, empresaId, empresaVersion]);

  const handleGrupoChange = (id: string | null) => {
    setFilterGrupoId(id);
    if (filterSubgrupoId) {
      const sg = subgrupoFiltroOptions.find((o) => o.value === filterSubgrupoId);
      if (sg && sg.grupoId !== id) setFilterSubgrupoId(null);
    }
  };

  const subgrupoOptionsFiltradas = useMemo(
    () =>
      filterGrupoId
        ? subgrupoFiltroOptions.filter((o) => o.grupoId === filterGrupoId)
        : subgrupoFiltroOptions,
    [subgrupoFiltroOptions, filterGrupoId],
  );

  const algumFiltro =
    !!filterSku || !!filterDescricao || !!filterReferencia || !!filterEan ||
    !!filterParceiroId || !!filterGrupoId || !!filterSubgrupoId || !!filterMarca;

  const limparFiltros = () => {
    setFilterSku("");
    setFilterDescricao("");
    setFilterReferencia("");
    setFilterEan("");
    setEanAplicado("");
    setFilterParceiroId(null);
    setFilterParceiroNome("");
    setFilterGrupoId(null);
    setFilterSubgrupoId(null);
    setFilterMarca(null);
  };

  const removerProduto = async (id: string) => {
    try {
      const { error } = await (supabase as any)
        .from("produto").update({ ativo: false })
        .eq("id", id).eq("tenant_id", tenantId);
      if (error) throw error;
      toast.success("Registro removido com sucesso!");
      await lista.refresh();
      return true;
    } catch (err) {
      const parsed = parseError(err, "excluir produto");
      toast.error(parsed.title, { description: parsed.technicalMessage });
      throw err;
    }
  };

  // ── Exportação ──
  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    { key: "descricao", label: "Descrição" },
    { key: "referencia", label: "Referência" },
    { key: "marca", label: "Marca" },
    { key: "parceiro_nome", label: "Parceiro" },
    { key: "grupo_descricao", label: "Grupo" },
    { key: "subgrupo_descricao", label: "Subgrupo" },
    { key: "tipo_controle", label: "Controle" },
    { key: "tipo_separacao", label: "Separação" },
    { key: "ativo", label: "Status", format: (r) => (r.ativo ? "Ativo" : "Inativo") },
  ];

  const filtrosAtivosPdf = useMemo(() => {
    const f: Record<string, string> = {};
    if (debSku.trim()) f["SKU"] = debSku.trim();
    if (debDescricao.trim()) f["Descrição"] = debDescricao.trim();
    if (debReferencia.trim()) f["Referência"] = debReferencia.trim();
    if (eanFiltro) f["EAN"] = eanFiltro;
    if (filterParceiroNome) f["Parceiro"] = filterParceiroNome;
    const g = grupoFiltroOptions.find((o) => o.value === filterGrupoId);
    if (g) f["Grupo"] = g.descricao;
    const sg = subgrupoFiltroOptions.find((o) => o.value === filterSubgrupoId);
    if (sg) f["Subgrupo"] = sg.label;
    if (filterMarca) f["Marca"] = filterMarca;
    if (filterSemEan) f["Sem código de barras"] = "Sim";
    return f;
  }, [debSku, debDescricao, debReferencia, eanFiltro, filterParceiroNome, filterGrupoId, filterSubgrupoId, filterMarca, filterSemEan, grupoFiltroOptions, subgrupoFiltroOptions]);

  const buscarTodosParaExportar = async (maxRows?: number) => {
    const toastId = "export-produtos";
    toast.loading("Exportando produtos…", { id: toastId });
    try {
      const resultado = await fetchAllProdutoListagem({
        tenantId,
        empresaId,
        filters,
        maxRows,
        onProgress: (carregados, tot) =>
          toast.loading(
            `Exportando produtos… ${carregados.toLocaleString("pt-BR")} de ${tot.toLocaleString("pt-BR")}`,
            { id: toastId },
          ),
      });
      return { ...resultado, toastId };
    } catch (err) {
      toast.error(parseError(err, "exportar produtos").title, { id: toastId });
      throw err;
    }
  };

  const executarExportExcel = async () => {
    setExportLoading("excel");
    try {
      const { rows, toastId } = await buscarTodosParaExportar();
      exportToExcel("produtos", exportColumns, rows);
      toast.success(`Excel gerado com ${rows.length.toLocaleString("pt-BR")} produtos`, { id: toastId });
    } catch {
      // toast de erro já exibido
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportExcel = () => {
    if (lista.total > 10000) setConfirmExcelOpen(true);
    else void executarExportExcel();
  };

  const executarExportPdf = async (modo: "pdf" | "print", janela?: Window | null) => {
    const cortou = lista.total > 5000;
    setExportLoading(modo);
    try {
      const { rows, total, toastId } = await buscarTodosParaExportar(cortou ? 5000 : undefined);
      if (modo === "print" && rows.length === 0) {
        janela?.close();
        toast.info("Nenhum produto para imprimir", { id: toastId });
        return;
      }
      const meta = {
        title: "Cadastro de Produtos",
        generatedAt: nowDisplay(),
        usuario: usuarioNome ?? undefined,
        total,
        filters: cortou
          ? {
              ...filtrosAtivosPdf,
              "Observação": `PDF com 5.000 de ${total.toLocaleString("pt-BR")} registros — use o Excel para a lista completa`,
            }
          : filtrosAtivosPdf,
      };
      if (modo === "pdf") exportToPdf("produtos", exportColumns, rows, meta);
      else printPdf("produtos", exportColumns, rows, meta, janela);
      if (cortou) {
        toast.warning(`PDF gerado com 5.000 de ${total.toLocaleString("pt-BR")} produtos (limite do PDF)`, { id: toastId });
      } else {
        toast.success(modo === "pdf" ? "PDF gerado" : "PDF enviado para impressão", { id: toastId });
      }
    } catch {
      janela?.close();
      // toast de erro já exibido
    } finally {
      setExportLoading(null);
    }
  };

  const handleExportPdf = (modo: "pdf" | "print") => {
    setPdfAcao(modo);
    if (lista.total > 5000) setConfirmPdfOpen(true);
    else {
      const janela = modo === "print" ? abrirJanelaImpressao() : null;
      void executarExportPdf(modo, janela);
    }
  };

  const columns: ColumnSpec[] = [
    {
      key: "tem_ean", label: "",
      className: "w-8",
      render: (r) => r.tem_ean === false ? (
        <span title="Sem código de barras cadastrado" className="inline-flex items-center justify-center w-6 h-6 rounded text-amber-500">
          <AlertTriangle size={14} />
        </span>
      ) : null,
    },
    {
      key: "url_imagem", label: "",
      className: "w-10",
      render: (r) => (
        <ProdutoImagemThumb
          url={r.url_imagem}
          alt={r.sku}
          caption={`${r.sku} — ${r.descricao}`}
          size={36}
        />
      ),
    },
    { key: "sku", label: "SKU", type: "mono" },
    { key: "descricao", label: "Descrição", render: (r) => <DescricaoCell text={r.descricao} /> },
    { key: "referencia", label: "Referência" },
    { key: "marca", label: "Marca" },
    {
      key: "parceiro_nome", label: "Parceiro",
      render: (r) => r.parceiro_nome ? (
        <span className="block truncate max-w-[220px]" title={r.parceiro_nome}>{r.parceiro_nome}</span>
      ) : "—",
    },
    { key: "tipo_controle", label: "Controle" },
    { key: "tipo_separacao", label: "Separação" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  return (
    <>
      <CrudTable
        title="Produtos"
        columns={columns}
        data={lista.data}
        loading={lista.loading}
        page={lista.page}
        totalPages={lista.totalPages}
        total={lista.total}
        pageSize={lista.pageSize}
        onPageChange={lista.setPage}
        onNew={() => { setEditItem(null); setModalOpen(true); }}
        onEdit={(row) => { setEditItem(stripListagemFields(row)); setModalOpen(true); }}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Novo Produto"
        extraFilters={
          <>
            <input
              type="text"
              value={filterSku}
              onChange={(e) => setFilterSku(e.target.value)}
              placeholder="SKU..."
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40 w-32"
            />
            <input
              type="text"
              value={filterDescricao}
              onChange={(e) => setFilterDescricao(e.target.value)}
              placeholder="Descrição..."
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40 w-40"
            />
            <input
              type="text"
              value={filterReferencia}
              onChange={(e) => setFilterReferencia(e.target.value)}
              placeholder="Referência..."
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40 w-36"
            />
            <input
              type="text"
              inputMode="numeric"
              value={filterEan}
              onChange={(e) => setFilterEan(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") setEanAplicado(filterEan); }}
              placeholder="EAN..."
              title={filterEan.trim().length > 0 && filterEan.trim().length < 3 ? "Digite ao menos 3 dígitos" : undefined}
              className="bg-secondary text-foreground text-sm rounded-lg px-3 py-2 outline-none border border-transparent focus:border-primary/40 w-40"
            />
            <div className="w-56">
              <ParceiroSearchInput
                value={filterParceiroId}
                onChange={(id, parceiro) => {
                  setFilterParceiroId(id);
                  setFilterParceiroNome(parceiro?.razaosocial ?? "");
                }}
                tenantId={tenantId}
                empresaId={empresaId}
                placeholder="Parceiro..."
              />
            </div>
            <SearchableSelectFilter
              value={filterGrupoId}
              onChange={handleGrupoChange}
              options={grupoFiltroOptions}
              placeholder={grupoFiltroOptions.length ? "Grupo..." : "Sem grupos vinculados"}
              disabled={grupoFiltroOptions.length === 0}
              title={grupoFiltroOptions.length ? undefined : "Nenhum produto desta empresa tem grupo vinculado"}
              emptyLabel="Todos os grupos"
              className="w-48"
            />
            <SearchableSelectFilter
              value={filterSubgrupoId}
              onChange={setFilterSubgrupoId}
              options={subgrupoOptionsFiltradas}
              placeholder="Subgrupo..."
              emptyLabel="Todos os subgrupos"
              className="w-48"
            />
            <SearchableSelectFilter
              value={filterMarca}
              onChange={setFilterMarca}
              options={marcaOptions}
              placeholder="Marca..."
              emptyLabel="Todas as marcas"
              className="w-44"
            />
            {algumFiltro && (
              <button
                type="button"
                onClick={limparFiltros}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Limpar filtros
              </button>
            )}
            {totalSemEan !== null && totalSemEan > 0 && (
              <button
                type="button"
                onClick={() => setFilterSemEan((v) => !v)}
                title={filterSemEan ? "Mostrando apenas produtos sem código de barras — clique para limpar" : "Filtrar produtos sem código de barras"}
                className={
                  "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors border " +
                  (filterSemEan
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                    : "bg-amber-500/5 border-amber-500/20 text-amber-500 hover:bg-amber-500/10")
                }
              >
                <AlertTriangle size={14} />
                {totalSemEan.toLocaleString("pt-BR")} sem código de barras
                {filterSemEan && <span className="ml-1 opacity-70">(filtro ativo)</span>}
              </button>
            )}
          </>
        }
        headerActions={
          <div className="flex items-center gap-2">
            <ExportActions
              onExportPdf={() => handleExportPdf("pdf")}
              onExportExcel={handleExportExcel}
              onPrint={() => handleExportPdf("print")}
              disabled={lista.total === 0 || lista.loading}
              loading={exportLoading}
              disabledTitle="Nenhum produto para exportar"
            />
            {selectedIds.size > 0 && (
              <button
                onClick={handleImprimirSelecionados}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
              >
                <Printer size={12} /> Imprimir Etiquetas ({selectedIds.size})
              </button>
            )}
            <BotaoImportarERP onClick={() => setImportOpen(true)} />
          </div>
        }
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
      />

      <ImportarDoERPModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => lista.refresh()}
        config={{
          titulo: "Importar Produto do ERP",
          labelCampo: "código do produto (SKU)",
          placeholderCampo: "Ex: 4400619",
          tipoCampo: "text",
          entidade: "produto",
          camposPrevia: [
            { label: "SKU", campo: "sku" },
            { label: "Descrição", campo: "descricao" },
            { label: "Código ERP", campo: "codigo_produto" },
            { label: "Status", campo: "ativo" },
          ],
          verRegistroPath: (id) => `/dados-mestres/produtos?id=${id}`,
        }}
      />
      {tenantId && (
        <ProdutoDetailModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setAbaInicial("cadastro"); }}
          abaInicial={abaInicial}
          produto={editItem}
          tenantId={tenantId}
          armazemId={armazemId}
          empresaId={empresaId}
          usuarioId={usuarioId}
          onSaved={lista.refresh}
          grupoOptions={grupoOptions}
          subgrupoOptions={subgrupoOptions}
          parceiroOptions={parceiroOptions}
          onNavigate={onNavigate}
        />
      )}
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? removerProduto(deleteItem.id) : false}
      />
      <PrintEtiquetaProdutoModal
        open={listPrintOpen}
        onClose={() => setListPrintOpen(false)}
        items={listPrintItems}
        onNavigate={onNavigate}
      />

      <AlertDialog open={confirmExcelOpen} onOpenChange={setConfirmExcelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exportar Excel</AlertDialogTitle>
            <AlertDialogDescription>
              Serão exportados <strong>{lista.total.toLocaleString("pt-BR")}</strong> produtos.
              Isso pode levar alguns segundos. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executarExportExcel()}>Exportar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPdfOpen} onOpenChange={setConfirmPdfOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>PDF limitado a 5.000 linhas</AlertDialogTitle>
            <AlertDialogDescription>
              O filtro atual tem <strong>{lista.total.toLocaleString("pt-BR")}</strong> produtos.
              O PDF incluirá apenas os <strong>5.000 primeiros</strong> (ordenados por descrição).
              Para a lista completa, use <strong>Exportar Excel</strong> ou refine os filtros.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmPdfOpen(false); handleExportExcel(); }}>
              Exportar Excel
            </AlertDialogAction>
            <AlertDialogAction onClick={() => {
              const janela = pdfAcao === "print" ? abrirJanelaImpressao() : null;
              void executarExportPdf(pdfAcao, janela);
            }}>
              Gerar PDF com 5.000
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
