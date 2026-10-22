import { FileDown, FileSpreadsheet, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExportActionsProps {
  onExportPdf?: () => void;
  onExportExcel?: () => void;
  onPrint?: () => void;
  disabled?: boolean;
  loading?: "pdf" | "excel" | "print" | null;
  disabledTitle?: string;
}

/** Botões de exportação dos relatórios (PDF, Excel, Imprimir), reutilizável. */
export function ExportActions({
  onExportPdf,
  onExportExcel,
  onPrint,
  disabled,
  loading,
  disabledTitle = "Gere o relatório primeiro",
}: ExportActionsProps) {
  const busy = !!loading;
  const botoes = [
    { key: "pdf" as const, onClick: onExportPdf, icon: FileDown, label: "Exportar PDF" },
    { key: "excel" as const, onClick: onExportExcel, icon: FileSpreadsheet, label: "Exportar Excel" },
    { key: "print" as const, onClick: onPrint, icon: Printer, label: "Imprimir" },
  ];

  return (
    <div className="flex items-center gap-2">
      {botoes.map(({ key, onClick, icon: Icon, label }) => (
        <Button
          key={key}
          variant="outline"
          size="sm"
          onClick={onClick}
          disabled={disabled || busy || !onClick}
          title={onClick ? label : disabledTitle}
        >
          {loading === key ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
          <span className="hidden sm:inline">{label}</span>
        </Button>
      ))}
    </div>
  );
}
