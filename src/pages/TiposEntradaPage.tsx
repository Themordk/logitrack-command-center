import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2 } from "lucide-react";

export function TiposEntradaPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "tipo_entrada", tenantId, orderBy: "descricao", filters: { empresa_id: empresaId } });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  const prioridadeBadge = (val: string) => {
    const colors: Record<string, string> = {
      BAIXA: "bg-muted text-muted-foreground",
      NORMAL: "bg-blue-500/10 text-blue-500",
      ALTA: "bg-orange-500/10 text-orange-500",
      URGENTE: "bg-red-500/10 text-red-500",
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[val] || colors.NORMAL}`}>{val || "NORMAL"}</span>;
  };

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição" },
    { key: "codigo_erp", label: "Código ERP" },
    { key: "realiza_conferencia", label: "Realiza Conferência", type: "badge" },
    { key: "armazenagem_automatica", label: "Armazenagem Automática", type: "badge" },
    { key: "gera_mov_automatico", label: "Gera Mov. Automático", type: "badge" },
    { key: "libera_mov_automatico", label: "Libera Mov. Automático", type: "badge" },
    { key: "prioridade", label: "Prioridade", type: "custom", render: (row) => prioridadeBadge(row.prioridade) },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const openModal = (item: any | null) => {
    setEditItem(item);
    setForm(item ? { ...item } : {
      descricao: "", codigo_erp: "", prioridade: "NORMAL",
      realiza_conferencia: true,
      armazenagem_automatica: false,
      gera_mov_automatico: false, libera_mov_automatico: false,
      ativo: true,
    });
    setModalOpen(true);
  };

  const set = (name: string, value: any) => setForm((p) => ({ ...p, [name]: value }));

  const handleSave = async () => {
    if (!form.descricao) return;
    setSaving(true);
    const payload: any = { ...form, empresa_id: empresaId };
    const ok = editItem
      ? await crud.update(editItem.id, payload)
      : await crud.create(payload);
    setSaving(false);
    if (ok) setModalOpen(false);
  };

  const inputClass = "w-full h-10 px-3 rounded-lg border border-border bg-secondary/40 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30";
  const sectionClass = "space-y-3 p-4 rounded-lg border border-border/50 bg-secondary/20";
  const sectionTitleClass = "text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3";

  return (
    <>
      <CrudTable
        title="Tipos de Entrada"
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
        onNew={() => openModal(null)}
        onEdit={(row) => openModal(row)}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Novo Tipo de Entrada"
      />

      <Sheet open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl !p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 py-4 border-b border-border shrink-0">
            <SheetTitle>{editItem ? "Editar Tipo de Entrada" : "Novo Tipo de Entrada"}</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-5">
            {/* ── Dados gerais ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Dados gerais</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Descrição *</label>
                  <input value={form.descricao || ""} onChange={(e) => set("descricao", e.target.value)} placeholder="Tipo de entrada" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Código ERP</label>
                  <input value={form.codigo_erp || ""} onChange={(e) => set("codigo_erp", e.target.value)} placeholder="Código no ERP" className={inputClass} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Prioridade *</label>
                  <select value={form.prioridade || "NORMAL"} onChange={(e) => set("prioridade", e.target.value)} className={inputClass}>
                    {["BAIXA", "NORMAL", "ALTA", "URGENTE"].map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Conferência ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Conferência</p>
              <div className="flex items-center gap-3">
                <Switch checked={!!form.realiza_conferencia} onCheckedChange={(v) => set("realiza_conferencia", v)} />
                <label className="text-sm text-foreground">Realiza conferência</label>
              </div>
            </div>

            {/* ── Armazenagem ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Armazenagem</p>
              <div className="flex items-center gap-3">
                <Switch checked={!!form.armazenagem_automatica} onCheckedChange={(v) => set("armazenagem_automatica", v)} />
                <label className="text-sm text-foreground">Armazenagem automática</label>
              </div>
            </div>

            {/* ── Automação ── */}
            <div className={sectionClass}>
              <p className={sectionTitleClass}>Automação</p>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.gera_mov_automatico} onCheckedChange={(v) => set("gera_mov_automatico", v)} />
                  <label className="text-sm text-foreground">Gera movimento automático</label>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={!!form.libera_mov_automatico} onCheckedChange={(v) => set("libera_mov_automatico", v)} />
                  <label className="text-sm text-foreground">Libera movimento automático</label>
                </div>
              </div>
            </div>

            {/* ── Status ── */}
            <div className="flex items-center gap-3 px-4">
              <Switch checked={form.ativo !== false} onCheckedChange={(v) => set("ativo", v)} />
              <label className="text-sm text-foreground font-medium">Ativo</label>
            </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t border-border shrink-0 flex-row justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>


      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
    </>
  );
}
