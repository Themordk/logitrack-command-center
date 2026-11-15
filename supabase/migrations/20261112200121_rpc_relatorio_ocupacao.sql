-- =====================================================================
-- 2026-11-12 · Relatórios · Ocupação de Endereços — RPCs server-side
--
-- Substitui ocupacao.service.ts, que baixava todos os endereços do armazém e
-- TODAS as posições de estoque da empresa (páginas de 1000 sem ORDER BY — risco
-- de linha duplicada/pulada nos saldos) e calculava no navegador.
--
-- Correções de regra (antes → agora):
--  1. Bloqueado: só situacao = 'BLOQUEADO' → também 'BLOQUEADO_INVENTARIO'.
--  2. % de ocupação do endereço: estimativa por nº de SKUs (1=33%, 2=66%,
--     3+=100%) → saldo ÷ capacidade_unidades, apenas onde há capacidade
--     cadastrada; sem capacidade fica nulo (não inventa número).
--  3. PARCIAL: nunca acontecia → estoque > 0 e abaixo da capacidade cadastrada.
--  4. Resumo por setor e KPIs: eram recalculados depois do filtro de status
--     (filtrar "Livre" zerava a ocupação de todos os setores) → o filtro de
--     status vale só para a lista de endereços.
--  5. "Taxa média de ocupação" repetia o % de ocupados → ocupação por
--     capacidade (Σ saldo ÷ Σ capacidade dos endereços com capacidade).
--  6. Ocupação física: saldo de qualquer empresa do tenant no endereço
--     (antes só da empresa selecionada).
--  7. Integridade: divergência entre endereco.situacao e o estoque real
--     (LIVRE com saldo, OCUPADO sem saldo) — contada e filtrável.
--
-- Status: BLOQUEADO (situação) > PARCIAL > OCUPADO > LIVRE.
-- % ocupados = ocupados (inclui parcial) ÷ total de endereços ativos, de modo
-- que ocupados + livres + bloqueados = 100%.
-- Segurança: SECURITY INVOKER (RLS vale) + assert_tenant_access.
-- =====================================================================

DROP FUNCTION IF EXISTS public.rpc_relatorio_ocupacao_enderecos(uuid, uuid, uuid, text, text, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.rpc_relatorio_ocupacao_resumo(uuid, uuid, uuid, text);
DROP FUNCTION IF EXISTS public.fn_ocupacao_base(uuid, uuid, uuid, text);

-- Base única: cada endereço ativo do armazém classificado.
CREATE FUNCTION public.fn_ocupacao_base(
  p_tenant_id     uuid,
  p_armazem_id    uuid,
  p_setor_id      uuid DEFAULT NULL,
  p_tipo_endereco text DEFAULT NULL
)
RETURNS TABLE(
  endereco_id         uuid,
  descricao           text,
  setor_id            uuid,
  tipo_endereco       text,
  situacao            text,
  rua                 integer,
  predio              integer,
  nivel               integer,
  apto                integer,
  capacidade          numeric,
  quantidade_total    numeric,
  skus_count          integer,
  ultima_atualizacao  timestamptz,
  status_ocupacao     text,
  percentual_ocupacao numeric,
  divergente          boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
  WITH ends AS (
    SELECT e.id, e.descricao, e.setor_id, e.tipo_endereco::text AS tipo, e.situacao::text AS sit,
           e.rua, e.predio, e.nivel, e.apto,
           NULLIF(e.capacidade_unidades, 0) AS cap
    FROM endereco e
    WHERE e.tenant_id  = p_tenant_id
      AND e.armazem_id = p_armazem_id
      AND e.ativo
      AND (p_setor_id      IS NULL OR e.setor_id = p_setor_id)
      AND (p_tipo_endereco IS NULL OR e.tipo_endereco::text = upper(p_tipo_endereco))
  ),
  est AS (
    SELECT eg.endereco_id, sum(eg.quantidade_total) AS qtd,
           count(DISTINCT eg.produto_id)::integer AS skus,
           max(eg.atualizado_em) AS ult
    FROM estoque_geral eg
    WHERE eg.tenant_id = p_tenant_id
      AND eg.quantidade_total > 0
      AND eg.endereco_id IN (SELECT id FROM ends)
    GROUP BY eg.endereco_id
  )
  SELECT e.id, e.descricao, e.setor_id, e.tipo, e.sit,
         e.rua, e.predio, e.nivel, e.apto,
         e.cap,
         COALESCE(s.qtd, 0),
         COALESCE(s.skus, 0),
         s.ult,
         CASE WHEN e.sit IN ('BLOQUEADO', 'BLOQUEADO_INVENTARIO') THEN 'BLOQUEADO'
              WHEN COALESCE(s.qtd, 0) > 0 AND e.cap IS NOT NULL AND s.qtd < e.cap THEN 'PARCIAL'
              WHEN COALESCE(s.qtd, 0) > 0 THEN 'OCUPADO'
              ELSE 'LIVRE' END,
         CASE WHEN e.cap IS NOT NULL THEN round(COALESCE(s.qtd, 0) / e.cap * 100, 1) END,
         (e.sit = 'LIVRE' AND COALESCE(s.qtd, 0) > 0) OR (e.sit = 'OCUPADO' AND COALESCE(s.qtd, 0) = 0)
  FROM ends e
  LEFT JOIN est s ON s.endereco_id = e.id;
$function$;

-- Resumo: KPIs, setores e distribuição de status (independe do filtro de status).
CREATE FUNCTION public.rpc_relatorio_ocupacao_resumo(
  p_tenant_id     uuid,
  p_armazem_id    uuid,
  p_setor_id      uuid DEFAULT NULL,
  p_tipo_endereco text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
DECLARE
  v_tipo   text := NULLIF(upper(btrim(p_tipo_endereco)), '');
  v_result jsonb;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_armazem_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o armazém' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('PICKING', 'PULMAO') THEN
    RAISE EXCEPTION 'Tipo de endereço inválido: %', p_tipo_endereco USING ERRCODE = '22023';
  END IF;

  WITH base AS MATERIALIZED (
    SELECT * FROM public.fn_ocupacao_base(p_tenant_id, p_armazem_id, p_setor_id, v_tipo)
  ),
  por_setor AS (
    SELECT b.setor_id,
           COALESCE(st.descricao, '—') AS setor_descricao,
           count(*) AS total,
           count(*) FILTER (WHERE b.status_ocupacao IN ('OCUPADO', 'PARCIAL')) AS ocupados,
           count(*) FILTER (WHERE b.status_ocupacao = 'PARCIAL') AS parciais,
           count(*) FILTER (WHERE b.status_ocupacao = 'LIVRE') AS livres,
           count(*) FILTER (WHERE b.status_ocupacao = 'BLOQUEADO') AS bloqueados,
           count(*) FILTER (WHERE b.divergente) AS divergentes,
           sum(b.capacidade) AS cap_total,
           sum(b.quantidade_total) FILTER (WHERE b.capacidade IS NOT NULL) AS qtd_com_cap
    FROM base b
    LEFT JOIN setor st ON st.id = b.setor_id
    GROUP BY b.setor_id, st.descricao
  ),
  setores AS (
    SELECT ps.*,
           round(ps.ocupados::numeric / NULLIF(ps.total, 0) * 100) AS perc
    FROM por_setor ps
  ),
  tot AS (
    SELECT count(*) AS total,
           count(*) FILTER (WHERE status_ocupacao IN ('OCUPADO', 'PARCIAL')) AS ocupados,
           count(*) FILTER (WHERE status_ocupacao = 'PARCIAL') AS parciais,
           count(*) FILTER (WHERE status_ocupacao = 'LIVRE') AS livres,
           count(*) FILTER (WHERE status_ocupacao = 'BLOQUEADO') AS bloqueados,
           count(*) FILTER (WHERE status_ocupacao = 'BLOQUEADO' AND quantidade_total > 0) AS bloqueados_com_saldo,
           count(*) FILTER (WHERE divergente) AS divergentes,
           count(*) FILTER (WHERE divergente AND situacao = 'LIVRE') AS livre_com_saldo,
           count(*) FILTER (WHERE divergente AND situacao = 'OCUPADO') AS ocupado_sem_saldo,
           count(*) FILTER (WHERE capacidade IS NOT NULL) AS com_capacidade,
           sum(capacidade) AS cap_total,
           sum(quantidade_total) FILTER (WHERE capacidade IS NOT NULL) AS qtd_com_cap,
           count(*) FILTER (WHERE capacidade IS NOT NULL AND quantidade_total > capacidade) AS acima_capacidade
    FROM base
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_enderecos',        t.total,
      'enderecos_ocupados',     t.ocupados,
      'enderecos_parciais',     t.parciais,
      'enderecos_livres',       t.livres,
      'enderecos_bloqueados',   t.bloqueados,
      'bloqueados_com_saldo',   t.bloqueados_com_saldo,
      'percentual_ocupados',    COALESCE(round(t.ocupados::numeric  / NULLIF(t.total, 0) * 100), 0),
      'percentual_livres',      COALESCE(round(t.livres::numeric    / NULLIF(t.total, 0) * 100), 0),
      'percentual_bloqueados',  COALESCE(round(t.bloqueados::numeric / NULLIF(t.total, 0) * 100), 0),
      'divergencias',           t.divergentes,
      'livre_com_saldo',        t.livre_com_saldo,
      'ocupado_sem_saldo',      t.ocupado_sem_saldo,
      'enderecos_com_capacidade', t.com_capacidade,
      'ocupacao_capacidade',    CASE WHEN t.cap_total > 0 THEN round(t.qtd_com_cap / t.cap_total * 100, 1) END,
      'acima_capacidade',       t.acima_capacidade,
      'setor_mais_saturado',    (SELECT s.setor_descricao FROM setores s ORDER BY s.perc DESC NULLS LAST, s.total DESC, s.setor_descricao LIMIT 1),
      'setor_mais_ocioso',      CASE WHEN (SELECT count(*) FROM setores) > 1
                                     THEN (SELECT s.setor_descricao FROM setores s ORDER BY s.perc ASC NULLS LAST, s.total DESC, s.setor_descricao LIMIT 1)
                                END
    ),
    'setores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'setor_id',              s.setor_id,
               'setor_descricao',       s.setor_descricao,
               'total_enderecos',       s.total,
               'enderecos_ocupados',    s.ocupados,
               'enderecos_parciais',    s.parciais,
               'enderecos_livres',      s.livres,
               'enderecos_bloqueados',  s.bloqueados,
               'divergencias',          s.divergentes,
               'percentual_ocupacao',   COALESCE(s.perc, 0),
               'ocupacao_capacidade',   CASE WHEN s.cap_total > 0 THEN round(s.qtd_com_cap / s.cap_total * 100, 1) END
             ) ORDER BY s.perc DESC NULLS LAST, s.total DESC, s.setor_descricao)
      FROM setores s), '[]'::jsonb)
  )
  INTO v_result
  FROM tot t;

  RETURN v_result;
END;
$function$;

-- Lista de endereços (paginada), com filtro de status e de divergência.
CREATE FUNCTION public.rpc_relatorio_ocupacao_enderecos(
  p_tenant_id          uuid,
  p_armazem_id         uuid,
  p_setor_id           uuid    DEFAULT NULL,
  p_tipo_endereco      text    DEFAULT NULL,
  p_status             text    DEFAULT NULL,   -- LIVRE | PARCIAL | OCUPADO | BLOQUEADO
  p_apenas_divergentes boolean DEFAULT false,
  p_limit              integer DEFAULT 100,
  p_offset             integer DEFAULT 0
)
RETURNS TABLE(
  endereco_id         uuid,
  descricao           text,
  setor_id            uuid,
  setor_descricao     text,
  tipo_endereco       text,
  situacao            text,
  rua                 integer,
  predio              integer,
  nivel               integer,
  apto                integer,
  capacidade          numeric,
  quantidade_total    numeric,
  skus_count          integer,
  ultima_atualizacao  timestamptz,
  status_ocupacao     text,
  percentual_ocupacao numeric,
  divergente          boolean,
  total_registros     bigint
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_tipo   text := NULLIF(upper(btrim(p_tipo_endereco)), '');
  v_status text := NULLIF(upper(btrim(p_status)), '');
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_armazem_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o armazém' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('PICKING', 'PULMAO') THEN
    RAISE EXCEPTION 'Tipo de endereço inválido: %', p_tipo_endereco USING ERRCODE = '22023';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('LIVRE', 'PARCIAL', 'OCUPADO', 'BLOQUEADO') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit deve estar entre 1 e 1000' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset não pode ser negativo' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH filtrado AS (
    SELECT b.*, count(*) OVER () AS total
    FROM public.fn_ocupacao_base(p_tenant_id, p_armazem_id, p_setor_id, v_tipo) b
    WHERE (v_status IS NULL OR b.status_ocupacao = v_status)
      AND (NOT COALESCE(p_apenas_divergentes, false) OR b.divergente)
  )
  SELECT f.endereco_id, f.descricao, f.setor_id, COALESCE(st.descricao, '—'),
         f.tipo_endereco, f.situacao, f.rua, f.predio, f.nivel, f.apto,
         f.capacidade, f.quantidade_total, f.skus_count, f.ultima_atualizacao,
         f.status_ocupacao, f.percentual_ocupacao, f.divergente, f.total
  FROM filtrado f
  LEFT JOIN setor st ON st.id = f.setor_id
  ORDER BY f.divergente DESC, f.quantidade_total DESC, f.descricao, f.endereco_id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

COMMENT ON FUNCTION public.fn_ocupacao_base(uuid, uuid, uuid, text)
  IS 'Base do relatório de ocupação: endereços ativos do armazém com saldo físico (todas as empresas), status (BLOQUEADO > PARCIAL > OCUPADO > LIVRE), % por capacidade e divergência situação × estoque.';
COMMENT ON FUNCTION public.rpc_relatorio_ocupacao_resumo(uuid, uuid, uuid, text)
  IS 'Relatório de Ocupação — KPIs, setores e distribuição (não depende do filtro de status).';
COMMENT ON FUNCTION public.rpc_relatorio_ocupacao_enderecos(uuid, uuid, uuid, text, text, boolean, integer, integer)
  IS 'Relatório de Ocupação — endereços paginados, com filtro de status e de divergência situação × estoque.';

REVOKE ALL ON FUNCTION public.fn_ocupacao_base(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_relatorio_ocupacao_resumo(uuid, uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_relatorio_ocupacao_enderecos(uuid, uuid, uuid, text, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ocupacao_base(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_ocupacao_resumo(uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_ocupacao_enderecos(uuid, uuid, uuid, text, text, boolean, integer, integer) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
