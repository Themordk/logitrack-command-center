import { supabase } from "@/integrations/supabase/client";

export interface DocumentoCanceladoFilter {
  tenant_id: string;
  data_inicio: string; // "YYYY-MM-DD"
  data_fim: string; // "YYYY-MM-DD"
  empresa_id?: string | null;
  tipo_documento?: string; // "ENTRADA", "SAIDA" ou vazio (todos)
}

export interface DocumentoCanceladoRow {
  id: string;
  tipo_documento: string;
  numero_documento: string;
  data_documento: string | null;
  parceiro_nome: string;
  parceiro_cnpj: string;
  tipo_doc_descricao: string;
  valor_total: number;
  qtd_itens: number;
  status: number;
  status_label: string;
  cancelamento_solicitado_em: string | null;
  cancelamento_origem: string;
  cancelamento_motivo: string | null;
  codigo_erp: string | null;
  empresa_id: string;
}

export async function fetchDocumentosCancelados(
  filters: DocumentoCanceladoFilter,
): Promise<DocumentoCanceladoRow[]> {
  const { data, error } = await (supabase as any).rpc(
    "fn_relatorio_documentos_cancelados",
    {
      p_tenant_id: filters.tenant_id,
      p_data_inicio: filters.data_inicio,
      p_data_fim: filters.data_fim,
      p_empresa_id: filters.empresa_id || null,
      p_tipo_documento: filters.tipo_documento || null,
    },
  );

  if (error) throw error;
  if (!data) return [];

  return (data as any[]).map((r) => ({
    ...r,
    valor_total: Number(r.valor_total ?? 0),
    qtd_itens: Number(r.qtd_itens ?? 0),
    status: Number(r.status),
  }));
}
