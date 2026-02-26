import { useState, useEffect } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud, fetchOptions } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Printer } from "lucide-react";
import { PrintEtiquetaEnderecoModal } from "@/components/etiqueta/PrintEtiquetaEnderecoModal";

export function EnderecosPage({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const { tenantId } = useTenant();
  const crud = useCrud({ table: "endereco", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [armazemOptions, setArmazemOptions] = useState<{ value: string; label: string }[]>([]);
  const [setorOptions, setSetorOptions] = useState<{ value: string; label: string }[]>([]);
  const [tipoEstoqueOptions, setTipoEstoqueOptions] = useState<{ value: string; label: string }[]>([]);

  // Selection & Print
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [printEnderecos, setPrintEnderecos] = useState<any[]>([]);
  const [printOpen, setPrintOpen] = useState(false);

  const handlePrintSelected = () => {
    const selected = crud.data.filter((r) => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setPrintEnderecos(selected);
    setPrintOpen(true);
  };

  const handlePrintSingle = (row: any) => {
    setPrintEnderecos([row]);
    setPrintOpen(true);
  };

  useEffect(() => {
    if (tenantId) {
      fetchOptions("armazem", tenantId).then(setArmazemOptions);
      fetchOptions("setor", tenantId).then(setSetorOptions);
      fetchOptions("tipo_estoque", tenantId).then(setTipoEstoqueOptions);
    }
  }, [tenantId]);

  const buildDescricao = (rua: string, predio: string, nivel: string, apto: string) => {
    const pad = (v: string) => String(v).padStart(2, "0");
    return `R${pad(rua)}-P${pad(predio)}-N${pad(nivel)}-A${pad(apto)}`;
  };

  const columns: ColumnSpec[] = [
    { key: "descricao", label: "Endereço", type: "mono" },
    { key: "codigo_endereco", label: "Código" },
    { key: "tipo_endereco", label: "Tipo", render: (row) => <StatusBadge status={row.tipo_endereco === "PULMAO" ? 0 : 1} type="endereco-tipo" /> },
    { key: "situacao", label: "Situação", render: (row) => {
      const map: Record<string, number> = { LIVRE: 0, OCUPADO: 1, BLOQUEADO: 2 };
      return <StatusBadge status={map[row.situacao] ?? 0} type="endereco-situacao" />;
    }},
    { key: "curva_acesso", label: "Curva" },
    { key: "m3", label: "M³", type: "number" },
    { key: "peso_total", label: "Peso Max", type: "number" },
    { key: "total_pallet", label: "Pallets" },
    { key: "lado", label: "Lado" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "armazem_id", label: "Armazém", type: "select", required: true, options: armazemOptions },
    { name: "setor_id", label: "Setor", type: "select", required: true, options: setorOptions },
    { name: "tipo_estoque_id", label: "Tipo de Estoque", type: "select", required: true, options: tipoEstoqueOptions },
    { name: "rua", label: "Rua", type: "number", required: true, placeholder: "1" },
    { name: "predio", label: "Prédio", type: "number", required: true, placeholder: "1" },
    { name: "nivel", label: "Nível", type: "number", required: true, placeholder: "1" },
    { name: "apto", label: "Apto", type: "number", required: true, placeholder: "1" },
    { name: "lado", label: "Lado", type: "enum", required: true, enumValues: ["PAR", "IMPAR"] },
    { name: "tipo_endereco", label: "Tipo Endereço", type: "enum", required: true, enumValues: ["PULMAO", "PICKING"] },
    { name: "tipo_estrutura", label: "Tipo Estrutura", type: "enum", enumValues: ["PORTA PALLET", "BLOCADO", "PRATELEIRA", "FLOW RACK", "DRIVE IN", "MEZANINO", "DOCA"] },
    { name: "situacao", label: "Situação", type: "enum", required: true, enumValues: ["LIVRE", "OCUPADO", "BLOQUEADO"] },
    { name: "total_pallet", label: "Total Pallets", type: "number", placeholder: "2", visibleWhen: (form) => form.tipo_endereco === "PULMAO", requiredWhen: (form) => form.tipo_endereco === "PULMAO" },
    { name: "curva_acesso", label: "Curva de Acesso", type: "enum", enumValues: ["A", "B", "C", "D"] },
    { name: "altura", label: "Altura (cm)", type: "number" },
    { name: "largura", label: "Largura (cm)", type: "number" },
    { name: "comprimento", label: "Comprimento (cm)", type: "number" },
    { name: "m3", label: "M³", type: "number" },
    { name: "peso_total", label: "Peso Máx (kg)", type: "number" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleSave = async (data: Record<string, any>) => {
    // Auto-generate descricao
    data.descricao = buildDescricao(
      String(data.rua || "0"),
      String(data.predio || "0"),
      String(data.nivel || "0"),
      String(data.apto || "0")
    );
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
      <CrudTable
        title="Localizações / Endereços"
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
        newLabel="Novo Endereço"
        searchPlaceholder="Buscar por endereço..."
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
              Imprimir Selecionados ({selectedIds.size})
            </button>
          ) : undefined
        }
        extraRowActions={(row) => (
          <button
            onClick={() => handlePrintSingle(row)}
            className="w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center"
            title="Imprimir etiqueta"
          >
            <Printer size={13} />
          </button>
        )}
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Endereço" : "Novo Endereço"}
        fields={fields}
        initialData={editItem}
        onSave={handleSave}
      />
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
      <PrintEtiquetaEnderecoModal
        open={printOpen}
        onClose={() => { setPrintOpen(false); setPrintEnderecos([]); }}
        enderecos={printEnderecos}
      />
    </>
  );
}
