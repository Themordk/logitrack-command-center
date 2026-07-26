import { useEffect, useState } from "react";
import logoCore from "@/assets/corelogitrack-logo.png";

interface TvShellProps {
  title: string;
  empresa?: string | null;
  armazem?: string | null;
  empresaLogo?: string | null;
  refreshCountdown?: number;
  refreshInterval?: number;
  children: React.ReactNode;
}

export function TvShell({
  title,
  empresa,
  armazem,
  empresaLogo,
  refreshCountdown,
  refreshInterval,
  children,
}: TvShellProps) {
  const [now, setNow] = useState(() => new Date());
  const [logoOk, setLogoOk] = useState(true);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const clock = now.toLocaleTimeString("pt-BR", { hour12: false });
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#060b18",
        color: "#f8fafc",
        fontFamily: "Inter, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          borderBottom: "1px solid #1a2540",
          background: "#0a1220",
          gap: 24,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16, minWidth: 240 }}>
          {empresaLogo ? (
            <img src={empresaLogo} alt={empresa || ""} style={{ height: 56, maxWidth: 200, objectFit: "contain" }} />
          ) : (
            <div style={{ height: 56 }} />
          )}
        </div>

        <div style={{ textAlign: "center", flex: 1 }}>
          <div style={{ fontSize: 12, letterSpacing: 4, textTransform: "uppercase", color: "#64748b" }}>
            {title}
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, marginTop: 4, color: "#f8fafc" }}>
            {empresa || "—"}
            {armazem ? <span style={{ color: "#94a3b8", fontWeight: 500 }}> · {armazem}</span> : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 240, justifyContent: "flex-end" }}>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                fontSize: 32,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {clock}
            </div>
            <div style={{ fontSize: 11, color: "#64748b", textTransform: "capitalize", marginTop: 4 }}>{date}</div>
            {refreshCountdown != null && refreshInterval != null && (
              <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                Atualiza em {refreshCountdown}s
              </div>
            )}
          </div>
          {logoOk ? (
            <img
              src={logoCore}
              alt="CORE LogiTrack"
              onError={() => setLogoOk(false)}
              style={{ height: 44, objectFit: "contain", filter: "brightness(0) invert(1)" }}
            />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: 1 }}>CORE LogiTrack</div>
          )}
        </div>
      </header>

      <main style={{ flex: 1, padding: 32, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</main>
    </div>
  );
}
