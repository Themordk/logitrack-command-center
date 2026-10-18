-- =====================================================================
-- 2026-10-18 · Armazenagem do coletor · Etapa 1 · A4
-- Nova RPC: rpc_coletor_armazenagem_destino
--
-- Alimenta o painel "Para onde vai" da tela 2 (/coletor/armazenagem/iniciar)
-- numa chamada só: tarefa, pickings do produto (saldo x mín/máx), pulmão e
-- o destino recomendado.
--
-- Regra de capacidade = a mesma de finalizar_armazenagem:
--   cabe = est_maximo - SUM(estoque_geral.quantidade_disponivel) do produto
--          no endereço (tenant + empresa). est_maximo nulo ou 0 = sem limite.
-- Todas as quantidades em UNIDADES (o frontend converte para caixas).
-- A recomendação é só orientação: a validação final continua no backend
-- (rpc_validar_endereco_picking + finalizar_armazenagem).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.rpc_coletor_armazenagem_destino(
  p_tenant_id  uuid,
  p_empresa_id uuid,
  p_armazem_id uuid,
  p_produto_id uuid,
  p_tarefa_id  uuid    DEFAULT NULL,
  p_quantidade numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_produto     record;
  v_requerida   numeric;
  v_executada   numeric;
  v_restante    numeric;
  v_qtd         numeric;
  v_pickings    jsonb;
  v_tem_picking boolean;
  v_m_id        uuid;
  v_m_desc      text;
  v_m_cabe      numeric;
  v_m_status    text;
  v_pulmao_sld  numeric;
  v_pulmao_end  integer;
  v_destino     text;
  v_motivo      text;
  v_qtd_picking numeric := 0;
  v_qtd_pulmao  numeric := 0;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL OR p_armazem_id IS NULL OR p_produto_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PARAMETRO_OBRIGATORIO',
      'mensagem', 'Informe tenant, empresa, armazém e produto.');
  END IF;

  SELECT p.id, p.sku, p.descricao, COALESCE(p.usa_picking, false) AS usa_picking,
         COALESCE(p.varios_pickings, false) AS varios_pickings, COALESCE(p.fator_caixa, 1) AS fator_caixa
    INTO v_produto
  FROM produto p
  WHERE p.id = p_produto_id AND p.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'PRODUTO_NAO_ENCONTRADO',
      'mensagem', 'Produto não encontrado.');
  END IF;

  -- Tarefa (opcional)
  IF p_tarefa_id IS NOT NULL THEN
    SELECT t.quantidade_requerida,
           COALESCE(t.quantidade_executada, 0),
           GREATEST(t.quantidade_requerida - COALESCE(t.quantidade_executada, 0), 0)
      INTO v_requerida, v_executada, v_restante
    FROM tarefa t
    WHERE t.id = p_tarefa_id AND t.tenant_id = p_tenant_id AND t.produto_id = p_produto_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('sucesso', false, 'codigo', 'TAREFA_NAO_ENCONTRADA',
        'mensagem', 'Tarefa de armazenagem não encontrada para este produto.');
    END IF;
  END IF;

  v_qtd := COALESCE(p_quantidade, v_restante, 0);

  -- Pickings do produto neste armazém (um por endereço), com saldo do produto
  WITH pp AS (
    SELECT DISTINCT ON (pp0.endereco_id) pp0.endereco_id, pp0.est_minimo, pp0.est_maximo
    FROM picking_produto pp0
    WHERE pp0.tenant_id  = p_tenant_id
      AND pp0.armazem_id = p_armazem_id
      AND pp0.produto_id = p_produto_id
      AND pp0.ativo      = true
      AND (pp0.empresa_id IS NULL OR pp0.empresa_id = p_empresa_id)
    ORDER BY pp0.endereco_id, (pp0.empresa_id = p_empresa_id) DESC NULLS LAST
  ),
  linhas AS (
    SELECT pp.endereco_id, e.descricao, e.situacao::text AS situacao, e.rua, e.predio, e.nivel, e.apto,
           s.saldo,
           COALESCE(pp.est_minimo, 0) AS est_minimo,
           NULLIF(pp.est_maximo, 0)   AS est_maximo,
           CASE WHEN COALESCE(pp.est_maximo, 0) > 0 THEN GREATEST(pp.est_maximo - s.saldo, 0) END AS cabe,
           CASE
             WHEN COALESCE(pp.est_maximo, 0) <= 0     THEN 'SEM_LIMITE'
             WHEN s.saldo > pp.est_maximo              THEN 'ACIMA_MAXIMO'
             WHEN s.saldo = pp.est_maximo              THEN 'CHEIO'
             WHEN s.saldo < COALESCE(pp.est_minimo, 0) THEN 'ABAIXO_MINIMO'
             ELSE 'NORMAL'
           END AS status
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
           'endereco_id', endereco_id, 'endereco', descricao, 'situacao', situacao,
           'saldo', saldo, 'est_minimo', est_minimo, 'est_maximo', est_maximo,
           'cabe', cabe, 'status', status)
         ORDER BY rua, predio, nivel, apto), '[]'::jsonb)
    INTO v_pickings
  FROM linhas;

  v_tem_picking := jsonb_array_length(v_pickings) > 0;

  -- Melhor picking para receber: endereço utilizável; sem limite primeiro, depois quem cabe mais
  SELECT x.endereco_id, x.endereco, x.cabe, x.status
    INTO v_m_id, v_m_desc, v_m_cabe, v_m_status
  FROM jsonb_to_recordset(v_pickings)
       AS x(endereco_id uuid, endereco text, situacao text, cabe numeric, status text)
  WHERE x.situacao IN ('LIVRE', 'OCUPADO')
  ORDER BY (x.cabe IS NULL) DESC, x.cabe DESC NULLS LAST
  LIMIT 1;

  -- Pulmão: saldo do produto em endereços de pulmão deste armazém
  SELECT COALESCE(SUM(eg.quantidade_disponivel), 0),
         COUNT(DISTINCT eg.endereco_id) FILTER (WHERE eg.quantidade_disponivel > 0)
    INTO v_pulmao_sld, v_pulmao_end
  FROM estoque_geral eg
  JOIN endereco e ON e.id = eg.endereco_id AND e.tenant_id = p_tenant_id
  WHERE eg.tenant_id    = p_tenant_id
    AND eg.empresa_id   = p_empresa_id
    AND eg.produto_id   = p_produto_id
    AND e.armazem_id    = p_armazem_id
    AND e.tipo_endereco = 'PULMAO';

  -- Recomendação
  IF NOT v_produto.usa_picking THEN
    v_destino := 'PULMAO';  v_qtd_pulmao := v_qtd;
    v_motivo  := 'Produto não usa picking.';
  ELSIF v_m_id IS NULL THEN
    IF v_tem_picking THEN
      v_destino := 'PULMAO';  v_qtd_pulmao := v_qtd;
      v_motivo  := 'Picking do produto bloqueado.';
    ELSE
      v_destino := 'SEM_PICKING';  v_qtd_pulmao := v_qtd;
      v_motivo  := 'Produto sem picking cadastrado.';
    END IF;
  ELSIF v_m_cabe IS NULL OR v_m_cabe >= v_qtd THEN
    v_destino := 'PICKING';  v_qtd_picking := v_qtd;
    v_motivo  := CASE WHEN v_m_cabe IS NULL
                   THEN 'Picking sem máximo configurado.'
                   ELSE 'Cabe tudo no picking.' END;
  ELSIF v_m_cabe > 0 THEN
    v_destino := 'DIVIDIR';
    v_qtd_picking := v_m_cabe;
    v_qtd_pulmao  := v_qtd - v_m_cabe;
    v_motivo  := 'Picking tem espaço só para parte. O restante vai para o pulmão.';
  ELSE
    v_destino := 'PULMAO';  v_qtd_pulmao := v_qtd;
    v_motivo  := CASE v_m_status WHEN 'ACIMA_MAXIMO' THEN 'Picking acima do máximo.' ELSE 'Picking cheio.' END;
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'produto', jsonb_build_object(
      'produto_id', v_produto.id, 'sku', v_produto.sku, 'descricao', v_produto.descricao,
      'usa_picking', v_produto.usa_picking, 'varios_pickings', v_produto.varios_pickings,
      'fator_caixa', v_produto.fator_caixa),
    'tarefa', CASE WHEN p_tarefa_id IS NULL THEN NULL ELSE jsonb_build_object(
      'tarefa_id', p_tarefa_id, 'requerida', v_requerida,
      'executada', v_executada, 'restante', v_restante) END,
    'quantidade', v_qtd,
    'pickings', v_pickings,
    'pulmao', jsonb_build_object('saldo', v_pulmao_sld, 'enderecos', v_pulmao_end),
    'recomendacao', jsonb_build_object(
      'destino', v_destino,
      'endereco_id', CASE WHEN v_destino IN ('PICKING', 'DIVIDIR') THEN v_m_id END,
      'endereco', CASE WHEN v_destino IN ('PICKING', 'DIVIDIR') THEN v_m_desc END,
      'quantidade_picking', v_qtd_picking,
      'quantidade_pulmao', v_qtd_pulmao,
      'motivo', v_motivo)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_coletor_armazenagem_destino(uuid,uuid,uuid,uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_coletor_armazenagem_destino(uuid,uuid,uuid,uuid,uuid,numeric) TO authenticated, service_role;

COMMENT ON FUNCTION public.rpc_coletor_armazenagem_destino(uuid,uuid,uuid,uuid,uuid,numeric) IS
  'Coletor/armazenagem tela 2: pickings do produto (saldo x mín/máx), pulmão e destino recomendado. Quantidades em unidades. Mesma regra de capacidade de finalizar_armazenagem.';
