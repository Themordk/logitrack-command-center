import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function TiposEntradaPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "tipo_entrada", tenantId, orderBy: "descricao", filters: { empresa_id: empresaId } });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const prioridadeBadge = (val: string) => {
    const colors: Record<string, string> = {
      BAIXA: "bg-muted text-muted-foreground",
      NORMAL: "bg-blue-500/10 text-blue-500",
      ALTA: "bg-orange-500/10 text-orange-500",
      URGENTE: "bg-red-500/10 text-red-500",
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[val] || colors.NORMAL}`}>{val || "NORMAL"}</span>;
  };

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição" },
    { key: "codigo_erp", label: "Código ERP" },
    { key: "realiza_conferencia", label: "Realiza Conferência", type: "badge" },
    { key: "armazenagem_automatica", label: "Armazenagem Automática", type: "badge" },
    { key: "gera_mov_automatico", label: "Gera Mov. Automático", type: "badge" },
    { key: "libera_mov_automatico", label: "Libera Mov. Automático", type: "badge" },
    { key: "prioridade", label: "Prioridade", type: "custom", render: (row) => prioridadeBadge(row.prioridade) },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Tipo de entrada" },
    { name: "codigo_erp", label: "Código ERP", type: "text", placeholder: "Código no ERP" },
    { name: "prioridade", label: "Prioridade", type: "enum", required: true, defaultValue: "NORMAL", enumValues: ["BAIXA", "NORMAL", "ALTA", "URGENTE"] },
    { name: "realiza_conferencia", label: "Realiza Conferência", type: "switch", defaultValue: true },
    { name: "armazenagem_automatica", label: "Armazenagem Automática", type: "switch", defaultValue: false },
    { name: "gera_mov_automatico", label: "Gera Mov. Automático", type: "switch", defaultValue: false },
    { name: "libera_mov_automatico", label: "Libera Mov. Automático", type: "switch", defaultValue: false },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];


  return (
    <>
      <CrudTable
        title="Tipos de Entrada"
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
        newLabel="Novo Tipo de Entrada"
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Tipo de Entrada" : "Novo Tipo de Entrada"}
        fields={fields}
        initialData={editItem}
        onSave={async (data) => {
          const payload = { ...data, empresa_id: empresaId };
          return editItem ? crud.update(editItem.id, payload) : crud.create(payload);
        }}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
    </>
  );
}
