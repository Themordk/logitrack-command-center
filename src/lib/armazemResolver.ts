import { supabase } from "@/integrations/supabase/client";
import { sanitizeId } from "@/lib/uuid";

export interface ArmazemResolvido {
  id: string | null;
  descricao: string | null;
  /** Mensagem de bloqueio quando não há armazém ativo para o contexto. */
  erro: string | null;
}

export const SEM_ARMAZEM_MSG =
  "Sua empresa não possui armazém ativo. Contate o administrador.";

/**
 * Resolve o armazém operacional do contexto (tenant + empresa).
 *
 * Regras:
 *  1. Se `preferidoId` (usuario.armazem_id) estiver preenchido E o armazém estiver
 *     ativo dentro do tenant/empresa atual → usa esse.
 *  2. Caso contrário → primeiro armazém ativo do par tenant/empresa.
 *  3. Se não houver nenhum → retorna erro com mensagem clara (nunca falha em silêncio).
 *
 * Ordem determinística: codigo_erp ASC, id ASC — evita variar entre logins quando
 * há mais de um armazém ativo (matriz/filial).
 */
export async function resolveArmazemAtivo(
  tenantId: string | null | undefined,
  empresaId: string | null | undefined,
  preferidoId?: string | null,
): Promise<ArmazemResolvido> {
  const tenant = sanitizeId(tenantId ?? null);
  const empresa = sanitizeId(empresaId ?? null);
  if (!tenant || !empresa) {
    return { id: null, descricao: null, erro: null };
  }

  try {
    const { data, error } = await (supabase as any)
      .from("armazem")
      .select("id, descricao, codigo_erp")
      .eq("tenant_id", tenant)
      .eq("empresa_id", empresa)
      .eq("ativo", true)
      .order("codigo_erp", { ascending: true })
      .order("id", { ascending: true });

    if (error) throw error;

    const lista: any[] = data || [];
    if (lista.length === 0) {
      return { id: null, descricao: null, erro: SEM_ARMAZEM_MSG };
    }

    const preferido = sanitizeId(preferidoId ?? null);
    const escolhido =
      (preferido && lista.find((a) => a.id === preferido)) || lista[0];

    return { id: escolhido.id, descricao: escolhido.descricao ?? null, erro: null };
  } catch (e) {
    console.warn("[armazemResolver] Falha ao resolver armazém ativo", e);
    return {
      id: null,
      descricao: null,
      erro: "Não foi possível resolver o armazém da empresa. Tente novamente.",
    };
  }
}
