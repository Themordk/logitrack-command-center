import { useMemo, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { supabase } from "@/integrations/supabase/client";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";

const setorColors: Record<string, string> = {
  RECEBIMENTO: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  EXPEDICAO: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  GERAL: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  INVENTARIO: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

const statusColors: Record<string, string> = {
  ONLINE: "bg-green-500/15 text-green-400 border-green-500/30",
  OFFLINE: "bg-red-500/15 text-red-400 border-red-500/30",
  ERRO: "bg-red-500/15 text-red-400 border-red-500/30",
  DESCONHECIDO: "bg-gray-500/15 text-gray-400 border-gray-500/30",
};

const langColors: Record<string, string> = {
  ZPL: "bg-primary/15 text-primary border-primary/30",
  TSPL: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  EPL: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

function Badge({ children, className = "" }: any) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-semibold uppercase ${className}`}>
      {children}
    </span>
  );
}

export function ImpressorasTab() {
  const { tenantId, empresaId, armazemId } = useTenant();
  const crud = useCrud<any>({
    table: "impressora",
    tenantId,
    orderBy: "nome",
    select: "*, print_agent:agent_id(nome), armazem:armazem_id(descricao)",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  const { data: agentOptions = [] } = useQuery({
    queryKey: ["print-agents-options", tenantId, empresaId, armazemId],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = (supabase as any)
        .from("print_agent")
        .select("id, nome")
        .eq("tenant_id", tenantId)
        .eq("ativo", true)
        .order("nome");
      if (armazemId) q = q.eq("armazem_id", armazemId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({ value: r.id, label: r.nome }));
    },
  });
  const hasAgents = agentOptions.length > 0;

  const columns: ColumnSpec[] = [
    { key: "nome", label: "Nome" },
    { key: "codigo", label: "Código", type: "mono" },
    {
      key: "setor_uso", label: "Setor", render: (r) => (
        <Badge className={setorColors[r.setor_uso] || setorColors.GERAL}>{r.setor_uso}</Badge>
      ),
    },
    { key: "tipo_conexao", label: "Conexão", render: (r) => <span className="text-xs text-muted-foreground">{r.tipo_conexao}</span> },
    {
      key: "endereco", label: "Endereço", render: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.tipo_conexao === "REDE" ? `${r.endereco_ip || "—"}:${r.porta || ""}` : (r.nome_sistema || "—")}
        </span>
      ),
    },
    {
      key: "linguagem", label: "Linguagem", render: (r) => (
        <Badge className={langColors[r.linguagem] || langColors.ZPL}>{r.linguagem}</Badge>
      ),
    },
    { key: "agent", label: "Agent", render: (r) => r.print_agent?.nome || "—" },
    {
      key: "status_conexao", label: "Status", render: (r) => {
        const s = r.status_conexao || "DESCONHECIDO";
        const Icon = s === "ONLINE" ? Wifi : WifiOff;
        return <Badge className={statusColors[s]}><Icon size={10} /> {s}</Badge>;
      },
    },
    { key: "ativo", label: "Ativo", type: "badge" },
  ];

  const fields: FieldSpec[] = useMemo(() => [
    { name: "nome", label: "Nome da Impressora", type: "text", required: true, placeholder: "Zebra ZD420 - Recebimento" },
    { name: "codigo", label: "Código", type: "text", required: true, placeholder: "IMP-REC-01" },
    { name: "setor_uso", label: "Setor de Uso", type: "enum", required: true, enumValues: ["RECEBIMENTO", "EXPEDICAO", "GERAL", "INVENTARIO"], defaultValue: "GERAL" },
    { name: "agent_id", label: "Agent Responsável", type: "select", options: agentOptions, placeholder: hasAgents ? "Selecionar..." : "Nenhum agent cadastrado para este armazém" },

    { name: "tipo_conexao", label: "Tipo de Conexão", type: "enum", required: true, enumValues: ["USB", "REDE", "BLUETOOTH"], defaultValue: "USB" },
    {
      name: "endereco_ip", label: "Endereço IP", type: "text", placeholder: "192.168.1.100",
      visibleWhen: (f) => f.tipo_conexao === "REDE",
      requiredWhen: (f) => f.tipo_conexao === "REDE",
    },
    {
      name: "porta", label: "Porta", type: "number", defaultValue: 9100,
      visibleWhen: (f) => f.tipo_conexao === "REDE",
    },
    {
      name: "nome_sistema", label: "Nome no Sistema Operacional", type: "text", placeholder: "\\\\PC-DOCA\\ZebraZD420",
      visibleWhen: (f) => f.tipo_conexao === "USB" || f.tipo_conexao === "BLUETOOTH",
      requiredWhen: (f) => f.tipo_conexao === "USB" || f.tipo_conexao === "BLUETOOTH",
    },

    { name: "linguagem", label: "Linguagem de Impressão", type: "enum", required: true, enumValues: ["ZPL", "TSPL", "EPL"], defaultValue: "ZPL" },
    { name: "largura_mm", label: "Largura da Mídia (mm)", type: "number", required: true, defaultValue: 100 },
    { name: "altura_mm", label: "Altura da Mídia (mm)", type: "number", required: true, defaultValue: 40 },
    { name: "dpi", label: "Resolução (DPI)", type: "select", required: true, options: [{ value: "203", label: "203" }, { value: "300", label: "300" }], defaultValue: "203" },

    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ], [agentOptions, hasAgents]);

  const filtered = crud.search
    ? crud.data.filter((r) => {
        const q = crud.search.toLowerCase();
        return (r.nome || "").toLowerCase().includes(q)
          || (r.codigo || "").toLowerCase().includes(q)
          || (r.endereco_ip || "").toLowerCase().includes(q);
      })
    : crud.data;

  const handleSave = async (data: Record<string, any>) => {
    if (!empresaId || !armazemId) {
      toast.error("Selecione empresa e armazém no topo antes de cadastrar impressoras");
      return false;
    }
    const payload: any = { ...data, empresa_id: empresaId, armazem_id: armazemId };
    if (data.dpi) payload.dpi = Number(data.dpi);
    if (editItem) return crud.update(editItem.id, payload);
    return crud.create(payload);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <CrudTable
        title="Impressoras"
        subtitle={`${crud.total} impressora(s) cadastrada(s)`}
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
        newLabel="Nova Impressora"
        searchPlaceholder="Buscar por nome, código ou IP..."
      />

      {modalOpen && (
        <CrudModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={editItem ? "Editar Impressora" : "Nova Impressora"}
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
        title="Desativar Impressora"
        description={`Desativar a impressora "${deleteItem?.nome}"?`}
      />
    </div>
  );
}
