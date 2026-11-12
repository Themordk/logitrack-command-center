import { useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { useCrud } from "@/hooks/useCrud";
import { CrudTable, type ColumnSpec } from "@/components/crud/CrudTable";
import { CrudModal, type FieldSpec } from "@/components/crud/CrudModal";
import { DeleteConfirmDialog } from "@/components/crud/DeleteConfirmDialog";
import { Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cargaService } from "@/lib/cargaService";
import { imprimirEtiquetaVeiculo } from "@/lib/etiquetaVeiculoPdf";
import { abrirJanelaImpressao } from "@/modules/reports/utils/exporters";
import { parseError } from "@/lib/errorMapper";

interface VeiculoLinha { id: string; descricao: string; placa: string | null; tipo_veiculo: string | null; codigo_identificacao: string }

const botaoAcao = "w-7 h-7 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center";

export function VeiculosPage() {
  const { tenantId, empresaId } = useTenant();
  const crud = useCrud({ table: "veiculos", tenantId, orderBy: "descricao" });
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [novoCodigoItem, setNovoCodigoItem] = useState<VeiculoLinha | null>(null);

  const imprimirEtiqueta = (row: VeiculoLinha) => {
    const janela = abrirJanelaImpressao(); // reservada no clique para não ser bloqueada
    imprimirEtiquetaVeiculo([{ codigo_identificacao: row.codigo_identificacao, descricao: row.descricao, placa: row.placa, tipo_veiculo: row.tipo_veiculo }], janela);
  };

  const gerarNovoCodigo = async () => {
    if (!novoCodigoItem || !tenantId) return;
    try {
      const r = await cargaService.veiculoNovoCodigo(tenantId, novoCodigoItem.id);
      toast.success(r.mensagem ?? "Novo código gerado.");
      const atualizado: VeiculoLinha = { ...novoCodigoItem, codigo_identificacao: r.dados?.codigo_identificacao ?? novoCodigoItem.codigo_identificacao };
      await crud.refresh();
      imprimirEtiqueta(atualizado);
    } catch (e) {
      const p = parseError(e, "veiculo-codigo");
      toast.error(p.title, { description: p.instruction ?? p.details });
    } finally {
      setNovoCodigoItem(null);
    }
  };

  const columns: ColumnSpec[] = [
    { key: "placa", label: "Placa", type: "mono" },
    { key: "descricao", label: "Descrição" },
    { key: "tipo_veiculo", label: "Tipo" },
    { key: "ano", label: "Ano" },
    { key: "peso_total", label: "Peso Total", type: "number" },
    { key: "m3", label: "M³", type: "number" },
    { key: "total_pallet", label: "Pallets", type: "number" },
    { key: "ativo", label: "Status", type: "badge" },
  ];

  const fields: FieldSpec[] = [
    { name: "placa", label: "Placa", type: "text", required: true, placeholder: "ABC-1234" },
    { name: "descricao", label: "Descrição", type: "text", required: true, placeholder: "Descrição do veículo" },
    { name: "tipo_veiculo", label: "Tipo de Veículo", type: "enum", required: true, enumValues: ["VUC", "3/4", "TOCO", "TRUCK", "BITRUCK", "BITREM", "RODOTREM", "OUTROS"] },
    { name: "ano", label: "Ano", type: "number", required: true, placeholder: "2024" },
    { name: "peso_total", label: "Peso Total (kg)", type: "number", placeholder: "25000" },
    { name: "m3", label: "Capacidade M³", type: "number", placeholder: "90" },
    { name: "total_pallet", label: "Total Pallets", type: "number", placeholder: "30" },
    { name: "ativo", label: "Ativo", type: "switch", defaultValue: true },
  ];

  const handleSave = async (data: Record<string, any>) => {
    if (empresaId) data.empresa_id = empresaId;
    if (editItem) return crud.update(editItem.id, data);
    return crud.create(data);
  };

  return (
    <>
      <CrudTable
        title="Veículos"
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
        extraRowActions={(row) => (
          <>
            <button type="button" onClick={() => imprimirEtiqueta(row)} className={botaoAcao}
              title="Imprimir etiqueta do veículo (QR para o embarque)" aria-label={`Imprimir etiqueta do veículo ${row.placa ?? row.descricao}`}>
              <Printer size={13} />
            </button>
            <button type="button" onClick={() => setNovoCodigoItem(row)} className={botaoAcao}
              title="Gerar novo código (invalida a etiqueta atual)" aria-label={`Gerar novo código do veículo ${row.placa ?? row.descricao}`}>
              <RefreshCw size={13} />
            </button>
          </>
        )}
        newLabel="Novo Veículo"
        searchPlaceholder="Buscar por placa ou descrição..."
      />
      <CrudModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editItem ? "Editar Veículo" : "Novo Veículo"}
        fields={fields}
        initialData={editItem}
        onSave={handleSave}
      />
      <AlertDialog open={!!novoCodigoItem} onOpenChange={(o) => { if (!o) setNovoCodigoItem(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar novo código do veículo {novoCodigoItem?.placa ?? ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              A etiqueta atual deixa de valer no embarque e a nova é aberta para impressão. Use quando a etiqueta for perdida, danificada ou copiada.
              Cargas abertas deste veículo precisarão confirmar o veículo de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void gerarNovoCodigo()}>Gerar e imprimir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <DeleteConfirmDialog
        open={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={async () => deleteItem ? crud.remove(deleteItem.id) : false}
      />
    </>
  );
}
