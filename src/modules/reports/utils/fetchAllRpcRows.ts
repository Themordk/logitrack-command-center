import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;

/**
 * Busca TODAS as linhas retornadas por uma RPC do Supabase,
 * paginando automaticamente para superar o limite de 1000 linhas do PostgREST.
 */
export async function fetchAllRpcRows<T = any>(
  rpcName: string,
  params: Record<string, any>,
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await (supabase as any)
      .rpc(rpcName, params)
      .range(from, to);

    if (error) throw error;

    if (!data || data.length === 0) break;

    allRows.push(...data);

    // Se retornou menos que PAGE_SIZE, não há mais páginas
    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allRows;
}
