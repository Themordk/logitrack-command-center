import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function MotivosOcorrenciaPage() {
  const { tenantId, armazemId } = useTenant();
  const crud = useCrud({ table: "motivo_ocorrencia", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const prioridadeBadge = (val: string) => {
    const colors: Record<string, string> = {
      BAIXA: "bg-muted text-muted-foreground",
      NORMAL: "bg-blue-500/10 text-blue-500",
      ALTA: "bg-orange-500/10 text-orange-500",
      CRITICA: "bg-red-500/10 text-red-500",
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors[val] || colors.NORMAL}`}>{val || "NORMAL"}</span>;
  };
  const categoriaBadge = (val: string) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${val === "PREVENTIVA" ? "bg-blue-500/10 text-blue-500" : "bg-orange-500/10 text-orange-500"}`}>
      {val === "PREVENTIVA" ? "Preventiva" : "Corretiva"}
    </span>
  );

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição", type: "mono" },
    { key: "etapa_ocorrencia", label: "Etapa" },
    { key: "categoria_padrao", label: "Categoria", render: (row) => categoriaBadge(row.categoria_padrao || "CORRETIVA") },
    { key: "prioridade_padrao", label: "Prioridade", render: (row) => prioridadeBadge(row.prioridade_padrao) },
    { key: "acao_automatica", label: "Ação automática", render: (row) => (
      <span className="text-xs text-muted-foreground">{row.acao_automatica || "—"}</span>
    )},
    { key: "bloqueio_estoque", label: "Bloqueia Estoque", render: (row) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row.bloqueio_estoque ? "badge-blocked" : "badge-free"}`}>
        {row.bloqueio_estoque ? "Sim" : "Não"}
      </span>
    )},
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Descrição do motivo" },
    { name: "etapa_ocorrencia", label: "Etapa Ocorrência", type: "enum", required: true, enumValues: ["RECEBIMENTO", "ARMAZENAGEM", "ABASTECIMENTO", "MOVIMENTACAO", "SEPARACAO", "EXPEDICAO", "INVENTARIO", "AUDITORIA"] },
    { name: "categoria_padrao", label: "Categoria padrão", type: "enum", required: true, defaultValue: "CORRETIVA", enumValues: ["PREVENTIVA", "CORRETIVA"] },
    { name: "prioridade_padrao", label: "Prioridade padrão", type: "enum", required: true, defaultValue: "NORMAL", enumValues: ["BAIXA", "NORMAL", "ALTA", "CRITICA"] },
    { name: "acao_automatica", label: "Ação automática", type: "enum", defaultValue: "NENHUMA", enumValues: ["NENHUMA", "BLOQUEIO_ESTOQUE", "NOTIFICACAO_SUPERVISOR", "AJUSTE_ESTOQUE"] },
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
