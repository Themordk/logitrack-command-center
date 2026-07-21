import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { supabase } from "@/integrations/supabase/client";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Printer, Save, Loader2, AlertCircle } from "lucide-react";
import { PrintEtiquetaHUModal } from "@/components/etiqueta/PrintEtiquetaHUModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function HUsPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({
    table: "hu",
    tenantId,
    orderBy: "codigo_hu",
    filters: empresaId ? { empresa_id: empresaId } : {},
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // Selection & Print
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printHUs, setPrintHUs] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);

  // Form state
  const [form, setForm] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handlePrintSelected = () => {
    const selected = crud.data.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setPrintHUs(selected);
    setPrintOpen(true);
  };

  const handlePrintSingle = (row: any) => {
    setPrintHUs([row]);
    setPrintOpen(true);
  };

  const statusMap: Record<string, { color: string; label: string }> = {
    ABERTA: { color: "text-blue-400", label: "Aberta" },
    FECHADA: { color: "text-yellow-400", label: "Fechada" },
    EM_TRANSITO: { color: "text-purple-400", label: "Em Trânsito" },
    ARMAZENADA: { color: "text-green-400", label: "Armazenada" },
    EXPEDIDA: { color: "text-gray-400", label: "Expedida" },
    DESCARTADA: { color: "text-red-400", label: "Descartada" },
  };

  const columns: ColumnSpec[] = [
    { key: "codigo_hu", label: "Código HU", type: "mono" },
    { key: "tipo_hu", label: "Tipo" },
    { key: "tamanho", label: "Tamanho" },
    { key: "status", label: "Status", render: (row) => {
      const s = statusMap[row.status] || { color: "text-gray-400", label: row.status || "—" };
      return <span className={`text-xs font-bold ${s.color}`}>{s.label}</span>;
    }},
    { key: "disponibilidade", label: "Disponibilidade", render: (row) => {
      const map: Record<string, number> = { DISPONIVEL: 0, RESERVADA: 1, BLOQUEADA: 2, EM_MOVIMENTO: 3, DESCARTADA: 4 };
      return <StatusBadge status={map[row.disponibilidade] ?? 0} type="hu-disponibilidade" />;
    }},
    { key: "peso_bruto", label: "Peso Bruto", type: "number" },
    { key: "created_at", label: "Criada em", render: (row) => {
      if (!row.created_at) return "—";
      return new Date(row.created_at).toLocaleDateString("pt-BR");
    }},
  ];

  const openNewModal = () => {
    setEditItem(null);
    setForm({
      tipo_hu: "",
      tamanho: "",
      altura: "",
      peso_bruto: "",
      m3: "",
      disponibilidade: "DISPONIVEL",
      quantidade: 1,
    });
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (row: any) => {
    setEditItem(row);
    setForm({
      tipo_hu: row.tipo_hu || "",
      tamanho: row.tamanho || "",
      altura: row.altura ?? "",
      peso_bruto: row.peso_bruto ?? "",
      m3: row.m3 ?? "",
      disponibilidade: row.disponibilidade || "DISPONIVEL",
      quantidade: 1,
    });
    setErrors({});
    setModalOpen(true);
  };

  const set = (name: string, value: any) => {
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((e) => { const n = { ...e }; delete n[name]; return n; });
  };

  const generateCodigoHU = async (count: number): Promise<string[]> => {
    const { data } = await (supabase as any)
      .from("hu")
      .select("codigo_hu")
      .eq("tenant_id", tenantId!)
      .like("codigo_hu", "HU-%")
      .order("codigo_hu", { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (data && data.length > 0 && data[0].codigo_hu) {
      const match = data[0].codigo_hu.match(/HU-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    return Array.from({ length: count }, (_, i) =>
      `HU-${String(nextNum + i).padStart(9, "0")}`
    );
  };

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.tipo_hu) errs.tipo_hu = "Campo obrigatório";
    if (!form.tamanho) errs.tamanho = "Campo obrigatório";
    if (!editItem) {
      const qty = parseInt(form.quantidade, 10);
      if (!qty || qty < 1) errs.quantidade = "Mínimo 1";
      if (qty > 500) errs.quantidade = "Máximo 500";
    }
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    try {
      const baseData: Record<string, any> = {
        tipo_hu: form.tipo_hu,
        tamanho: form.tamanho,
        disponibilidade: form.disponibilidade || "DISPONIVEL",
        altura: form.altura !== "" ? Number(form.altura) : null,
        peso_bruto: form.peso_bruto !== "" ? Number(form.peso_bruto) : null,
        m3: form.m3 !== "" ? Number(form.m3) : null,
      };

      if (editItem) {
        const { error } = await (supabase as any).from("hu").update(baseData).eq("id", editItem.id);
        if (error) throw error;
        toast.success("HU atualizada com sucesso!");
      } else {
        const qty = parseInt(form.quantidade, 10) || 1;
        const codigos = await generateCodigoHU(qty);
        const records = codigos.map((codigo) => ({
          ...baseData,
          codigo_hu: codigo,
          tenant_id: tenantId,
          empresa_id: empresaId,
        }));
        const { error } = await (supabase as any).from("hu").insert(records);
        if (error) throw error;
        toast.success(`${qty} HU(s) gerada(s) com sucesso!`);
      }
      await crud.refresh();
      setModalOpen(false);
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (name: string) => cn(
    "w-full h-10 px-3 rounded-lg border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors",
    errors[name] ? "border-destructive" : "border-border",
    "focus:border-primary focus:ring-1 focus:ring-primary/30"
  );

  return (
    <>
      <CrudTable
        title="Unidades de Handling (HUs)"
        columns={columns}
        data={crud.data}
        loading={crud.loading}
        search={crud.search}
        onSearchChange={crud.setSearch}
        page={crud.page}
        totalPages={crud.totalPages}
        total={crud.total}
        pageSize={crud.pageSize}
        onPageChange={crud.setPage}
        onNew={openNewModal}
        onEdit={openEditModal}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Nova HU"
        searchPlaceholder="Buscar HU..."
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        headerActions={
          selectedIds.size > 0 ? (
            <button
              onClick={handlePrintSelected}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/50 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              <Printer size={15} />
              Imprimir HU ({selectedIds.size})
            </button>
          ) : undefined
        }
        extraRowActions={(row) => (
          <button
            onClick={() => handlePrintSingle(row)}
            className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            title="Imprimir etiqueta HU"
          >
            <Printer size={13} />
          </button>
        )}
      />

      {/* Custom Modal */}
      <Dialog open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? "Editar HU" : "Gerar HU"}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            {/* Tipo HU */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Tipo HU<span className="text-destructive ml-0.5">*</span>
              </label>
              <select value={form.tipo_hu || ""} onChange={(e) => set("tipo_hu", e.target.value)}
                className={cn(fieldClass("tipo_hu"), "cursor-pointer", !form.tipo_hu && "text-muted-foreground")}>
                <option value="">Selecionar...</option>
                {["PALLET", "CAIXA", "VOLUME", "OUTRO"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {errors.tipo_hu && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {errors.tipo_hu}</p>}
            </div>

            {/* Tamanho */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                Tamanho<span className="text-destructive ml-0.5">*</span>
              </label>
              <select value={form.tamanho || ""} onChange={(e) => set("tamanho", e.target.value)}
                className={cn(fieldClass("tamanho"), "cursor-pointer", !form.tamanho && "text-muted-foreground")}>
                <option value="">Selecionar...</option>
                {["P", "M", "G", "GG", "EG"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
              {errors.tamanho && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {errors.tamanho}</p>}
            </div>

            {/* Altura */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Altura</label>
              <input type="number" step="any" value={form.altura ?? ""} onChange={(e) => set("altura", e.target.value)} placeholder="cm" className={fieldClass("altura")} />
            </div>

            {/* Peso Bruto */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Peso Bruto</label>
              <input type="number" step="any" value={form.peso_bruto ?? ""} onChange={(e) => set("peso_bruto", e.target.value)} placeholder="kg" className={fieldClass("peso_bruto")} />
            </div>

            {/* M³ */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">M³</label>
              <input type="number" step="any" value={form.m3 ?? ""} onChange={(e) => set("m3", e.target.value)} placeholder="m³" className={fieldClass("m3")} />
            </div>

            {/* Disponibilidade */}
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">Disponibilidade</label>
              <select value={form.disponibilidade || "DISPONIVEL"} onChange={(e) => set("disponibilidade", e.target.value)}
                className={cn(fieldClass("disponibilidade"), "cursor-pointer")}>
                {["DISPONIVEL", "RESERVADA", "BLOQUEADA", "EM_MOVIMENTO", "DESCARTADA"].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Quantidade - only for new */}
            {!editItem && (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wide">
                  Quantidade a gerar<span className="text-destructive ml-0.5">*</span>
                </label>
                <input type="number" min={1} max={500} step={1} value={form.quantidade ?? 1}
                  onChange={(e) => set("quantidade", e.target.value)} placeholder="Quantidade de HUs a gerar"
                  className={fieldClass("quantidade")} />
                {errors.quantidade && <p className="flex items-center gap-1 mt-1 text-xs text-destructive"><AlertCircle size={11} /> {errors.quantidade}</p>}
                <p className="text-xs text-muted-foreground mt-1">Códigos HU serão gerados automaticamente pelo sistema.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <button onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Salvando..." : editItem ? "Salvar" : "Gerar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
      <PrintEtiquetaHUModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintHUs([]); }}
        hus={printHUs}
      />
    </>
  );
}
