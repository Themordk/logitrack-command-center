import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function ParceirosPage() {
  const { tenantId, empresaId, armazemId, empresaVersion } = useTenant();
  const crud = useCrud({ table: "parceiro", tenantId, orderBy: "razaosocial" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [rotaOptions, setRotaOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId && empresaId && armazemId) {
      fetchOptions("rotas", tenantId, "descricao", { empresa_id: empresaId, armazem_id: armazemId }).then(setRotaOptions);
    } else {
      setRotaOptions([]);
    }
    setModalOpen(false);
    setEditItem(null);
  }, [tenantId, empresaId, armazemId, empresaVersion]);

  const columns: ColumnSpec[] = [
    { key: "razaosocial", label: "Razão Social" },
    { key: "cnpj", label: "CNPJ" },
    { key: "tipo_parceiro", label: "Tipo" },
    { key: "cidade", label: "Cidade" },
    { key: "estado", label: "UF" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "razaosocial", label: "Razão Social", type: "text", required: true, placeholder: "Razão Social" },
    { name: "cnpj", label: "CNPJ", type: "text", required: true, placeholder: "00.000.000/0001-00" },
    { name: "tipo_parceiro", label: "Tipo de Parceiro", type: "enum", required: true, enumValues: ["CLIENTE", "FORNECEDOR", "TRANSPORTADOR"] },
    { name: "endereco", label: "Endereço", type: "text", required: true, placeholder: "Rua, número" },
    { name: "bairro", label: "Bairro", type: "text", required: true, placeholder: "Bairro" },
    { name: "cidade", label: "Cidade", type: "text", required: true, placeholder: "Cidade" },
    { name: "estado", label: "Estado", type: "text", required: true, placeholder: "UF" },
    { name: "rota_id", label: "Rota", type: "select", options: rotaOptions, placeholder: "Opcional" },
    { name: "dias_shelf", label: "Dias Shelf", type: "number", placeholder: "Ex: 30" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Parceiros"
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
        newLabel="Novo Parceiro"
        searchPlaceholder="Buscar por razão social..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Parceiro" : "Novo Parceiro"}
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
