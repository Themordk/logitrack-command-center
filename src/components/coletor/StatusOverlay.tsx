import { useEffect, useState } from "react";
import { Check, X, AlertTriangle } from "lucide-react";

export type OverlayType = "success" | "error" | "warning" | null;

interface StatusOverlayProps {
  type: OverlayType;
  message?: string;
  onDone?: () => void;
  duration?: number;
}

const config = {
  success: { bg: "rgba(34,197,94,0.25)", icon: Check, color: "#22C55E", defaultMsg: "Confirmado!" },
  error: { bg: "rgba(224,36,36,0.25)", icon: X, color: "#E02424", defaultMsg: "Erro!" },
  warning: { bg: "rgba(245,158,11,0.25)", icon: AlertTriangle, color: "#F59E0B", defaultMsg: "Atenção!" },
};

export function StatusOverlay({ type, message, onDone, duration = 800 }: StatusOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!type) { setVisible(false); return; }
    setVisible(true);
    const t = setTimeout(() => { setVisible(false); onDone?.(); }, duration);
    return () => clearTimeout(t);
  }, [type, duration, onDone]);

  if (!visible || !type) return null;
  const c = config[type];
  const Icon = c.icon;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none animate-in fade-in duration-150" style={{ backgroundColor: c.bg }}>
      <Icon size={72} color={c.color} strokeWidth={3} />
      <span className="mt-3 text-2xl font-bold" style={{ color: c.color }}>{message || c.defaultMsg}</span>
    </div>
  );
}
