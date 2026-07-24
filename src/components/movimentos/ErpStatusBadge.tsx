import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  status: string | null | undefined;
  tipo: "entrada" | "saida";
  className?: string;
  /** Força modo compacto (apenas ícone) independente do viewport. */
  compact?: boolean;
}

type Variant = { label: string; icon: typeof CheckCircle2; className: string };

function resolve(status: string | null | undefined, tipo: "entrada" | "saida"): Variant | null {
  if (!status) return null;
  if (tipo === "entrada") {
    if (status === "EXPORTADO") {
      return {
        label: "Exportado ERP",
        icon: CheckCircle2,
        className:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
      };
    }
    if (status === "ARMAZENADO") {
      return {
        label: "Aguardando ERP",
        icon: Clock,
        className:
          "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      };
    }
    return null;
  }
  // saida
  if (status === "EXPORTADA_ERP") {
    return {
      label: "Exportado ERP",
      icon: CheckCircle2,
      className:
        "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    };
  }
  if (status === "CONCLUIDA") {
    return {
      label: "Aguardando ERP",
      icon: Clock,
      className:
        "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    };
  }
  return null;
}

export function ErpStatusBadge({ status, tipo, className, compact }: Props) {
  const isMobile = useIsMobile();
  const v = resolve(status, tipo);
  if (!v) return null;
  const Icon = v.icon;
  const onlyIcon = compact || isMobile;
  return (
    <span
      title={v.label}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        v.className,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {!onlyIcon && <span>{v.label}</span>}
    </span>
  );
}

export function erpBadgeApplies(status: string | null | undefined, tipo: "entrada" | "saida") {
  return resolve(status, tipo) !== null;
}
