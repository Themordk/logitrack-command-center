import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function VeiculosPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "veiculos", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const columns: ColumnSpec[] = [
    { key: "placa", label: "Placa", type: "mono" },
    { key: "descricao", label: "Descrição" },
    { key: "tipo_veiculo", label: "Tipo" },
    { key: "ano", label: "Ano" },
    { key: "peso_total", label: "Peso Total", type: "number" },
    { key: "m3", label: "M³", type: "number" },
    { key: "total_pallet", label: "Pallets", type: "number" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "placa", label: "Placa", type: "text", required: true, placeholder: "ABC-1234" },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Descrição do veículo" },
    { name: "tipo_veiculo", label: "Tipo de Veículo", type: "enum", required: true, enumValues: ["VUC", "3/4", "TOCO", "TRUCK", "BITRUCK", "BITREM", "RODOTREM", "OUTROS"] },
    { name: "ano", label: "Ano", type: "number", required: true, placeholder: "2024" },
    { name: "peso_total", label: "Peso Total (kg)", type: "number", placeholder: "25000" },
    { name: "m3", label: "Capacidade M³", type: "number", placeholder: "90" },
    { name: "total_pallet", label: "Total Pallets", type: "number", placeholder: "30" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleSave = async (data: Record<string, any>) => {
    if (empresaId) data.empresa_id = empresaId;
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
      <CrudTable
        title="Veículos"
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
        newLabel="Novo Veículo"
        searchPlaceholder="Buscar por placa ou descrição..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Veículo" : "Novo Veículo"}
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
