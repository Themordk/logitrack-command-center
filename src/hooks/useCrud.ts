import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";

// Tabelas com coluna empresa_id direta — filtradas/criadas vinculadas à empresa ativa
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
  "agrupamento_separacao",
  "agrupamento_conferencia",
  "ordem_expedicao",
  "veiculos",
  "produto_embalagem",
  "volume_expedicao",
  "tipo_estoque",
]);

// Tabelas com empresa_id E armazem_id (filtradas pelos dois)
const TABLES_WITH_EMPRESA_AND_ARMAZEM = new Set([
  "rotas",
]);

// Tabelas sem empresa_id direto, mas que pertencem a um armazém — filtradas pelo armazém ativo
// OBS: "setor" foi removido daqui porque o armazém é selecionado manualmente no formulário
// (a tela lista setores de todos os armazéns do tenant — RLS garante o isolamento).
const TABLES_WITH_ARMAZEM = new Set([
  "endereco",
  "box",
  "turnos",
  "motivo_ocorrencia",
  "zona_atividade",
  "tipo_box",
  "picking_produto",
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
  const { empresaId, armazemId, empresaVersion } = useTenant();
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const requiresBoth = TABLES_WITH_EMPRESA_AND_ARMAZEM.has(table);
  const requiresArmazem = TABLES_WITH_ARMAZEM.has(table) || requiresBoth;
  const requiresEmpresa = TABLES_WITH_EMPRESA.has(table) || requiresBoth;

  const fetchData = useCallback(async () => {
    if (!tenantId) {
      setData([]);
      setLoading(false);
      return;
    }
    // Proteção contra vazamento de dados: se a tabela depende de armazém/empresa
    // e o contexto ainda não está pronto, não consulta o tenant inteiro.
    if (requiresArmazem && !armazemId) {
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    if (requiresEmpresa && !empresaId) {
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = (supabase as any).from(table).select(select, { count: "exact" });
      query = query.eq("tenant_id", tenantId);

      if (requiresEmpresa && empresaId) {
        query = query.eq("empresa_id", empresaId);
      }
      if (requiresArmazem && armazemId) {
        query = query.eq("armazem_id", armazemId);
      }

      Object.entries(filters).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== "" && val !== "all") {
          query = query.eq(key, val);
        }
      });

      if (search) {
        const searchFields = ["descricao"];
        if (table === "hu") searchFields.push("codigo_hu");
        if (table === "volume_expedicao") searchFields.push("codigo_volume");
        if (table === "produto") searchFields.push("sku");
        if (table === "tipo_entrada" || table === "tipo_saida") searchFields.push("coderp");
        if (table === "veiculos") searchFields.push("placa");
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
  }, [table, tenantId, empresaId, armazemId, empresaVersion, page, pageSize, search, orderBy, orderDir, select, JSON.stringify(filters), requiresArmazem, requiresEmpresa]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const create = async (record: Partial<T>) => {
    try {
      const payload: any = { ...record, tenant_id: tenantId };
      if (requiresEmpresa && empresaId && payload.empresa_id == null) {
        payload.empresa_id = empresaId;
      }
      if (requiresArmazem && armazemId && payload.armazem_id == null) {
        payload.armazem_id = armazemId;
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

// Tabelas que NÃO possuem coluna `ativo` — fetchOptions deve pular o filtro nelas.
const TABLES_WITHOUT_ATIVO = new Set(["zona_atividade"]);

// Helper de selects: filtra opções por tenant + ativo + filters extras.
// Aceita filters como { empresa_id, armazem_id, ... } para escopo correto.
// Use opts.activeOnly = false para tabelas sem coluna ativo (ou deixe automático via TABLES_WITHOUT_ATIVO).
export async function fetchOptions(
  table: string,
  tenantId: string,
  labelField = "descricao",
  filters?: Record<string, any>,
  opts?: { activeOnly?: boolean }
) {
  const activeOnly = opts?.activeOnly ?? !TABLES_WITHOUT_ATIVO.has(table);
  let query = (supabase as any)
    .from(table)
    .select(`id, ${labelField}`)
    .eq("tenant_id", tenantId)
    .order(labelField);
  if (activeOnly) {
    query = query.eq("ativo", true);
  }
  if (filters) {
    Object.entries(filters).forEach(([k, v]) => {
      if (v) query = query.eq(k, v);
    });
  }
  const { data, error } = await query;
  if (error) {
    console.warn(`[fetchOptions] erro ao carregar ${table}:`, error.message);
    return [];
  }
  return (data || []).map((d: any) => ({ value: d.id, label: d[labelField] || d.id }));
}
