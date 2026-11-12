-- =====================================================================
-- 2026-11-12 · Relatórios · Acuracidade de Inventário — usuário e tipo de execução
--
-- Redefine rpc_relatorio_inventario (20261112160514) com:
--  - tipo_execucao: AUDITORIA (tarefa INV-AUDIT) | ATUALIZACAO (INV-ATU) —
--    o mesmo que inventario.tipo_execucao (1:1 conferido em produção);
--  - p_tipo_execucao: filtro opcional por tipo (DEFAULT NULL, então a tela já
--    publicada, que não envia o parâmetro, continua funcionando);
--  - usuario_contagem: nome do operador da última execução não cancelada da
--    tarefa (concluído_em ↓). Vazio para itens pendentes, cuja execução só
--    indica a quem a tarefa foi atribuída. Resolvido só para as linhas da página.
-- Demais regras, KPIs e ordenação inalterados.
-- =====================================================================

DROP FUNCTION IF EXISTS public.rpc_relatorio_inventario(
  uuid, uuid, uuid, uuid, date, date, text, integer, integer, integer, integer, text, text, boolean, integer, integer, text
);
DROP FUNCTION IF EXISTS public.rpc_relatorio_inventario(
  uuid, uuid, uuid, uuid, date, date, text, integer, integer, integer, integer, text, text, boolean, text, integer, integer, text
);

CREATE FUNCTION public.rpc_relatorio_inventario(
  p_tenant_id             uuid,
  p_empresa_id            uuid,
  p_inventario_id         uuid    DEFAULT NULL,
  p_armazem_id            uuid    DEFAULT NULL,
  p_data_contagem_inicio  date    DEFAULT NULL,
  p_data_contagem_fim     date    DEFAULT NULL,
  p_sku                   text    DEFAULT NULL,   -- busca parcial
  p_rua                   integer DEFAULT NULL,
  p_predio                integer DEFAULT NULL,
  p_nivel                 integer DEFAULT NULL,
  p_apto                  integer DEFAULT NULL,
  p_status                text    DEFAULT NULL,   -- CONFORME | SOBRA | FALTA | PENDENTE
  p_severidade            text    DEFAULT NULL,   -- OK | PEQUENA | MEDIA | GRANDE
  p_apenas_divergentes    boolean DEFAULT false,
  p_tipo_execucao         text    DEFAULT NULL,   -- AUDITORIA | ATUALIZACAO
  p_limit                 integer DEFAULT 100,
  p_offset                integer DEFAULT 0,
  p_fuso                  text    DEFAULT 'America/Fortaleza'
)
RETURNS TABLE(
  id                          uuid,
  inventario_id               uuid,
  numero_inventario           bigint,
  inventario_status           text,
  inventario_finalizado_em    timestamptz,
  produto_id                  uuid,
  sku                         text,
  descricao                   text,
  rua                         integer,
  predio                      integer,
  nivel                       integer,
  apto                        integer,
  qtd_sistemica               numeric,
  qtd_contada                 numeric,
  diferenca                   numeric,
  diferenca_pct               numeric,
  acuracidade_item            numeric,
  preco_custo                 numeric,
  impacto_financeiro          numeric,
  status_calc                 text,
  severidade                  text,
  status_tarefa               text,
  numero_contagens            integer,
  data_contagem               timestamptz,
  tipo_execucao               text,
  usuario_contagem            text,
  -- KPIs do conjunto filtrado (iguais em todas as linhas)
  total_itens                 bigint,
  itens_conformes             bigint,
  itens_divergentes           bigint,
  itens_pendentes             bigint,
  acuracidade_por_item        numeric,
  acuracidade_ponderada_qtd   numeric,
  acuracidade_ponderada_valor numeric,
  total_sobra                 numeric,
  total_falta                 numeric,
  impacto_total               numeric
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_sku    text := NULLIF(btrim(p_sku), '');
  v_status text := NULLIF(upper(btrim(p_status)), '');
  v_sev    text := NULLIF(upper(btrim(p_severidade)), '');
  v_tipo   text := NULLIF(upper(btrim(p_tipo_execucao)), '');
  v_fuso   text := COALESCE(NULLIF(btrim(p_fuso), ''), 'America/Fortaleza');
  v_ini    timestamptz;
  v_fim    timestamptz;
BEGIN
  -- ---------- validações ----------
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id obrigatório' USING ERRCODE = '22023';
  END IF;
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF v_status IS NOT NULL AND v_status NOT IN ('CONFORME', 'SOBRA', 'FALTA', 'PENDENTE') THEN
    RAISE EXCEPTION 'Status inválido: %', p_status USING ERRCODE = '22023';
  END IF;
  IF v_sev IS NOT NULL AND v_sev NOT IN ('OK', 'PEQUENA', 'MEDIA', 'GRANDE') THEN
    RAISE EXCEPTION 'Severidade inválida: %', p_severidade USING ERRCODE = '22023';
  END IF;
  IF v_tipo IS NOT NULL AND v_tipo NOT IN ('AUDITORIA', 'ATUALIZACAO') THEN
    RAISE EXCEPTION 'Tipo de execução inválido: %', p_tipo_execucao USING ERRCODE = '22023';
  END IF;
  IF p_data_contagem_inicio IS NOT NULL AND p_data_contagem_fim IS NOT NULL
     AND p_data_contagem_fim < p_data_contagem_inicio THEN
    RAISE EXCEPTION 'Data final da contagem não pode ser anterior à data inicial' USING ERRCODE = '22023';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'p_limit deve estar entre 1 e 1000' USING ERRCODE = '22023';
  END IF;
  IF p_offset IS NULL OR p_offset < 0 THEN
    RAISE EXCEPTION 'p_offset não pode ser negativo' USING ERRCODE = '22023';
  END IF;
  BEGIN
    -- Intervalo [início 00:00, fim+1 00:00) no fuso local, em timestamptz,
    -- para comparar direto com concluido_em.
    v_ini := CASE WHEN p_data_contagem_inicio IS NULL THEN NULL
                  ELSE p_data_contagem_inicio::timestamp AT TIME ZONE v_fuso END;
    v_fim := CASE WHEN p_data_contagem_fim IS NULL THEN NULL
                  ELSE (p_data_contagem_fim + 1)::timestamp AT TIME ZONE v_fuso END;
    PERFORM now() AT TIME ZONE v_fuso;
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE EXCEPTION 'Fuso horário inválido: %', v_fuso USING ERRCODE = '22023';
  END;

  RETURN QUERY
  WITH inv AS (
    SELECT i.id, i.numero_inventario, i.status::text AS status, i.finalizado_em
    FROM inventario i
    WHERE i.tenant_id  = p_tenant_id
      AND i.empresa_id = p_empresa_id
      AND (p_inventario_id IS NULL OR i.id = p_inventario_id)
      AND (p_armazem_id    IS NULL OR i.armazem_id = p_armazem_id)
  ),
  base AS MATERIALIZED (
    SELECT t.id, t.id_documento_origem AS inventario_id, t.produto_id, t.id_local_origem,
           t.status::text AS status_tarefa,
           CASE tt.codigo WHEN 'INV-AUDIT' THEN 'AUDITORIA' ELSE 'ATUALIZACAO' END AS tipo_exec,
           p.sku, p.preco_custo,
           e.rua, e.predio, e.nivel, e.apto,
           COALESCE(t.quantidade_requerida, 0) AS sist,
           (t.status::text IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')) AS pendente,
           COALESCE(t.quantidade_executada4, t.quantidade_executada3,
                    t.quantidade_executada2, t.quantidade_executada, 0) AS contado,
           COALESCE(t.contagem_inventario::integer,
                    CASE WHEN t.quantidade_executada3 IS NOT NULL THEN 3
                         WHEN t.quantidade_executada2 IS NOT NULL THEN 2
                         ELSE 1 END) AS n_contagens,
           CASE WHEN t.status::text IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA') THEN NULL
                ELSE COALESCE(
                       t.concluido_em,
                       (SELECT max(te.concluido_em)
                          FROM tarefa_execucao te
                         WHERE te.tarefa_id = t.id
                           AND te.tenant_id = p_tenant_id
                           AND te.cancelado_em IS NULL))
           END AS data_contagem
    FROM inv
    JOIN tarefa t       ON t.id_documento_origem = inv.id
                       AND t.tenant_id = p_tenant_id
                       AND t.status::text <> 'CANCELADA'
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
                       AND tt.codigo IN ('INV-AUDIT', 'INV-ATU')
    JOIN produto p      ON p.id = t.produto_id
    JOIN endereco e     ON e.id = t.id_local_origem
    WHERE (v_sku     IS NULL OR p.sku ILIKE '%' || v_sku || '%')
      AND (p_rua     IS NULL OR e.rua    = p_rua)
      AND (p_predio  IS NULL OR e.predio = p_predio)
      AND (p_nivel   IS NULL OR e.nivel  = p_nivel)
      AND (p_apto    IS NULL OR e.apto   = p_apto)
      AND (v_tipo    IS NULL OR tt.codigo = CASE v_tipo WHEN 'AUDITORIA' THEN 'INV-AUDIT' ELSE 'INV-ATU' END)
  ),
  calc AS (
    SELECT b.*,
           (b.contado - b.sist) AS dif,
           CASE WHEN b.sist > 0 THEN (b.contado - b.sist) / b.sist * 100
                WHEN b.contado > 0 THEN 100 ELSE 0 END AS dif_pct,
           CASE WHEN b.sist > 0 THEN GREATEST(0, (1 - abs(b.contado - b.sist) / b.sist) * 100)
                WHEN b.contado = 0 THEN 100 ELSE 0 END AS acur,
           abs(b.contado - b.sist) * COALESCE(b.preco_custo, 0) AS impacto
    FROM base b
    WHERE (v_ini IS NULL OR b.data_contagem >= v_ini)
      AND (v_fim IS NULL OR b.data_contagem <  v_fim)
  ),
  classif AS (
    SELECT c.*,
           CASE WHEN c.pendente  THEN 'PENDENTE'
                WHEN c.dif = 0   THEN 'CONFORME'
                WHEN c.dif > 0   THEN 'SOBRA'
                ELSE 'FALTA' END AS st,
           CASE WHEN c.pendente OR abs(c.dif_pct) = 0 THEN 'OK'
                WHEN abs(c.dif_pct) <= 5  THEN 'PEQUENA'
                WHEN abs(c.dif_pct) <= 20 THEN 'MEDIA'
                ELSE 'GRANDE' END AS sev
    FROM calc c
  ),
  filtrado AS (
    SELECT f.*,
           count(*) OVER () AS k_total,
           count(*) FILTER (WHERE f.st = 'CONFORME')                      OVER () AS k_conf,
           count(*) FILTER (WHERE f.st IN ('SOBRA', 'FALTA'))             OVER () AS k_div,
           count(*) FILTER (WHERE f.st = 'PENDENTE')                      OVER () AS k_pend,
           COALESCE(sum(f.sist)                      FILTER (WHERE NOT f.pendente) OVER (), 0) AS k_sist,
           COALESCE(sum(abs(f.dif))                  FILTER (WHERE NOT f.pendente) OVER (), 0) AS k_absdif,
           COALESCE(sum(f.sist * COALESCE(f.preco_custo, 0)) FILTER (WHERE NOT f.pendente) OVER (), 0) AS k_valsist,
           COALESCE(sum(f.impacto)                   FILTER (WHERE NOT f.pendente) OVER (), 0) AS k_impacto,
           COALESCE(sum(f.dif)                       FILTER (WHERE NOT f.pendente AND f.dif > 0) OVER (), 0) AS k_sobra,
           COALESCE(sum(abs(f.dif))                  FILTER (WHERE NOT f.pendente AND f.dif < 0) OVER (), 0) AS k_falta
    FROM classif f
    WHERE (v_status IS NULL OR f.st  = v_status)
      AND (v_sev    IS NULL OR f.sev = v_sev)
      AND (NOT COALESCE(p_apenas_divergentes, false) OR f.st IN ('SOBRA', 'FALTA'))
  ),
  pagina AS (
    SELECT f.*,
           row_number() OVER (ORDER BY
             CASE f.sev WHEN 'GRANDE' THEN 4 WHEN 'MEDIA' THEN 3 WHEN 'PEQUENA' THEN 2 ELSE 1 END DESC,
             f.impacto DESC, f.sku, f.id) AS rn
    FROM filtrado f
    ORDER BY rn
    LIMIT p_limit OFFSET p_offset
  )
  -- Descrições só para as linhas da página (late materialization).
  SELECT pg.id, pg.inventario_id, inv.numero_inventario, inv.status, inv.finalizado_em,
         pg.produto_id, pg.sku, p.descricao,
         pg.rua, pg.predio, pg.nivel, pg.apto,
         pg.sist, pg.contado, pg.dif, round(pg.dif_pct, 4), round(pg.acur, 4),
         COALESCE(pg.preco_custo, 0), pg.impacto,
         pg.st, pg.sev, pg.status_tarefa, pg.n_contagens, pg.data_contagem,
         pg.tipo_exec, uc.nome,
         pg.k_total, pg.k_conf, pg.k_div, pg.k_pend,
         CASE WHEN (pg.k_conf + pg.k_div) > 0
              THEN round(pg.k_conf::numeric / (pg.k_conf + pg.k_div) * 100, 4) ELSE 0 END,
         CASE WHEN pg.k_sist > 0
              THEN round(GREATEST(0, (1 - pg.k_absdif / pg.k_sist) * 100), 4) ELSE 100 END,
         CASE WHEN pg.k_valsist > 0
              THEN round(GREATEST(0, (1 - pg.k_impacto / pg.k_valsist) * 100), 4) ELSE 100 END,
         pg.k_sobra, pg.k_falta, pg.k_impacto
  FROM pagina pg
  JOIN inv       ON inv.id = pg.inventario_id
  JOIN produto p ON p.id   = pg.produto_id
  -- Quem contou: operador da última execução (só itens já contados; em pendente
  -- a execução indica apenas a quem a tarefa foi atribuída).
  LEFT JOIN LATERAL (
    SELECT u.nome
    FROM tarefa_execucao te
    JOIN usuario u ON u.id = te.usuario_id
    WHERE te.tarefa_id = pg.id
      AND te.tenant_id = p_tenant_id
      AND te.cancelado_em IS NULL
      AND NOT pg.pendente
    ORDER BY te.concluido_em DESC NULLS LAST, te.iniciado_em DESC NULLS LAST, te.atribuido_em DESC NULLS LAST
    LIMIT 1
  ) uc ON true
  ORDER BY pg.rn;
END;
$function$;

COMMENT ON FUNCTION public.rpc_relatorio_inventario(
  uuid, uuid, uuid, uuid, date, date, text, integer, integer, integer, integer, text, text, boolean, text, integer, integer, text
) IS 'Relatório Acuracidade de Inventário (paginado, KPIs por janela). Pendente = tarefa não contada; contagem = última; data da contagem no fuso informado; tipo de execução e usuário da última contagem.';

REVOKE ALL ON FUNCTION public.rpc_relatorio_inventario(
  uuid, uuid, uuid, uuid, date, date, text, integer, integer, integer, integer, text, text, boolean, text, integer, integer, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_relatorio_inventario(
  uuid, uuid, uuid, uuid, date, date, text, integer, integer, integer, integer, text, text, boolean, text, integer, integer, text
) TO authenticated, service_role;
