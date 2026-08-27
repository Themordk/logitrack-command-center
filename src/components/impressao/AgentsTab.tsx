import { useEffect, useState } from "react";
import { Copy, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { formatDateTime } from "@/utils/dateTime";

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `há ${Math.max(0, Math.floor(diff))}s`;
  if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
  return formatDateTime(iso);
}

const statusColors: Record<string, string> = {
  ONLINE: "bg-green-500/15 text-green-400 border-green-500/30",
  OFFLINE: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function AgentsTab() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud<any>({
    table: "print_agent",
    tenantId,
    orderBy: "nome",
    select: "*, armazem:armazem_id(descricao), chave_api_ativada, chave_api_expira_em, ativado_em, ativado_hostname, ativado_ip",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    fetchOptions("armazem", tenantId, "descricao", empresaId ? { empresa_id: empresaId } : undefined)
      .then(setArmazemOptions);
  }, [tenantId, empresaId]);

  useEffect(() => {
    const timer = setInterval(() => {
      crud.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [crud.refresh]);

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Chave API copiada para a área de transferência!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const regenerateKey = async (r: any) => {
    if (!confirm("Regenerar chave de ativação? A chave atual será invalidada.")) return;
    const { error } = await supabase
      .from("print_agent")
      .update({
        chave_api: crypto.randomUUID(),
        chave_api_ativada: false,
        chave_api_expira_em: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        ativado_em: null,
        ativado_hostname: null,
        ativado_ip: null,
        auth_user_id: null,
      })
      .eq("id", r.id);
    if (error) {
      toast.error("Erro ao regenerar chave");
      return;
    }
    await crud.refresh();
    toast.success("Chave regenerada!");
  };

  const columns: ColumnSpec[] = [
    { key: "nome", label: "Nome" },
    { key: "armazem", label: "Armazém", render: (r) => r.armazem?.descricao || "—" },
    { key: "hostname", label: "Hostname", type: "mono" },
    { key: "versao", label: "Versão", type: "mono" },
    {
      key: "status", label: "Status", render: (r) => (
        <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${statusColors[r.status] || "bg-gray-500/15 text-gray-400 border-gray-500/30"}`}>
          {r.status || "DESCONHECIDO"}
        </span>
      ),
    },
    { key: "ultimo_heartbeat", label: "Último Heartbeat", render: (r) => <span className="text-xs text-muted-foreground">{relativeTime(r.ultimo_heartbeat)}</span> },
    {
      key: "ativacao", label: "Ativação", render: (r) => {
        const ativada = r.chave_api_ativada === true;
        const expirada = r.chave_api_expira_em && new Date(r.chave_api_expira_em) < new Date();

        if (ativada) {
          return (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase bg-green-500/15 text-green-400 border-green-500/30 w-fit">
                Ativado
              </span>
              <span className="text-xs text-muted-foreground">
                {r.ativado_hostname || "—"} · {relativeTime(r.ativado_em)}
              </span>
            </div>
          );
        }
        if (expirada) {
          return (
            <span className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase bg-red-500/15 text-red-400 border-red-500/30 w-fit">
              Expirada
            </span>
          );
        }
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold uppercase bg-yellow-500/15 text-yellow-400 border-yellow-500/30 w-fit">
              Pendente
            </span>
            <span className="text-xs text-muted-foreground">
              Expira em {relativeTime(r.chave_api_expira_em)}
            </span>
          </div>
        );
      },
    },
    {
      key: "chave_api", label: "Chave API", render: (r) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">{r.chave_api ? `${String(r.chave_api).slice(0, 8)}…` : "—"}</span>
          {r.chave_api && (
            <>
              <button
                onClick={() => copyKey(r.chave_api)}
                className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
                title="Copiar chave API"
              >
                <Copy size={12} />
              </button>
              <button
                onClick={() => regenerateKey(r)}
                className="w-6 h-6 rounded hover:bg-secondary text-muted-foreground hover:text-foreground flex items-center justify-center"
                title="Regenerar chave"
              >
                <RefreshCw size={12} />
              </button>
            </>
          )}
        </div>
      ),
    },
    { key: "ativo", label: "Ativo", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "nome", label: "Nome do Agent", type: "text", required: true, placeholder: "Agent Doca Recebimento" },
    { name: "armazem_id", label: "Armazém", type: "select", required: true, options: armazemOptions },
    { name: "intervalo_polling_ms", label: "Intervalo de Polling (ms)", type: "number", required: true, defaultValue: 2000, step: "100" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  // client-side search filter (nome, hostname)
  const filtered = crud.search
    ? crud.data.filter((r) => {
        const q = crud.search.toLowerCase();
        return (r.nome || "").toLowerCase().includes(q) || (r.hostname || "").toLowerCase().includes(q);
      })
    : crud.data;

  const handleSave = async (data: Record<string, any>) => {
    const ms = Number(data.intervalo_polling_ms);
    if (ms < 500 || ms > 10000) {
      toast.error("Intervalo de Polling deve estar entre 500 e 10000 ms");
      return false;
    }
    if (editItem) return crud.update(editItem.id, data as any);
    return crud.create(data as any);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <CrudTable
        title="Print Agents"
        subtitle={`${crud.total} agent(s) cadastrado(s)`}
        columns={columns}
        data={filtered}
        loading={crud.loading}
        search={crud.search}
        onSearchChange={crud.setSearch}
        page={crud.page}
        totalPages={crud.totalPages}
        total={crud.total}
        pageSize={crud.pageSize}
        onPageChange={crud.setPage}
        onNew={() => { setEditItem(null); setModalOpen(true); }}
        onEdit={(r) => { setEditItem(r); setModalOpen(true); }}
        onDelete={(r) => setDeleteItem(r)}
        newLabel="Novo Agent"
        searchPlaceholder="Buscar por nome ou hostname..."
      />

      {modalOpen && (
        <CrudModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editItem ? "Editar Agent" : "Novo Agent"}
          fields={fields}
          initialData={editItem}
          onSave={handleSave}
        />
      )}

      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => {
          if (!deleteItem) return false;
          return crud.remove(deleteItem.id, true);
        }}
        title="Desativar Agent"
        description={`Desativar o agent "${deleteItem?.nome}"?`}
      />
    </div>
  );
}
