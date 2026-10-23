import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTenant } from "@/contexts/TenantContext";
import { parseError } from "@/lib/errorMapper";
import {
  fetchProdutoListagem,
  type ProdutoListagemFilters,
  type ProdutoListagemRow,
} from "@/modules/produtos/produtoListagem.service";

interface UseProdutoListagemParams {
  filters: ProdutoListagemFilters;
  pageSize?: number;
}

/**
 * Lista de produtos via RPC rpc_produto_listagem, com a mesma "cara" do
 * useCrud para a CrudTable continuar funcionando sem mudanças.
 */
export function useProdutoListagem({ filters, pageSize = 15 }: UseProdutoListagemParams) {
  const { tenantId, empresaId, empresaVersion } = useTenant();
  const [data, setData] = useState<ProdutoListagemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const reqRef = useRef(0);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const filtersKey = JSON.stringify(filters);
  const prevKeyRef = useRef(filtersKey);

  const carregar = useCallback(async () => {
    const req = ++reqRef.current;
    if (prevKeyRef.current !== filtersKey) {
      prevKeyRef.current = filtersKey;
      if (page !== 1) {
        setLoading(true);
        setPage(1);
        return;
      }
    }
    if (!tenantId || !empresaId) {
      setData([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { rows, total: t } = await fetchProdutoListagem({
        tenantId,
        empresaId,
        filters: filtersRef.current,
        page,
        pageSize,
      });
      if (req !== reqRef.current) return; // resposta antiga: descarta
      setData(rows);
      setTotal(t);
    } catch (err) {
      if (req !== reqRef.current) return;
      toast.error(parseError(err, "carregar produtos").title);
      setData([]);
      setTotal(0);
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, empresaId, empresaVersion, filtersKey, page, pageSize]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const refresh = useCallback(() => carregar(), [carregar]);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  return { data, loading, page, setPage, total, totalPages, pageSize, refresh };
}
