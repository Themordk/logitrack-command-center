import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

const TIPO_BOX_VALUES = ["RECEBIMENTO", "SEPARACAO", "EXPEDICAO"];

export function BoxPage() {
  const { tenantId, armazemId, empresaId, empresaVersion } = useTenant();
  const crud = useCrud({ table: "box", tenantId, orderBy: "descricao" });
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
    { key: "tipo_box", label: "Tipo Box", render: (row) => (
      <span className="text-sm text-muted-foreground">{row.tipo_box || "—"}</span>
    )},
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Nome do box" },
    { name: "armazem_id", label: "Armazém", type: "select", required: true, options: armazemOptions, defaultValue: armazemId || "" },
    { name: "tipo_box", label: "Tipo Box", type: "enum", required: true, enumValues: TIPO_BOX_VALUES },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleSave = async (data: Record<string, any>) => {
    delete data.tipo_box_id;
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
