import { supabase } from "@/integrations/supabase/client";
import { fetchAllRpcRows } from "../utils/fetchAllRpcRows";

export interface CortesFilter {
  tenant_id: string;
  empresa_id: string;
  data_inicio: string; // YYYY-MM-DD
  data_fim: string; // YYYY-MM-DD
  motivo_ids?: string[];
  usuario_autorizou_id?: string;
  sku?: string;
  tem_saldo?: "SIM" | "NAO"; // undefined = todos
}

export interface CorteRow {
  id: string;
  movimento_saida_id: string;
  numero_onda: number;
  produto_id: string;
  sku: string;
  descricao: string;
  qtde_cortada: number;
  preco_custo: number;
  custo_total: number;
  saldo_disponivel_no_corte: number | null; // null = corte anterior ao registro de saldo
  tem_saldo: "SIM" | "NAO" | "SEM_REGISTRO";
  motivo_id: string | null;
  motivo: string | null;
  solicitante_login: string | null;
  solicitante_nome: string | null;
  autorizador_login: string | null;
  autorizador_nome: string | null;
  metodo: string | null; // SENHA | PERMISSAO_PROPRIA | DISPENSADA
  autorizado_em: string;
}

export async function fetchCortesReport(filters: CortesFilter): Promise<CorteRow[]> {
  const data = await fetchAllRpcRows("fn_relatorio_cortes", {
    p_tenant_id: filters.tenant_id,
    p_empresa_id: filters.empresa_id,
    p_data_inicio: filters.data_inicio,
    p_data_fim: filters.data_fim,
    p_motivo_ids: filters.motivo_ids?.length ? filters.motivo_ids : null,
    p_usuario_autorizou_id: filters.usuario_autorizou_id ?? null,
    p_sku: filters.sku?.trim() || null,
    p_tem_saldo: filters.tem_saldo ?? null,
  });

  return data.map((r: any) => ({
    ...r,
    numero_onda: Number(r.numero_onda ?? 0),
    qtde_cortada: Number(r.qtde_cortada ?? 0),
    preco_custo: Number(r.preco_custo ?? 0),
    custo_total: Number(r.custo_total ?? 0),
    saldo_disponivel_no_corte:
      r.saldo_disponivel_no_corte == null ? null : Number(r.saldo_disponivel_no_corte),
  })) as CorteRow[];
}

/** Extrai a mensagem amigável de erros da RPC no formato "CODIGO: texto". */
export function extrairMensagemErroCortes(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? "";
  const match = /^[A-Z_]+:\s*(.+)$/.exec(msg);
  return match ? match[1] : "Erro ao gerar relatório.";
}

export interface MotivoCorteOption {
  descricao: string;
  motivo_ids: string[];
  ativo: boolean;
}

/**
 * Opções do filtro de motivo: todos os motivos da etapa SEPARAÇÃO
 * (inclusive inativos), já agrupados por descrição pelo backend.
 */
export async function fetchMotivosCorte(tenantId: string): Promise<MotivoCorteOption[]> {
  const { data } = await (supabase as any).rpc("fn_relatorio_cortes_motivos", {
    p_tenant_id: tenantId,
  });
  return (data ?? []) as MotivoCorteOption[];
}

export async function fetchUsuariosTenant(tenantId: string): Promise<{ id: string; login: string; nome: string | null }[]> {
  const { data } = await (supabase as any)
    .from("usuario")
    .select("id, login, nome")
    .eq("tenant_id", tenantId)
    .order("login");
  return (data ?? []) as { id: string; login: string; nome: string | null }[];
}

export const METODO_CORTE_LABELS: Record<string, string> = {
  SENHA: "Senha do supervisor",
  PERMISSAO_PROPRIA: "Permissão própria",
  DISPENSADA: "Regra desligada",
};
export const labelMetodoCorte = (m?: string | null) => (m && METODO_CORTE_LABELS[m]) || (m ? m : "—");
