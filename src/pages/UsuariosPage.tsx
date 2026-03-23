import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

export function UsuariosPage() {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "usuario", tenantId, orderBy: "nome" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [empresaOptions, setEmpresaOptions] = useState<{ value: string; label: string }[]>([]);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);
  const [turnoOptions, setTurnoOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId) {
      fetchOptions("empresa", tenantId, "razaosocial").then(setEmpresaOptions);
      fetchOptions("armazem", tenantId).then(setArmazemOptions);
      fetchOptions("turnos", tenantId).then(setTurnoOptions);
    }
  }, [tenantId]);

  const columns: ColumnSpec[] = [
    { key: "nome", label: "Nome" },
    { key: "login", label: "Login" },
    { key: "email", label: "Email" },
    { key: "habilidade", label: "Habilidade" },
    { key: "tipo_operacao", label: "Operação" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "empresa_id", label: "Empresa", type: "select", required: true, options: empresaOptions },
    { name: "armazem_id", label: "Armazém", type: "select", required: true, options: armazemOptions },
    { name: "turno_id", label: "Turno", type: "select", required: true, options: turnoOptions },
    { name: "nome", label: "Nome", type: "text", required: true, placeholder: "Nome completo" },
    { name: "login", label: "Login", type: "text", required: true, placeholder: "Login do usuário" },
    { name: "email", label: "Email", type: "text", required: true, placeholder: "email@empresa.com" },
    { name: "senha", label: "Senha", type: "text", placeholder: "Senha de acesso (mín. 6 caracteres)" },
    { name: "habilidade", label: "Habilidade", type: "enum", enumValues: ["TREINANDO", "BASICO", "BOM", "ESPECIALISTA"] },
    { name: "tipo_operacao", label: "Tipo de Operação", type: "enum", required: true, enumValues: ["RECEBIMENTO", "ARMAZENAGEM", "MOVIMENTOS", "SEPARACAO", "CONFERENCIA", "EXPEDICAO", "AUDITORIA"] },
    { name: "tipo_usuario", label: "Tipo Usuário", type: "enum", enumValues: ["ADMIN", "OPERADOR", "SUPERVISOR"] },
    { name: "cod_erp", label: "Código ERP", type: "text", placeholder: "Opcional" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  return (
    <>
      <CrudTable
        title="Usuários"
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
        newLabel="Novo Usuário"
        searchPlaceholder="Buscar por nome..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Usuário" : "Novo Usuário"}
        fields={editItem ? fields.map(f => f.name === "id" ? { ...f, hidden: true } : f) : fields}
        initialData={editItem}
        onSave={async (data) => {
          if (editItem) {
            const { id, ...rest } = data;
            return crud.update(editItem.id, rest);
          }
          return crud.create(data);
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
