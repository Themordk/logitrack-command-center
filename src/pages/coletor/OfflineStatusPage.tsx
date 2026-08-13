import { useCallback, useEffect, useState } from "react";
import { ColetorLayout } from "@/components/coletor/ColetorLayout";
import { ActionButton } from "@/components/coletor/ActionButton";
import { useOffline } from "@/contexts/OfflineContext";
import { OfflineStore, type PendingAction } from "@/lib/offlineStore";
import { AlertTriangle, CheckCircle, Cloud, Database, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/utils/dateTime";

interface Props { onNavigate: (path: string) => void; }

const ACTION_LABELS: Record<string, string> = {
  // Separação
  separacao_executar_coleta: "Confirmar coleta de separação",
  separacao_confirmar_endereco: "Confirmar endereço de separação",
  gerar_volumes_expedicao: "Gerar volumes de expedição",
  // Conferência
  conferencia_saida_confirmacao: "Confirmar item de conferência",
  separacao_conferencia_limpar_item: "Limpar item de conferência",
  // Armazenagem
  rpc_coletor_armazenagem_execucao: "Confirmar armazenagem",
  finalizar_armazenagem: "Finalizar armazenagem",
  // Inventário
  fn_inventario_registrar_contagem: "Registrar contagem de inventário",
  fn_inventario_contagem_livre: "Registrar contagem livre",
  // Recebimento
  finalizar_conferencia_entrada_item: "Confirmar item de recebimento",
  finalizar_conferencia_entrada_movimento: "Finalizar conferência de entrada",
  fn_limpar_conferencia_entrada: "Limpar conferência de entrada",
  // Abastecimento
  rpc_coletor_abastecimento_confirmar_coleta: "Confirmar coleta de abastecimento",
  rpc_coletor_abastecimento_confirmar_entrega: "Confirmar entrega de abastecimento",
};

function labelFor(action: string) {
  return ACTION_LABELS[action] || action;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflineStatusPage({ onNavigate }: Props) {
  const { isOnline, isSyncing, lastCheckAt, lastSyncAt, syncNow, retryAction, checkNow, refreshCounts } = useOffline();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [cacheCount, setCacheCount] = useState(0);
  const [cacheSize, setCacheSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [all, entries, size] = await Promise.all([
        OfflineStore.getAllActions(),
        OfflineStore.getCacheEntries(),
        OfflineStore.getCacheSizeBytes(),
      ]);
      setActions(all.filter((a) => a.status !== "synced"));
      setCacheCount(entries.length);
      setCacheSize(size);
    } catch {
      toast.error("Não foi possível ler o armazenamento local.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, isSyncing]);

  const handleTest = async () => {
    setTesting(true);
    const ok = await checkNow();
    setTesting(false);
    if (ok) toast.success("Conexão disponível.");
    else toast.error("Sem conexão com o servidor.");
  };

  const handleSync = async () => {
    await syncNow();
    await load();
    toast.success("Sincronização concluída.");
  };

  const handleRetry = async (id: string) => {
    await retryAction(id);
    await load();
  };

  const handleClearCache = async () => {
    if (!confirmClear) { setConfirmClear(true); return; }
    await OfflineStore.clearAllCache();
    setConfirmClear(false);
    await load();
    toast.success("Cache limpo.");
  };

  const statusBadge = (a: PendingAction) => {
    if (a.status === "failed") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">FALHOU</span>;
    if (a.status === "syncing") return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">SINCRONIZANDO</span>;
    return <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">PENDENTE</span>;
  };

  return (
    <ColetorLayout title="Status Offline" onNavigate={onNavigate} showBack backPath="/coletor/configuracoes">
      <div className="flex flex-col gap-4">
        {/* Conexão */}
        <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            {isOnline ? <Wifi size={20} className="text-green-400" /> : <WifiOff size={20} className="text-yellow-400" />}
            <span className={`text-base font-bold ${isOnline ? "text-green-400" : "text-yellow-400"}`}>
              {isOnline ? "Conectado" : "Sem conexão"}
            </span>
          </div>
          <p className="text-xs text-[hsl(213,31%,55%)]">
            Última verificação: {lastCheckAt ? formatDateTime(lastCheckAt.toISOString()) : "—"}
          </p>
          <ActionButton variant="secondary" onClick={handleTest} loading={testing}>
            <RefreshCw size={18} /> Testar conexão agora
          </ActionButton>
        </section>

        {/* Fila */}
        <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Cloud size={20} className="text-[hsl(217,91%,60%)]" />
            <span className="text-base font-bold text-white">Fila de sincronização</span>
          </div>
          <p className="text-xs text-[hsl(213,31%,55%)]">
            Última sincronização: {lastSyncAt ? formatDateTime(lastSyncAt.toISOString()) : "—"}
          </p>

          {loading ? (
            <div className="py-6 flex justify-center"><Loader2 size={22} className="animate-spin text-[hsl(217,91%,60%)]" /></div>
          ) : actions.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2">
              <CheckCircle size={28} className="text-green-400" />
              <span className="text-sm text-[hsl(213,31%,55%)]">Nenhuma ação pendente.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {actions.map((a) => (
                <div key={a.id} className="rounded-xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,9%)] p-3 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-white truncate">{labelFor(a.action)}</span>
                    {statusBadge(a)}
                  </div>
                  <span className="text-[11px] text-[hsl(213,31%,55%)] font-mono">
                    {formatDateTime(new Date(a.timestamp).toISOString())}
                  </span>
                  {a.status === "failed" && (
                    <>
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                        <span className="text-[11px] text-red-300 break-words">{a.errorMessage}</span>
                      </div>
                      <button
                        onClick={() => handleRetry(a.id)}
                        disabled={!isOnline}
                        className="self-start min-h-[48px] px-3 text-xs font-bold text-[hsl(217,91%,70%)] disabled:opacity-40"
                      >
                        Tentar novamente
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {isOnline && actions.length > 0 && (
            <ActionButton onClick={handleSync} loading={isSyncing}>
              <RefreshCw size={18} /> Sincronizar agora
            </ActionButton>
          )}
        </section>

        {/* Cache */}
        <section className="rounded-2xl border border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Database size={20} className="text-[hsl(280,70%,60%)]" />
            <span className="text-base font-bold text-white">Cache de dados</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[hsl(213,31%,55%)]">
            <span>Registros em cache</span>
            <span className="font-mono text-[hsl(213,31%,91%)]">{cacheCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-[hsl(213,31%,55%)]">
            <span>Espaço aproximado</span>
            <span className="font-mono text-[hsl(213,31%,91%)]">{formatBytes(cacheSize)}</span>
          </div>
          <ActionButton variant={confirmClear ? "danger" : "secondary"} onClick={handleClearCache}>
            {confirmClear ? "Confirmar limpeza do cache" : "Limpar cache"}
          </ActionButton>
        </section>
      </div>
    </ColetorLayout>
  );
}
