-- =====================================================================
-- 2026-11-12 · Relatórios · Posição de Estoque — RPC server-side + indicadores
-- Aplicada em produção como versão 20261112170618. Medido: ~0,55 s por página
-- no tenant com 25 mil posições sem filtro (antes ~1 min 47 s).
--
-- Substitui estoque.service.ts, que: (A) resolvia filtros de produto em
-- consultas separadas e mandava a lista de IDs no .in() da URL; (B) baixava
-- TODAS as posições da empresa em páginas de 1000, sequenciais, cada uma
-- reordenando a tabela por atualizado_em antes do OFFSET, com embeds de
-- produto e endereco; (C) ordenava, filtrava saldo e multi-localização no
-- navegador. Medido em produção (12/11, tenant com 25 mil posições):
-- 26 requisições de ~3,7 s = ~1 min 47 s.
--
-- Regras (paridade com o front antigo, salvo onde indicado):
--  1. Posições de estoque_geral da empresa; p_apenas_com_saldo (padrão true)
--     mantém só quantidade_total > 0.
--  2. Filtros de endereço (armazém, tipo, tipo de estoque, setor, código,
--     rua/prédio/nível/apto) e de produto (grupo, subgrupo, marca exata,
--     parceiro, EAN exato via produto_embalagem).
--     MUDANÇA: SKU passa a ser busca parcial (o front antigo usava igualdade,
--     apesar do placeholder "Buscar SKU...").
--  3. Multi-localização: SKUs com saldo em 2+ endereços distintos dentro do
--     conjunto filtrado (mesma regra do front antigo).
--  4. Valor = quantidade_total × produto.preco_custo.
--  5. Vencida = data_validade < hoje (fuso p_fuso) e diferente de 1900-01-01.
--  6. Sem atualização: atualizado_em anterior a p_dias_sem_atualizacao (90).
--  7. Ordem: SKU, validade, endereço, id (paginação estável).
--  8. p_empresa_id obrigatório.
--
-- Retorno: linhas paginadas + resumo do conjunto filtrado em cada linha.
-- Segurança: SECURITY INVOKER (RLS vale) + assert_tenant_access.
-- Índices: nenhum novo (estoque_geral ~28 mil linhas no maior tenant).
-- Comparação com saldo do ERP: não há saldo do ERP gravado no banco hoje;
-- entra numa etapa própria da integração.
-- =====================================================================

DROP FUNCTION IF EXISTS public.rpc_relatorio_posicao_estoque(
  uuid, uuid, uuid, text, uuid, uuid, numeric, integer, integer, integer, integer,
  uuid, uuid, text, uuid, text, text, boolean, boolean, integer, integer, integer, text
);

CREATE FUNCTION public.rpc_relatorio_posicao_estoque(
  p_tenant_id               uuid,
  p_empresa_id              uuid,
  p_armazem_id              uuid    DEFAULT NULL,
  p_tipo_endereco           text    DEFAULT NULL,   -- PICKING | PULMAO
  p_tipo_estoque_id         uuid    DEFAULT NULL,
  p_setor_id                uuid    DEFAULT NULL,
  p_codigo_endereco         numeric DEFAULT NULL,
  p_rua                     integer DEFAULT NULL,
  p_predio                  integer DEFAULT NULL,
  p_nivel                   integer DEFAULT NULL,
  p_apto                    integer DEFAULT NULL,
  p_grupo_id                uuid    DEFAULT NULL,
  p_subgrupo_id             uuid    DEFAULT NULL,
  p_marca                   text    DEFAULT NULL,   -- exata (sem diferenciar maiúsculas)
  p_parceiro_id             uuid    DEFAULT NULL,
  p_sku                     text    DEFAULT NULL,   -- busca parcial
  p_ean                     text    DEFAULT NULL,   -- exato
  p_apenas_com_saldo        boolean DEFAULT true,
  p_apenas_multi_localizacao boolean DEFAULT false,
  p_dias_sem_atualizacao    integer DEFAULT 90,
  p_limit                   integer DEFAULT 100,
  p_offset                  integer DEFAULT 0,
  p_fuso                    text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  id                      uuid,
  produto_id              uuid,
  sku                     text,
  descricao               text,
  marca                   text,
  fator_caixa             integer,
  preco_custo             numeric,
  lote                    text,
  data_validade           date,
  numero_serie            text,
  endereco_id             uuid,
  codigo_endereco         numeric,
  endereco_descricao      text,
  tipo_endereco           text,
  armazem_id              uuid,
  setor_id                uuid,
  tipo_estoque_id         uuid,
  rua                     integer,
  predio                  integer,
  nivel                   integer,
  apto                    integer,
  quantidade_disponivel   numeric,
  quantidade_bloqueada    numeric,
  quantidade_total        numeric,
  valor_total             numeric,
  vencido                 boolean,
  enderecos_do_sku        integer,
  atualizado_em           timestamptz,
  -- resumo do conjunto filtrado (igual em todas as linhas)
  total_registros         bigint,
  qtd_skus                bigint,
  qtd_skus_multi          bigint,
  qtd_enderecos           bigint,
  pos_picking             bigint,
  pos_pulmao              bigint,
  saldo_total             numeric,
  saldo_disponivel        numeric,
  saldo_bloqueado         numeric,
  pos_bloqueadas          bigint,
  valor_estoque           numeric,
  qtd_skus_sem_custo      bigint,
  pos_vencidas            bigint,
  saldo_vencido           numeric,
  pos_sem_atualizacao     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_sku    text := NULLIF(btrim(p_sku), '');
  v_ean    text := NULLIF(btrim(p_ean), '');
  v_marca  text := NULLIF(btrim(p_marca), '');
  v_tipo   text := NULLIF(upper(btrim(p_tipo_endereco)), '');
  v_fuso   text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_hoje   date;
  v_corte  timestamptz;
BEGIN
  -- ---------- validações ----------
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('PICKING', 'PULMAO') THEN
    RAISE EXCEPTION 'Tipo de endereço inválido: %', p_tipo_endereco USING ERRCODE = '22023';
  END IF;
  IF p_dias_sem_atualizacao IS NULL OR p_dias_sem_atualizacao < 1 THEN
    RAISE EXCEPTION 'Dias sem atualização deve ser maior que zero' USING ERRCODE = '22023';
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
  v_corte := now() - make_interval(days => p_dias_sem_atualizacao);

  RETURN QUERY
  WITH base AS MATERIALIZED (
    SELECT eg.id, eg.produto_id, eg.endereco_id, eg.lote, eg.data_validade,
           eg.quantidade_disponivel AS q_disp, eg.quantidade_bloqueada AS q_bloq,
           eg.quantidade_total AS q_total, eg.atualizado_em,
           p.sku, p.preco_custo,
           e.descricao AS end_desc, e.tipo_endereco::text AS tend,
           (eg.data_validade < v_hoje AND eg.data_validade <> DATE '1900-01-01') AS venc
    FROM estoque_geral eg
    JOIN produto p       ON p.id = eg.produto_id
    LEFT JOIN endereco e ON e.id = eg.endereco_id
    WHERE eg.tenant_id  = p_tenant_id
      AND eg.empresa_id = p_empresa_id
      AND (NOT COALESCE(p_apenas_com_saldo, true) OR eg.quantidade_total > 0)
      AND (p_armazem_id      IS NULL OR e.armazem_id      = p_armazem_id)
      AND (v_tipo            IS NULL OR e.tipo_endereco::text = v_tipo)
      AND (p_tipo_estoque_id IS NULL OR e.tipo_estoque_id = p_tipo_estoque_id)
      AND (p_setor_id        IS NULL OR e.setor_id        = p_setor_id)
      AND (p_codigo_endereco IS NULL OR e.codigo_endereco = p_codigo_endereco)
      AND (p_rua             IS NULL OR e.rua    = p_rua)
      AND (p_predio          IS NULL OR e.predio = p_predio)
      AND (p_nivel           IS NULL OR e.nivel  = p_nivel)
      AND (p_apto            IS NULL OR e.apto   = p_apto)
      AND (p_grupo_id        IS NULL OR p.grupo_id    = p_grupo_id)
      AND (p_subgrupo_id     IS NULL OR p.subgrupo_id = p_subgrupo_id)
      AND (p_parceiro_id     IS NULL OR p.parceiro_id = p_parceiro_id)
      AND (v_marca           IS NULL OR lower(p.marca) = lower(v_marca))
      AND (v_sku             IS NULL OR p.sku ILIKE '%' || v_sku || '%')
      AND (v_ean IS NULL OR EXISTS (
            SELECT 1 FROM produto_embalagem pe
            WHERE pe.tenant_id = p_tenant_id
              AND pe.produto_id = eg.produto_id
              AND pe.ean = v_ean))
  ),
  -- Endereços distintos com saldo por SKU, no conjunto filtrado.
  locs AS (
    SELECT b.produto_id, count(DISTINCT b.endereco_id) FILTER (WHERE b.q_total > 0)::integer AS n_end
    FROM base b
    GROUP BY b.produto_id
  ),
  filtrado AS MATERIALIZED (
    SELECT b.*, COALESCE(l.n_end, 0) AS n_end
    FROM base b
    LEFT JOIN locs l ON l.produto_id = b.produto_id
    WHERE NOT COALESCE(p_apenas_multi_localizacao, false) OR l.n_end >= 2
  ),
  resumo AS (
    SELECT count(*)                                                        AS total,
           count(DISTINCT f.produto_id)                                    AS skus,
           count(DISTINCT f.produto_id) FILTER (WHERE f.n_end >= 2)        AS skus_multi,
           count(DISTINCT f.endereco_id) FILTER (WHERE f.q_total > 0)      AS ends,
           count(*) FILTER (WHERE f.tend = 'PICKING')                      AS pick,
           count(*) FILTER (WHERE f.tend = 'PULMAO')                       AS pulm,
           COALESCE(sum(f.q_total), 0)                                     AS s_total,
           COALESCE(sum(f.q_disp), 0)                                      AS s_disp,
           COALESCE(sum(f.q_bloq), 0)                                      AS s_bloq,
           count(*) FILTER (WHERE f.q_bloq > 0)                            AS p_bloq,
           COALESCE(sum(f.q_total * COALESCE(f.preco_custo, 0)), 0)        AS valor,
           count(DISTINCT f.produto_id) FILTER (WHERE f.q_total > 0 AND COALESCE(f.preco_custo, 0) = 0) AS sem_custo,
           count(*) FILTER (WHERE f.venc AND f.q_total > 0)                AS p_venc,
           COALESCE(sum(f.q_total) FILTER (WHERE f.venc AND f.q_total > 0), 0) AS s_venc,
           count(*) FILTER (WHERE f.q_total > 0 AND f.atualizado_em < v_corte) AS p_parada
    FROM filtrado f
  ),
  pagina AS (
    SELECT f.*,
           row_number() OVER (ORDER BY f.sku, f.data_validade, f.end_desc NULLS LAST, f.id) AS rn
    FROM filtrado f
    ORDER BY rn
    LIMIT p_limit OFFSET p_offset
  )
  -- Descrições e dados de endereço só para as linhas da página.
  SELECT pg.id, pg.produto_id, p.sku, p.descricao, p.marca, p.fator_caixa, COALESCE(p.preco_custo, 0),
         COALESCE(pg.lote, ''), pg.data_validade, eg.numero_serie,
         pg.endereco_id, e.codigo_endereco, COALESCE(e.descricao, ''), COALESCE(e.tipo_endereco::text, ''),
         e.armazem_id, e.setor_id, e.tipo_estoque_id,
         e.rua, e.predio, e.nivel, e.apto,
         pg.q_disp, pg.q_bloq, pg.q_total,
         pg.q_total * COALESCE(p.preco_custo, 0),
         pg.venc, pg.n_end, pg.atualizado_em,
         r.total, r.skus, r.skus_multi, r.ends, r.pick, r.pulm,
         r.s_total, r.s_disp, r.s_bloq, r.p_bloq,
         r.valor, r.sem_custo, r.p_venc, r.s_venc, r.p_parada
  FROM pagina pg
  CROSS JOIN resumo r
  JOIN estoque_geral eg ON eg.id = pg.id
  JOIN produto p        ON p.id  = pg.produto_id
  LEFT JOIN endereco e  ON e.id  = pg.endereco_id
  ORDER BY pg.rn;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_posicao_estoque(
  uuid, uuid, uuid, text, uuid, uuid, numeric, integer, integer, integer, integer,
  uuid, uuid, text, uuid, text, text, boolean, boolean, integer, integer, integer, text
) IS 'Relatório Posição de Estoque (paginado, resumo por linha): saldos por posição com filtros de endereço/produto, valor a custo, vencidos, multi-localização e posições sem atualização.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_posicao_estoque(
  uuid, uuid, uuid, text, uuid, uuid, numeric, integer, integer, integer, integer,
  uuid, uuid, text, uuid, text, text, boolean, boolean, integer, integer, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_posicao_estoque(
  uuid, uuid, uuid, text, uuid, uuid, numeric, integer, integer, integer, integer,
  uuid, uuid, text, uuid, text, text, boolean, boolean, integer, integer, integer, text
) TO authenticated, service_role;
