import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { StatusBadge } from "@/components/StatusBadge";

export function VolumesPage() {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "volume_expedicao", tenantId, orderBy: "created_at", orderDir: "desc" });

  const columns: ColumnSpec[] = [
    { key: "codigo_volume", label: "Código Volume", type: "mono" },
    { key: "pedido_id", label: "Pedido" },
    { key: "peso_bruto", label: "Peso Bruto", type: "number" },
    { key: "m3", label: "M³", type: "number" },
    { key: "status", label: "Status", render: (row) => {
      const map: Record<string, number> = { ABERTO: 0, FECHADO: 1, CONFERIDO: 2, EXPEDIDO: 3 };
      return <StatusBadge status={map[row.status] ?? 0} type="volume-status" />;
    }},
    { key: "created_at", label: "Criado em", render: (row) => (
      <span className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleDateString("pt-BR")}</span>
    )},
  ];

  return (
    <CrudTable
      title="Volumes de Expedição"
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
      onNew={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      newLabel="Novo Volume"
      searchPlaceholder="Buscar volume..."
    />
  );
}
