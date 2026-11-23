import { cn } from "@/lib/utils";
import {
  ajudaEntrega, entregaPedido, etapaPedido, VISUAL_ENTREGA, VISUAL_ETAPA,
} from "@/lib/situacaoPedido";

const base = "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-medium whitespace-nowrap";

/** Selo da etapa operacional do pedido (S2). Só exibe o valor calculado no banco. */
export function EtapaPedidoBadge({ etapa, complemento, className }: { etapa: string | null | undefined; complemento?: string | null; className?: string }) {
  const e = etapaPedido(etapa);
  if (!e) return null;
  const v = VISUAL_ETAPA[e];
  return (
    <span className={cn(base, v.classe, className)} title={`Etapa: ${v.rotulo}${complemento ? ` · ${complemento}` : ""}`}>
      {v.rotulo}{complemento ? <span className="opacity-80">· {complemento}</span> : null}
    </span>
  );
}

/** Selo da situação de entrega do pedido (S2). */
export function EntregaPedidoBadge({ entrega, motivo, complemento, className, mostrarSemEntrega = true }: {
  entrega: string | null | undefined; motivo?: string | null; complemento?: string | null; className?: string; mostrarSemEntrega?: boolean;
}) {
  const e = entregaPedido(entrega);
  if (!e || (e === "nao_se_aplica" && !mostrarSemEntrega)) return null;
  const v = VISUAL_ENTREGA[e];
  return (
    <span className={cn(base, v.classe, className)} title={`${ajudaEntrega(e, motivo)}${complemento ? ` (${complemento})` : ""}`}>
      {v.rotulo}{complemento ? <span className="opacity-80">· {complemento}</span> : null}
    </span>
  );
}
