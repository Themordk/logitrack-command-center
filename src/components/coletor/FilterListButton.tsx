import { SlidersHorizontal } from "lucide-react";

interface Props {
  onClick: () => void;
  activeCount?: number;
}

export function FilterListButton({ onClick, activeCount = 0 }: Props) {
  const active = activeCount > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Filtrar lista"
      className={`relative shrink-0 w-10 h-10 rounded-full border flex items-center justify-center transition-all active:scale-95 ${
        active
          ? "border-amber-500 bg-amber-500/15 text-amber-400"
          : "border-[hsl(217,91%,60%)] bg-[hsl(217,91%,50%)]/10 text-[hsl(217,91%,60%)]"
      }`}
    >
      <SlidersHorizontal size={18} />
      {active && (
        <span className="absolute -bottom-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-amber-500 border border-amber-400 text-[9px] font-bold text-black flex items-center justify-center">
          {activeCount}
        </span>
      )}
    </button>
  );
}
