-- =====================================================================
-- CORE LogiTrack — Produtos: opções do filtro "Grupo"
-- Data: 2026-10-22
-- Rota: /dados-mestres/produtos
--
-- Problema: grupo_produto tem centenas de descrições repetidas por empresa
-- (unicidade é descricao + codigo_erp) e, em cada par repetido, no máximo um
-- grupo tem produtos. O dropdown mostrava nomes iguais e o usuário podia
-- escolher o grupo vazio (resultado: 0 produtos).
--
-- Solução: o filtro passa a listar somente grupos que possuem produtos na
-- empresa, com a quantidade. O modal de cadastro continua usando a lista
-- completa de grupos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_produto_grupos_filtro(
  p_tenant_id  uuid,
  p_empresa_id uuid
)
RETURNS TABLE (
  id           uuid,
  descricao    text,
  codigo_erp   text,
  qtd_produtos bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id e empresa_id são obrigatórios'
      USING ERRCODE = '22023';
  END IF;

  IF p_tenant_id IS DISTINCT FROM public.get_current_tenant() THEN
    RAISE EXCEPTION 'Acesso negado ao tenant informado'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT g.id, g.descricao, g.codigo_erp, count(*)::bigint AS qtd_produtos
    FROM produto p
    JOIN grupo_produto g ON g.id = p.grupo_id
   WHERE p.tenant_id  = p_tenant_id
     AND p.empresa_id = p_empresa_id
     AND p.grupo_id IS NOT NULL
   GROUP BY g.id, g.descricao, g.codigo_erp
   ORDER BY g.descricao, g.codigo_erp;
END;
$$;

COMMENT ON FUNCTION public.fn_produto_grupos_filtro(uuid, uuid)
  IS 'Grupos com ao menos 1 produto na empresa (opções do filtro Grupo em /dados-mestres/produtos).';

REVOKE ALL ON FUNCTION public.fn_produto_grupos_filtro(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_produto_grupos_filtro(uuid, uuid) TO authenticated, service_role;
