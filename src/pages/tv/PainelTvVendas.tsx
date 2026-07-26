import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { TvShell } from "./TvShell";
import { TvTokenGate, useTvToken } from "./TvTokenGate";

interface PedidoBase {
  numero_pedido: number;
  cliente: string;
  status_onda: string;
  status_label: string;
  prioridade?: string;
  numero_onda?: number;
  data_emissao?: string;
  finalizado_em?: string;
}

interface VendasData {
  armazem: string;
  empresa: string;
  empresa_logo?: string | null;
  em_processamento: PedidoBase[];
  prontos: PedidoBase[];
}

const REFRESH_MS = 30_000;
const PAGE_SIZE = 8;
const PAGE_INTERVAL_MS = 5_000;

const STATUS_COLORS: Record<string, string> = {
  CRIADA: "#3b82f6",
  LIBERADO: "#3b82f6",
  EM_PICKING: "#f59e0b",
  SEPARADO: "#a855f7",
  EM_CONFERENCIA: "#f97316",
  CONFERIDO: "#22c55e",
  EM_CARREGAMENTO: "#06b6d4",
};

function StatusBadge({ status, label }: { status: string; label: string }) {
  const color = STATUS_COLORS[status] || "#64748b";
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1,
        textTransform: "uppercase",
        padding: "6px 12px",
        borderRadius: 999,
        background: `${color}22`,
        color,
        border: `1px solid ${color}55`,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function PrioridadeBadge({ prioridade }: { prioridade?: string }) {
  if (!prioridade || (prioridade !== "URGENTE" && prioridade !== "ALTA")) return null;
  const color = prioridade === "URGENTE" ? "#ef4444" : "#f59e0b";
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 1.5,
        padding: "4px 10px",
        borderRadius: 6,
        background: color,
        color: "#fff",
        marginLeft: 8,
      }}
    >
      {prioridade}
    </span>
  );
}

function PedidoRow({ p, prontoIcon }: { p: PedidoBase; prontoIcon?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "16px 20px",
        borderBottom: "1px solid #1a2540",
      }}
    >
      <div
        style={{
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          fontSize: 28,
          fontWeight: 700,
          color: "#f8fafc",
          minWidth: 110,
        }}
      >
        #{p.numero_pedido}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 16,
            color: "#e2e8f0",
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {p.cliente}
          <PrioridadeBadge prioridade={p.prioridade} />
        </div>
        {p.numero_onda != null && (
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Onda #{p.numero_onda}</div>
        )}
      </div>
      <StatusBadge status={p.status_onda} label={prontoIcon ? `✓ ${p.status_label}` : p.status_label} />
    </div>
  );
}

function Column({
  title,
  color,
  items,
  prontoIcon,
}: {
  title: string;
  color: string;
  items: PedidoBase[];
  prontoIcon?: boolean;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  useEffect(() => {
    setPage(0);
  }, [items.length]);

  useEffect(() => {
    if (totalPages <= 1) return;
    const iv = setInterval(() => setPage((p) => (p + 1) % totalPages), PAGE_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [totalPages]);

  const pageItems = useMemo(
    () => items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [items, page]
  );

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        background: "#0d1420",
        border: "1px solid #1a2540",
        borderTop: `4px solid ${color}`,
        borderRadius: 16,
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          borderBottom: "1px solid #1a2540",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: 1 }}>{title}</div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', ui-monospace, monospace",
            fontSize: 24,
            fontWeight: 700,
          }}
        >
          {items.length}
        </div>
      </div>
      <div style={{ flex: 1, overflow: "hidden" }}>
        {pageItems.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#475569", fontSize: 14 }}>
            Nenhum pedido no momento.
          </div>
        ) : (
          pageItems.map((p) => <PedidoRow key={`${p.numero_pedido}-${p.numero_onda}`} p={p} prontoIcon={prontoIcon} />)
        )}
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: 12, borderTop: "1px solid #1a2540" }}>
          {Array.from({ length: totalPages }).map((_, i) => (
            <span
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: i === page ? color : "#1a2540",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function PainelTvVendas() {
  const [token, setToken] = useTvToken();
  const [countdown, setCountdown] = useState(REFRESH_MS / 1000);

  const query = useQuery({
    queryKey: ["tv-vd", token],
    enabled: !!token,
    refetchInterval: REFRESH_MS,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_painel_tv_vendas" as any, {
        p_tv_token: token,
      });
      if (error) throw error;
      return data as VendasData;
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

  return (
    <TvShell
      title="Acompanhamento de pedidos"
      empresa={data?.empresa}
      armazem={data?.armazem}
      empresaLogo={data?.empresa_logo ?? null}
      refreshCountdown={countdown}
      refreshInterval={REFRESH_MS / 1000}
    >
      <div style={{ display: "flex", gap: 24, flex: 1, minHeight: 0 }}>
        <Column title="Em processamento" color="#3b82f6" items={data?.em_processamento ?? []} />
        <Column title="Prontos" color="#22c55e" items={data?.prontos ?? []} prontoIcon />
      </div>
    </TvShell>
  );
}
