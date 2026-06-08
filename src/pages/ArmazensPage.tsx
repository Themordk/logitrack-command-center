import { useState, useEffect } from "react";
import { Settings } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { ArmazemConfigModal } from "@/components/armazem/ArmazemConfigModal";

export function ArmazensPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "armazem", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [configItem, setConfigItem] = useState<any>(null);
  const [empresaOptions, setEmpresaOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId) fetchOptions("empresa", tenantId, "razaosocial").then(setEmpresaOptions);
  }, [tenantId]);

  const columns: ColumnSpec[] = [
    { key: "codigo_erp", label: "Código", type: "mono" },
    { key: "descricao", label: "Descrição" },
    { key: "cidade", label: "Cidade" },
    { key: "uf", label: "UF" },
    { key: "capacidade", label: "Capacidade", type: "number" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "empresa_id", label: "Empresa", type: "select", required: true, options: empresaOptions, placeholder: "Selecionar empresa..." },
    { name: "codigo_erp", label: "Código ERP", type: "text", required: true, placeholder: "Ex: ARM-001" },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Ex: Armazém Central SP" },
    { name: "cidade", label: "Cidade", type: "text", placeholder: "Ex: São Paulo" },
    { name: "uf", label: "UF", type: "text", placeholder: "Ex: SP" },
    { name: "capacidade", label: "Capacidade (m²)", type: "number", placeholder: "Ex: 5000" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Cadastro de Armazéns"
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
        extraRowActions={(row) => (
          <button
            onClick={() => setConfigItem(row)}
            className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
            title="Configurações"
          >
            <Settings size={13} />
          </button>
        )}
        newLabel="Novo Armazém"
        searchPlaceholder="Buscar armazém..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Armazém" : "Novo Armazém"}
        fields={fields}
        initialData={editItem ?? (empresaId ? { empresa_id: empresaId } : null)}
        onSave={async (data) => editItem ? crud.update(editItem.id, data) : crud.create(data)}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
        description="O armazém será inativado."
      />
      <ArmazemConfigModal
        open={!!configItem}
        onClose={() => setConfigItem(null)}
        armazem={configItem ? { id: configItem.id, descricao: configItem.descricao, empresa_id: configItem.empresa_id } : null}
      />
    </>
  );
}
