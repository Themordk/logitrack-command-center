-- =====================================================================
-- 2026-11-10 · Ondas de Carregamento (web) · badge "Aguardando NF"
-- Enriquecimento em lote (uma chamada por página da lista), sem alterar
-- listar_ondas_carregamento. Mesma regra do validador da conferência
-- (fn_conferencia_docs_sem_nf): onda SEPARADO/EM_CONFERENCIA com pedido de
-- tipo POS_FATURAMENTO sem NF AUTORIZADA.
-- Depende de 20261110202246_conferencia_momento_faturamento_validador.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.conferencia_ondas_aguardando_nf(p_tenant_id uuid, p_movimento_ids uuid[])
RETURNS TABLE(movimento_saida_id uuid, docs_sem_nf integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_movimento_ids IS NULL OR cardinality(p_movimento_ids) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT x.id, x.qtd
  FROM (
    SELECT ms.id, public.fn_conferencia_docs_sem_nf(p_tenant_id, ms.id) AS qtd
    FROM movimento_saida ms
    WHERE ms.tenant_id = p_tenant_id
      AND ms.id = ANY (p_movimento_ids[1:200])
      AND ms.status IN ('SEPARADO', 'EM_CONFERENCIA')
  ) x
  WHERE x.qtd > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.conferencia_ondas_aguardando_nf(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_ondas_aguardando_nf(uuid, uuid[]) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
