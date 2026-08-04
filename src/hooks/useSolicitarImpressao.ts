import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface SolicitarImpressaoParams {
  tipoEtiqueta: "PRODUTO" | "HU" | "VOLUME" | "ENDERECO";
  dados: Record<string, any>;
  origem: string;
  documentoOrigemId?: string;
  tipoDocumentoOrigem?: string;
  quantidadeCopias?: number;
  prioridade?: number;
  templateId?: string | null;
  impressoraId?: string | null;
  setorUso?: string | null;
}

/**
 * Hook para solicitar impressão de etiquetas via fila automatizada.
 * Silencioso quando não há impressora configurada (não bloqueia o fluxo).
 */
export function useSolicitarImpressao() {
  const solicitar = useCallback(async (params: SolicitarImpressaoParams): Promise<boolean> => {
    const armazemId = localStorage.getItem("core_armazem_id");
    if (!armazemId) {
      console.warn("[Impressão] Armazém não definido, ignorando impressão");
      return false;
    }

    try {
      const { data, error } = await supabase.rpc("solicitar_impressao" as any, {
        p_armazem_id: armazemId,
        p_tipo_etiqueta: params.tipoEtiqueta,
        p_dados: params.dados,
        p_origem: params.origem,
        p_documento_origem_id: params.documentoOrigemId || null,
        p_tipo_documento_origem: params.tipoDocumentoOrigem || null,
        p_quantidade_copias: params.quantidadeCopias || 1,
        p_prioridade: params.prioridade || 5,
      });

      if (error) throw error;

      const result = typeof data === "string" ? JSON.parse(data) : data;

      if (result?.success) {
        toast.success("Etiqueta enviada para impressão", {
          description: `Job ${String(result.job_id).substring(0, 8)}...`,
          duration: 2000,
        });
        return true;
      } else {
        console.warn("[Impressão] Sem impressora/template:", result?.error);
        return false;
      }
    } catch (err: any) {
      console.warn("[Impressão] Erro ao solicitar:", err?.message);
      return false;
    }
  }, []);

  return { solicitar };
}
