import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { KeyRound, Loader2 } from "lucide-react";
import { parseError } from "@/lib/errorMapper";

export function UsuariosPage() {
  const { tenantId, empresaId, armazemId, empresaVersion } = useTenant();
  const crud = useCrud({
    table: "usuario",
    tenantId,
    orderBy: "nome",
    select: "*, usuario_perfil(perfil_id, perfil(nome))",
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [empresaOptions, setEmpresaOptions] = useState<{ value: string; label: string }[]>([]);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);
  const [turnoOptions, setTurnoOptions] = useState<{ value: string; label: string }[]>([]);
  const [perfilOptions, setPerfilOptions] = useState<{ value: string; label: string }[]>([]);
  const [resetConfirm, setResetConfirm] = useState<any>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (tenantId) {
      fetchOptions("empresa", tenantId, "razaosocial").then(setEmpresaOptions);
      fetchOptions("perfil", tenantId, "nome").then(setPerfilOptions);
      // Armazém filtrado por empresa ativa
      if (empresaId) {
        fetchOptions("armazem", tenantId, "descricao", { empresa_id: empresaId }).then(setArmazemOptions);
      } else {
        setArmazemOptions([]);
      }
      // Turnos filtrados por armazém ativo (turnos pertencem a um armazém)
      if (armazemId) {
        fetchOptions("turnos", tenantId, "descricao", { armazem_id: armazemId }).then(setTurnoOptions);
      } else {
        setTurnoOptions([]);
      }
    }
    setModalOpen(false);
    setEditItem(null);
  }, [tenantId, empresaId, armazemId, empresaVersion]);

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
    { name: "codigo_erp", label: "Código ERP", type: "text", placeholder: "Opcional" },
    { name: "permite_checkout", label: "Permite Checkout", type: "switch", defaultValue: false },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleResetPassword = async () => {
    if (!resetConfirm) return;
    setResetting(true);
    try {
      const { data, error } = await supabase.functions.invoke("reset-password", {
        body: { usuario_id: resetConfirm.id },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || "Erro ao resetar senha.");
      } else {
        toast.success(data.message || "Senha resetada com sucesso!");
      }
    } catch (err: any) {
      toast.error((() => { const p = parseError(err, "usuarios-page"); return (!p.errorCode && p.title === "Ocorreu um erro inesperado.") ? "Erro ao resetar senha." : p.title; })());
    } finally {
      setResetting(false);
      setResetConfirm(null);
    }
  };

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
        extraRowActions={(row) => (
          <button
            onClick={() => setResetConfirm(row)}
            title="Resetar Senha"
            className="p-1.5 rounded-md text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
          >
            <KeyRound size={15} />
          </button>
        )}
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Usuário" : "Novo Usuário"}
        fields={editItem ? fields.filter(f => f.name !== "senha") : fields}
        initialData={editItem ? getEditInitialData(editItem) : (empresaId ? { empresa_id: empresaId, armazem_id: armazemId || undefined } : null)}
        onSave={async (data) => {
          const { perfil_id, senha, ...rest } = data;

          if (editItem) {
            const ok = await crud.update(editItem.id, rest);
            if (!ok) return false;

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

      {/* Reset Password Confirmation Dialog */}
      {resetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-6 space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <KeyRound size={20} className="text-amber-500" />
              </div>
              <h3 className="text-base font-bold text-foreground">Resetar Senha</h3>
              <p className="text-sm text-center text-muted-foreground">
                A senha de <strong>{resetConfirm.nome}</strong> será redefinida para <code className="text-xs bg-muted px-1.5 py-0.5 rounded">123456</code>. O usuário será obrigado a trocar a senha no próximo login.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setResetConfirm(null)}
                disabled={resetting}
                className="flex-1 h-9 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="flex-1 flex items-center justify-center gap-2 h-9 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
              >
                {resetting && <Loader2 size={14} className="animate-spin" />}
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
