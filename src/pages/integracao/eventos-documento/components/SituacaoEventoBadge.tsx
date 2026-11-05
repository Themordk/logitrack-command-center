import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StatusRetornoBadge } from "../../retornos/components/StatusRetornoBadge";
import type { StatusExecucao } from "../../retornos/retornos.types";
import type { FonteEvento } from "../eventosDocumento.types";
import { situacaoUi } from "../eventosDocumentoUi";

export function SituacaoEventoBadge({ fonte, situacao }: { fonte: FonteEvento; situacao: string | null }) {
  if (!situacao) return <span className="text-muted-foreground">—</span>;
  if (fonte === "retorno_execucao") return <StatusRetornoBadge tipo="execucao" status={situacao as StatusExecucao} />;
  const ui = situacaoUi(situacao);
  if (!ui) return <Badge variant="outline" className="text-[10px]">{situacao}</Badge>;
  const Icone = ui.icone;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px] font-medium", ui.classe)}>
      <Icone size={11} aria-hidden />
      {ui.rotulo}
    </Badge>
  );
}
