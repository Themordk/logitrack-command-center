import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function TiposEstoquePage() {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "tipo_estoque", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId) fetchOptions("armazem", tenantId).then(setArmazemOptions);
  }, [tenantId]);

  const columns: ColumnSpec[] = [
    { key: "codigo_erp", label: "Código", type: "mono" },
    { key: "descricao", label: "Descrição" },
    { key: "sigla", label: "Sigla" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "armazem_id", label: "Armazém", type: "select", required: true, options: armazemOptions },
    { name: "codigo_erp", label: "Código ERP", type: "text", required: true, placeholder: "Ex: TE-001" },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Ex: Estoque Regular" },
    { name: "sigla", label: "Sigla", type: "text", placeholder: "Ex: REG" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

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
        onSave={async (data) => editItem ? crud.update(editItem.id, data) : crud.create(data)}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
    </>
  );
}
