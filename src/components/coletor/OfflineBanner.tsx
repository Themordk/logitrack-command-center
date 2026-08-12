import { AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { useOffline } from "@/contexts/OfflineContext";

interface Props {
  onNavigate?: (path: string) => void;
}

export function OfflineBanner({ onNavigate }: Props) {
  const { isOnline, isSyncing, pendingCount, failedCount, syncProgress } = useOffline();

  if (isSyncing) {
    const total = syncProgress.total || pendingCount;
    return (
      <div className="shrink-0 px-3 py-1.5 bg-blue-500/15 border-b border-blue-500/30 flex items-center gap-2">
        <Loader2 size={14} className="animate-spin text-blue-300 shrink-0" />
        <span className="text-xs font-semibold text-blue-300 truncate">
          {total > 0 ? `Sincronizando ${syncProgress.current} de ${total} ações...` : "Sincronizando..."}
        </span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="shrink-0 px-3 py-1.5 bg-yellow-500/15 border-b border-yellow-500/30 flex items-center gap-2">
        <WifiOff size={14} className="text-yellow-300 shrink-0" />
        <div className="min-w-0">
          <span className="text-xs font-bold text-yellow-300">
            MODO OFFLINE{pendingCount > 0 ? ` — ${pendingCount} ${pendingCount === 1 ? "ação pendente" : "ações pendentes"}` : ""}
          </span>
          <p className="text-[10px] text-yellow-200/80 leading-tight">
            Suas ações serão enviadas quando a conexão retornar
          </p>
        </div>
      </div>
    );
  }

  if (failedCount > 0) {
    return (
      <div className="shrink-0 px-3 py-1.5 bg-red-500/15 border-b border-red-500/30 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle size={14} className="text-red-300 shrink-0" />
          <span className="text-xs font-semibold text-red-300 truncate">
            {failedCount} {failedCount === 1 ? "ação falhou" : "ações falharam"} ao sincronizar
          </span>
        </div>
        {onNavigate && (
          <button
            onClick={() => onNavigate("/coletor/offline-status")}
            className="text-[11px] font-bold text-red-200 underline underline-offset-2 shrink-0 px-1 py-1"
          >
            Ver detalhes
          </button>
        )}
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="shrink-0 px-3 py-1.5 bg-yellow-500/15 border-b border-yellow-500/30 flex items-center gap-2">
        <AlertTriangle size={14} className="text-yellow-300 shrink-0" />
        <span className="text-xs font-semibold text-yellow-300 truncate">
          {pendingCount} {pendingCount === 1 ? "ação aguardando" : "ações aguardando"} sincronização
        </span>
      </div>
    );
  }

  return null;
}
