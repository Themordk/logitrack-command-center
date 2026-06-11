import { useState, useEffect, useMemo, useCallback } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ZonaEnderecosSheet } from "./zonas/ZonaEnderecosSheet";

export function ZonasAtividadePage() {
  const { tenantId, empresaId, armazemId, empresaVersion } = useTenant();
  const [filterTipo, setFilterTipo] = useState<string>("ALL");
  const [filterAtivo, setFilterAtivo] = useState<string>("ALL");

  const crudFilters = useMemo(() => {
    const f: Record<string, any> = {};
    if (filterTipo !== "ALL") f.tipo_grupo = filterTipo;
    if (filterAtivo !== "ALL") f.Ativo = filterAtivo === "true";
    return f;
  }, [filterTipo, filterAtivo]);

  const crud = useCrud({ table: "zona_atividade", tenantId, orderBy: "descricao", filters: crudFilters });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);
  const [sheetZona, setSheetZona] = useState<any>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (tenantId && empresaId) {
      fetchOptions("armazem", tenantId, "descricao", { empresa_id: empresaId }).then(setArmazemOptions);
    } else {
      setArmazemOptions([]);
    }
  }, [tenantId, empresaId, empresaVersion]);

  useEffect(() => {
    setSheetZona(null);
    setModalOpen(false);
    setEditItem(null);
  }, [tenantId, armazemId, empresaVersion]);

  const refreshCounts = useCallback(async () => {
    if (!tenantId || crud.data.length === 0) { setCounts({}); return; }
    const results = await Promise.all(
      crud.data.map(async (z: any) => {
        const { count } = await (supabase as any)
          .from("endereco_zona_atividade")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("zona_atividade_id", z.id);
        return [z.id, count || 0] as const;
      })
    );
    setCounts(Object.fromEntries(results));
  }, [tenantId, crud.data]);

  useEffect(() => { refreshCounts(); }, [refreshCounts]);

  const armazemNomeById = useCallback(
    (id: string) => armazemOptions.find((o) => o.value === id)?.label || "—",
    [armazemOptions]
  );

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Descrição", render: (row) => <span className="text-sm font-medium text-foreground truncate">{row.descricao}</span> },
    { key: "armazem_id", label: "Armazém", render: (row) => <span className="text-sm text-muted-foreground">{armazemNomeById(row.armazem_id)}</span> },
    { key: "tipo_grupo", label: "Tipo", render: (row) => (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-cyan-500/30 bg-cyan-500/10 text-cyan-400">{row.tipo_grupo}</span>
    )},
    { key: "total_enderecos", label: "Endereços", render: (row) => (
      <span className="inline-flex items-center justify-center min-w-[2.25rem] h-6 px-2 rounded-full text-xs font-semibold bg-muted text-foreground">
        {counts[row.id] ?? "·"}
      </span>
    )},
    { key: "Ativo", label: "Status", render: (row) => <StatusBadge status={row.Ativo ? "ativo" : "inativo"} type="generic" /> },
  ];

  const fields: FieldSpec[] = useMemo(() => [
    {
      name: "armazem_id",
      label: "Armazém",
      type: "select",
      required: true,
      options: armazemOptions,
      placeholder: "Selecione o armazém...",
      defaultValue: armazemId || "",
    },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Ex: ZONA A" },
    { name: "tipo_grupo", label: "Tipo do Grupo", type: "enum", required: true, enumValues: ["PICKING", "ARMAZENAGEM", "INVENTARIO"] },
    { name: "Ativo", label: "Ativo", type: "switch", defaultValue: true },
  ], [armazemOptions, armazemId]);

  const handleSave = async (data: Record<string, any>) => {
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  const extraFilters = (
    <>
      <Select value={filterTipo} onValueChange={setFilterTipo}>
        <SelectTrigger className="h-9 w-[180px] text-sm bg-secondary border-border"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos os tipos</SelectItem>
          <SelectItem value="PICKING">PICKING</SelectItem>
          <SelectItem value="ARMAZENAGEM">ARMAZENAGEM</SelectItem>
          <SelectItem value="INVENTARIO">INVENTÁRIO</SelectItem>
        </SelectContent>
      </Select>
      <Select value={filterAtivo} onValueChange={setFilterAtivo}>
        <SelectTrigger className="h-9 w-[140px] text-sm bg-secondary border-border"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todos</SelectItem>
          <SelectItem value="true">Ativo</SelectItem>
          <SelectItem value="false">Inativo</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  return (
    <TooltipProvider>
      <CrudTable
        title="Zonas de Atividade"
        subtitle={`${crud.total} registro${crud.total === 1 ? "" : "s"} encontrado${crud.total === 1 ? "" : "s"}`}
        columns={columns}
        data={crud.data}
        loading={crud.loading}
        search={crud.search}
        onSearchChange={crud.setSearch}
        searchPlaceholder="Buscar por descrição..."
        page={crud.page}
        totalPages={crud.totalPages}
        total={crud.total}
        pageSize={crud.pageSize}
        onPageChange={crud.setPage}
        onNew={() => { setEditItem(null); setModalOpen(true); }}
        onEdit={(row) => { setEditItem(row); setModalOpen(true); }}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Nova Zona"
        extraFilters={extraFilters}
        extraRowActions={(row) => (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={`Gerenciar endereços da ${row.descricao}`}
                onClick={() => setSheetZona(row)}
                className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors flex items-center justify-center"
              >
                <Link2 size={13} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Gerenciar Endereços</TooltipContent>
          </Tooltip>
        )}
      />

      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Zona" : "Nova Zona"}
        fields={fields}
        initialData={editItem}
        onSave={handleSave}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id, false) : false}
      />

      <ZonaEnderecosSheet
        zona={sheetZona}
        tenantId={tenantId}
        armazemNome={sheetZona ? armazemNomeById(sheetZona.armazem_id) : undefined}
        onClose={() => setSheetZona(null)}
        onCountChanged={refreshCounts}
      />
    </TooltipProvider>
  );
}
