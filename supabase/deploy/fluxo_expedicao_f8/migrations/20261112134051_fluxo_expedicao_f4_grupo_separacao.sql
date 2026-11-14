-- =====================================================================
-- Fluxo de Expedição — F4: grupos de separação
-- Versão 1 · 2026-11-12
-- * grupo_separacao + tarefa.grupo_separacao_id
-- * fn_montar_grupos_separacao: agrupa as tarefas SEP do movimento por
--   Armazém (sempre) + critérios do nível SEPARACAO (Zona, Tipo de Posição,
--   Tipo de Separação SKU) e rompe pelo limite MAX_SKU. Idempotente.
-- * liberar_onda_separacao chama a montagem antes do passo 9 (1 linha; backup _bkp_20261112)
-- * Convocação: onda com 2+ grupos vira COMPARTILHADA e o operador assume
--   um GRUPO inteiro por vez (_fn_onda_assumir). Zona passa a vir do roteiro novo.
-- * RPC separacao_buscar_grupos para web/coletor.
-- Reversão: 20261112_fluxo_expedicao_f4_down.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABELA grupo_separacao
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupo_separacao (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id         uuid        NOT NULL REFERENCES public.empresa(id),
  movimento_saida_id uuid        NOT NULL REFERENCES public.movimento_saida(id) ON DELETE CASCADE,
  armazem_id         uuid        REFERENCES public.armazem(id),
  zona_atividade_id  uuid        REFERENCES public.zona_atividade(id),
  chave_base         text        NOT NULL,
  bloco              integer     NOT NULL DEFAULT 1 CHECK (bloco > 0),
  sequencia          integer     NOT NULL CHECK (sequencia > 0),
  atributos          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  qtd_skus           integer     NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid        REFERENCES public.usuario(id),
  CONSTRAINT grupo_separacao_pkey PRIMARY KEY (id),
  CONSTRAINT grupo_separacao_chave_unq UNIQUE (movimento_saida_id, chave_base, bloco),
  CONSTRAINT grupo_separacao_seq_unq UNIQUE (movimento_saida_id, sequencia)
);
COMMENT ON TABLE public.grupo_separacao IS
  'Fluxo de Expedição N3: pacote de tarefas SEP que um separador assume de uma vez. Sempre dentro de um armazém.';

CREATE INDEX IF NOT EXISTS idx_grupo_separacao_tenant_empresa ON public.grupo_separacao(tenant_id, empresa_id);
CREATE INDEX IF NOT EXISTS idx_grupo_separacao_empresa ON public.grupo_separacao(empresa_id);
CREATE INDEX IF NOT EXISTS idx_grupo_separacao_armazem ON public.grupo_separacao(armazem_id);
CREATE INDEX IF NOT EXISTS idx_grupo_separacao_zona ON public.grupo_separacao(zona_atividade_id);
CREATE INDEX IF NOT EXISTS idx_grupo_separacao_created_by ON public.grupo_separacao(created_by);

ALTER TABLE public.grupo_separacao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grupo_separacao_tenant ON public.grupo_separacao;
CREATE POLICY grupo_separacao_tenant ON public.grupo_separacao
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_current_tenant()));
REVOKE ALL ON public.grupo_separacao FROM anon;
GRANT SELECT ON public.grupo_separacao TO authenticated;

DROP TRIGGER IF EXISTS trg_updated_at ON public.grupo_separacao;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.grupo_separacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tarefa ADD COLUMN IF NOT EXISTS grupo_separacao_id uuid
  REFERENCES public.grupo_separacao(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tarefa_grupo_separacao ON public.tarefa(grupo_separacao_id)
  WHERE grupo_separacao_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. MONTAGEM DOS GRUPOS (idempotente: só pega tarefas SEP ainda sem grupo)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_montar_grupos_separacao(p_tenant_id uuid, p_movimento_saida_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa  uuid;
  v_sep      uuid;
  v_crit     text[];
  v_max      integer;
  v_seq_base integer;
  v_criados  integer := 0;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT ms.empresa_id INTO v_empresa
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id;
  IF v_empresa IS NULL THEN RETURN 0; END IF;

  SELECT tt.id INTO v_sep FROM tipo_tarefa tt WHERE tt.tenant_id = p_tenant_id AND tt.codigo = 'SEP' LIMIT 1;
  IF v_sep IS NULL THEN RETURN 0; END IF;

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
           COALESCE(e.armazem_id, t.armazem_id) AS armazem_id,
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

  -- grupos que ficaram sem tarefa viva (ex.: re-liberação cancelou e recriou as tarefas)
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
-- 3. liberar_onda_separacao: backup + chamada da montagem antes do passo 9
-- ---------------------------------------------------------------------
DO $$
DECLARE v_def text; v_bkp text; v_novo text; v_n int;
BEGIN
  v_def := pg_get_functiondef('public.liberar_onda_separacao(uuid,uuid,uuid,uuid,boolean)'::regprocedure);

  IF position('fn_montar_grupos_separacao' IN v_def) > 0 THEN
    RAISE NOTICE 'liberar_onda_separacao já chama a montagem; nada a fazer.';
    RETURN;
  END IF;

  v_bkp := replace(v_def, 'FUNCTION public.liberar_onda_separacao(', 'FUNCTION public.liberar_onda_separacao_bkp_20261112(');
  EXECUTE v_bkp;
  EXECUTE 'REVOKE ALL ON FUNCTION public.liberar_onda_separacao_bkp_20261112(uuid,uuid,uuid,uuid,boolean) FROM PUBLIC, anon, authenticated';

  v_n := (length(v_def) - length(replace(v_def, '-- 9. STATUS DA ONDA', ''))) / length('-- 9. STATUS DA ONDA');
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'Marcador "-- 9. STATUS DA ONDA" encontrado % vezes em liberar_onda_separacao; esperado 1. Abortando.', v_n;
  END IF;

  v_novo := replace(v_def, '-- 9. STATUS DA ONDA',
    '-- 8b. (2026-11-12) Fluxo de Expedição F4: grupos de separação' || E'\n' ||
    '  PERFORM public.fn_montar_grupos_separacao(p_tenant_id, p_movimento_saida_id);' || E'\n\n' ||
    '  -- 9. STATUS DA ONDA');
  EXECUTE v_novo;
END $$;

-- ---------------------------------------------------------------------
-- 3b. Backup das funções que serão substituídas abaixo
-- ---------------------------------------------------------------------
DO $$
DECLARE f text; v_def text;
BEGIN
  FOREACH f IN ARRAY ARRAY['_fn_onda_etapa_calcular','_fn_onda_assumir','fn_roteiro_sync_legado','tg_tipo_saida_valida_zona'] LOOP
    IF to_regproc('public.' || f || '_bkp_20261112') IS NULL THEN
      SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f;
      v_def := replace(v_def, 'FUNCTION public.' || f || '(', 'FUNCTION public.' || f || '_bkp_20261112(');
      EXECUTE v_def;
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', f || '_bkp_20261112');
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 4. Etapa da onda: zona vem do roteiro novo (ou legado); 2+ grupos => COMPARTILHADA
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_onda_etapa_calcular(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid)
 RETURNS TABLE(modo text, ativa boolean, por_zona boolean, permite_mesmo_operador boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12) Fluxo de Expedição F4: zona lida de roteiro_saida_criterio (SEPARACAO);
--   onda com 2+ grupos de separação é COMPARTILHADA (cada operador assume um grupo).
DECLARE
  v_tenant uuid; v_empresa uuid; v_tipo_saida uuid; v_codigo text;
  v_res_sep boolean; v_res_conf boolean; v_realiza_ts boolean; v_permite boolean;
  v_zona boolean; v_realiza_docs boolean; v_grupos integer;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id, ms.tipo_saida INTO v_tenant, v_empresa, v_tipo_saida
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  IF v_tenant IS NULL THEN RETURN; END IF;

  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt
  WHERE tt.id = p_tipo_tarefa_id AND tt.tenant_id = v_tenant;

  SELECT ts.reserva_separacao_movimento, ts.reserva_conferencia_movimento,
         ts.realiza_conferencia, ts.permite_mesmo_operador_sep_conf
    INTO v_res_sep, v_res_conf, v_realiza_ts, v_permite
  FROM tipo_saida ts WHERE ts.id = v_tipo_saida;

  v_zona := EXISTS (SELECT 1 FROM roteiro_saida_criterio rc
                    WHERE rc.tenant_id = v_tenant AND rc.empresa_id = v_empresa
                      AND rc.nivel = 'SEPARACAO' AND rc.criterio = 'ZONA_ATIVIDADE')
         OR EXISTS (SELECT 1 FROM agrupamento_separacao a
                    WHERE a.tenant_id = v_tenant
                      AND (a.empresa_id IS NULL OR a.empresa_id = v_empresa)
                      AND a.tipo_agrupamento = 'ZONA_ATIVIDADE');

  IF v_codigo = 'SEP' THEN
    SELECT COUNT(*) INTO v_grupos FROM grupo_separacao g WHERE g.movimento_saida_id = p_movimento_saida_id;
    RETURN QUERY SELECT
      CASE WHEN v_zona OR v_grupos > 1 OR NOT COALESCE(v_res_sep, true) THEN 'COMPARTILHADA' ELSE 'EXCLUSIVA' END,
      true, v_zona, true;
  ELSIF v_codigo = 'SEP-CONF' THEN
    SELECT bool_or(ts.realiza_conferencia) INTO v_realiza_docs
    FROM movimento_saida_documento msd
    JOIN documento_saida ds ON ds.id = msd.documento_saida_id
    JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
    WHERE msd.movimento_saida_id = p_movimento_saida_id;
    RETURN QUERY SELECT
      CASE WHEN COALESCE(v_res_conf, true) THEN 'EXCLUSIVA' ELSE 'COMPARTILHADA' END,
      COALESCE(v_realiza_docs, v_realiza_ts, true), false, COALESCE(v_permite, true);
  ELSE
    RETURN QUERY SELECT 'EXCLUSIVA'::text, true, false, true;
  END IF;
END $function$;

-- ---------------------------------------------------------------------
-- 5. Assumir: em onda COMPARTILHADA com grupos, o operador leva um GRUPO inteiro
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_onda_assumir(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_usuario_id uuid, p_tipo_convocacao enum_tipo_convocacao DEFAULT 'AUTO_CONVOCADO'::enum_tipo_convocacao)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12) Fluxo de Expedição F4: com grupos de separação, assume o próximo grupo livre inteiro.
DECLARE
  v_tenant uuid; v_empresa uuid; v_modo text; v_por_zona boolean; v_zona uuid;
  v_ids uuid[]; v_n integer := 0; v_codigo text; v_grupo uuid; v_tem_grupos boolean := false;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id INTO v_tenant, v_empresa
  FROM movimento_saida ms WHERE ms.id = p_movimento_saida_id;
  SELECT i.modo, i.por_zona INTO v_modo, v_por_zona
  FROM public.fn_onda_etapa_info(p_movimento_saida_id, p_tipo_tarefa_id) i;
  SELECT u.zona_atividade_separacao INTO v_zona FROM usuario u WHERE u.id = p_usuario_id;
  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt WHERE tt.id = p_tipo_tarefa_id;

  IF v_codigo = 'SEP' AND v_modo <> 'EXCLUSIVA' THEN
    PERFORM public.fn_montar_grupos_separacao(v_tenant, p_movimento_saida_id);
    v_tem_grupos := (SELECT COUNT(*) > 1 FROM grupo_separacao g WHERE g.movimento_saida_id = p_movimento_saida_id);
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

    IF v_tem_grupos THEN
      -- próximo grupo inteiramente livre (ninguém com tarefa aberta nele), na ordem do roteiro
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

-- ---------------------------------------------------------------------
-- 6. RPC: grupos de uma onda (web e coletor)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.separacao_buscar_grupos(p_tenant_id uuid, p_empresa_id uuid, p_movimento_saida_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_lista jsonb;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  IF NOT EXISTS (SELECT 1 FROM movimento_saida ms
                 WHERE ms.id = p_movimento_saida_id AND ms.tenant_id = p_tenant_id AND ms.empresa_id = p_empresa_id) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ONDA_NAO_ENCONTRADA', 'mensagem', 'Onda não encontrada nesta empresa.');
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'sequencia')::int), '[]'::jsonb) INTO v_lista
  FROM (
    SELECT jsonb_build_object(
      'grupo_separacao_id', g.id,
      'sequencia', g.sequencia,
      'descricao', concat_ws(' · ',
                     COALESCE(a.descricao, 'Sem armazém'),
                     z.descricao,
                     CASE g.atributos->>'tipo_posicao' WHEN 'PICKING' THEN 'Picking' WHEN 'PULMAO' THEN 'Pulmão' END,
                     CASE g.atributos->>'tipo_separacao_sku' WHEN 'FRACIONADO' THEN 'Fracionado'
                          WHEN 'EMBALAGEM_TOTAL' THEN 'Embalagem total' WHEN 'CAIXARIA' THEN 'Caixaria' END,
                     CASE WHEN (SELECT COUNT(*) FROM grupo_separacao g2
                                WHERE g2.movimento_saida_id = g.movimento_saida_id AND g2.chave_base = g.chave_base) > 1
                          THEN 'parte ' || g.bloco END),
      'armazem_id', g.armazem_id,
      'zona_atividade_id', g.zona_atividade_id,
      'atributos', g.atributos,
      'qtd_skus', g.qtd_skus,
      'tarefas', COUNT(t.id),
      'tarefas_concluidas', COUNT(t.id) FILTER (WHERE t.status = 'CONCLUIDA'),
      'qtd_requerida', COALESCE(SUM(t.quantidade_requerida), 0),
      'qtd_separada', COALESCE(SUM(t.quantidade_executada), 0),
      'situacao', CASE
          WHEN COUNT(t.id) FILTER (WHERE t.status NOT IN ('CONCLUIDA','CANCELADA')) = 0 THEN 'CONCLUIDO'
          WHEN bool_or(ta.id IS NOT NULL) THEN 'EM_SEPARACAO'
          ELSE 'LIVRE' END,
      'operadores', COALESCE(jsonb_agg(DISTINCT u.nome) FILTER (WHERE u.nome IS NOT NULL), '[]'::jsonb)
    ) AS x
    FROM grupo_separacao g
    LEFT JOIN armazem a        ON a.id = g.armazem_id
    LEFT JOIN zona_atividade z ON z.id = g.zona_atividade_id
    LEFT JOIN tarefa t         ON t.grupo_separacao_id = g.id AND t.status <> 'CANCELADA'
    LEFT JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                  AND t.status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO','PAUSADA')
    LEFT JOIN usuario u        ON u.id = ta.usuario_id
    WHERE g.movimento_saida_id = p_movimento_saida_id AND g.tenant_id = p_tenant_id
    GROUP BY g.id, a.descricao, z.descricao
  ) s;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK',
    'mensagem', jsonb_array_length(v_lista) || ' grupo(s) de separação.',
    'dados', jsonb_build_object('grupos', v_lista));
END;
$$;
REVOKE ALL ON FUNCTION public.separacao_buscar_grupos(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.separacao_buscar_grupos(uuid, uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Zona: tela antiga espelha em SEPARACAO; tipo de saída checa o roteiro novo
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_roteiro_sync_legado(p_tenant_id uuid, p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
-- v2 (2026-11-12): espelha também ZONA_ATIVIDADE -> SEPARACAO
DECLARE v_zona_legado boolean; v_zona_novo boolean;
BEGIN
  IF p_tenant_id IS NULL OR p_empresa_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM roteiro_saida_criterio
   WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
     AND nivel IN ('MOVIMENTO','CONFERENCIA');

  INSERT INTO roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
  SELECT p_tenant_id, p_empresa_id, 'MOVIMENTO', x.criterio,
         ROW_NUMBER() OVER (ORDER BY x.seq)
  FROM (
    SELECT a.tipo_agrupamento::text::public.enum_criterio_roteiro_saida AS criterio,
           MIN(COALESCE(a.sequencia, 999)) AS seq
    FROM agrupamento_separacao a
    WHERE a.tenant_id = p_tenant_id AND a.empresa_id = p_empresa_id
      AND a.tipo_agrupamento::text IN ('DOCUMENTO','PARCEIRO','ROTA')
    GROUP BY 1
  ) x;

  INSERT INTO roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
  SELECT p_tenant_id, p_empresa_id, 'CONFERENCIA', 'HU_VOLUME', 1
  WHERE EXISTS (SELECT 1 FROM agrupamento_conferencia c
                WHERE c.tenant_id = p_tenant_id AND c.empresa_id = p_empresa_id
                  AND c.tipo_agrupamento::text = 'HU');

  v_zona_legado := EXISTS (SELECT 1 FROM agrupamento_separacao a
                           WHERE a.tenant_id = p_tenant_id AND a.empresa_id = p_empresa_id
                             AND a.tipo_agrupamento::text = 'ZONA_ATIVIDADE');
  v_zona_novo := EXISTS (SELECT 1 FROM roteiro_saida_criterio rc
                         WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = p_empresa_id
                           AND rc.nivel = 'SEPARACAO' AND rc.criterio = 'ZONA_ATIVIDADE');
  IF v_zona_legado AND NOT v_zona_novo THEN
    INSERT INTO roteiro_saida_criterio (tenant_id, empresa_id, nivel, criterio, sequencia)
    SELECT p_tenant_id, p_empresa_id, 'SEPARACAO', 'ZONA_ATIVIDADE', COALESCE(MAX(sequencia), 0) + 1
    FROM roteiro_saida_criterio
    WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id AND nivel = 'SEPARACAO';
  ELSIF v_zona_novo AND NOT v_zona_legado THEN
    DELETE FROM roteiro_saida_criterio
     WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id
       AND nivel = 'SEPARACAO' AND criterio = 'ZONA_ATIVIDADE';
    UPDATE roteiro_saida_criterio rc SET sequencia = x.nova
      FROM (SELECT id, ROW_NUMBER() OVER (ORDER BY sequencia) AS nova FROM roteiro_saida_criterio
            WHERE tenant_id = p_tenant_id AND empresa_id = p_empresa_id AND nivel = 'SEPARACAO') x
     WHERE rc.id = x.id AND rc.sequencia <> x.nova;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_roteiro_sync_legado(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_tipo_saida_valida_zona()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12): considera também o roteiro novo (roteiro_saida_criterio)
BEGIN
  IF COALESCE(NEW.reserva_separacao_movimento, true) AND COALESCE(NEW.ativo, true)
     AND (EXISTS (SELECT 1 FROM agrupamento_separacao a
                  WHERE a.tenant_id = NEW.tenant_id
                    AND (NEW.empresa_id IS NULL OR a.empresa_id IS NULL OR a.empresa_id = NEW.empresa_id)
                    AND a.tipo_agrupamento = 'ZONA_ATIVIDADE')
       OR EXISTS (SELECT 1 FROM roteiro_saida_criterio rc
                  WHERE rc.tenant_id = NEW.tenant_id
                    AND (NEW.empresa_id IS NULL OR rc.empresa_id = NEW.empresa_id)
                    AND rc.nivel = 'SEPARACAO' AND rc.criterio = 'ZONA_ATIVIDADE')) THEN
    RAISE EXCEPTION 'ROTEIRO_ZONA_EXIGE_SEM_RESERVA: O roteiro de separação desta empresa usa zona de atividade. Desmarque "Reserva todo o movimento na separação" neste tipo de saída.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;
