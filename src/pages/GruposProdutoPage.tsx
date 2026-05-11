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
          labelCampo: "código do grupo no ERP",
          placeholderCampo: "Ex: 1001",
          tipoCampo: "text",
          entidade: "redirect_sync",
          mensagemRedirect:
            "A importação de grupos é feita automaticamente pelo sincronizador de cadastros. Acesse Configurações > Integração ERP > Sincronização e execute manualmente a entidade 'grupo_produto'.",
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
