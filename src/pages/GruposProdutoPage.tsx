import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { ImportarDoERPModal, BotaoImportarERP } from "@/components/erp/ImportarDoERPModal";

export function GruposProdutoPage() {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "grupo_produto", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Ex: Eletrônicos" },
    { name: "codigo_erp", label: "Código ERP", type: "text", placeholder: "Ex: 11209768439" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Grupos de Produto"
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
        newLabel="Novo Grupo"
        headerActions={<BotaoImportarERP onClick={() => setImportOpen(true)} />}
      />
      <ImportarDoERPModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => crud.refresh()}
        config={{
          titulo: "Importar Grupo de Produto do ERP",
          labelCampo: "código do grupo no Omie",
          placeholderCampo: "Ex: 11209768439",
          tipoCampo: "number",
          entidade: "grupo_produto",
          camposPrevia: [
            { label: "Nome do Grupo", campo: "descricao" },
            { label: "Código ERP", campo: "codigo_erp" },
            { label: "Status", campo: "ativo" },
          ],
        }}
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Grupo" : "Novo Grupo"}
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
