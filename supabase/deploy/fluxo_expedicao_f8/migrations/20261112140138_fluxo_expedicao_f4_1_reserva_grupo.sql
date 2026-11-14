-- =====================================================================
-- Fluxo de Expedição — F4.1: correções da F4 · 2026-11-12
-- 1. Convocação respeita tipo_saida.reserva_separacao_movimento com grupos:
--      TRUE  -> cada grupo fica com um operador (grupo inteiro)
--      FALSE -> vários operadores no mesmo grupo, uma tarefa por vez,
--               priorizando o grupo em que o operador já está
-- 2. Zona no roteiro + reserva ligada passa a ser permitida (decisão 12/11):
--    significa "cada grupo de zona fica com um operador".
-- 3. Tarefa sem endereço usa o armazém da configuração da empresa no grupo.
-- 4. Montagem de grupos protegida contra execução simultânea (lock por onda).
-- Reversão: 20261112_fluxo_expedicao_f4_down.sql (restaura a situação pré-F4).
-- =====================================================================

-- 0. Backup do que ainda não tem backup
DO $$
DECLARE v_def text;
BEGIN
  IF to_regproc('public.tg_agrupamento_separacao_valida_zona_bkp_20261112') IS NULL THEN
    v_def := pg_get_functiondef('public.tg_agrupamento_separacao_valida_zona()'::regprocedure);
    v_def := replace(v_def, 'FUNCTION public.tg_agrupamento_separacao_valida_zona(', 'FUNCTION public.tg_agrupamento_separacao_valida_zona_bkp_20261112(');
    EXECUTE v_def;
    EXECUTE 'REVOKE ALL ON FUNCTION public.tg_agrupamento_separacao_valida_zona_bkp_20261112() FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. Zona + reserva: regra removida nos três pontos
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_agrupamento_separacao_valida_zona()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12): zona + reserva do movimento passou a ser permitida (reserva vale por grupo de zona).
BEGIN
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_tipo_saida_valida_zona()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
-- v3 (2026-11-12): zona + reserva do movimento passou a ser permitida (reserva vale por grupo de zona).
BEGIN
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_roteiro_saida_validar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
-- v2 (2026-11-12): sem a trava zona x reserva
BEGIN
  IF NOT EXISTS (SELECT 1 FROM empresa e WHERE e.id = NEW.empresa_id AND e.tenant_id = NEW.tenant_id) THEN
    RAISE EXCEPTION 'ROTEIRO_EMPRESA_INVALIDA: empresa não pertence ao tenant.' USING ERRCODE = 'P0001';
  END IF;

  NEW.updated_by := COALESCE(public.fn_audit_usuario_atual(), NEW.updated_by);

  IF TG_TABLE_NAME = 'roteiro_saida_criterio' THEN
    IF NOT public.fn_roteiro_criterio_permitido(NEW.nivel, NEW.criterio) THEN
      RAISE EXCEPTION 'ROTEIRO_CRITERIO_NIVEL_INVALIDO: o critério % não é aceito no nível %.', NEW.criterio, NEW.nivel
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.tg_roteiro_saida_validar() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Montagem: lock por onda + armazém da configuração para tarefa sem endereço
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_montar_grupos_separacao(p_tenant_id uuid, p_movimento_saida_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
-- v2 (2026-11-12): lock por onda; tarefa sem endereço usa armazem_config da empresa.
DECLARE
  v_empresa  uuid;
  v_sep      uuid;
  v_crit     text[];
  v_max      integer;
  v_seq_base integer;
  v_criados  integer := 0;
  v_arm_cfg  uuid;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  -- duas chamadas na mesma onda (liberação + coletor) nunca montam ao mesmo tempo
  PERFORM pg_advisory_xact_lock(hashtextextended('grupo_separacao:' || p_movimento_saida_id::text, 0));

  SELECT ms.empresa_id INTO v_empresa
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id;
  IF v_empresa IS NULL THEN RETURN 0; END IF;

  SELECT tt.id INTO v_sep FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'SEP' LIMIT 1;
  IF v_sep IS NULL THEN RETURN 0; END IF;

  SELECT ac.armazem_id INTO v_arm_cfg
  FROM armazem_config ac
  WHERE ac.tenant_id = p_tenant_id AND ac.empresa_id = v_empresa AND ac.ativo = true
  LIMIT 1;

  SELECT array_agg(rc.criterio::text ORDER BY rc.sequencia) INTO v_crit
  FROM roteiro_saida_criterio rc
  WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = v_empresa AND rc.nivel = 'SEPARACAO';
  v_crit := COALESCE(v_crit, ARRAY[]::text[]);

  SELECT rl.valor::integer INTO v_max
  FROM roteiro_saida_limite rl
  WHERE rl.tenant_id = p_tenant_id AND rl.empresa_id = v_empresa
    AND rl.nivel = 'SEPARACAO' AND rl.tipo_limite = 'MAX_SKU';

  DROP TABLE IF EXISTS tmp_grupo_sep_tarefas;
  CREATE TEMP TABLE tmp_grupo_sep_tarefas ON COMMIT DROP AS
  WITH base AS (
    SELECT t.id AS tarefa_id, t.produto_id, COALESCE(t.ordem_tarefa, 0) AS ordem,
           COALESCE(e.armazem_id, t.armazem_id, v_arm_cfg) AS armazem_id,
           z.zona_atividade_id,
           e.tipo_endereco::text AS tipo_posicao,
           p.tipo_separacao::text AS tipo_separacao_sku
    FROM tarefa t
    JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
                                 AND msi.movimento_saida_id = p_movimento_saida_id
    JOIN produto p ON p.id = t.produto_id
    LEFT JOIN endereco e ON e.id = t.id_local_origem
    LEFT JOIN LATERAL (
      SELECT eza.zona_atividade_id FROM endereco_zona_atividade eza
      WHERE eza.endereco_id = t.id_local_origem AND eza.tenant_id = p_tenant_id
      ORDER BY eza.zona_atividade_id LIMIT 1) z ON true
    WHERE t.tenant_id = p_tenant_id
      AND t.tipo_tarefa_id = v_sep
      AND t.grupo_separacao_id IS NULL
      AND t.status <> 'CANCELADA'::enum_status_tarefa
  ), chave AS (
    SELECT b.*,
           COALESCE(b.armazem_id::text, 'SEM_ARMAZEM')
           || COALESCE((SELECT string_agg('|' || CASE c.crit
                           WHEN 'ZONA_ATIVIDADE'     THEN COALESCE(b.zona_atividade_id::text, 'SEM_ZONA')
                           WHEN 'TIPO_POSICAO'       THEN COALESCE(b.tipo_posicao, 'SEM_ENDERECO')
                           WHEN 'TIPO_SEPARACAO_SKU' THEN COALESCE(b.tipo_separacao_sku, 'SEM_TIPO')
                         END, '' ORDER BY c.ord)
                        FROM unnest(v_crit) WITH ORDINALITY AS c(crit, ord)), '') AS chave_base
    FROM base b
  ), ordenado AS (
    SELECT c.*,
           MIN(c.ordem) OVER (PARTITION BY c.chave_base, c.produto_id) AS primeira_ordem
    FROM chave c
  ), rank_sku AS (
    SELECT o.*,
           DENSE_RANK() OVER (PARTITION BY o.chave_base ORDER BY o.primeira_ordem, o.produto_id) AS rk
    FROM ordenado o
  )
  SELECT r.*,
         COALESCE((SELECT MAX(g.bloco) FROM grupo_separacao g
                   WHERE g.movimento_saida_id = p_movimento_saida_id AND g.chave_base = r.chave_base), 0)
         + CASE WHEN v_max IS NULL OR v_max <= 0 THEN 1 ELSE ((r.rk - 1) / v_max)::int + 1 END AS bloco
  FROM rank_sku r;

  SELECT COALESCE(MAX(g.sequencia), 0) INTO v_seq_base
  FROM grupo_separacao g WHERE g.movimento_saida_id = p_movimento_saida_id;

  WITH novos AS (
    INSERT INTO grupo_separacao (tenant_id, empresa_id, movimento_saida_id, armazem_id, zona_atividade_id,
                                 chave_base, bloco, sequencia, atributos, qtd_skus, created_by)
    SELECT p_tenant_id, v_empresa, p_movimento_saida_id, x.armazem_id,
           CASE WHEN 'ZONA_ATIVIDADE' = ANY (v_crit) THEN x.zona_atividade_id END,
           x.chave_base, x.bloco,
           v_seq_base + ROW_NUMBER() OVER (ORDER BY x.armazem_id NULLS LAST, x.min_ordem, x.chave_base, x.bloco),
           jsonb_strip_nulls(jsonb_build_object(
             'zona_atividade_id',  CASE WHEN 'ZONA_ATIVIDADE'     = ANY (v_crit) THEN x.zona_atividade_id END,
             'tipo_posicao',       CASE WHEN 'TIPO_POSICAO'       = ANY (v_crit) THEN x.tipo_posicao END,
             'tipo_separacao_sku', CASE WHEN 'TIPO_SEPARACAO_SKU' = ANY (v_crit) THEN x.tipo_separacao_sku END,
             'max_sku', v_max)),
           x.qtd_skus,
           public.fn_audit_usuario_atual()
    FROM (
      SELECT chave_base, bloco,
             MIN(armazem_id::text)::uuid         AS armazem_id,
             MIN(zona_atividade_id::text)::uuid  AS zona_atividade_id,
             MIN(tipo_posicao)                   AS tipo_posicao,
             MIN(tipo_separacao_sku)             AS tipo_separacao_sku,
             MIN(ordem)                          AS min_ordem,
             COUNT(DISTINCT produto_id)::int     AS qtd_skus
      FROM tmp_grupo_sep_tarefas
      GROUP BY chave_base, bloco
    ) x
    RETURNING id, chave_base, bloco
  )
  UPDATE tarefa t
     SET grupo_separacao_id = n.id
    FROM tmp_grupo_sep_tarefas tg
    JOIN novos n ON n.chave_base = tg.chave_base AND n.bloco = tg.bloco
   WHERE t.id = tg.tarefa_id;

  SELECT COUNT(DISTINCT (chave_base, bloco)) INTO v_criados FROM tmp_grupo_sep_tarefas;

  DELETE FROM grupo_separacao g
   WHERE g.movimento_saida_id = p_movimento_saida_id
     AND NOT EXISTS (SELECT 1 FROM tarefa t WHERE t.grupo_separacao_id = g.id
                     AND t.status <> 'CANCELADA'::enum_status_tarefa);

  DROP TABLE IF EXISTS tmp_grupo_sep_tarefas;
  RETURN v_criados;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_montar_grupos_separacao(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_montar_grupos_separacao(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------
-- 3. Assumir: reserva do tipo de saída decide grupo inteiro x tarefa a tarefa
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_onda_assumir(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_usuario_id uuid, p_tipo_convocacao enum_tipo_convocacao DEFAULT 'AUTO_CONVOCADO'::enum_tipo_convocacao)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v3 (2026-11-12) Fluxo de Expedição F4.1: com grupos, reserva_separacao_movimento decide:
--   TRUE  = o operador assume o próximo grupo livre inteiro (um operador por grupo)
--   FALSE = uma tarefa por vez, vários operadores no mesmo grupo, priorizando o grupo atual do operador
-- v2: grupo inteiro sempre. v1: ver _fn_onda_assumir_bkp_20261112.
DECLARE
  v_tenant uuid; v_empresa uuid; v_modo text; v_por_zona boolean; v_zona uuid;
  v_ids uuid[]; v_n integer := 0; v_codigo text; v_grupo uuid; v_tem_grupos boolean := false;
  v_qtd_grupos integer := 0; v_reserva boolean; v_grupo_atual uuid;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id, COALESCE(ts.reserva_separacao_movimento, true)
    INTO v_tenant, v_empresa, v_reserva
  FROM movimento_saida ms LEFT JOIN tipo_saida ts ON ts.id = ms.tipo_saida
  WHERE ms.id = p_movimento_saida_id;
  SELECT i.modo, i.por_zona INTO v_modo, v_por_zona
  FROM public.fn_onda_etapa_info(p_movimento_saida_id, p_tipo_tarefa_id) i;
  SELECT u.zona_atividade_separacao INTO v_zona FROM usuario u WHERE u.id = p_usuario_id;
  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt WHERE tt.id = p_tipo_tarefa_id;

  IF v_codigo = 'SEP' AND v_modo <> 'EXCLUSIVA' THEN
    PERFORM public.fn_montar_grupos_separacao(v_tenant, p_movimento_saida_id);
    SELECT COUNT(*) INTO v_qtd_grupos FROM grupo_separacao g WHERE g.movimento_saida_id = p_movimento_saida_id;
    v_tem_grupos := v_qtd_grupos > 1 OR (COALESCE(v_por_zona, false) AND v_qtd_grupos >= 1);
  END IF;

  IF v_modo = 'EXCLUSIVA' THEN
    SELECT array_agg(s.id) INTO v_ids FROM (
      SELECT t.id
      FROM tarefa t
      JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND t.tenant_id = v_tenant
        AND t.tipo_tarefa_id = p_tipo_tarefa_id
        AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
        AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
        AND NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL)
      ORDER BY t.ordem_tarefa
      FOR UPDATE OF t SKIP LOCKED) s;
  ELSE
    IF EXISTS (SELECT 1 FROM tarefa t
               JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
               JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                        AND ta.usuario_id = p_usuario_id
               WHERE msi.movimento_saida_id = p_movimento_saida_id
                 AND t.tipo_tarefa_id = p_tipo_tarefa_id
                 AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
                 AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)) THEN
      RETURN 0;
    END IF;

    IF v_tem_grupos AND v_reserva THEN
      -- um operador por grupo: próximo grupo inteiramente livre
      SELECT g.id INTO v_grupo
      FROM grupo_separacao g
      WHERE g.movimento_saida_id = p_movimento_saida_id
        AND (NOT COALESCE(v_por_zona, false) OR g.zona_atividade_id IS NULL OR g.zona_atividade_id = v_zona)
        AND EXISTS (SELECT 1 FROM tarefa t
                    WHERE t.grupo_separacao_id = g.id
                      AND t.tipo_tarefa_id = p_tipo_tarefa_id
                      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
                      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
                      AND NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL))
        AND NOT EXISTS (SELECT 1 FROM tarefa t
                        JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                        WHERE t.grupo_separacao_id = g.id
                          AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA'))
      ORDER BY g.sequencia
      FOR UPDATE OF g SKIP LOCKED
      LIMIT 1;

      IF v_grupo IS NOT NULL THEN
        SELECT array_agg(s.id) INTO v_ids FROM (
          SELECT t.id FROM tarefa t
          WHERE t.grupo_separacao_id = v_grupo
            AND t.tipo_tarefa_id = p_tipo_tarefa_id
            AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
            AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
            AND NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL)
          ORDER BY t.ordem_tarefa
          FOR UPDATE OF t SKIP LOCKED) s;
      END IF;

    ELSIF v_tem_grupos THEN
      -- grupo compartilhado: uma tarefa por vez, ficando no grupo onde o operador já trabalhou por último
      SELECT t.grupo_separacao_id INTO v_grupo_atual
      FROM tarefa_atribuicao ta
      JOIN tarefa t ON t.id = ta.tarefa_id
      JOIN grupo_separacao g ON g.id = t.grupo_separacao_id AND g.movimento_saida_id = p_movimento_saida_id
      WHERE ta.usuario_id = p_usuario_id AND t.tipo_tarefa_id = p_tipo_tarefa_id
      ORDER BY ta.atribuido_em DESC
      LIMIT 1;

      SELECT array_agg(s.id) INTO v_ids FROM (
        SELECT t.id
        FROM tarefa t
        JOIN grupo_separacao g ON g.id = t.grupo_separacao_id AND g.movimento_saida_id = p_movimento_saida_id
        WHERE t.tipo_tarefa_id = p_tipo_tarefa_id
          AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
          AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
          AND NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL)
          AND (NOT COALESCE(v_por_zona, false) OR g.zona_atividade_id IS NULL OR g.zona_atividade_id = v_zona)
        ORDER BY (g.id IS DISTINCT FROM v_grupo_atual), g.sequencia, t.ordem_tarefa
        FOR UPDATE OF t SKIP LOCKED
        LIMIT 1) s;

    ELSE
      SELECT array_agg(s.id) INTO v_ids FROM (
        SELECT t.id
        FROM tarefa t
        JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
        WHERE msi.movimento_saida_id = p_movimento_saida_id
          AND t.tenant_id = v_tenant
          AND t.tipo_tarefa_id = p_tipo_tarefa_id
          AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
          AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
          AND NOT EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL)
          AND (NOT COALESCE(v_por_zona, false) OR t.id_local_origem IS NULL OR EXISTS (
                SELECT 1 FROM endereco_zona_atividade eza
                WHERE eza.endereco_id = t.id_local_origem AND eza.tenant_id = v_tenant
                  AND eza.zona_atividade_id = v_zona))
        ORDER BY t.ordem_tarefa
        FOR UPDATE OF t SKIP LOCKED
        LIMIT 1) s;
    END IF;
  END IF;

  IF v_ids IS NULL THEN RETURN 0; END IF;

  WITH ins AS (
    INSERT INTO tarefa_atribuicao (tenant_id, empresa_id, tarefa_id, usuario_id, tipo_convocacao, status, atribuido_em, created_by)
    SELECT v_tenant, v_empresa, x.id, p_usuario_id, p_tipo_convocacao, 'ATRIBUIDA', now(), p_usuario_id
    FROM unnest(v_ids) AS x(id)
    ON CONFLICT (tarefa_id) WHERE liberado_em IS NULL DO NOTHING
    RETURNING tarefa_id
  ), upd AS (
    UPDATE tarefa t SET status = 'ATRIBUIDA'
    FROM ins WHERE t.id = ins.tarefa_id AND t.status = 'CRIADA'
    RETURNING t.id
  )
  SELECT count(*) INTO v_n FROM ins;

  RETURN v_n;
END $function$;
