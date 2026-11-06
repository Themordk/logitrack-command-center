import { AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { calcularPrazo, formatarHorasParado } from "@/lib/armazenagemOrigem";
export function PrazoCancelamentoBadge({ entrada, horas = 0, prazo = 2, agora }: { entrada?: string | null; horas?: number; prazo?: number; agora?: number }) {
  const { horasParado, status } = calcularPrazo(entrada, horas, prazo, agora);
  const Icone = status === "VENCIDO" ? AlertTriangle : status === "ATENCAO" ? Clock : CheckCircle;
  const texto = status === "VENCIDO" ? "VENCIDO" : status === "ATENCAO" ? "ATENÇÃO" : "No prazo";
  return <Badge variant="outline" className={`gap-1 shrink-0 ${status === "VENCIDO" ? "prazo-vencido" : status === "ATENCAO" ? "prazo-atencao" : "prazo-normal"}`}><Icone size={13} />{texto} · {formatarHorasParado(horasParado)}</Badge>;
}