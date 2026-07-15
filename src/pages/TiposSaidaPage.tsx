import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function TiposSaidaPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "tipo_saida", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const boolBadge = (val: any) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${val ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
      {val ? "Sim" : "Não"}
    </span>
  );

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
    { key: "realiza_conferencia", label: "Realiza Conferência", type: "custom", render: (row) => boolBadge(row.realiza_conferencia) },
    { key: "conferencia_checkout", label: "Conferência Checkout", type: "custom", render: (row) => boolBadge(row.conferencia_checkout) },
    { key: "separa_pulmao", label: "Separa Pulmão", type: "custom", render: (row) => boolBadge(row.separa_pulmao) },
    { key: "gera_mov_automatico", label: "Gera Mov. Automático", type: "custom", render: (row) => boolBadge(row.gera_mov_automatico) },
    { key: "libera_mov_automatico", label: "Libera Mov. Automático", type: "custom", render: (row) => boolBadge(row.libera_mov_automatico) },
    { key: "conferencia_cega", label: "Conf. Cega", type: "custom", render: (row) => boolBadge(row.conferencia_cega) },
    { key: "gera_volume_etapa", label: "Gera Volume Em", type: "custom", render: (row) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-500/10 text-blue-500">
        {row.gera_volume_etapa || "CONFERÊNCIA"}
      </span>
    ) },
    { key: "gera_abastecimento_automatico", label: "Abast. Automático", type: "custom", render: (row) => boolBadge(row.gera_abastecimento_automatico) },
    { key: "prioridade", label: "Prioridade", type: "custom", render: (row) => prioridadeBadge(row.prioridade) },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    // --- Dados gerais ---
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Tipo de saída" },
    { name: "codigo_erp", label: "Código ERP", type: "text", placeholder: "Código no ERP" },
    { name: "prioridade", label: "Prioridade", type: "enum", required: true, defaultValue: "NORMAL", enumValues: ["BAIXA", "NORMAL", "ALTA", "URGENTE"] },

    // --- Conferência ---
    { name: "realiza_conferencia", label: "Realiza Conferência", type: "switch", defaultValue: true },
    {
      name: "conferencia_checkout",
      label: "Conferência Checkout",
      type: "switch",
      defaultValue: false,
      disabledWhen: (f) => !f.realiza_conferencia,
    },
    {
      name: "conferencia_cega",
      label: "Conferência Cega",
      type: "switch",
      defaultValue: false,
      disabledWhen: (f) => !f.realiza_conferencia,
    },

    // --- Separação e volume ---
    { name: "separa_pulmao", label: "Separa Pulmão", type: "switch", defaultValue: false },
    {
      name: "gera_volume_etapa",
      label: "Gera Volume na Etapa",
      type: "enum",
      required: true,
      defaultValue: "CONFERÊNCIA",
      enumValues: ["NENHUMA", "SEPARAÇÃO", "CONFERÊNCIA", "CARREGAMENTO"],
    },

    // --- Automação ---
    { name: "gera_mov_automatico", label: "Gera Mov. Automático", type: "switch", defaultValue: false },
    { name: "libera_mov_automatico", label: "Libera Mov. Automático", type: "switch", defaultValue: false },
    { name: "gera_abastecimento_automatico", label: "Gera Abastecimento Automático", type: "switch", defaultValue: false },

    // --- Status ---
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Tipos de Saída"
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
        newLabel="Novo Tipo de Saída"
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Tipo de Saída" : "Novo Tipo de Saída"}
        fields={fields}
        initialData={editItem}
        onSave={async (data) => {
          const payload: any = { ...data, empresa_id: empresaId };
          if (!payload.realiza_conferencia) {
            payload.conferencia_checkout = false;
            payload.conferencia_cega = false;
          }
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
