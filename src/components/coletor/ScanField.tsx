import { useRef, useEffect, useState } from "react";
import { ScanLine } from "lucide-react";
import { useFeedback } from "@/hooks/useFeedback";

interface ScanFieldProps {
  label?: string;
  lastScanned?: string;
  onScan: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Called when scan is rejected (triggers error feedback) */
  onError?: () => void;
  /** Suppress virtual keyboard for hardware scanners */
  suppressKeyboard?: boolean;
}

export function ScanField({
  label = "Escanear código",
  lastScanned,
  onScan,
  disabled,
  placeholder = "Aguardando leitura…",
  suppressKeyboard,
}: ScanFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const feedback = useFeedback();

  // Read preference from localStorage if not explicitly set
  const shouldSuppressKeyboard = suppressKeyboard ?? localStorage.getItem("coletor_tipo_dispositivo") === "coletor";

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  // Re-focus when overlays close
  useEffect(() => {
    const handleFocus = () => {
      if (!disabled) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    };
    document.addEventListener("visibilitychange", handleFocus);
    return () => document.removeEventListener("visibilitychange", handleFocus);
  }, [disabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      feedback.success();
      onScan(value.trim());
      setValue("");
    }
  };

  return (
    <div
      className="relative rounded-xl border-2 border-dashed border-primary/40 bg-card p-4 flex flex-col items-center gap-2 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <ScanLine size={32} className="text-primary" />
      <span className="text-base font-semibold text-muted-foreground">{label}</span>
      {lastScanned && (
        <span className="text-sm text-muted-foreground">Último: <span className="font-mono font-bold text-foreground">{lastScanned}</span></span>
      )}
      {!lastScanned && (
        <span className="text-sm text-muted-foreground/60">{placeholder}</span>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        inputMode={shouldSuppressKeyboard ? "none" : undefined}
        className="absolute inset-0 opacity-0 w-full h-full cursor-text"
        autoComplete="off"
      />
    </div>
  );
}
