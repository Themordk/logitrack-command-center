import { WifiOff } from "lucide-react";
import { useOffline } from "@/contexts/OfflineContext";

/**
 * Aviso para fluxos que ainda não têm suporte offline (Transferência e
 * Mudança de Picking). Renderiza nada quando há conexão.
 */
export function OnlineOnlyNotice({ flow }: { flow?: string }) {
  const { isOnline } = useOffline();
  if (isOnline) return null;

  return (
    <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-3 flex items-start gap-2 mb-2">
      <WifiOff size={16} className="text-yellow-300 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-xs font-bold text-yellow-300">Este fluxo exige conexão</p>
        <p className="text-[11px] text-yellow-200/80 leading-tight">
          {flow ? `${flow} não está disponível offline. ` : ""}
          Restabeleça a conexão para continuar.
        </p>
      </div>
    </div>
  );
}

/** Conveniência: indica se o fluxo online-only deve ficar bloqueado. */
export function useOnlineOnlyBlocked() {
  const { isOnline } = useOffline();
  return !isOnline;
}
