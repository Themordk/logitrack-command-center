import { useEffect, useState } from "react";
import { useTenant } from "@/contexts/TenantContext";
import { ReportHeader } from "../components/ReportHeader";
import { ReportTable, type ReportColumn } from "../components/ReportTable";
import {
  fetchPickingNaoCadastrado,
  type PickingNaoCadastradoRow,
} from "./pickingNaoCadastrado.service";
import { Button } from "@/components/ui/button";
import { Search, ArrowLeft } from "lucide-react";
import { nowDisplay, formatDateTimeShort } from "@/utils/dateTime";
import { exportToExcel, exportToPdf, fmtDateTimeBR, type ExportColumn } from "../utils/exporters";

export function PickingNaoCadastradoReportPage({ onNavigate }: { onNavigate?: (p: string) => void }) {
  const { tenantId, empresaId, empresaVersion, armazemId, usuarioNome } = useTenant();
  const [data, setData] = useState<PickingNaoCadastradoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  const handleGenerate = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const rows = await fetchPickingNaoCadastrado({
        tenant_id: tenantId,
        empresa_id: empresaId || undefined,
        armazem_id: armazemId || undefined,
      });
      setData(rows);
      setGeneratedAt(nowDisplay());
      setGenerated(true);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Reset ao trocar empresa/armazém
  useEffect(() => {
    setData([]);
    setGenerated(false);
    setGeneratedAt("");
  }, [empresaId, empresaVersion, armazemId]);

  // Auto-gerar na primeira renderização (padrão do relatório operacional)
  useEffect(() => {
    if (tenantId && empresaId && !generated && !loading) {
      handleGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, armazemId]);

  const columns: ReportColumn[] = [
    { key: "sku", label: "SKU", width: "110px", render: (v) => <span className="font-mono text-foreground">{v}</span> },
    { key: "referencia", label: "Referência", width: "120px", render: (v) => <span className="font-mono text-[10px]">{v || "—"}</span> },
    { key: "descricao", label: "Descrição", width: "320px", render: (v) => <span className="truncate block max-w-[320px]" title={v}>{v}</span> },
    { key: "numero_movimento", label: "Movimento", width: "100px", align: "center", render: (v) => <span className="font-mono text-foreground">#{v ?? "—"}</span> },
    { key: "created_at", label: "Data Criação", width: "130px", render: (v) => <span className="text-[10px]">{formatDateTimeShort(v)}</span> },
  ];

  const exportColumns: ExportColumn[] = [
    { key: "sku", label: "SKU" },
    { key: "referencia", label: "Referência" },
    { key: "descricao", label: "Descrição" },
    { key: "numero_movimento", label: "Movimento", format: (r) => r.numero_movimento != null ? `#${r.numero_movimento}` : "" },
    { key: "created_at", label: "Data Criação", format: (r) => fmtDateTimeBR(r.created_at) },
  ];

  const activeFilters: Record<string, string> = {};
  if (generated) activeFilters["Itens"] = String(data.length);

  const canExport = generated && data.length > 0;
  const handleExcel = () => exportToExcel("itens_sem_picking", exportColumns, data);
  const handlePdf = () =>
    exportToPdf("itens_sem_picking", exportColumns, data, {
      title: "Itens sem Endereço de Picking Cadastrado",
      generatedAt,
      usuario: usuarioNome || "—",
      total: data.length,
      filters: activeFilters,
    });
  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-4">
      <div className="flex items-center gap-2">
        {onNavigate && (
          <button
            onClick={() => onNavigate("/atividades/movimentos")}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            title="Voltar"
          >
            <ArrowLeft size={16} className="text-muted-foreground" />
          </button>
        )}
        <div className="flex-1">
          <ReportHeader
            title="Itens sem Endereço de Picking"
            subtitle="Produtos em movimentos de entrada em aberto que ainda não possuem picking cadastrado"
            generatedAt={generated ? generatedAt : "—"}
            total={generated ? data.length : undefined}
            filters={generated ? activeFilters : undefined}
            onExportExcel={canExport ? handleExcel : undefined}
            onExportPdf={canExport ? handlePdf : undefined}
            onPrint={canExport ? handlePrint : undefined}
            exportDisabled={!canExport}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleGenerate} disabled={loading}>
          <Search size={14} />{loading ? "Gerando..." : "Atualizar"}
        </Button>
      </div>

      {generated && (
        <ReportTable
          columns={columns}
          data={data}
          loading={loading}
          emptyMessage="Todos os produtos em movimentos de entrada em aberto possuem picking cadastrado."
        />
      )}
    </div>
  );
}
