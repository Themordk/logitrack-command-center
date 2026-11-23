import { supabase } from "@/integrations/supabase/client";

/**
 * Quem está com cada movimento de entrada numa etapa do coletor (conferência ou
 * armazenagem). Mesma regra da separação (separacao_buscar_ondas): tarefa da etapa
 * com atribuição ativa. Vem só de rpc_coletor_entrada_atribuicoes.
 */
export type EtapaEntrada = "ENTR-CONF" | "ENTR-ARMZ";

export interface AtribuicaoEntrada {
  atribuido_ao_usuario: boolean;
  operador_nome: string | null;
  qtd_operadores: number;
  minhas_tarefas: number;
}

export async function buscarAtribuicoesEntrada(
  tenantId: string, usuarioId: string, movimentoIds: string[], etapa: EtapaEntrada,
): Promise<Record<string, AtribuicaoEntrada>> {
  if (movimentoIds.length === 0) return {};
  const { data, error } = await supabase.rpc("rpc_coletor_entrada_atribuicoes" as never, {
    p_tenant_id: tenantId, p_usuario_id: usuarioId, p_movimento_ids: movimentoIds, p_tipo_codigo: etapa,
  } as never);
  if (error) throw error;
  const mapa: Record<string, AtribuicaoEntrada> = {};
  type Linha = { movimento_entrada_id: string; atribuido_ao_usuario: boolean; operador_nome: string | null; qtd_operadores: number; minhas_tarefas: number };
  for (const r of ((data ?? []) as unknown as Linha[])) {
    mapa[r.movimento_entrada_id] = {
      atribuido_ao_usuario: !!r.atribuido_ao_usuario,
      operador_nome: r.operador_nome ?? null,
      qtd_operadores: Number(r.qtd_operadores ?? 0),
      minhas_tarefas: Number(r.minhas_tarefas ?? 0),
    };
  }
  return mapa;
}
