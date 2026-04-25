import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Trash2, Loader2, Link2 } from "lucide-react";

export function ZonasAtividadePage() {
  const { tenantId, armazemId, empresaVersion } = useTenant();
  const crud = useCrud({ table: "zona_atividade", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const [vinculoZona, setVinculoZona] = useState<any>(null);
  const [vinculos, setVinculos] = useState<any[]>([]);
  const [vinculoLoading, setVinculoLoading] = useState(false);
  const [addEndOpen, setAddEndOpen] = useState(false);
  const [enderecoOptions, setEnderecoOptions] = useState<{ value: string; label: string }[]>([]);
  const [selectedEnderecos, setSelectedEnderecos] = useState<string[]>([]);

  // Resetar estado local ao trocar empresa/armazém
  useEffect(() => {
    setVinculoZona(null);
    setVinculos([]);
    setAddEndOpen(false);
    setSelectedEnderecos([]);
    setModalOpen(false);
    setEditItem(null);
  }, [tenantId, armazemId, empresaVersion]);

  const loadVinculos = async (zonaId: string) => {
    setVinculoLoading(true);
    const { data, error } = await (supabase as any)
      .from("endereco_zona_atividade")
      .select("id, endereco_id, endereco:endereco_id(descricao)")
      .eq("zona_atividade_id", zonaId)
      .eq("tenant_id", tenantId);
    if (!error) setVinculos(data || []);
    setVinculoLoading(false);
  };

  const openVinculos = (zona: any) => {
    setVinculoZona(zona);
    loadVinculos(zona.id);
  };

  const loadEnderecoOptions = async () => {
    if (!tenantId || !armazemId) return;
    const { data } = await (supabase as any).from("endereco").select("id, descricao").eq("tenant_id", tenantId).eq("armazem_id", armazemId).eq("ativo", true).order("descricao");
    const existingIds = new Set(vinculos.map((v: any) => v.endereco_id));
    setEnderecoOptions((data || []).filter((e: any) => !existingIds.has(e.id)).map((e: any) => ({ value: e.id, label: e.descricao })));
  };

  const addVinculos = async () => {
    if (selectedEnderecos.length === 0 || !vinculoZona) return;
    const inserts = selectedEnderecos.map((endId) => ({
      endereco_id: endId,
      zona_atividade_id: vinculoZona.id,
      tenant_id: tenantId,
    }));
    const { error } = await (supabase as any).from("endereco_zona_atividade").insert(inserts);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success("Endereços vinculados!");
    setSelectedEnderecos([]);
    setAddEndOpen(false);
    loadVinculos(vinculoZona.id);
  };

  const removeVinculo = async (vinculoId: string) => {
    const { error } = await (supabase as any).from("endereco_zona_atividade").delete().eq("id", vinculoId);
    if (error) { toast.error(`Erro: ${error.message}`); return; }
    toast.success("Vínculo removido!");
    if (vinculoZona) loadVinculos(vinculoZona.id);
  };

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição" },
    { key: "tipo_grupo", label: "Tipo" },
    { key: "Ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Ex: Zona Picking A" },
    { name: "tipo_grupo", label: "Tipo do Grupo", type: "enum", required: true, enumValues: ["PICKING", "ARMAZENAGEM", "INVENTARIO"] },
    { name: "Ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleSave = async (data: Record<string, any>) => {
    if (armazemId) data.armazem_id = armazemId;
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
      <CrudTable
        title="Zonas de Atividade"
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
        onNew={() => { setEditItem(null); setModalOpen(true); }}
        onEdit={(row) => { setEditItem(row); setModalOpen(true); }}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Nova Zona"
        extraRowActions={(row) => (
          <button
            onClick={() => openVinculos(row)}
            className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
            title="Gerenciar Vínculos"
          >
            <Link2 size={13} />
          </button>
        )}
      />

      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Zona" : "Nova Zona"}
        fields={fields}
        initialData={editItem}
        onSave={handleSave}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id, false) : false}
      />

      <Dialog open={!!vinculoZona} onOpenChange={(v) => !v && setVinculoZona(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Endereços Vinculados – {vinculoZona?.descricao}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <button
              onClick={() => { loadEnderecoOptions(); setAddEndOpen(true); }}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={14} /> Adicionar Endereço
            </button>
            {vinculoLoading ? (
              <div className="flex items-center justify-center py-8"><Loader2 size={20} className="animate-spin text-primary" /></div>
            ) : vinculos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum endereço vinculado.</p>
            ) : (
              <div className="space-y-1">
                {vinculos.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30 border border-border">
                    <span className="font-mono text-sm text-foreground">{v.endereco?.descricao ?? v.endereco_id}</span>
                    <button onClick={() => removeVinculo(v.id)} className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addEndOpen} onOpenChange={(v) => !v && setAddEndOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Endereços</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <select
              multiple
              value={selectedEnderecos}
              onChange={(e) => setSelectedEnderecos(Array.from(e.target.selectedOptions, (o) => o.value))}
              className="w-full h-48 rounded-lg border border-border bg-secondary/40 text-sm text-foreground p-2"
            >
              {enderecoOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Segure Ctrl/Cmd para selecionar múltiplos.</p>
            <button
              onClick={addVinculos}
              disabled={selectedEnderecos.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Vincular {selectedEnderecos.length} endereço(s)
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
