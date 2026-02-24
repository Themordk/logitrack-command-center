import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function MotivosOcorrenciaPage() {
  const { tenantId, armazemId } = useTenant();
  const crud = useCrud({
    table: "motivo_ocorrencia",
    tenantId,
    orderBy: "descricao",
    filters: armazemId ? { armazem_id: armazemId } : {},
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição", type: "mono" },
    { key: "etapa_ocorrencia", label: "Etapa" },
    { key: "bloqueio_estoque", label: "Bloqueia Estoque", render: (row) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.bloqueio_estoque ? "badge-blocked" : "badge-free"}`}>
        {row.bloqueio_estoque ? "Sim" : "Não"}
      </span>
    )},
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Descrição do motivo" },
    { name: "etapa_ocorrencia", label: "Etapa Ocorrência", type: "enum", required: true, enumValues: ["RECEBIMENTO", "ARMAZENAGEM", "ABASTECIMENTO", "MOVIMENTACAO", "SEPARACAO", "EXPEDICAO"] },
    { name: "bloqueio_estoque", label: "Bloqueia Estoque", type: "switch", defaultValue: false },
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
        title="Motivos de Ocorrência"
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
        newLabel="Novo Motivo"
        searchPlaceholder="Buscar motivo..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Motivo" : "Novo Motivo"}
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
