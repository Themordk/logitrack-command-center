-- =====================================================================
-- 2026-11-12 · Relatórios · Validade & Lote (FEFO/FIFO) — RPC server-side
--
-- Decisões aprovadas (2026-11-12): SERIE fora; contadores refletem todos os
-- filtros (inclusive criticidade); faixas 30/60 editáveis na tela; colunas
-- HU (codigo_hu) e saldo bloqueado expostas.
--
-- Substitui validadeLote.service.ts, que hoje baixa TODO o estoque_geral com
-- saldo da empresa (páginas de 1000 via .range(), sequenciais, sem ORDER BY)
-- com embeds de produto/endereco e só depois filtra/ordena no navegador.
--
-- Regras (paridade com o front atual, salvo onde indicado):
--  1. Só produtos com tipo_controle IN ('LOTE','VALIDADE').
--     ('LOTE_SERIE' do front não existe no enum; 'SERIE' segue fora — DECISÃO PENDENTE.)
--  2. Posição precisa ter quantidade_total > 0.
--  3. Ignora posição "sem controle real": lote vazio E data_validade = 1900-01-01.
--  4. dias_para_vencer = data_validade − hoje (fuso America/Fortaleza).
--     CORREÇÃO: o front calculava com new Date('AAAA-MM-DD') (UTC) e ficava
--     1 dia a menos no Brasil — item que vence hoje aparecia como VENCIDO.
--  5. Criticidade: < 0 VENCIDO · <= p_dias_critico (30) CRITICO ·
--     <= p_dias_atencao (60) ATENCAO · senão OK.
--  6. Ordem: FEFO = validade ↑, sku, id · FIFO = fabricação ↑, sku, id
--     (id no fim garante paginação estável).
--  7. p_empresa_id obrigatório (empresas não se misturam).
--
-- Retorno: linhas paginadas (p_limit/p_offset) + totais do conjunto filtrado
-- em cada linha (window functions) para cabeçalho/cards e para a exportação.
-- Segurança: SECURITY INVOKER (RLS vale) + assert_tenant_access.
-- =====================================================================

-- Índice parcial minúsculo: produtos com controle de validade por empresa.
-- Em produção foi criado antes com CREATE INDEX CONCURRENTLY (aqui vira no-op).
-- Medido em produção: sem ele o planner varre 53K produtos do maior tenant
-- (67 ms, 51K buffers) para achar 0 controlados.
CREATE INDEX IF NOT EXISTS idx_produto_controle_validade
  ON public.produto (tenant_id, empresa_id)
  WHERE tipo_controle IN ('LOTE', 'VALIDADE');

DROP FUNCTION IF EXISTS public.rpc_relatorio_validade_lote(
  uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, text, date, text, integer, integer, integer, integer, text
);

CREATE FUNCTION public.rpc_relatorio_validade_lote(
  p_tenant_id      uuid,
  p_empresa_id     uuid,
  p_armazem_id     uuid    DEFAULT NULL,
  p_setor_id       uuid    DEFAULT NULL,
  p_tipo_endereco  text    DEFAULT NULL,   -- PICKING | PULMAO
  p_sku            text    DEFAULT NULL,   -- busca parcial
  p_marca          text    DEFAULT NULL,   -- busca parcial
  p_grupo_id       uuid    DEFAULT NULL,
  p_subgrupo_id    uuid    DEFAULT NULL,
  p_criticidade    text    DEFAULT NULL,   -- VENCIDO | CRITICO | ATENCAO | OK
  p_validade_ate   date    DEFAULT NULL,
  p_ordem          text    DEFAULT 'FEFO', -- FEFO | FIFO
  p_dias_critico   integer DEFAULT 30,
  p_dias_atencao   integer DEFAULT 60,
  p_limit          integer DEFAULT 100,
  p_offset         integer DEFAULT 0,
  p_fuso           text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  id                  uuid,
  produto_id          uuid,
  sku                 text,
  descricao           text,
  marca               text,
  grupo_id            uuid,
  grupo_descricao     text,
  subgrupo_id         uuid,
  subgrupo_descricao  text,
  lote                text,
  data_fabricacao     date,
  data_validade       date,
  dias_para_vencer    integer,
  saldo               numeric,
  saldo_disponivel    numeric,
  saldo_bloqueado     numeric,
  hu_id               uuid,
  codigo_hu           text,              -- '' quando a posição é SEM_HU
  endereco_id         uuid,
  codigo_endereco     text,
  tipo_endereco       text,
  armazem_id          uuid,
  setor_id            uuid,
  criticidade         text,
  -- totais do conjunto filtrado (iguais em todas as linhas)
  total_registros     bigint,
  total_saldo         numeric,
  qtd_vencido         bigint,
  qtd_critico         bigint,
  qtd_atencao         bigint,
  qtd_ok              bigint,
  saldo_vencido       numeric,
  saldo_critico       numeric,
  saldo_atencao       numeric
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
  v_crit  text := NULLIF(upper(btrim(p_criticidade)), '');
  v_tipo  text := NULLIF(upper(btrim(p_tipo_endereco)), '');
  v_ord   text := COALESCE(NULLIF(upper(btrim(p_ordem)), ''), 'FEFO');
  v_fuso  text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_hoje  date;
BEGIN
  -- ---------- validações ----------
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF v_crit IS NOT NULL AND v_crit NOT IN ('VENCIDO', 'CRITICO', 'ATENCAO', 'OK') THEN
    RAISE EXCEPTION 'Criticidade inválida: %', p_criticidade USING ERRCODE = '22023';
  END IF;
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('PICKING', 'PULMAO') THEN
    RAISE EXCEPTION 'Tipo de endereço inválido: %', p_tipo_endereco USING ERRCODE = '22023';
  END IF;
  IF v_ord NOT IN ('FEFO', 'FIFO') THEN
    RAISE EXCEPTION 'Ordem inválida: %', p_ordem USING ERRCODE = '22023';
  END IF;
  IF p_dias_critico IS NULL OR p_dias_critico < 0
     OR p_dias_atencao IS NULL OR p_dias_atencao <= p_dias_critico THEN
    RAISE EXCEPTION 'Faixas inválidas: dias de atenção deve ser maior que dias críticos' USING ERRCODE = '22023';
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
  WITH base AS MATERIALIZED (
    -- Parte do conjunto pequeno (produtos controlados, índice parcial) e
    -- desce no estoque por idx_estoque_geral_tenant_empresa_produto.
    SELECT eg.id, eg.produto_id, p.sku,
           eg.lote, eg.data_fabricacao, eg.data_validade,
           eg.quantidade_total, eg.quantidade_disponivel, eg.quantidade_bloqueada,
           eg.hu_id, eg.endereco_id,
           e.armazem_id, e.setor_id,
           (eg.data_validade - v_hoje)::integer AS dias
    FROM produto p
    JOIN estoque_geral eg
      ON eg.tenant_id  = p_tenant_id
     AND eg.empresa_id = p_empresa_id
     AND eg.produto_id = p.id
     AND eg.quantidade_total > 0
     AND NOT (COALESCE(eg.lote, '') = '' AND eg.data_validade = DATE '1900-01-01')
    LEFT JOIN endereco e ON e.id = eg.endereco_id
    WHERE p.tenant_id  = p_tenant_id
      AND p.empresa_id = p_empresa_id
      AND p.tipo_controle IN ('LOTE', 'VALIDADE')
      AND (p_grupo_id    IS NULL OR p.grupo_id    = p_grupo_id)
      AND (p_subgrupo_id IS NULL OR p.subgrupo_id = p_subgrupo_id)
      AND (v_sku   IS NULL OR p.sku   ILIKE '%' || v_sku   || '%')
      AND (v_marca IS NULL OR p.marca ILIKE '%' || v_marca || '%')
      AND (p_armazem_id   IS NULL OR e.armazem_id = p_armazem_id)
      AND (p_setor_id     IS NULL OR e.setor_id   = p_setor_id)
      AND (v_tipo         IS NULL OR e.tipo_endereco::text = v_tipo)
      AND (p_validade_ate IS NULL OR eg.data_validade <= p_validade_ate)
  ),
  classif AS (
    SELECT b.*,
           CASE
             WHEN b.dias < 0              THEN 'VENCIDO'
             WHEN b.dias <= p_dias_critico THEN 'CRITICO'
             WHEN b.dias <= p_dias_atencao THEN 'ATENCAO'
             ELSE 'OK'
           END AS criticidade
    FROM base b
  ),
  filtrado AS (
    SELECT c.*,
           count(*)               OVER () AS total_registros,
           sum(c.quantidade_total) OVER () AS total_saldo,
           count(*) FILTER (WHERE c.criticidade = 'VENCIDO') OVER () AS qtd_vencido,
           count(*) FILTER (WHERE c.criticidade = 'CRITICO') OVER () AS qtd_critico,
           count(*) FILTER (WHERE c.criticidade = 'ATENCAO') OVER () AS qtd_atencao,
           count(*) FILTER (WHERE c.criticidade = 'OK')      OVER () AS qtd_ok,
           COALESCE(sum(c.quantidade_total) FILTER (WHERE c.criticidade = 'VENCIDO') OVER (), 0) AS saldo_vencido,
           COALESCE(sum(c.quantidade_total) FILTER (WHERE c.criticidade = 'CRITICO') OVER (), 0) AS saldo_critico,
           COALESCE(sum(c.quantidade_total) FILTER (WHERE c.criticidade = 'ATENCAO') OVER (), 0) AS saldo_atencao
    FROM classif c
    WHERE v_crit IS NULL OR c.criticidade = v_crit
  ),
  pagina AS (
    SELECT f.*,
           row_number() OVER (ORDER BY
             CASE WHEN v_ord = 'FEFO' THEN f.data_validade   END ASC NULLS LAST,
             CASE WHEN v_ord = 'FIFO' THEN f.data_fabricacao END ASC NULLS LAST,
             f.sku, f.id) AS rn
    FROM filtrado f
    ORDER BY rn
    LIMIT p_limit OFFSET p_offset
  )
  -- Descrições só para as linhas da página (late materialization).
  SELECT pg.id, pg.produto_id, p.sku, p.descricao, COALESCE(p.marca, ''),
         p.grupo_id, g.descricao, p.subgrupo_id, sg.descricao,
         COALESCE(pg.lote, ''), pg.data_fabricacao, pg.data_validade, pg.dias,
         pg.quantidade_total, pg.quantidade_disponivel, pg.quantidade_bloqueada,
         pg.hu_id, COALESCE(NULLIF(h.codigo_hu, 'SEM_HU'), ''),
         pg.endereco_id, COALESCE(e.descricao, ''), COALESCE(e.tipo_endereco::text, ''),
         pg.armazem_id, pg.setor_id, pg.criticidade,
         pg.total_registros, pg.total_saldo,
         pg.qtd_vencido, pg.qtd_critico, pg.qtd_atencao, pg.qtd_ok,
         pg.saldo_vencido, pg.saldo_critico, pg.saldo_atencao
  FROM pagina pg
  JOIN produto p                ON p.id  = pg.produto_id
  LEFT JOIN endereco e          ON e.id  = pg.endereco_id
  LEFT JOIN hu h                ON h.id  = pg.hu_id
  LEFT JOIN grupo_produto    g  ON g.id  = p.grupo_id
  LEFT JOIN subgrupo_produto sg ON sg.id = p.subgrupo_id
  ORDER BY pg.rn;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_validade_lote(
  uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, text, date, text, integer, integer, integer, integer, text
) IS 'Relatório Validade & Lote FEFO/FIFO (paginado, totais por janela). Produtos LOTE/VALIDADE com saldo > 0; dias no fuso informado.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_validade_lote(
  uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, text, date, text, integer, integer, integer, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_validade_lote(
  uuid, uuid, uuid, uuid, text, text, text, uuid, uuid, text, date, text, integer, integer, integer, integer, text
) TO authenticated, service_role;
