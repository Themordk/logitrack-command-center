import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { ImportarDoERPModal, BotaoImportarERP } from "@/components/erp/ImportarDoERPModal";

export function SubgruposPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({
    table: "subgrupo_produto",
    tenantId,
    orderBy: "descricao",
    filters: empresaId ? { empresa_id: empresaId } : {},
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [grupoOptions, setGrupoOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId) {
      fetchOptions("grupo_produto", tenantId, "descricao", empresaId ? { empresa_id: empresaId } : undefined).then(setGrupoOptions);
    }
  }, [tenantId, empresaId]);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição", type: "mono" },
    { key: "grupo_id", label: "Grupo", render: (row) => {
      const opt = grupoOptions.find((o) => o.value === row.grupo_id);
      return <span className="text-sm text-muted-foreground">{opt?.label || "—"}</span>;
    }},
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Nome do subgrupo" },
    { name: "grupo_id", label: "Grupo", type: "select", required: true, options: grupoOptions },
    { name: "codigo_erp", label: "Código ERP", type: "text", placeholder: "Ex: 2001" },
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
        title="Subgrupos de Produtos"
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
        newLabel="Novo Subgrupo"
        searchPlaceholder="Buscar subgrupo..."
        headerActions={<BotaoImportarERP onClick={() => setImportOpen(true)} />}
      />
      <ImportarDoERPModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onSuccess={() => crud.refresh()}
        config={{
          titulo: "Importar Subgrupo de Produto do ERP",
          labelCampo: "código do subgrupo no ERP",
          placeholderCampo: "Ex: 2001",
          tipoCampo: "text",
          entidade: "redirect_sync",
          mensagemRedirect:
            "A importação de subgrupos é feita automaticamente pelo sincronizador de cadastros. Acesse Configurações > Integração ERP > Sincronização e execute manualmente a entidade 'subgrupo_produto'.",
        }}
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Subgrupo" : "Novo Subgrupo"}
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
