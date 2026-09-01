import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;

/**
 * Busca TODAS as linhas de uma query .from().select() do Supabase,
 * paginando automaticamente via .range() para superar o limite de 1000 linhas do PostgREST.
 *
 * @param tableName - nome da tabela
 * @param selectColumns - string do .select() (ex: "id, sku, descricao")
 * @param applyFilters - callback que recebe o query builder e aplica .eq(), .gte(), .order(), etc.
 *                       NÃO aplicar .limit() ou .range() dentro deste callback.
 */
export async function fetchAllSelectRows<T = any>(
  tableName: string,
  selectColumns: string,
  applyFilters?: (query: any) => any,
): Promise<T[]> {
  const allRows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;

    let query = (supabase as any)
      .from(tableName)
      .select(selectColumns)
      .range(from, to);

    if (applyFilters) {
      query = applyFilters(query);
    }

    const { data, error } = await query;

    if (error) throw error;

    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < PAGE_SIZE) break;

    from += PAGE_SIZE;
  }

  return allRows;
}
