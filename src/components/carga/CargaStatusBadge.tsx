import { CheckCircle2, CircleDashed, Lock, Truck, XCircle } from "lucide-react";
import type { CargaStatus } from "@/lib/cargaService";
import { CARGA_STATUS_LABEL, CARGA_STATUS_TOM } from "@/lib/cargaExibicao";

const ICONE: Record<CargaStatus, typeof Truck> = {
  EM_MONTAGEM: CircleDashed,
  LIBERADA: CheckCircle2,
  EM_CARREGAMENTO: Truck,
  FECHADA: Lock,
  CANCELADA: XCircle,
};

/** Situação da carga com ícone + texto (não depende só da cor). */
export function CargaStatusBadge({ status }: { status: CargaStatus }) {
  const Icone = ICONE[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${CARGA_STATUS_TOM[status]}`}>
      <Icone size={12} aria-hidden="true" />
      {CARGA_STATUS_LABEL[status]}
    </span>
  );
}
