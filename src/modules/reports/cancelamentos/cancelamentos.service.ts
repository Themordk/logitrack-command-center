import { supabase } from "@/integrations/supabase/client";
import { fetchAllSelectRows } from "../utils/fetchAllSelectRows";

export interface CancelamentosFilter {
  tenant_id: string;
  data_inicio: string;
  data_fim: string;
  empresa_id?: string | null;
  armazem_id?: string | null;
  tipo_tarefa_id?: string;
  sku?: string;
  usuario_corte_id?: string;
}

export interface CancelamentoRow {
  id: string;
  concluido_em: string | null;
  atribuido_em: string | null;
  iniciado_em: string | null;
  tipo_tarefa_codigo: string;
  tipo_tarefa: string;
  sku: string;
  descricao: string;
  qtd_requerida: number;
  qtd_cancelada: number;
  qtd_executada: number;
  operador: string;
  cancelado_por: string;
  motivo: string;
  endereco_origem: string;
  endereco_destino: string;
  tipo_documento_origem: string;
  id_documento_origem: string | null;
}

export async function fetchCancelamentos(
  filters: CancelamentosFilter,
): Promise<CancelamentoRow[]> {
  const selectColumns = `
    id,
    quantidade_executada,
    concluido_em,
    atribuido_em,
    iniciado_em,
    operador:usuario_id ( nome ),
    usuario_cancelamento:usuario_corte ( nome ),
    motivo:motivo_ocorrencia ( descricao ),
    endereco_origem:endereco_origem_id ( descricao ),
    endereco_destino:endereco_destino_id ( descricao ),
    tarefa:tarefa_id (
      id,
      quantidade_requerida,
      tipo_documento_origem,
      id_documento_origem,
      empresa_id,
      armazem_id,
      tipo_tarefa_id,
      tipo_tarefa:tipo_tarefa_id ( codigo, descricao ),
      produto:produto_id ( sku, descricao )
    )
  `;

  const data = await fetchAllSelectRows(
    "tarefa_execucao",
    selectColumns,
    (q) => {
      q = q
        .eq("tenant_id", filters.tenant_id)
        .eq("status", "CANCELADA")
        .gte("concluido_em", filters.data_inicio)
        .lte("concluido_em", filters.data_fim + "T23:59:59.999Z")
        .order("concluido_em", { ascending: false });
      if (filters.usuario_corte_id) {
        q = q.eq("usuario_corte", filters.usuario_corte_id);
      }
      return q;
    },
  );

  let rows: CancelamentoRow[] = data.map((r: any) => {
    const t = r.tarefa as any;
    const tt = t?.tipo_tarefa as any;
    const prod = t?.produto as any;
    return {
      id: r.id,
      concluido_em: r.concluido_em,
      atribuido_em: r.atribuido_em,
      iniciado_em: r.iniciado_em,
      tipo_tarefa_codigo: tt?.codigo ?? "",
      tipo_tarefa: tt?.descricao ?? "—",
      sku: prod?.sku ?? "",
      descricao: prod?.descricao ?? "",
      qtd_requerida: Number(t?.quantidade_requerida ?? 0),
      qtd_cancelada: Number(r.quantidade_executada ?? 0),
      qtd_executada: Number(r.quantidade_executada ?? 0),
      operador: (r.operador as any)?.nome ?? "—",
      cancelado_por: (r.usuario_cancelamento as any)?.nome ?? "Sistema",
      motivo: (r.motivo as any)?.descricao ?? "—",
      endereco_origem: (r.endereco_origem as any)?.descricao ?? "—",
      endereco_destino: (r.endereco_destino as any)?.descricao ?? "—",
      tipo_documento_origem: t?.tipo_documento_origem ?? "",
      id_documento_origem: t?.id_documento_origem ?? null,
      __empresa_id: t?.empresa_id,
      __armazem_id: t?.armazem_id,
      __tipo_tarefa_id: t?.tipo_tarefa_id,
    } as any;
  });

  // Filtros client-side em colunas aninhadas (Supabase não filtra inline aqui)
  if (filters.empresa_id) {
    rows = rows.filter((r: any) => !r.__empresa_id || r.__empresa_id === filters.empresa_id);
  }
  if (filters.armazem_id) {
    rows = rows.filter((r: any) => !r.__armazem_id || r.__armazem_id === filters.armazem_id);
  }
  if (filters.tipo_tarefa_id) {
    rows = rows.filter((r: any) => r.__tipo_tarefa_id === filters.tipo_tarefa_id);
  }
  if (filters.sku) {
    const s = filters.sku.toLowerCase();
    rows = rows.filter((r) => r.sku.toLowerCase().includes(s));
  }

  return rows;
}

export async function fetchTiposTarefa(tenantId: string) {
  const { data } = await supabase
    .from("tipo_tarefa")
    .select("id, codigo, descricao")
    .eq("tenant_id", tenantId)
    .order("descricao");
  return data ?? [];
}

export async function fetchUsuariosAtivos(tenantId: string) {
  const { data } = await (supabase as any)
    .from("usuario")
    .select("id, nome")
    .eq("tenant_id", tenantId)
    .eq("ativo", true)
    .order("nome");
  return (data ?? []) as { id: string; nome: string }[];
}
