import { LogsPanel } from "./LogsPanel";
import { FilasPanel } from "./FilasPanel";

interface Props {
  tenantId: string;
  empresaId: string;
  sistemaOrigem?: string;
}

export function LogsFilasTab({ tenantId, empresaId, sistemaOrigem }: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-[600px]">
      <LogsPanel tenantId={tenantId} empresaId={empresaId} sistemaOrigem={sistemaOrigem} />
      <FilasPanel tenantId={tenantId} empresaId={empresaId} sistemaOrigem={sistemaOrigem} />
    </div>
  );
}
