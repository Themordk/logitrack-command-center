import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function EmpresasPage() {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "empresa", tenantId, orderBy: "razaosocial", searchFields: ["razaosocial", "cnpj", "codigo"] });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const columns: ColumnSpec[] = [
    { key: "codigo", label: "Código" },
    { key: "razaosocial", label: "Razão Social" },
    { key: "cnpj", label: "CNPJ" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "codigo", label: "Código", type: "text", placeholder: "Código da Empresa" },
    { name: "razaosocial", label: "Razão Social", type: "text", required: true, placeholder: "Razão Social da Empresa" },
    { name: "cnpj", label: "CNPJ", type: "text", required: true, placeholder: "00.000.000/0001-00" },
    // Plano HU — H7: formato do código das HUs da empresa (a geração é sempre do banco)
    { name: "hu_formato_codigo", label: "Código da HU", type: "select", required: true, defaultValue: "PADRAO",
      options: [{ value: "PADRAO", label: "Padrão (HU-000000001)" }, { value: "SSCC", label: "SSCC GS1 (18 dígitos)" }] },
    { name: "gs1_prefixo", label: "Prefixo GS1 da empresa", type: "text", placeholder: "7 a 10 dígitos",
      visibleWhen: (f) => f.hu_formato_codigo === "SSCC", requiredWhen: (f) => f.hu_formato_codigo === "SSCC" },
    { name: "gs1_digito_extensao", label: "Dígito de extensão SSCC (0 a 9)", type: "number", defaultValue: 0, step: "1",
      visibleWhen: (f) => f.hu_formato_codigo === "SSCC", requiredWhen: (f) => f.hu_formato_codigo === "SSCC" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Empresas"
        columns={columns}
        data={crud.data}
        loading={crud.loading}
        search={crud.search}
        onSearchChange={(s) => crud.setSearch(s)}
        page={crud.page}
        totalPages={crud.totalPages}
        total={crud.total}
        pageSize={crud.pageSize}
        onPageChange={crud.setPage}
        onNew={() => { setEditItem(null); setModalOpen(true); }}
        onEdit={(row) => { setEditItem(row); setModalOpen(true); }}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Nova Empresa"
        searchPlaceholder="Buscar empresa..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Empresa" : "Nova Empresa"}
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
