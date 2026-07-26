import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TvShell } from "./TvShell";
import { TvTokenGate, useTvToken } from "./TvTokenGate";

interface OperacionalData {
  armazem: string;
  empresa: string;
  empresa_logo?: string | null;
  contadores: {
    aguardando_separacao: number;
    em_picking: number;
    separado: number;
    em_conferencia: number;
    conferido: number;
    expedidos_hoje: number;
  };
  tempos: {
    falhas_operacao: number;
    tempo_medio_separacao_segundos: number;
    tempo_medio_conferencia_segundos: number;
  };
}

const REFRESH_MS = 15_000;

function formatHMS(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function Card({
  label,
  value,
  color = "#f8fafc",
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  color?: string;
  mono?: boolean;
}) {
  return (
    <div
      style={{
        background: "#0d1420",
        border: "1px solid #1a2540",
        borderRadius: 16,
        padding: "28px 32px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: 180,
      }}
    >
      <div style={{ fontSize: 12, letterSpacing: 3, textTransform: "uppercase", color: "#64748b", fontWeight: 600 }}>
        {label}
      </div>
      <div
        style={{
          fontFamily: mono ? "'JetBrains Mono', ui-monospace, monospace" : undefined,
          fontSize: 72,
          fontWeight: 800,
          lineHeight: 1,
          color,
          textAlign: "right",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Footer({ tempos }: { tempos: OperacionalData["tempos"] }) {
  const falhas = tempos.falhas_operacao || 0;
  return (
    <div
      style={{
        marginTop: 24,
        background: "#0d1420",
        border: "1px solid #1a2540",
        borderRadius: 16,
        padding: "20px 32px",
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 32,
      }}
    >
      <div>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" }}>
          Falhas de operação
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 34,
            fontWeight: 700,
            marginTop: 6,
            color: falhas > 0 ? "#ef4444" : "#f8fafc",
          }}
        >
          {falhas}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" }}>
          Tempo médio separação
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 34,
            fontWeight: 700,
            marginTop: 6,
          }}
        >
          {formatHMS(tempos.tempo_medio_separacao_segundos)}
        </div>
      </div>
      <div>
        <div style={{ fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "#64748b" }}>
          Tempo médio conferência
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 34,
            fontWeight: 700,
            marginTop: 6,
          }}
        >
          {formatHMS(tempos.tempo_medio_conferencia_segundos)}
        </div>
      </div>
    </div>
  );
}

export function PainelTvOperacional() {
  const [token, setToken] = useTvToken();
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);

  const query = useQuery({
    queryKey: ["tv-op", token],
    enabled: !!token,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_painel_tv_operacional" as any, {
        p_tv_token: token,
      });
      if (error) throw error;
      return data as OperacionalData;
    },
  });

  useEffect(() => {
    if (!token) return;
    setCountdown(REFRESH_MS / 1000);
    const iv = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_MS / 1000 : c - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, [token, query.dataUpdatedAt]);

  if (!token) {
    return <TvTokenGate onSubmit={(t) => setToken(t)} />;
  }

  if (query.isError) {
    return (
      <TvTokenGate
        onSubmit={(t) => setToken(t)}
        errorMessage="Token inválido ou armazém indisponível."
      />
    );
  }

  const data = query.data;
  const c = data?.contadores;
  const aguardando = c?.aguardando_separacao ?? 0;
  const emSep = c?.em_picking ?? 0;
  const aguardConf = (c?.separado ?? 0) + (c?.em_conferencia ?? 0);
  const prontos = c?.conferido ?? 0;
  const expedidos = c?.expedidos_hoje ?? 0;
  const totalOp = aguardando + emSep + aguardConf + prontos;

  return (
    <TvShell
      title="Painel operacional"
      empresa={data?.empresa}
      armazem={data?.armazem}
      empresaLogo={data?.empresa_logo ?? null}
      refreshCountdown={countdown}
      refreshInterval={REFRESH_MS / 1000}
    >
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, flex: 1 }}>
        <Card label="Aguardando separação" value={aguardando} color={aguardando > 10 ? "#f59e0b" : "#f8fafc"} />
        <Card label="Em separação" value={emSep} color="#3b82f6" />
        <Card label="Aguardando conferência" value={aguardConf} color="#a855f7" />
        <Card label="Pronto para embarque" value={prontos} color="#22c55e" />
        <Card label="Expedidos hoje" value={expedidos} color="#06b6d4" />
        <Card label="Total em operação" value={totalOp} color="#f8fafc" />
      </div>
      {data?.tempos && <Footer tempos={data.tempos} />}
    </TvShell>
  );
}
