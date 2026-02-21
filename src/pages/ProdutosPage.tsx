import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function ProdutosPage() {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "produto", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [empresaOptions, setEmpresaOptions] = useState<{ value: string; label: string }[]>([]);
  const [grupoOptions, setGrupoOptions] = useState<{ value: string; label: string }[]>([]);
  const [subgrupoOptions, setSubgrupoOptions] = useState<{ value: string; label: string }[]>([]);
  const [parceiroOptions, setParceiroOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId) {
      fetchOptions("empresa", tenantId, "razaosocial").then(setEmpresaOptions);
      fetchOptions("grupo_produto", tenantId).then(setGrupoOptions);
      fetchOptions("subgrupo_produto", tenantId).then(setSubgrupoOptions);
      fetchOptions("parceiro", tenantId, "razaosocial").then(setParceiroOptions);
    }
  }, [tenantId]);

  const columns: ColumnSpec[] = [
    { key: "sku", label: "SKU", type: "mono" },
    { key: "descricao", label: "Descrição" },
    { key: "referencia", label: "Referência" },
    { key: "marca", label: "Marca" },
    { key: "tipo_controle", label: "Controle" },
    { key: "tipo_separacao", label: "Separação" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "empresa_id", label: "Empresa", type: "select", required: true, options: empresaOptions },
    { name: "parceiro_id", label: "Parceiro (Fornecedor)", type: "select", required: true, options: parceiroOptions },
    { name: "sku", label: "SKU", type: "text", required: true, placeholder: "Ex: ELT-001" },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Descrição do produto" },
    { name: "referencia", label: "Referência", type: "text", required: true, placeholder: "Referência" },
    { name: "marca", label: "Marca", type: "text", placeholder: "Marca" },
    { name: "grupo_id", label: "Grupo", type: "select", options: grupoOptions },
    { name: "subgrupo_id", label: "Subgrupo", type: "select", options: subgrupoOptions },
    { name: "preco_custo", label: "Preço de Custo", type: "number", placeholder: "0.00", step: "0.01" },
    { name: "tipo_controle", label: "Tipo de Controle", type: "enum", required: true, enumValues: ["UNIDADE", "LOTE", "VALIDADE", "SERIE", "METROS"] },
    { name: "tipo_separacao", label: "Tipo de Separação", type: "enum", required: true, enumValues: ["FRACIONADO", "EMBALAGEM_TOTAL", "CAIXARIA"] },
    { name: "usa_picking", label: "Usa Picking", type: "switch", defaultValue: true },
    { name: "varios_pickings", label: "Vários Pickings", type: "switch", defaultValue: false },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Produtos"
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
        newLabel="Novo Produto"
        searchPlaceholder="Buscar por SKU ou descrição..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Produto" : "Novo Produto"}
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
