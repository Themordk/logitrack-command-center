import { useRegisterSW } from "virtual:pwa-register/react";
import { RefreshCw } from "lucide-react";

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates every 60 minutes
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
    },
  });

  if (!needRefresh) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-primary text-primary-foreground flex items-center justify-between px-4 py-2 shadow-lg animate-fade-in">
      <div className="flex items-center gap-2 text-sm font-medium">
        <RefreshCw size={16} className="animate-spin" />
        <span>Nova versão disponível</span>
      </div>
      <button
        onClick={() => updateServiceWorker(true)}
        className="text-xs font-bold bg-primary-foreground text-primary px-3 py-1 rounded-md hover:opacity-90 transition-opacity"
      >
        Atualizar
      </button>
    </div>
  );
}
