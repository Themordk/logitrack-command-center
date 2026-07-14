import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function OcorrenciaSlaConfigPage() {
  const { tenantId, armazemId } = useTenant();
  const crud = useCrud({ table: "ocorrencia_sla_config", tenantId, orderBy: "prioridade" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const columns: ColumnSpec[] = [
    {
      key: "prioridade",
      label: "Prioridade",
      render: (row) => {
        const badges: Record<string, string> = {
          BAIXA: "bg-gray-500/15 text-gray-400 border-gray-500/30",
          NORMAL: "bg-blue-500/15 text-blue-400 border-blue-500/30",
          ALTA: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
          CRITICA: "bg-red-500/15 text-red-400 border-red-500/30",
        };
        return (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${badges[row.prioridade] || ""}`}>
            {row.prioridade}
          </span>
        );
      },
    },
    { key: "sla_horas", label: "SLA (horas)" },
    {
      key: "notificar_percentual",
      label: "Alerta em (%)",
      render: (row) => `${row.notificar_percentual ?? "—"}%`,
    },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    {
      name: "prioridade",
      label: "Prioridade",
      type: "enum",
      required: true,
      enumValues: ["BAIXA", "NORMAL", "ALTA", "CRITICA"],
    },
    {
      name: "sla_horas",
      label: "SLA (horas)",
      type: "number",
      required: true,
      placeholder: "Ex: 24",
    },
    {
      name: "notificar_percentual",
      label: "Notificar em (%)",
      type: "number",
      required: true,
      defaultValue: 80,
      placeholder: "Ex: 80",
    },
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
        title="SLA de Ocorrências"
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
        newLabel="Novo SLA"
        searchPlaceholder="Buscar SLA..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar SLA" : "Novo SLA"}
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
