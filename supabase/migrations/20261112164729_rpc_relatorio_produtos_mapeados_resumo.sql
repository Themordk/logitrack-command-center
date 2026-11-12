-- =====================================================================
-- 2026-11-12 · Relatórios · Produtos Mapeados em Picking — indicadores
-- Aplicada em produção como versão 20261112164729.
--
-- Redefine rpc_relatorio_produtos_mapeados (20261112163310) acrescentando,
-- em cada linha, o resumo do conjunto filtrado para os cards da tela:
--  - qtd_skus / qtd_enderecos: SKUs e endereços de picking distintos;
--  - qtd_enderecos_compartilhados / qtd_mapeamentos_compartilhados: endereços
--    (e mapeamentos neles) com mais de 1 SKU mapeado — contando TODOS os
--    mapeamentos ativos da empresa/armazém, não só os filtrados, para que um
--    filtro de SKU não esconda que o endereço é dividido;
--  - qtd_fracionado / qtd_master / qtd_pdv: por tipo de picking;
--  - qtd_sem_autoria: mapeamentos sem created_by (anteriores à auditoria).
-- E por linha: skus_no_endereco (mesma contagem de SKUs do endereço).
-- Filtros, ordenação e demais colunas inalterados. Muda só o tipo de retorno
-- (DROP + CREATE na mesma transação).
-- =====================================================================

DROP FUNCTION IF EXISTS public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
);

CREATE FUNCTION public.rpc_relatorio_produtos_mapeados(
  p_tenant_id      uuid,
  p_empresa_id     uuid,
  p_armazem_id     uuid    DEFAULT NULL,
  p_sku            text    DEFAULT NULL,   -- busca parcial
  p_marca          text    DEFAULT NULL,   -- exata (sem diferenciar maiúsculas)
  p_parceiro_id    uuid    DEFAULT NULL,
  p_data_inicio    date    DEFAULT NULL,   -- data do mapeamento (inclusive)
  p_data_fim       date    DEFAULT NULL,   -- data do mapeamento (inclusive)
  p_rua            integer DEFAULT NULL,
  p_predio         integer DEFAULT NULL,
  p_nivel          integer DEFAULT NULL,
  p_apto           integer DEFAULT NULL,
  p_limit          integer DEFAULT 100,
  p_offset         integer DEFAULT 0,
  p_fuso           text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  picking_id                      uuid,
  produto_id                      uuid,
  sku                             text,
  referencia                      text,
  descricao                       text,
  marca                           text,
  parceiro_id                     uuid,
  parceiro_nome                   text,
  endereco_id                     uuid,
  endereco_descricao              text,
  rua                             integer,
  predio                          integer,
  nivel                           integer,
  apto                            integer,
  est_minimo                      numeric,
  est_maximo                      numeric,
  tipo_picking                    text,
  mapeado_em                      timestamptz,
  mapeado_por                     text,
  skus_no_endereco                integer,
  -- resumo do conjunto filtrado (igual em todas as linhas)
  total_registros                 bigint,
  qtd_skus                        bigint,
  qtd_enderecos                   bigint,
  qtd_enderecos_compartilhados    bigint,
  qtd_mapeamentos_compartilhados  bigint,
  qtd_fracionado                  bigint,
  qtd_master                      bigint,
  qtd_pdv                         bigint,
  qtd_sem_autoria                 bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_sku   text := NULLIF(btrim(p_sku), '');
  v_marca text := NULLIF(btrim(p_marca), '');
  v_fuso  text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_ini   timestamptz;
  v_fim   timestamptz;
BEGIN
  -- ---------- validações ----------
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF p_data_inicio IS NOT NULL AND p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Data final não pode ser anterior à data inicial' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit deve estar entre 1 e 1000' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  BEGIN
    -- [início 00:00, fim+1 00:00) no fuso local, para comparar com created_at.
    v_ini := CASE WHEN p_data_inicio IS NULL THEN NULL
                  ELSE p_data_inicio::timestamp AT TIME ZONE v_fuso END;
    v_fim := CASE WHEN p_data_fim IS NULL THEN NULL
                  ELSE (p_data_fim + 1)::timestamp AT TIME ZONE v_fuso END;
    PERFORM now() AT TIME ZONE v_fuso;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_fuso USING ERRCODE = '22023';
  END;

  RETURN QUERY
  WITH base AS MATERIALIZED (
    SELECT pp.id, pp.produto_id, pp.endereco_id, pp.created_at, pp.created_by,
           pp.tipo_picking::text AS tipo,
           p.sku, e.descricao AS end_desc
    FROM picking_produto pp
    JOIN produto p       ON p.id = pp.produto_id
    LEFT JOIN endereco e ON e.id = pp.endereco_id
    WHERE pp.tenant_id  = p_tenant_id
      AND pp.empresa_id = p_empresa_id
      AND pp.ativo
      AND (p_armazem_id  IS NULL OR pp.armazem_id = p_armazem_id)
      AND (v_sku         IS NULL OR p.sku ILIKE '%' || v_sku || '%')
      AND (v_marca       IS NULL OR lower(p.marca) = lower(v_marca))
      AND (p_parceiro_id IS NULL OR p.parceiro_id = p_parceiro_id)
      AND (p_rua         IS NULL OR e.rua    = p_rua)
      AND (p_predio      IS NULL OR e.predio = p_predio)
      AND (p_nivel       IS NULL OR e.nivel  = p_nivel)
      AND (p_apto        IS NULL OR e.apto   = p_apto)
      AND (v_ini         IS NULL OR pp.created_at >= v_ini)
      AND (v_fim         IS NULL OR pp.created_at <  v_fim)
  ),
  -- SKUs por endereço considerando todos os mapeamentos ativos (não só os
  -- filtrados), restrito aos endereços que aparecem no resultado.
  ocupacao AS MATERIALIZED (
    SELECT x.endereco_id, count(DISTINCT x.produto_id)::integer AS n_skus
    FROM picking_produto x
    WHERE x.tenant_id  = p_tenant_id
      AND x.empresa_id = p_empresa_id
      AND x.ativo
      AND (p_armazem_id IS NULL OR x.armazem_id = p_armazem_id)
      AND x.endereco_id IN (SELECT b.endereco_id FROM base b)
    GROUP BY x.endereco_id
  ),
  resumo AS (
    SELECT count(*)                                                    AS total,
           count(DISTINCT b.produto_id)                                AS skus,
           count(DISTINCT b.endereco_id)                               AS ends,
           count(DISTINCT b.endereco_id) FILTER (WHERE o.n_skus > 1)   AS ends_comp,
           count(*) FILTER (WHERE o.n_skus > 1)                        AS map_comp,
           count(*) FILTER (WHERE b.tipo = 'FRACIONADO')               AS frac,
           count(*) FILTER (WHERE b.tipo = 'MASTER')                   AS master,
           count(*) FILTER (WHERE b.tipo = 'PDV')                      AS pdv,
           count(*) FILTER (WHERE b.created_by IS NULL)                AS sem_aut
    FROM base b
    LEFT JOIN ocupacao o ON o.endereco_id = b.endereco_id
  ),
  pagina AS (
    SELECT b.*, row_number() OVER (ORDER BY b.sku, b.end_desc NULLS LAST, b.id) AS rn
    FROM base b
    ORDER BY rn
    LIMIT p_limit OFFSET p_offset
  )
  -- Descrições, parceiro e usuário só para as linhas da página.
  SELECT pg.id, pg.produto_id, p.sku, p.referencia, p.descricao, p.marca,
         p.parceiro_id, pa.razaosocial,
         pg.endereco_id, COALESCE(e.descricao, ''),
         e.rua, e.predio, e.nivel, e.apto,
         COALESCE(pp.est_minimo, 0), COALESCE(pp.est_maximo, 0), COALESCE(pg.tipo, ''),
         pg.created_at, u.nome,
         COALESCE(o.n_skus, 0),
         r.total, r.skus, r.ends, r.ends_comp, r.map_comp,
         r.frac, r.master, r.pdv, r.sem_aut
  FROM pagina pg
  CROSS JOIN resumo r
  JOIN picking_produto pp ON pp.id = pg.id
  JOIN produto p          ON p.id  = pg.produto_id
  LEFT JOIN parceiro pa   ON pa.id = p.parceiro_id
  LEFT JOIN endereco e    ON e.id  = pg.endereco_id
  LEFT JOIN usuario u     ON u.id  = pg.created_by
  LEFT JOIN ocupacao o    ON o.endereco_id = pg.endereco_id
  ORDER BY pg.rn;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
) IS 'Relatório Produtos Mapeados em Picking (paginado, resumo por linha). Filtros de produto, parceiro, endereço e data do mapeamento (created_at no fuso informado); usuário = created_by; endereço compartilhado = mais de 1 SKU ativo.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_produtos_mapeados(
  uuid, uuid, uuid, text, text, uuid, date, date, integer, integer, integer, integer, integer, integer, text
) TO authenticated, service_role;
