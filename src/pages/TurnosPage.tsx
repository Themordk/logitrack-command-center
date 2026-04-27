import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function TurnosPage() {
  const { tenantId, empresaId, armazemId, empresaVersion } = useTenant();
  const crud = useCrud({ table: "turnos", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId && empresaId) {
      fetchOptions("armazem", tenantId, "descricao", { empresa_id: empresaId }).then(setArmazemOptions);
    } else {
      setArmazemOptions([]);
    }
  }, [tenantId, empresaId, empresaVersion]);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição", type: "mono" },
    { key: "armazem_id", label: "Armazém", render: (row) => {
      const opt = armazemOptions.find((o) => o.value === row.armazem_id);
      return <span className="text-sm text-muted-foreground">{opt?.label || "—"}</span>;
    }},
    { key: "hora_inicio", label: "Início" },
    { key: "hora_fim", label: "Fim" },
    { key: "tempo_intervalo", label: "Intervalo (min)", type: "number" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = useMemo(() => [
    {
      name: "armazem_id",
      label: "Armazém",
      type: "select",
      required: true,
      options: armazemOptions,
      placeholder: "Selecione o armazém...",
      defaultValue: armazemId || "",
    },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Nome do turno" },
    { name: "hora_inicio", label: "Hora Início", type: "text", required: true, placeholder: "08:00" },
    { name: "hora_fim", label: "Hora Fim", type: "text", required: true, placeholder: "17:00" },
    { name: "tempo_intervalo", label: "Intervalo (min)", type: "number", required: true, placeholder: "60" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ], [armazemOptions, armazemId]);

  const handleSave = async (data: Record<string, any>) => {
    // armazem_id vem do form
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
