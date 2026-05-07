import { LogsPanel } from "./LogsPanel";
import { FilasPanel } from "./FilasPanel";

interface Props {
  tenantId: string;
  empresaId: string;
}

export function LogsFilasTab({ tenantId, empresaId }: Props) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-[600px]">
      <LogsPanel tenantId={tenantId} empresaId={empresaId} />
      <FilasPanel tenantId={tenantId} empresaId={empresaId} />
    </div>
  );
}
