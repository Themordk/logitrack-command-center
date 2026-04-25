import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function TiposEstoquePage() {
  const { tenantId, armazemId } = useTenant();
  const crud = useCrud({ table: "tipo_estoque", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const columns: ColumnSpec[] = [
    { key: "codigo_erp", label: "Código", type: "mono" },
    { key: "descricao", label: "Descrição" },
    { key: "sigla", label: "Sigla" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "codigo_erp", label: "Código ERP", type: "text", required: true, placeholder: "Ex: TE-001" },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Ex: Estoque Regular" },
    { name: "sigla", label: "Sigla", type: "text", placeholder: "Ex: REG" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleSave = async (data: Record<string, any>) => {
    if (armazemId) data.armazem_id = armazemId;
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
      <CrudTable
        title="Tipos de Estoque"
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
        newLabel="Novo Tipo"
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Tipo de Estoque" : "Novo Tipo de Estoque"}
        fields={fields}
        initialData={editItem}
        onSave={handleSave}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
    </>
  );
}
