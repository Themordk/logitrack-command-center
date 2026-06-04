import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function TiposSaidaPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "tipo_saida", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição" },
    { key: "caderp", label: "Código ERP" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Tipo de saída" },
    { name: "caderp", label: "Código ERP", type: "text", placeholder: "Código no ERP" },
    { name: "realiza_conferencia", label: "Realiza Conferência", type: "switch", defaultValue: true },
    {
      name: "conferencia_checkout",
      label: "Conferência Checkout",
      type: "switch",
      defaultValue: false,
      disabledWhen: (f) => !f.realiza_conferencia,
    },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Tipos de Saída"
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
        newLabel="Novo Tipo de Saída"
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Tipo de Saída" : "Novo Tipo de Saída"}
        fields={fields}
        initialData={editItem}
        onSave={async (data) => {
          const payload: any = { ...data, empresa_id: empresaId };
          if (!payload.realiza_conferencia) payload.conferencia_checkout = false;
          return editItem ? crud.update(editItem.id, payload) : crud.create(payload);
        }}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
    </>
  );
}
