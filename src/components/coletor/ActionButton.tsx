import { Loader2 } from "lucide-react";

interface ActionButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "success" | "danger" | "warning" | "secondary";
  type?: "button" | "submit";
  className?: string;
}

const variantStyles: Record<string, string> = {
  primary: "bg-[hsl(217,91%,50%)] active:bg-[hsl(217,91%,40%)] text-white",
  success: "bg-[#22C55E] active:bg-[#16a34a] text-white",
  danger: "bg-[#E02424] active:bg-[#b91c1c] text-white",
  warning: "bg-[#F59E0B] active:bg-[#d97706] text-white",
  secondary: "bg-[hsl(222,35%,20%)] active:bg-[hsl(222,35%,16%)] text-[hsl(213,31%,91%)] border border-[hsl(222,35%,28%)]",
};

export function ActionButton({ children, onClick, disabled, loading, variant = "primary", type = "button", className = "" }: ActionButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`w-full h-[52px] rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all duration-100 active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${variantStyles[variant]} ${className}`}
    >
      {loading ? <Loader2 size={20} className="animate-spin" /> : children}
    </button>
  );
}
