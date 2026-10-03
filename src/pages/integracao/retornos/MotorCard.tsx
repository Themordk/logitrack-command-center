import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { definirMotor } from "./retornosService";
import { useRetornoConfig } from "./useRetornos";

export function MotorCard() {
  const { tenantId, empresaId } = useTenant();
  const qc = useQueryClient();
  const { data, isLoading } = useRetornoConfig();
  const [confirmar, setConfirmar] = useState(false);
  const [salvando, setSalvando] = useState(false);

  if (isLoading) return <Skeleton className="h-12 w-full rounded-lg" />;
  if (!data) return null;

  const fluxos = data.motor === "fluxos";
  const alvo = fluxos ? "legado" : "fluxos";

  async function trocar() {
    setSalvando(true);
    try {
      await definirMotor(tenantId as string, empresaId as string, alvo);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["retorno-config"] }),
        qc.invalidateQueries({ queryKey: ["retorno-fluxos"] }),
      ]);
      toast.success(alvo === "fluxos" ? "Motor de fluxos ativado." : "Retorno legado reativado.");
    } catch (e) {
      toast.error(parseError(e, "Definir motor de retorno").title);
    } finally {
      setSalvando(false);
      setConfirmar(false);
    }
  }

  return (
    <div className="card-surface px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 min-w-0">
        {fluxos ? (
          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 gap-1">
            <CheckCircle2 size={13} aria-hidden /> Motor de fluxos ativo
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
            <AlertTriangle size={13} aria-hidden /> Retorno legado ativo
          </Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {fluxos
            ? "O retorno legado está desligado para esta empresa."
            : "Os fluxos ativos também rodam. Com fluxos Omie ativos, o ERP pode receber o retorno em dobro."}
        </span>
      </div>
      <Button size="sm" variant="outline" disabled={salvando} onClick={() => setConfirmar(true)}>
        {fluxos ? "Voltar ao retorno legado" : "Usar motor de fluxos"}
      </Button>

      <AlertDialog open={confirmar} onOpenChange={(o) => { if (!salvando) setConfirmar(o); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{fluxos ? "Voltar ao retorno legado?" : "Usar o motor de fluxos?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {fluxos
                ? "O retorno legado volta a enviar ao ERP para esta empresa. Os fluxos ativos continuam rodando, então o ERP pode receber o retorno em dobro."
                : "O retorno legado será desligado para esta empresa. A partir de agora, só os fluxos publicados e ativos enviam retornos ao ERP."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={salvando} onClick={(e) => { e.preventDefault(); trocar(); }}>
              {salvando && <Loader2 size={14} className="animate-spin" />}
              {fluxos ? "Voltar ao legado" : "Usar motor de fluxos"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
