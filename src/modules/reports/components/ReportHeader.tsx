import { useTenant } from "@/contexts/TenantContext";
import { FileText, Printer, FileSpreadsheet, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  filters?: Record<string, string>;
  generatedAt: string;
  total?: number;
}

export function ReportHeader({ title, subtitle, filters, generatedAt, total }: ReportHeaderProps) {
  const { usuarioNome } = useTenant();

  return (
    <div className="space-y-3 print:space-y-1">
      {/* Title bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <FileText size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled title="Em breve">
            <FileDown size={14} />
            <span className="hidden sm:inline">Exportar PDF</span>
          </Button>
          <Button variant="outline" size="sm" disabled title="Em breve">
            <FileSpreadsheet size={14} />
            <span className="hidden sm:inline">Exportar Excel</span>
          </Button>
          <Button variant="outline" size="sm" disabled title="Em breve">
            <Printer size={14} />
            <span className="hidden sm:inline">Imprimir</span>
          </Button>
        </div>
      </div>

      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground border border-border rounded-lg px-4 py-2 bg-card">
        <span>Gerado em: <span className="text-foreground font-medium">{generatedAt}</span></span>
        <span>Usuário: <span className="text-foreground font-medium">{usuarioNome || "—"}</span></span>
        {total !== undefined && (
          <span>Registros: <span className="text-foreground font-medium">{total}</span></span>
        )}
        {filters && Object.entries(filters).filter(([, v]) => v).map(([k, v]) => (
          <span key={k} className="bg-secondary px-2 py-0.5 rounded text-foreground">{k}: {v}</span>
        ))}
      </div>
    </div>
  );
}
