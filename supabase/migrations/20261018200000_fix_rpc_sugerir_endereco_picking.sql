-- =====================================================================
-- 2026-10-18 · Armazenagem do coletor · Etapa 1 · A1
-- Corrige rpc_sugerir_endereco_picking (mesma assinatura e retorno).
--
-- Defeitos corrigidos:
--  1. Sugestão repetida: em picking compartilhado, o endereço era cruzado com
--     cada mapeamento de outro produto (picking_produto) e voltava N vezes.
--     -> mapeamentos agrupados por endereço antes do cruzamento.
--  2. "Consolidar" com o picking acima do máximo: a trava só valia quando o
--     endereço tinha capacidade_unidades cadastrada.
--     -> consolida só se o saldo DO PRODUTO estiver abaixo do est_maximo.
--  3. Saldo de todos os produtos do endereço comparado ao máximo deste produto.
--     -> saldo do produto separado do saldo total do endereço.
--
-- Capacidade livre:
--  - picking já mapeado para o produto, com est_maximo > 0:
--      est_maximo - saldo disponível do produto (mesma conta de finalizar_armazenagem).
--      Entra na lista se couber ao menos 1 unidade (capacidade_livre informa quanto).
--  - demais endereços com capacidade_unidades: capacidade - saldo total;
--      entra só se couber a quantidade inteira (comportamento anterior).
-- =====================================================================

INSERT INTO integracao.bkp_funcao_definicao (id, funcao, definicao, motivo, criado_em)
SELECT gen_random_uuid(),
       'public.rpc_sugerir_endereco_picking(uuid,uuid,uuid,text,date,numeric,integer)',
       pg_get_functiondef('public.rpc_sugerir_endereco_picking(uuid,uuid,uuid,text,date,numeric,integer)'::regprocedure),
       'Antes de 20261018200000_fix_rpc_sugerir_endereco_picking',
       now();

CREATE OR REPLACE FUNCTION public.rpc_sugerir_endereco_picking(
  p_tenant_id   uuid,
  p_armazem_id  uuid,
  p_produto_id  uuid,
  p_lote        text    DEFAULT NULL,
  p_validade    date    DEFAULT NULL,
  p_quantidade  numeric DEFAULT 1,
  p_limite      integer DEFAULT 5
)
RETURNS TABLE(
  endereco_id      uuid,
  descricao        text,
  score            numeric,
  motivo           text,
  tipo_sugestao    text,
  saldo_atual      numeric,
  capacidade_livre numeric,
  curva_acesso     text,
  rua              integer,
  predio           integer,
  nivel            integer,
  apto             integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_regra         RECORD;
  v_produto       RECORD;
  v_curva_venda   text;
  v_tipo_controle text;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório';
  END IF;
  IF p_armazem_id IS NULL THEN
    RAISE EXCEPTION 'armazem_id obrigatório';
  END IF;
  IF p_produto_id IS NULL THEN
    RAISE EXCEPTION 'produto_id obrigatório';
  END IF;

  SELECT p.curva_venda::text, p.tipo_controle::text, p.usa_picking, p.varios_pickings
    INTO v_produto
  FROM public.produto p
  WHERE p.id = p_produto_id
    AND p.tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado para este tenant';
  END IF;

  IF NOT v_produto.usa_picking THEN
    RAISE EXCEPTION 'Produto não utiliza endereço de picking (usa_picking = false)';
  END IF;

  v_curva_venda   := v_produto.curva_venda;
  v_tipo_controle := v_produto.tipo_controle;

  SELECT * INTO v_regra
  FROM public.regra_armazenagem ra
  WHERE ra.tenant_id  = p_tenant_id
    AND ra.armazem_id = p_armazem_id
    AND ra.ativo      = true
  LIMIT 1;

  IF NOT FOUND THEN
    v_regra.permite_mistura_sku      := false;
    v_regra.permite_mistura_lote     := false;
    v_regra.permite_mistura_validade := false;
    v_regra.tolerancia_validade_dias := 0;
    v_regra.usar_cruzamento_curvas   := true;
    v_regra.priorizar_consolidacao   := true;
  END IF;

  RETURN QUERY
  WITH
  enderecos_picking AS (
    SELECT e.id AS end_id, e.descricao AS end_descricao, e.curva_acesso::text AS end_curva_acesso,
           e.rua AS end_rua, e.predio AS end_predio, e.nivel AS end_nivel, e.apto AS end_apto,
           e.capacidade_unidades AS end_capacidade
    FROM public.endereco e
    INNER JOIN public.setor s ON s.id = e.setor_id AND s.tenant_id = p_tenant_id
    WHERE e.tenant_id     = p_tenant_id
      AND e.armazem_id    = p_armazem_id
      AND e.tipo_endereco = 'PICKING'
      AND e.ativo         = true
      AND e.situacao IN ('LIVRE', 'OCUPADO')
      AND s.tipo = 'PICKING'
  ),
  saldo_por_endereco AS (
    SELECT eg.endereco_id,
           SUM(eg.quantidade_total) AS saldo_total,
           COALESCE(SUM(eg.quantidade_disponivel) FILTER (WHERE eg.produto_id = p_produto_id), 0) AS saldo_produto,
           COUNT(DISTINCT eg.lote) FILTER (WHERE eg.lote IS NOT NULL AND eg.lote <> '') AS qtd_lotes,
           MIN(eg.data_validade) FILTER (WHERE eg.data_validade IS NOT NULL AND eg.data_validade <> '1900-01-01') AS menor_validade,
           BOOL_OR(eg.produto_id <> p_produto_id) AS tem_outro_produto
    FROM public.estoque_geral eg
    WHERE eg.tenant_id = p_tenant_id
      AND eg.endereco_id IN (SELECT end_id FROM enderecos_picking)
      AND eg.quantidade_total > 0
    GROUP BY eg.endereco_id
  ),
  -- Um registro por endereço (antes: um por produto mapeado -> sugestão repetida)
  pickings_mapeados_outros AS (
    SELECT DISTINCT pp.endereco_id
    FROM public.picking_produto pp
    WHERE pp.tenant_id  = p_tenant_id
      AND pp.armazem_id = p_armazem_id
      AND pp.produto_id <> p_produto_id
      AND pp.ativo      = true
  ),
  picking_mesmo_produto AS (
    SELECT pp.endereco_id, MAX(pp.est_maximo) AS est_maximo
    FROM public.picking_produto pp
    WHERE pp.tenant_id  = p_tenant_id
      AND pp.armazem_id = p_armazem_id
      AND pp.produto_id = p_produto_id
      AND pp.ativo      = true
    GROUP BY pp.endereco_id
  ),
  candidatos AS (
    SELECT
      ep.*,
      COALESCE(se.saldo_total, 0)   AS saldo,
      COALESCE(se.saldo_produto, 0) AS saldo_prod,
      pmp.endereco_id IS NOT NULL   AS eh_mapeado_produto,
      pmo.endereco_id IS NOT NULL   AS eh_mapeado_outro,
      (pmp.endereco_id IS NOT NULL AND COALESCE(pmp.est_maximo, 0) > 0) AS tem_maximo,
      -- Abaixo do máximo do produto (sem máximo configurado = sem limite)
      (pmp.endereco_id IS NOT NULL
        AND (COALESCE(pmp.est_maximo, 0) <= 0 OR COALESCE(se.saldo_produto, 0) < pmp.est_maximo)) AS pode_consolidar,
      CASE
        WHEN pmp.endereco_id IS NOT NULL AND COALESCE(pmp.est_maximo, 0) > 0
          THEN pmp.est_maximo - COALESCE(se.saldo_produto, 0)
        WHEN ep.end_capacidade IS NOT NULL
          THEN ep.end_capacidade - COALESCE(se.saldo_total, 0)
        ELSE NULL
      END AS cap_livre,
      COALESCE(se.tem_outro_produto, false) AS tem_outro_sku,
      COALESCE(se.qtd_lotes, 0) AS qtd_lotes,
      se.menor_validade
    FROM enderecos_picking ep
    LEFT JOIN saldo_por_endereco se       ON se.endereco_id  = ep.end_id
    LEFT JOIN pickings_mapeados_outros pmo ON pmo.endereco_id = ep.end_id
    LEFT JOIN picking_mesmo_produto pmp    ON pmp.endereco_id = ep.end_id
  ),
  pontuados AS (
    SELECT c.*,
      CASE WHEN v_regra.priorizar_consolidacao AND c.pode_consolidar THEN 30 ELSE 0 END AS score_consolidacao,
      CASE
        WHEN NOT v_regra.usar_cruzamento_curvas OR v_curva_venda IS NULL OR c.end_curva_acesso IS NULL THEN 50
        WHEN v_curva_venda = c.end_curva_acesso THEN 100
        WHEN v_curva_venda = 'A' AND c.end_curva_acesso = 'B' THEN 60
        WHEN v_curva_venda = 'A' AND c.end_curva_acesso = 'C' THEN 30
        WHEN v_curva_venda = 'A' AND c.end_curva_acesso = 'D' THEN 10
        WHEN v_curva_venda = 'B' AND c.end_curva_acesso = 'A' THEN 70
        WHEN v_curva_venda = 'B' AND c.end_curva_acesso = 'C' THEN 50
        WHEN v_curva_venda = 'B' AND c.end_curva_acesso = 'D' THEN 20
        WHEN v_curva_venda = 'C' AND c.end_curva_acesso = 'A' THEN 40
        WHEN v_curva_venda = 'C' AND c.end_curva_acesso = 'B' THEN 70
        WHEN v_curva_venda = 'C' AND c.end_curva_acesso = 'D' THEN 40
        WHEN v_curva_venda = 'D' AND c.end_curva_acesso = 'A' THEN 20
        WHEN v_curva_venda = 'D' AND c.end_curva_acesso = 'B' THEN 40
        WHEN v_curva_venda = 'D' AND c.end_curva_acesso = 'C' THEN 70
        ELSE 50
      END AS score_curva,
      CASE WHEN c.eh_mapeado_outro AND v_regra.permite_mistura_sku THEN -20 ELSE 0 END AS score_penalizacao_mapeado,
      CASE
        WHEN c.pode_consolidar THEN 'CONSOLIDACAO'
        WHEN v_regra.usar_cruzamento_curvas AND v_curva_venda IS NOT NULL
             AND c.end_curva_acesso IS NOT NULL AND v_curva_venda = c.end_curva_acesso THEN 'CURVA_MATCH'
        WHEN c.saldo = 0 THEN 'ENDERECO_LIVRE'
        ELSE 'FALLBACK'
      END AS tipo_sug
    FROM candidatos c
  )
  SELECT
    p.end_id,
    p.end_descricao,
    (p.score_consolidacao + p.score_curva + p.score_penalizacao_mapeado)::numeric,
    CASE p.tipo_sug
      WHEN 'CONSOLIDACAO'   THEN 'Consolidação — picking do produto com espaço livre'
      WHEN 'CURVA_MATCH'    THEN 'Match de curva ' || COALESCE(v_curva_venda, '?') || ' → ' || COALESCE(p.end_curva_acesso, '?')
      WHEN 'ENDERECO_LIVRE' THEN 'Endereço livre — sem estoque'
      ELSE 'Fallback — primeiro endereço disponível'
    END,
    p.tipo_sug,
    p.saldo,
    p.cap_livre,
    p.end_curva_acesso,
    p.end_rua, p.end_predio, p.end_nivel, p.end_apto
  FROM pontuados p
  WHERE
    -- Regras de mistura de SKU (iguais às de antes, valem para todos)
    (v_regra.permite_mistura_sku = true OR p.eh_mapeado_outro = false)
    AND (v_regra.permite_mistura_sku = true OR p.tem_outro_sku = false)
    -- Capacidade: picking do próprio produto entra se couber ao menos 1 unidade;
    -- os demais, só se couber a quantidade inteira
    AND (
      CASE WHEN p.eh_mapeado_produto AND p.tem_maximo
        THEN p.cap_livre > 0
        ELSE (p.cap_livre IS NULL OR p.cap_livre >= p_quantidade)
      END
    )
    AND (
      v_tipo_controle NOT IN ('LOTE', 'VALIDADE', 'SERIE')
      OR v_regra.permite_mistura_lote = true
      OR p.qtd_lotes <= 1
      OR p.saldo = 0
    )
    AND (
      v_tipo_controle <> 'VALIDADE'
      OR p_validade IS NULL
      OR v_regra.permite_mistura_validade = true
      OR p.saldo = 0
      OR p.menor_validade IS NULL
      OR (v_regra.tolerancia_validade_dias > 0 AND ABS(p_validade - p.menor_validade) <= v_regra.tolerancia_validade_dias)
      OR (v_regra.tolerancia_validade_dias = 0 AND p_validade = p.menor_validade)
    )
  ORDER BY
    p.score_consolidacao DESC,
    (p.score_consolidacao + p.score_curva + p.score_penalizacao_mapeado) DESC,
    p.saldo ASC,
    p.end_rua ASC, p.end_predio ASC, p.end_nivel ASC, p.end_apto ASC
  LIMIT p_limite;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_sugerir_endereco_picking(uuid,uuid,uuid,text,date,numeric,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_sugerir_endereco_picking(uuid,uuid,uuid,text,date,numeric,integer) TO authenticated, service_role;
