import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "core_tv_token";

function parseTokenFromHash(): string | null {
  const hash = window.location.hash.replace(/^#/, "");
  const qIdx = hash.indexOf("?");
  if (qIdx === -1) return null;
  const params = new URLSearchParams(hash.slice(qIdx + 1));
  const t = params.get("token");
  return t && /^[A-Z0-9]{4,12}$/i.test(t) ? t.toUpperCase() : null;
}

export function useTvToken(): [string | null, (t: string | null) => void] {
  const [token, setToken] = useState<string | null>(() => {
    return parseTokenFromHash() ?? localStorage.getItem(STORAGE_KEY);
  });

  useEffect(() => {
    const onHash = () => {
      const t = parseTokenFromHash();
      if (t) setToken(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const persist = (t: string | null) => {
    if (t) localStorage.setItem(STORAGE_KEY, t);
    else localStorage.removeItem(STORAGE_KEY);
    setToken(t);
  };

  return [token, persist];
}

export function TvTokenGate({
  onSubmit,
  errorMessage,
  loading,
}: {
  onSubmit: (token: string) => void;
  errorMessage?: string | null;
  loading?: boolean;
}) {
  const [value, setValue] = useState("");
  const canSubmit = useMemo(() => value.trim().length >= 4 && !loading, [value, loading]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#060b18",
        color: "#f8fafc",
        fontFamily: "Inter, -apple-system, sans-serif",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#0d1420",
          border: "1px solid #1a2540",
          borderRadius: 20,
          padding: "40px 36px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 11, letterSpacing: 4, textTransform: "uppercase", color: "#64748b" }}>
          CORE LogiTrack · Gestão à Vista
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginTop: 12, marginBottom: 8 }}>Código do armazém</h1>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 28 }}>
          Digite o código de 8 caracteres do painel de TV.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit(value.trim().toUpperCase());
          }}
        >
          <input
            autoFocus
            value={value}
            maxLength={12}
            onChange={(e) => setValue(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            placeholder="XXXXXXXX"
            style={{
              width: "100%",
              padding: "18px 16px",
              background: "#060b18",
              border: "1px solid #1a2540",
              borderRadius: 12,
              color: "#f8fafc",
              fontFamily: "'JetBrains Mono', ui-monospace, monospace",
              fontSize: 32,
              letterSpacing: "0.4em",
              textAlign: "center",
              outline: "none",
            }}
          />

          {errorMessage && (
            <div style={{ marginTop: 16, fontSize: 13, color: "#f87171" }}>{errorMessage}</div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              marginTop: 24,
              width: "100%",
              padding: "14px 20px",
              background: canSubmit ? "#3b82f6" : "#1a2540",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              cursor: canSubmit ? "pointer" : "not-allowed",
              transition: "background 0.2s",
            }}
          >
            {loading ? "Conectando..." : "Conectar"}
          </button>
        </form>
      </div>
    </div>
  );
}
