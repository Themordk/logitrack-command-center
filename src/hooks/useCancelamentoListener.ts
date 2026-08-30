import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CancelamentoNotificacao {
  documentoEntradaId: string;
  numeroNota: string;
  motivo: string;
  origem: string;
  estagio: string;
}

export function useCancelamentoListener(
  documentoEntradaId: string | null,
  tenantId: string | null,
) {
  const [cancelamento, setCancelamento] = useState<CancelamentoNotificacao | null>(null);

  const limpar = useCallback(() => setCancelamento(null), []);

  useEffect(() => {
    if (!documentoEntradaId) return;
    let ativo = true;

    // 1) Verificação inicial — documento já cancelado antes de abrir a tela
    (async () => {
      try {
        let query = (supabase as any)
          .from("documento_entrada")
          .select("id, status, cancelamento_motivo, cancelamento_origem, numero_nota")
          .eq("id", documentoEntradaId)
          .in("status", [8, 9]);
        if (tenantId) query = query.eq("tenant_id", tenantId);
        const { data } = await query.maybeSingle();
        if (ativo && data) {
          setCancelamento({
            documentoEntradaId: data.id,
            numeroNota: data.numero_nota || "",
            motivo: data.cancelamento_motivo || "Cancelamento solicitado",
            origem: data.cancelamento_origem || "ERP",
            estagio: "",
          });
        }
      } catch {
        // silencioso — o Realtime cobre o restante
      }
    })();

    // 2) Realtime
    const channel = supabase
      .channel(`cancelamento-doc-${documentoEntradaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notificacao_painel",
          filter: `referencia_id=eq.${documentoEntradaId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (row?.tipo !== "ALERTA_CANCELAMENTO") return;
          if (row?.referencia_tipo !== "documento_entrada") return;
          let dados: any = row.dados;
          try {
            if (typeof dados === "string") dados = JSON.parse(dados);
          } catch {
            dados = {};
          }
          dados = dados || {};
          setCancelamento({
            documentoEntradaId: row.referencia_id,
            numeroNota: dados.numero_nota || "",
            motivo: dados.motivo || "Cancelamento solicitado",
            origem: dados.origem || "ERP",
            estagio: dados.estagio || "",
          });
        },
      )
      .subscribe();

    return () => {
      ativo = false;
      supabase.removeChannel(channel);
    };
  }, [documentoEntradaId, tenantId]);

  return { cancelamento, limpar };
}

/** Verificação pré-ação: true se o documento estiver cancelado (status 8 ou 9). */
export async function documentoEntradaCancelado(
  documentoEntradaId: string | null,
  tenantId: string | null,
): Promise<boolean> {
  if (!documentoEntradaId) return false;
  try {
    let query = (supabase as any)
      .from("documento_entrada")
      .select("status")
      .eq("id", documentoEntradaId);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query.maybeSingle();
    return !!data && (data.status === 8 || data.status === 9);
  } catch {
    return false;
  }
}
