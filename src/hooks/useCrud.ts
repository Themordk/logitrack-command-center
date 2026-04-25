import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";

// Tabelas que possuem coluna empresa_id e devem ser filtradas por empresa ativa
const TABLES_WITH_EMPRESA = new Set([
  "produto",
  "parceiro",
  "movimento_entrada",
  "movimento_saida",
  "documento_entrada",
  "documento_saida",
  "abastecimento",
  "inventario",
  "armazem",
  "grupo_produto",
  "subgrupo_produto",
  "hu",
  "usuario",
  "tipo_entrada",
  "tipo_saida",
  "rotas",
  "agrupamento_separacao",
  "agrupamento_conferencia",
  "ordem_expedicao",
]);

interface UseCrudOptions {
  table: string;
  tenantId: string | null;
  pageSize?: number;
  orderBy?: string;
  orderDir?: "asc" | "desc";
  select?: string;
  filters?: Record<string, any>;
}

export function useCrud<T extends Record<string, any>>({
  table,
  tenantId,
  pageSize = 15,
  orderBy = "descricao",
  orderDir = "asc",
  select = "*",
  filters = {},
}: UseCrudOptions) {
  const { empresaId, empresaVersion } = useTenant();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let query = (supabase as any).from(table).select(select, { count: "exact" });
      query = query.eq("tenant_id", tenantId);

      // Filtro automático por empresa ativa quando aplicável
      if (TABLES_WITH_EMPRESA.has(table) && empresaId) {
        query = query.eq("empresa_id", empresaId);
      }

      Object.entries(filters).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "" && val !== "all") {
          query = query.eq(key, val);
        }
      });

      if (search) {
        // Search across common text columns
        const searchFields = ["descricao"];
        if (table === "hu") searchFields.push("codigo_hu");
        if (table === "volume_expedicao") searchFields.push("codigo_volume");
        if (table === "produto") searchFields.push("sku");
        if (table === "tipo_entrada" || table === "tipo_saida") searchFields.push("coderp");
        const orClause = searchFields.map((f) => `${f}.ilike.%${search}%`).join(",");
        query = query.or(orClause);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.order(orderBy, { ascending: orderDir === "asc" }).range(from, to);

      const { data: result, error, count } = await query;
      if (error) throw error;
      setData((result as T[]) || []);
      setTotal(count || 0);
    } catch (err: any) {
      console.error(`Error fetching ${table}:`, err);
      toast.error(`Erro ao carregar dados: ${err.message}`);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [table, tenantId, empresaId, empresaVersion, page, pageSize, search, orderBy, orderDir, select, JSON.stringify(filters)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const create = async (record: Partial<T>) => {
    try {
      const payload: any = { ...record, tenant_id: tenantId };
      // Anexa empresa ativa quando a tabela exige
      if (TABLES_WITH_EMPRESA.has(table) && empresaId && payload.empresa_id == null) {
        payload.empresa_id = empresaId;
      }
      const { error } = await (supabase as any).from(table).insert(payload);
      if (error) throw error;
      toast.success("Registro criado com sucesso!");
      await fetchData();
      return true;
    } catch (err: any) {
      console.error(`Error creating ${table}:`, err);
      toast.error(`Erro ao criar: ${err.message}`);
      return false;
    }
  };

  const update = async (id: string, record: Partial<T>) => {
    try {
      const { error } = await (supabase as any).from(table).update(record).eq("id", id);
      if (error) throw error;
      toast.success("Registro atualizado com sucesso!");
      await fetchData();
      return true;
    } catch (err: any) {
      console.error(`Error updating ${table}:`, err);
      toast.error(`Erro ao atualizar: ${err.message}`);
      return false;
    }
  };

  const remove = async (id: string, softDelete = true) => {
    try {
      if (softDelete) {
        const { error } = await (supabase as any).from(table).update({ ativo: false }).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from(table).delete().eq("id", id);
        if (error) throw error;
      }
      toast.success("Registro removido com sucesso!");
      await fetchData();
      return true;
    } catch (err: any) {
      console.error(`Error removing ${table}:`, err);
      toast.error(`Erro ao remover: ${err.message}`);
      return false;
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return {
    data,
    loading,
    search,
    setSearch: (s: string) => { setSearch(s); setPage(1); },
    page,
    setPage,
    total,
    totalPages,
    pageSize,
    create,
    update,
    remove,
    refresh: fetchData,
  };
}

// Helper to fetch options for selects
export async function fetchOptions(table: string, tenantId: string, labelField = "descricao", filters?: Record<string, any>) {
  let query = (supabase as any).from(table).select(`id, ${labelField}`).eq("tenant_id", tenantId).eq("ativo", true).order(labelField);
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v) query = query.eq(k, v);
    });
  }
  const { data, error } = await query;
  if (error) return [];
  return (data || []).map((d: any) => ({ value: d.id, label: d[labelField] || d.id }));
}
