import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Printer } from "lucide-react";
import { PrintEtiquetaHUModal } from "@/components/etiqueta/PrintEtiquetaHUModal";

export function HUsPage() {
  const { tenantId, armazemId } = useTenant();
  const crud = useCrud({
    table: "hu",
    tenantId,
    orderBy: "codigo_hu",
    filters: armazemId ? { armazem_id: armazemId } : {},
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);

  // Selection & Print
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printHUs, setPrintHUs] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);

  const handlePrintSelected = () => {
    const selected = crud.data.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setPrintHUs(selected);
    setPrintOpen(true);
  };

  const handlePrintSingle = (row: any) => {
    setPrintHUs([row]);
    setPrintOpen(true);
  };

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

  const fields: FieldSpec[] = [
    { name: "codigo_hu", label: "Código HU", type: "text", placeholder: "Gerado automaticamente se vazio" },
    { name: "tipo_hu", label: "Tipo HU", type: "enum", required: true, enumValues: ["PALLET", "CAIXA", "VOLUME", "OUTRO"] },
    { name: "tamanho", label: "Tamanho", type: "enum", required: true, enumValues: ["P", "M", "G", "GG", "EG"] },
    { name: "altura", label: "Altura", type: "number", placeholder: "cm" },
    { name: "peso_bruto", label: "Peso Bruto", type: "number", placeholder: "kg" },
    { name: "m3", label: "M³", type: "number", placeholder: "m³" },
    { name: "disponibilidade", label: "Disponibilidade", type: "enum", enumValues: ["DISPONIVEL", "RESERVADA", "BLOQUEADA", "EM_MOVIMENTO", "DESCARTADA"], defaultValue: "DISPONIVEL" },
  ];

  const generateCodigoHU = async (): Promise<string> => {
    // Get current max codigo_hu to generate next
    const { data } = await (await import("@/integrations/supabase/client")).supabase
      .from("hu")
      .select("codigo_hu")
      .eq("tenant_id", tenantId!)
      .like("codigo_hu", "HU-%")
      .order("codigo_hu", { ascending: false })
      .limit(1);

    let nextNum = 1;
    if (data && data.length > 0 && data[0].codigo_hu) {
      const match = data[0].codigo_hu.match(/HU-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    return `HU-${String(nextNum).padStart(9, "0")}`;
  };

  const handleSave = async (data: Record<string, any>) => {
    if (armazemId) data.armazem_id = armazemId;
    if (!data.codigo_hu || data.codigo_hu.trim() === "") {
      data.codigo_hu = await generateCodigoHU();
    }
    if (!data.disponibilidade) data.disponibilidade = "DISPONIVEL";
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
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
        onNew={() => { setEditItem(null); setModalOpen(true); }}
        onEdit={(row) => { setEditItem(row); setModalOpen(true); }}
        onDelete={(row) => setDeleteItem(row)}
        newLabel="Nova HU"
        searchPlaceholder="Buscar HU..."
        selectable
        selectedIds={selectedIds}
        onSelectChange={setSelectedIds}
        headerActions={
          selectedIds.size > 0 ? (
            <button
              onClick={handlePrintSelected}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/50 text-primary text-sm font-medium hover:bg-primary/10 transition-colors"
            >
              <Printer size={15} />
              Imprimir HU ({selectedIds.size})
            </button>
          ) : undefined
        }
        extraRowActions={(row) => (
          <button
            onClick={() => handlePrintSingle(row)}
            className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            title="Imprimir etiqueta HU"
          >
            <Printer size={13} />
          </button>
        )}
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar HU" : "Nova HU"}
        fields={fields}
        initialData={editItem}
        onSave={handleSave}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
      <PrintEtiquetaHUModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintHUs([]); }}
        hus={printHUs}
      />
    </>
  );
}
