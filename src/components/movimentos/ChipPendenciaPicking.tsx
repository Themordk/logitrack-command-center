import { AlertTriangle } from "lucide-react";
import type { SituacaoSaldo } from "@/lib/pendenciasPicking.types";

export function ChipPendenciaPicking({ situacao }: { situacao: SituacaoSaldo }) {
  if (situacao === "OK") return null;
  return <span className="inline-flex items-center gap-1 bg-destructive/15 text-destructive border border-destructive/30 text-[11px] px-2 py-0.5 rounded uppercase font-medium"><AlertTriangle size={12} />{situacao === "SEM_PICKING_MAPEADO" ? "Sem picking" : situacao === "SEM_SALDO_ENDERECO" ? "Sem saldo endereço" : "Sem saldo picking"}</span>;
}