import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useRefreshCooldown } from "@/hooks/useRefreshCooldown";

interface Props {
  onRefresh: () => void | Promise<void>;
  cooldownMs?: number;
  successMessage?: string;
}

export function RefreshListButton({ onRefresh, cooldownMs = 3000, successMessage = "Lista atualizada" }: Props) {
  const { refresh, state, secondsLeft } = useRefreshCooldown(async () => {
    await onRefresh();
    toast.success(successMessage);
  }, cooldownMs);

  const disabled = state !== "idle";
  const isLoading = state === "loading";
  const isCooldown = state === "cooldown";

  return (
    <button
      type="button"
      onClick={refresh}
      disabled={disabled}
      aria-label="Atualizar lista"
      className={`relative shrink-0 w-10 h-10 rounded-full border flex items-center justify-center transition-all ${
        isCooldown
          ? "border-[hsl(222,35%,22%)] bg-[hsl(222,40%,12%)] text-[hsl(213,31%,45%)]"
          : isLoading
          ? "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,60%)]"
          : "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,60%)] active:scale-95"
      }`}
    >
      <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
      {isCooldown && secondsLeft > 0 && (
        <span className="absolute -bottom-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[hsl(222,40%,18%)] border border-[hsl(222,35%,28%)] text-[9px] font-bold text-[hsl(213,31%,70%)] flex items-center justify-center">
          {secondsLeft}
        </span>
      )}
    </button>
  );
}
