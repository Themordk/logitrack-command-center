-- =====================================================================
-- 2026-11-09 · Relatórios · Baixo Giro / Obsoletos — RPC server-side
--
-- Substitui o cálculo client-side de baixoGiro.service.ts (N lotes .in() +
-- download de todo o histórico de saídas) por uma única RPC paginada.
--
-- Regras aprovadas:
--  1. Saída = tipo_movimento IN (2 Saída, 5 Separação), descontando saídas
--     estornadas (tipo 99 com estorno_da_execucao_id = tarefa_execucao_id).
--     Transferência (3) e Armazenagem (4) não contam como giro.
--  2. Dias parado = hoje − última saída; sem saída: hoje − entrada mais
--     antiga do saldo atual (min(estoque_geral.created_at)).
--     SEM_MOVIMENTO só aparece quando essa idade >= p_dias_baixo_giro.
--  3. Faixas configuráveis: p_dias_baixo_giro (90) e p_dias_obsoleto (180).
--  4. Com p_armazem_id: saldo e última saída restritos ao armazém
--     (saída via endereco_origem_id → endereco.armazem_id).
--  5. p_empresa_id obrigatório (empresas não se misturam).
--  6. Data de referência no fuso America/Fortaleza (não há cadastro de fuso
--     por tenant; p_fuso permite sobrescrever).
--
-- Retorno: linhas paginadas (p_limit/p_offset) + totais do conjunto filtrado
-- inteiro em cada linha (window functions) para os cards de resumo.
-- Segurança: SECURITY INVOKER (RLS das tabelas vale) + assert_tenant_access.
-- =====================================================================

-- Índice parcial: só saídas válidas para giro. Tabela pequena hoje
-- (~32K linhas) → CREATE INDEX comum é instantâneo; em bases grandes
-- preferir CONCURRENTLY fora de transação.
CREATE INDEX IF NOT EXISTS idx_estoque_movimento_ultima_saida
  ON public.estoque_movimento (tenant_id, empresa_id, produto_id, criado_em DESC)
  INCLUDE (tarefa_execucao_id, endereco_origem_id)
  WHERE tipo_movimento IN (2, 5);

DROP FUNCTION IF EXISTS public.rpc_relatorio_baixo_giro(
  uuid, uuid, uuid, integer, integer, text, uuid, uuid, text, text, numeric, text, integer, integer, text
);

CREATE FUNCTION public.rpc_relatorio_baixo_giro(
  p_tenant_id        uuid,
  p_empresa_id       uuid,
  p_armazem_id       uuid    DEFAULT NULL,
  p_dias_baixo_giro  integer DEFAULT 90,
  p_dias_obsoleto    integer DEFAULT 180,
  p_classificacao    text    DEFAULT NULL,   -- BAIXO_GIRO | OBSOLETO | SEM_MOVIMENTO
  p_grupo_id         uuid    DEFAULT NULL,
  p_subgrupo_id      uuid    DEFAULT NULL,
  p_marca            text    DEFAULT NULL,   -- busca parcial
  p_sku              text    DEFAULT NULL,   -- busca parcial
  p_saldo_minimo     numeric DEFAULT NULL,
  p_ordenacao        text    DEFAULT 'DIAS_DESC', -- DIAS_DESC | CUSTO_DESC | SALDO_DESC | SKU_ASC
  p_limit            integer DEFAULT 100,
  p_offset           integer DEFAULT 0,
  p_fuso             text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  produto_id           uuid,
  sku                  text,
  descricao            text,
  marca                text,
  grupo_id             uuid,
  grupo_descricao      text,
  subgrupo_id          uuid,
  subgrupo_descricao   text,
  saldo                numeric,
  saldo_bloqueado      numeric,
  qtd_posicoes         integer,
  preco_custo          numeric,
  custo_total          numeric,
  ultima_saida         timestamptz,
  entrada_mais_antiga  timestamptz,
  dias_parado          integer,
  nunca_saiu           boolean,
  classificacao        text,
  -- totais do conjunto filtrado (iguais em todas as linhas)
  total_registros      bigint,
  total_saldo          numeric,
  total_custo          numeric,
  qtd_baixo_giro       bigint,
  qtd_obsoleto         bigint,
  qtd_sem_movimento    bigint,
  qtd_sem_custo        bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_sku    text := NULLIF(btrim(p_sku), '');
  v_marca  text := NULLIF(btrim(p_marca), '');
  v_class  text := NULLIF(upper(btrim(p_classificacao)), '');
  v_ord    text := COALESCE(NULLIF(upper(btrim(p_ordenacao)), ''), 'DIAS_DESC');
  v_fuso   text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_hoje   date;
BEGIN
  -- ---------- validações ----------
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_dias_baixo_giro IS NULL OR p_dias_baixo_giro < 1 THEN
    RAISE EXCEPTION 'Dias de baixo giro deve ser maior que zero' USING ERRCODE = '22023';
  END IF;
  IF p_dias_obsoleto IS NULL OR p_dias_obsoleto <= p_dias_baixo_giro THEN
    RAISE EXCEPTION 'Dias de obsoleto deve ser maior que os dias de baixo giro' USING ERRCODE = '22023';
  END IF;
  IF v_class IS NOT NULL AND v_class NOT IN ('BAIXO_GIRO', 'OBSOLETO', 'SEM_MOVIMENTO') THEN
    RAISE EXCEPTION 'Classificação inválida: %', p_classificacao USING ERRCODE = '22023';
  END IF;
  IF v_ord NOT IN ('DIAS_DESC', 'CUSTO_DESC', 'SALDO_DESC', 'SKU_ASC') THEN
    RAISE EXCEPTION 'Ordenação inválida: %', p_ordenacao USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit deve estar entre 1 e 1000' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_hoje := (now() AT TIME ZONE v_fuso)::date;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_fuso USING ERRCODE = '22023';
  END;

  RETURN QUERY
  WITH saldo AS (
    -- Linhas estreitas: só o necessário para filtrar, classificar e totalizar.
    SELECT eg.produto_id,
           sum(eg.quantidade_total)            AS saldo,
           sum(eg.quantidade_bloqueada)        AS saldo_bloqueado,
           count(*)::integer                   AS qtd_posicoes,
           min(eg.created_at)                  AS min_created,
           min(eg.atualizado_em)               AS min_atualizado,
           bool_or(eg.created_at IS NULL)      AS tem_entrada_sem_data
    FROM estoque_geral eg
    WHERE eg.tenant_id  = p_tenant_id
      AND eg.empresa_id = p_empresa_id
      AND eg.quantidade_total > 0
      AND (p_armazem_id IS NULL OR EXISTS (
            SELECT 1 FROM endereco e
            WHERE e.id = eg.endereco_id
              AND e.armazem_id = p_armazem_id))
    GROUP BY eg.produto_id
  ),
  base AS MATERIALIZED (
    SELECT s.*, p.sku, p.preco_custo
    FROM saldo s
    JOIN produto p
      ON p.id = s.produto_id
     AND p.tenant_id  = p_tenant_id
     AND p.empresa_id = p_empresa_id
    WHERE (p_saldo_minimo IS NULL OR s.saldo >= p_saldo_minimo)
      AND (p_grupo_id    IS NULL OR p.grupo_id    = p_grupo_id)
      AND (p_subgrupo_id IS NULL OR p.subgrupo_id = p_subgrupo_id)
      AND (v_sku   IS NULL OR p.sku   ILIKE '%' || v_sku   || '%')
      AND (v_marca IS NULL OR p.marca ILIKE '%' || v_marca || '%')
  ),
  -- Última saída válida por produto: UMA agregação por hash sobre as saídas
  -- (índice parcial idx_estoque_movimento_ultima_saida) em vez de uma sondagem
  -- por SKU — a maioria dos SKUs com saldo não tem saída nenhuma.
  saidas AS (
    SELECT em.produto_id, max(em.criado_em) AS ultima_saida
    FROM estoque_movimento em
    WHERE em.tenant_id  = p_tenant_id
      AND em.empresa_id = p_empresa_id
      AND em.tipo_movimento IN (2, 5)
      AND (p_armazem_id IS NULL OR EXISTS (
            SELECT 1 FROM endereco eo
            WHERE eo.id = em.endereco_origem_id
              AND eo.armazem_id = p_armazem_id))
      AND NOT EXISTS (
            SELECT 1 FROM estoque_movimento x
            WHERE x.estorno_da_execucao_id = em.tarefa_execucao_id
              AND x.tipo_movimento = 99
              AND x.tenant_id = p_tenant_id)
    GROUP BY em.produto_id
  ),
  -- Fallback de data de entrada para posições com created_at nulo:
  -- primeiro movimento do produto. Só executa se houver alguma posição
  -- sem data (InitPlan de uma vez, não por linha).
  primeiro_mov AS (
    SELECT m.produto_id, min(m.criado_em) AS primeiro_mov
    FROM estoque_movimento m
    WHERE m.tenant_id  = p_tenant_id
      AND m.empresa_id = p_empresa_id
      AND EXISTS (SELECT 1 FROM base b2 WHERE b2.tem_entrada_sem_data)
    GROUP BY m.produto_id
  ),
  calc AS MATERIALIZED (
    SELECT b.produto_id, b.sku, b.saldo, b.saldo_bloqueado, b.qtd_posicoes, b.preco_custo,
           sd.ultima_saida,
           CASE WHEN b.tem_entrada_sem_data
                THEN LEAST(b.min_created, COALESCE(pm.primeiro_mov, b.min_atualizado))
                ELSE b.min_created
           END AS entrada_mais_antiga
    FROM base b
    LEFT JOIN saidas       sd ON sd.produto_id = b.produto_id
    LEFT JOIN primeiro_mov pm ON pm.produto_id = b.produto_id
  ),
  classif AS (
    SELECT c.*,
           (v_hoje - (COALESCE(c.ultima_saida, c.entrada_mais_antiga) AT TIME ZONE v_fuso)::date)::integer AS dias_parado,
           (c.ultima_saida IS NULL) AS nunca_saiu,
           c.saldo * COALESCE(c.preco_custo, 0) AS custo_total
    FROM calc c
  ),
  classif2 AS (
    SELECT c.*,
           CASE
             WHEN c.nunca_saiu                     THEN 'SEM_MOVIMENTO'
             WHEN c.dias_parado >= p_dias_obsoleto THEN 'OBSOLETO'
             ELSE 'BAIXO_GIRO'
           END AS classificacao
    FROM classif c
    WHERE c.dias_parado IS NULL OR c.dias_parado >= p_dias_baixo_giro
  ),
  filtrado AS (
    SELECT f.*,
           count(*)                OVER () AS total_registros,
           sum(f.saldo)            OVER () AS total_saldo,
           sum(f.custo_total)      OVER () AS total_custo,
           count(*) FILTER (WHERE f.classificacao = 'BAIXO_GIRO')    OVER () AS qtd_baixo_giro,
           count(*) FILTER (WHERE f.classificacao = 'OBSOLETO')      OVER () AS qtd_obsoleto,
           count(*) FILTER (WHERE f.classificacao = 'SEM_MOVIMENTO') OVER () AS qtd_sem_movimento,
           count(*) FILTER (WHERE COALESCE(f.preco_custo, 0) = 0)    OVER () AS qtd_sem_custo
    FROM classif2 f
    WHERE v_class IS NULL OR f.classificacao = v_class
  ),
  pagina AS (
    SELECT f.*,
           row_number() OVER (ORDER BY
             CASE WHEN v_ord = 'DIAS_DESC'  THEN f.dias_parado END DESC NULLS FIRST,
             CASE WHEN v_ord = 'CUSTO_DESC' THEN f.custo_total END DESC NULLS LAST,
             CASE WHEN v_ord = 'SALDO_DESC' THEN f.saldo       END DESC NULLS LAST,
             CASE WHEN v_ord = 'SKU_ASC'    THEN f.sku         END ASC  NULLS LAST,
             f.custo_total DESC,
             f.produto_id) AS rn
    FROM filtrado f
    ORDER BY rn
    LIMIT p_limit OFFSET p_offset
  )
  -- Detalhes descritivos só para as linhas da página (late materialization).
  SELECT pg.produto_id, p.sku, p.descricao, p.marca,
         p.grupo_id, g.descricao, p.subgrupo_id, sg.descricao,
         pg.saldo, pg.saldo_bloqueado, pg.qtd_posicoes,
         pg.preco_custo, pg.custo_total,
         pg.ultima_saida, pg.entrada_mais_antiga, pg.dias_parado, pg.nunca_saiu,
         pg.classificacao,
         pg.total_registros, pg.total_saldo, pg.total_custo,
         pg.qtd_baixo_giro, pg.qtd_obsoleto, pg.qtd_sem_movimento, pg.qtd_sem_custo
  FROM pagina pg
  JOIN produto p                ON p.id  = pg.produto_id
  LEFT JOIN grupo_produto    g  ON g.id  = p.grupo_id
  LEFT JOIN subgrupo_produto sg ON sg.id = p.subgrupo_id
  ORDER BY pg.rn;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_baixo_giro(
  uuid, uuid, uuid, integer, integer, text, uuid, uuid, text, text, numeric, text, integer, integer, text
) IS 'Relatório Baixo Giro / Obsoletos (paginado, totais por janela). Saída = tipos 2,5 sem estorno; sem saída usa entrada mais antiga do saldo.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_baixo_giro(
  uuid, uuid, uuid, integer, integer, text, uuid, uuid, text, text, numeric, text, integer, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_baixo_giro(
  uuid, uuid, uuid, integer, integer, text, uuid, uuid, text, text, numeric, text, integer, integer, text
) TO authenticated, service_role;
