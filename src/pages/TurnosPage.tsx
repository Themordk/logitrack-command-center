import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function TurnosPage() {
  const { tenantId, armazemId } = useTenant();
  const crud = useCrud({ table: "turnos", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição", type: "mono" },
    { key: "hora_inicio", label: "Início" },
    { key: "hora_fim", label: "Fim" },
    { key: "tempo_intervalo", label: "Intervalo (min)", type: "number" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Nome do turno" },
    { name: "hora_inicio", label: "Hora Início", type: "text", required: true, placeholder: "08:00" },
    { name: "hora_fim", label: "Hora Fim", type: "text", required: true, placeholder: "17:00" },
    { name: "tempo_intervalo", label: "Intervalo (min)", type: "number", required: true, placeholder: "60" },
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
        title="Turnos"
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
        newLabel="Novo Turno"
        searchPlaceholder="Buscar turno..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Turno" : "Novo Turno"}
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
