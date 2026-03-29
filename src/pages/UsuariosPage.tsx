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
  const crud = useCrud({
    table: "usuario",
    tenantId,
    orderBy: "nome",
    select: "*, usuario_perfil(perfil(nome))",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [empresaOptions, setEmpresaOptions] = useState<{ value: string; label: string }[]>([]);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);
  const [turnoOptions, setTurnoOptions] = useState<{ value: string; label: string }[]>([]);
  const [perfilOptions, setPerfilOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (tenantId) {
      fetchOptions("empresa", tenantId, "razaosocial").then(setEmpresaOptions);
      fetchOptions("armazem", tenantId).then(setArmazemOptions);
      fetchOptions("turnos", tenantId).then(setTurnoOptions);
      fetchOptions("perfil", tenantId, "nome").then(setPerfilOptions);
    }
  }, [tenantId]);

  const columns: ColumnSpec[] = [
    { key: "nome", label: "Nome" },
    { key: "login", label: "Login" },
    {
      key: "perfil",
      label: "Perfil",
      render: (row: any) => {
        const perfis = row.usuario_perfil;
        if (Array.isArray(perfis) && perfis.length > 0) {
          return perfis[0]?.perfil?.nome ?? "—";
        }
        return "—";
      },
    },
    { key: "habilidade", label: "Habilidade" },
    { key: "tipo_operacao", label: "Operação" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const getEditInitialData = (item: any) => {
    if (!item) return null;
    const perfis = item.usuario_perfil;
    const perfilId = Array.isArray(perfis) && perfis.length > 0
      ? perfis[0]?.perfil_id || ""
      : "";
    return { ...item, perfil_id: perfilId };
  };

  const fields: FieldSpec[] = [
    { name: "empresa_id", label: "Empresa", type: "select", required: true, options: empresaOptions },
    { name: "armazem_id", label: "Armazém", type: "select", required: false, options: armazemOptions },
    { name: "turno_id", label: "Turno", type: "select", required: false, options: turnoOptions },
    { name: "perfil_id", label: "Perfil de Usuário", type: "select", required: true, options: perfilOptions },
    { name: "nome", label: "Nome", type: "text", required: true, placeholder: "Nome completo" },
    { name: "login", label: "Login", type: "text", required: true, placeholder: "Login do usuário" },
    { name: "senha", label: "Senha", type: "text", placeholder: "Senha de acesso (mín. 6 caracteres)" },
    { name: "habilidade", label: "Habilidade", type: "enum", enumValues: ["TREINANDO", "BASICO", "BOM", "ESPECIALISTA"] },
    { name: "tipo_operacao", label: "Tipo de Operação", type: "enum", required: true, enumValues: ["RECEBIMENTO", "ARMAZENAGEM", "MOVIMENTOS", "SEPARACAO", "CONFERENCIA", "EXPEDICAO", "AUDITORIA"] },
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
        fields={editItem ? fields.filter(f => f.name !== "senha") : fields}
        initialData={editItem ? getEditInitialData(editItem) : null}
        onSave={async (data) => {
          const { perfil_id, senha, ...rest } = data;

          if (editItem) {
            // Update usuario record (without perfil_id and senha)
            const ok = await crud.update(editItem.id, rest);
            if (!ok) return false;

            // Update usuario_perfil: delete existing, insert new
            if (perfil_id) {
              await (supabase as any).from("usuario_perfil").delete().eq("usuario_id", editItem.id);
              await (supabase as any).from("usuario_perfil").insert({
                tenant_id: tenantId,
                usuario_id: editItem.id,
                perfil_id,
              });
            }
            crud.refresh();
            return true;
          }

          // New user: call edge function
          const { data: result, error } = await supabase.functions.invoke("create-usuario", {
            body: {
              ...rest,
              perfil_id,
              senha: senha || undefined,
              tenant_id: tenantId,
            },
          });
          if (error || !result?.success) {
            toast.error(result?.error || error?.message || "Erro ao criar usuário");
            return false;
          }
          toast.success("Usuário criado com sucesso!");
          crud.refresh();
          return true;
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
