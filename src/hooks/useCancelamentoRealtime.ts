import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CancelamentoNotificacao {
  documentoNumero: string;
  documentoSaidaId: string;
  timestamp: string;
}

interface UseCancelamentoRealtimeProps {
  movimentoSaidaId: string | null;
  usuarioId: string | null;
  enabled?: boolean;
}

export function useCancelamentoRealtime({
  movimentoSaidaId,
  usuarioId,
  enabled = true,
}: UseCancelamentoRealtimeProps) {
  const [notificacoes, setNotificacoes] = useState<CancelamentoNotificacao[]>([]);
  const [ultimaNotificacao, setUltimaNotificacao] = useState<CancelamentoNotificacao | null>(null);

  const dismissNotificacao = useCallback((documentoSaidaId: string) => {
    setNotificacoes((prev) => prev.filter((n) => n.documentoSaidaId !== documentoSaidaId));
  }, []);

  const dismissAll = useCallback(() => {
    setNotificacoes([]);
    setUltimaNotificacao(null);
  }, []);

  useEffect(() => {
    if (!enabled || !movimentoSaidaId || !usuarioId) return;

    const channel = supabase
      .channel(`cancelamento-${movimentoSaidaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacao_painel",
          filter: `usuario_id=eq.${usuarioId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.tipo !== "CANCELAMENTO_PEDIDO") return;

          const notif: CancelamentoNotificacao = {
            documentoNumero: row.titulo || "Pedido cancelado",
            documentoSaidaId: row.referencia_id || "",
            timestamp: row.criado_em || new Date().toISOString(),
          };

          setNotificacoes((prev) =>
            prev.some((n) => n.documentoSaidaId === notif.documentoSaidaId) ? prev : [...prev, notif],
          );
          setUltimaNotificacao(notif);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [movimentoSaidaId, usuarioId, enabled]);

  return {
    notificacoes,
    ultimaNotificacao,
    temNotificacao: notificacoes.length > 0,
    dismissNotificacao,
    dismissAll,
  };
}
