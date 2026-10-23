-- =====================================================================
-- 2026-10-23 · Coletor · Transferência · Passo 3 (detalhe)
-- Nova RPC: rpc_coletor_transferencia_picking
-- Retorna os endereços de picking mapeados (picking_produto ativo) do produto
-- no armazém, com saldo atual, mín/máx, quanto cabe, situação e se é a origem.
-- Somente leitura / orientação: validação final do destino continua em
-- rpc_validar_endereco_picking. Quantidades em UNIDADES.
-- Já aplicada em produção (versão 20261023192947).
-- Rollback: DROP FUNCTION public.rpc_coletor_transferencia_picking(uuid,uuid,uuid,uuid,uuid);
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_coletor_transferencia_picking(
  p_tenant_id          uuid,
  p_empresa_id         uuid,
  p_armazem_id         uuid,
  p_produto_id         uuid,
  p_endereco_origem_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_produto  record;
  v_pickings jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_tenant_id IS NULL OR p_empresa_id IS NULL OR p_armazem_id IS NULL OR p_produto_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PARAMETRO_OBRIGATORIO',
      'mensagem', 'Informe tenant, empresa, armazém e produto.');
  END IF;

  SELECT p.id,
         COALESCE(p.usa_picking, false)     AS usa_picking,
         COALESCE(p.varios_pickings, false) AS varios_pickings
    INTO v_produto
  FROM produto p
  WHERE p.id = p_produto_id AND p.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PRODUTO_NAO_ENCONTRADO',
      'mensagem', 'Produto não encontrado.');
  END IF;

  WITH pp AS (
    SELECT DISTINCT ON (pp0.endereco_id)
           pp0.endereco_id, pp0.est_minimo, pp0.est_maximo, pp0.tipo_picking
    FROM picking_produto pp0
    WHERE pp0.tenant_id  = p_tenant_id
      AND pp0.armazem_id = p_armazem_id
      AND pp0.produto_id = p_produto_id
      AND pp0.ativo      = true
      AND (pp0.empresa_id IS NULL OR pp0.empresa_id = p_empresa_id)
    ORDER BY pp0.endereco_id, (pp0.empresa_id = p_empresa_id) DESC NULLS LAST
  ),
  linhas AS (
    SELECT pp.endereco_id,
           e.descricao,
           e.situacao::text            AS situacao,
           pp.tipo_picking::text       AS tipo_picking,
           e.rua, e.predio, e.nivel, e.apto,
           s.saldo,
           COALESCE(pp.est_minimo, 0)  AS est_minimo,
           NULLIF(pp.est_maximo, 0)    AS est_maximo,
           CASE WHEN COALESCE(pp.est_maximo, 0) > 0
                THEN GREATEST(pp.est_maximo - s.saldo, 0) END AS cabe,
           (pp.endereco_id = p_endereco_origem_id) AS e_origem
    FROM pp
    JOIN endereco e ON e.id = pp.endereco_id AND e.tenant_id = p_tenant_id
    CROSS JOIN LATERAL (
      SELECT COALESCE(SUM(eg.quantidade_disponivel), 0) AS saldo
      FROM estoque_geral eg
      WHERE eg.tenant_id   = p_tenant_id
        AND eg.empresa_id  = p_empresa_id
        AND eg.produto_id  = p_produto_id
        AND eg.endereco_id = pp.endereco_id
    ) s
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'endereco_id',  endereco_id,
           'endereco',     descricao,
           'situacao',     situacao,
           'utilizavel',   situacao IN ('LIVRE', 'OCUPADO'),
           'tipo_picking', tipo_picking,
           'saldo',        saldo,
           'est_minimo',   est_minimo,
           'est_maximo',   est_maximo,
           'cabe',         cabe,
           'e_origem',     COALESCE(e_origem, false))
         ORDER BY rua, predio, nivel, apto), '[]'::jsonb)
    INTO v_pickings
  FROM linhas;

  RETURN jsonb_build_object(
    'sucesso',         true,
    'usa_picking',     v_produto.usa_picking,
    'varios_pickings', v_produto.varios_pickings,
    'pickings',        v_pickings
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_coletor_transferencia_picking(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_transferencia_picking(uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_coletor_transferencia_picking(uuid,uuid,uuid,uuid,uuid) IS
  'Coletor/transferência passo 3: pickings mapeados do produto no armazém (saldo x mín/máx, cabe, situação, e_origem). Somente leitura; quantidades em unidades.';
