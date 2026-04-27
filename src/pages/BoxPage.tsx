import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function BoxPage() {
  const { tenantId, armazemId, empresaVersion } = useTenant();
  const crud = useCrud({ table: "box", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [tipoBoxOptions, setTipoBoxOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId) {
      // tipo_box é cadastro do tenant — não filtra por armazém aqui
      fetchOptions("tipo_box", tenantId, "descricao").then(setTipoBoxOptions);
    } else {
      setTipoBoxOptions([]);
    }
    setModalOpen(false);
    setEditItem(null);
  }, [tenantId, armazemId, empresaVersion]);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição", type: "mono" },
    { key: "tipo_box_id", label: "Tipo Box", render: (row) => {
      const opt = tipoBoxOptions.find((o) => o.value === row.tipo_box_id);
      return <span className="text-sm text-muted-foreground">{opt?.label || row.tipo_box_id || "—"}</span>;
    }},
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Nome do box" },
    { name: "tipo_box_id", label: "Tipo Box", type: "select", required: true, options: tipoBoxOptions },
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
        title="Box"
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
        newLabel="Novo Box"
        searchPlaceholder="Buscar box..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Box" : "Novo Box"}
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
