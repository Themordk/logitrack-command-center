import { useRef, useEffect, useState } from "react";
import { ScanLine } from "lucide-react";

interface ScanFieldProps {
  label?: string;
  lastScanned?: string;
  onScan: (code: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ScanField({ label = "Escanear código", lastScanned, onScan, disabled, placeholder = "Aguardando leitura…" }: ScanFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      onScan(value.trim());
      setValue("");
    }
  };

  return (
    <div
      className="relative rounded-xl border-2 border-dashed border-[hsl(217,91%,50%)]/40 bg-[hsl(222,40%,12%)] p-4 flex flex-col items-center gap-2 cursor-text"
      onClick={() => inputRef.current?.focus()}
    >
      <ScanLine size={32} className="text-[hsl(217,91%,60%)]" />
      <span className="text-base font-semibold text-[hsl(213,31%,75%)]">{label}</span>
      {lastScanned && (
        <span className="text-sm text-[hsl(213,31%,55%)]">Último: <span className="font-mono font-bold text-[hsl(213,31%,91%)]">{lastScanned}</span></span>
      )}
      {!lastScanned && (
        <span className="text-sm text-[hsl(213,31%,45%)]">{placeholder}</span>
      )}
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className="absolute inset-0 opacity-0 w-full h-full cursor-text"
        autoComplete="off"
      />
    </div>
  );
}
