import { useEffect, useMemo, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function SetoresPage() {
  const { tenantId, empresaId, armazemId } = useTenant();
  const crud = useCrud({ table: "setor", tenantId, orderBy: "descricao" });
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
  }, [tenantId, empresaId]);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição" },
    { key: "tipo", label: "Tipo" },
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
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Ex: Setor A – Recebimento" },
    { name: "tipo", label: "Tipo", type: "enum", enumValues: ["PICKING", "PULMAO", "RECEBIMENTO", "QUARENTENA", "EXPEDICAO"] },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ], [armazemOptions, armazemId]);

  const handleSave = async (data: Record<string, any>) => {
    // armazem_id vem do formulário; useCrud só injeta o do contexto quando vazio.
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
      <CrudTable
        title="Setores"
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
        newLabel="Novo Setor"
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Setor" : "Novo Setor"}
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
