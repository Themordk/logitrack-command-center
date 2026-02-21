import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { StatusBadge } from "@/components/StatusBadge";

export function HUsPage() {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "hu", tenantId, orderBy: "codigo_hu" });

  const columns: ColumnSpec[] = [
    { key: "codigo_hu", label: "Código HU", type: "mono" },
    { key: "tipo_hu", label: "Tipo" },
    { key: "tamanho", label: "Tamanho" },
    { key: "peso_bruto", label: "Peso Bruto", type: "number" },
    { key: "m3", label: "M³", type: "number" },
    { key: "altura", label: "Altura", type: "number" },
    { key: "disponibilidade", label: "Disponibilidade", render: (row) => {
      const map: Record<string, number> = { DISPONIVEL: 0, RESERVADA: 1, BLOQUEADA: 2, EM_MOVIMENTO: 3, DESCARTADA: 4 };
      return <StatusBadge status={map[row.disponibilidade] ?? 0} type="hu-disponibilidade" />;
    }},
  ];

  return (
    <CrudTable
      title="Unidades de Handling (HUs)"
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
      newLabel="Nova HU"
      searchPlaceholder="Buscar HU..."
    />
  );
}
