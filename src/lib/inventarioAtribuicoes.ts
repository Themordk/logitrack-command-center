import { supabase } from "@/integrations/supabase/client";

/**
 * Quem está com cada inventário no coletor. Mesma regra de rpc_coletor_sair_etapa
 * (contexto INVENTARIO): tarefa do inventário em aberto com atribuição ativa.
 * Vem só de rpc_coletor_inventario_atribuicoes.
 */
export interface AtribuicaoInventario {
  atribuido_ao_usuario: boolean;
  operador_nome: string | null;
  qtd_operadores: number;
  minhas_tarefas: number;
}

export async function buscarAtribuicoesInventario(
  tenantId: string, usuarioId: string, inventarioIds: string[],
): Promise<Record<string, AtribuicaoInventario>> {
  if (inventarioIds.length === 0) return {};
  const { data, error } = await supabase.rpc("rpc_coletor_inventario_atribuicoes" as never, {
    p_tenant_id: tenantId, p_usuario_id: usuarioId, p_inventario_ids: inventarioIds,
  } as never);
  if (error) throw error;
  type Linha = { inventario_id: string } & AtribuicaoInventario;
  const mapa: Record<string, AtribuicaoInventario> = {};
  for (const r of ((data ?? []) as unknown as Linha[])) {
    mapa[r.inventario_id] = {
      atribuido_ao_usuario: !!r.atribuido_ao_usuario,
      operador_nome: r.operador_nome ?? null,
      qtd_operadores: Number(r.qtd_operadores ?? 0),
      minhas_tarefas: Number(r.minhas_tarefas ?? 0),
    };
  }
  return mapa;
}
