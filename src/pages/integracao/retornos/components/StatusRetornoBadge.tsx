import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_EXECUCAO_UI, STATUS_FLUXO_UI, STATUS_PASSO_UI, type ApresentacaoStatus } from "../retornosUi";
import type { StatusExecucao, StatusFluxo, StatusPasso } from "../retornos.types";

type Props =
  | { tipo: "execucao"; status: StatusExecucao; className?: string }
  | { tipo: "passo"; status: StatusPasso; className?: string }
  | { tipo: "fluxo"; status: StatusFluxo; className?: string };

export function StatusRetornoBadge(props: Props) {
  let ui: ApresentacaoStatus | undefined;
  if (props.tipo === "execucao") ui = STATUS_EXECUCAO_UI[props.status];
  else if (props.tipo === "passo") ui = STATUS_PASSO_UI[props.status];
  else ui = STATUS_FLUXO_UI[props.status];
  if (!ui) return <Badge variant="outline" className="text-[10px]">{String(props.status)}</Badge>;
  const Icon = ui.icone;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px] font-medium", ui.classe, props.className)}>
      <Icon size={11} className={ui.iconeClasse} aria-hidden />
      {ui.rotulo}
    </Badge>
  );
}
