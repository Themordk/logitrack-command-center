-- =====================================================================
-- Fluxo de Expedição — F5: unidade de conferência · v1 · 2026-11-12
-- * grupo_conferencia + tarefa.grupo_conferencia_id
-- * fn_gerar_conferencia_saida v5: com critério no nível CONFERENCIA
--   (GRUPO_SEPARACAO e/ou HU_VOLUME) a tarefa SEP-CONF do item é dividida
--   por unidade (quantidade separada naquele grupo/HU). Sem critério: igual à v4.
-- * Convocação: reserva_conferencia_movimento vale por unidade
--   (TRUE = 1 conferente por unidade; FALSE = tarefa a tarefa).
-- * Quantidade do item reparte entre as partes (fn_conf_distribuir) na
--   alteração de saída e na remoção de pedido da onda.
-- * RPC conferencia_buscar_unidades.
-- Reversão: 20261112_fluxo_expedicao_f5_down.sql
-- =====================================================================

-- 0. Backups
DO $$
DECLARE f text; v_def text;
BEGIN
  FOREACH f IN ARRAY ARRAY['fn_gerar_conferencia_saida','fn_conferencia_validar_onda','_fn_alteracao_saida_sync_conf','_fn_remocao_doc_saida_core'] LOOP
    IF to_regproc('public.' || f || '_bkp_20261112') IS NULL THEN
      SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = f;
      v_def := replace(v_def, 'FUNCTION public.' || f || '(', 'FUNCTION public.' || f || '_bkp_20261112(');
      EXECUTE v_def;
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', f || '_bkp_20261112');
    END IF;
  END LOOP;
  -- _fn_onda_assumir já tem backup pré-F4 (_bkp_20261112); guarda a versão F4.1 também
  IF to_regproc('public._fn_onda_assumir_bkp_f41') IS NULL THEN
    v_def := pg_get_functiondef('public._fn_onda_assumir(uuid,uuid,uuid,enum_tipo_convocacao)'::regprocedure);
    v_def := replace(v_def, 'FUNCTION public._fn_onda_assumir(', 'FUNCTION public._fn_onda_assumir_bkp_f41(');
    EXECUTE v_def;
    EXECUTE 'REVOKE ALL ON FUNCTION public._fn_onda_assumir_bkp_f41(uuid,uuid,uuid,enum_tipo_convocacao) FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 1. TABELA grupo_conferencia
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupo_conferencia (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES public.tenant(id),
  empresa_id         uuid        NOT NULL REFERENCES public.empresa(id),
  movimento_saida_id uuid        NOT NULL REFERENCES public.movimento_saida(id) ON DELETE CASCADE,
  chave              text        NOT NULL,
  criterios          text[]      NOT NULL DEFAULT '{}',
  grupo_separacao_id uuid        REFERENCES public.grupo_separacao(id) ON DELETE SET NULL,
  hu_id              uuid        REFERENCES public.hu(id),
  sequencia          integer     NOT NULL CHECK (sequencia > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid        REFERENCES public.usuario(id),
  CONSTRAINT grupo_conferencia_pkey PRIMARY KEY (id),
  CONSTRAINT grupo_conferencia_chave_unq UNIQUE (movimento_saida_id, chave),
  CONSTRAINT grupo_conferencia_seq_unq UNIQUE (movimento_saida_id, sequencia)
);
COMMENT ON TABLE public.grupo_conferencia IS
  'Fluxo de Expedição N4: unidade de conferência (grupo de separação e/ou HU) dentro da onda.';

CREATE INDEX IF NOT EXISTS idx_grupo_conferencia_tenant_empresa ON public.grupo_conferencia(tenant_id, empresa_id);
CREATE INDEX IF NOT EXISTS idx_grupo_conferencia_empresa ON public.grupo_conferencia(empresa_id);
CREATE INDEX IF NOT EXISTS idx_grupo_conferencia_grupo_sep ON public.grupo_conferencia(grupo_separacao_id);
CREATE INDEX IF NOT EXISTS idx_grupo_conferencia_hu ON public.grupo_conferencia(hu_id);
CREATE INDEX IF NOT EXISTS idx_grupo_conferencia_created_by ON public.grupo_conferencia(created_by);

ALTER TABLE public.grupo_conferencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grupo_conferencia_tenant ON public.grupo_conferencia;
CREATE POLICY grupo_conferencia_tenant ON public.grupo_conferencia
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.get_current_tenant()));
REVOKE ALL ON public.grupo_conferencia FROM anon;
GRANT SELECT ON public.grupo_conferencia TO authenticated;

DROP TRIGGER IF EXISTS trg_updated_at ON public.grupo_conferencia;
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON public.grupo_conferencia
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.tarefa ADD COLUMN IF NOT EXISTS grupo_conferencia_id uuid
  REFERENCES public.grupo_conferencia(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tarefa_grupo_conferencia ON public.tarefa(grupo_conferencia_id)
  WHERE grupo_conferencia_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 2. Repartir a quantidade do item entre as partes da conferência
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conf_distribuir(p_tenant_id uuid, p_msi_id uuid, p_total numeric,
                                                     p_exigir_sem_execucao boolean DEFAULT false)
RETURNS TABLE(tarefa_id uuid, status text, qtd_atual numeric, qtd_nova numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
-- Com 1 tarefa elegível: qtd_nova = total disponível (igual ao comportamento anterior).
-- Com N: proporcional à quantidade atual de cada parte, sobra pelo maior resto;
-- em unidades inteiras quando todas as quantidades são inteiras.
DECLARE
  v_conf uuid; v_fixo numeric; v_disp numeric; v_soma numeric; v_unid numeric; v_n int;
BEGIN
  SELECT id INTO v_conf FROM tipo_tarefa WHERE tenant_id = p_tenant_id AND codigo = 'SEP-CONF' LIMIT 1;
  IF v_conf IS NULL THEN RETURN; END IF;

  -- partes que não podem mudar (já em andamento/concluídas) continuam com o que têm
  SELECT COALESCE(SUM(t.quantidade_requerida), 0) INTO v_fixo
  FROM tarefa t
  WHERE t.tenant_id = p_tenant_id AND t.id_documento_origem = p_msi_id AND t.tipo_tarefa_id = v_conf
    AND t.status <> 'CANCELADA'
    AND NOT (t.status IN ('CRIADA','ATRIBUIDA') AND (NOT p_exigir_sem_execucao OR COALESCE(t.quantidade_executada,0) = 0));

  SELECT COUNT(*), COALESCE(SUM(t.quantidade_requerida), 0) INTO v_n, v_soma
  FROM tarefa t
  WHERE t.tenant_id = p_tenant_id AND t.id_documento_origem = p_msi_id AND t.tipo_tarefa_id = v_conf
    AND t.status IN ('CRIADA','ATRIBUIDA')
    AND (NOT p_exigir_sem_execucao OR COALESCE(t.quantidade_executada,0) = 0);
  IF v_n = 0 THEN RETURN; END IF;

  v_disp := CASE WHEN v_n = 1 THEN GREATEST(p_total, 0) ELSE GREATEST(p_total - v_fixo, 0) END;
  v_unid := CASE WHEN v_disp = trunc(v_disp) AND NOT EXISTS (
                  SELECT 1 FROM tarefa t WHERE t.tenant_id = p_tenant_id AND t.id_documento_origem = p_msi_id
                    AND t.tipo_tarefa_id = v_conf AND t.status IN ('CRIADA','ATRIBUIDA')
                    AND t.quantidade_requerida <> trunc(t.quantidade_requerida))
                 THEN 1 ELSE 0.0001 END;

  RETURN QUERY
  WITH el AS (
    SELECT t.id, t.status::text AS st, t.quantidade_requerida AS q,
           CASE WHEN v_soma > 0 THEN v_disp * t.quantidade_requerida / v_soma ELSE 0 END AS bruto
    FROM tarefa t
    WHERE t.tenant_id = p_tenant_id AND t.id_documento_origem = p_msi_id AND t.tipo_tarefa_id = v_conf
      AND t.status IN ('CRIADA','ATRIBUIDA')
      AND (NOT p_exigir_sem_execucao OR COALESCE(t.quantidade_executada,0) = 0)
  ), base AS (
    SELECT el.*, floor(el.bruto / v_unid) * v_unid AS piso,
           (el.bruto / v_unid) - floor(el.bruto / v_unid) AS resto
    FROM el
  ), sobra AS (
    SELECT round((v_disp - SUM(piso)) / v_unid)::int AS n FROM base
  ), ord AS (
    SELECT b.*, ROW_NUMBER() OVER (ORDER BY b.resto DESC, b.q DESC, b.id) AS rk FROM base b
  )
  SELECT o.id, o.st, o.q,
         CASE WHEN v_n = 1 THEN v_disp
              WHEN v_soma = 0 THEN CASE WHEN o.rk = 1 THEN v_disp ELSE 0 END
              ELSE o.piso + CASE WHEN o.rk <= (SELECT n FROM sobra) THEN v_unid ELSE 0 END END
  FROM ord o;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_conf_distribuir(uuid, uuid, numeric, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._fn_alteracao_saida_sync_conf(p_tenant_id uuid, p_msi_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12) Fluxo de Expedição F5: reparte entre as partes da conferência do item.
DECLARE v_nova numeric; r record;
BEGIN
  SELECT GREATEST(COALESCE(msi.qtd_esperada,0) - COALESCE(msi.qtde_cortada,0), 0) INTO v_nova
    FROM movimento_saida_item msi WHERE msi.id = p_msi_id AND msi.tenant_id = p_tenant_id;
  IF v_nova IS NULL THEN RETURN; END IF;

  FOR r IN SELECT * FROM public.fn_conf_distribuir(p_tenant_id, p_msi_id, v_nova, true) LOOP
    UPDATE tarefa SET status = CASE WHEN r.qtd_nova = 0 THEN 'CANCELADA'::enum_status_tarefa ELSE status END,
                      quantidade_requerida = CASE WHEN r.qtd_nova = 0 THEN quantidade_requerida ELSE r.qtd_nova END
     WHERE id = r.tarefa_id AND tenant_id = p_tenant_id
       AND status IN ('CRIADA','ATRIBUIDA') AND COALESCE(quantidade_executada,0) = 0;
  END LOOP;
END;
$function$;

-- Remoção de pedido da onda: a prévia passa a calcular a quantidade de CADA parte
DO $$
DECLARE v_def text; v_novo text; v_a int; v_b int;
  pa text := 'SELECT tx\.id, tx\.status::text AS status, tx\.quantidade_requerida FROM tarefa tx\s+WHERE tx\.id_documento_origem = r\.msi_id AND tx\.tenant_id = p_tenant_id\s+AND tx\.tipo_tarefa_id = v_tipo_conf AND tx\.status IN \(''CRIADA'',''ATRIBUIDA''\)\s+ORDER BY tx\.id';
  pb text := '''qtd_nova'', v_conf_qtd,\s+''acao'', CASE WHEN v_conf_qtd = 0 THEN ''CANCELAR'' WHEN v_conf_qtd = t\.quantidade_requerida THEN ''MANTER'' ELSE ''REDUZIR'' END\)';
BEGIN
  v_def := pg_get_functiondef('public._fn_remocao_doc_saida_core'::regproc);
  IF position('fn_conf_distribuir' IN v_def) > 0 THEN RETURN; END IF;
  SELECT count(*) INTO v_a FROM regexp_matches(v_def, pa, 'g');
  SELECT count(*) INTO v_b FROM regexp_matches(v_def, pb, 'g');
  IF v_a <> 1 OR v_b <> 1 THEN
    RAISE EXCEPTION '_fn_remocao_doc_saida_core: trechos esperados não encontrados (A=%, B=%). Abortando.', v_a, v_b;
  END IF;
  v_novo := regexp_replace(v_def, pa,
    'SELECT d.tarefa_id AS id, d.status, d.qtd_atual AS quantidade_requerida, d.qtd_nova FROM public.fn_conf_distribuir(p_tenant_id, r.msi_id, v_conf_qtd) d /* F5 2026-11-12 */');
  v_novo := regexp_replace(v_novo, pb,
    '''qtd_nova'', t.qtd_nova, ''acao'', CASE WHEN t.qtd_nova = 0 THEN ''CANCELAR'' WHEN t.qtd_nova = t.quantidade_requerida THEN ''MANTER'' ELSE ''REDUZIR'' END)');
  EXECUTE v_novo;
END $$;

-- ---------------------------------------------------------------------
-- 3. Geração da conferência por unidade
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gerar_conferencia_saida(p_movimento_saida_id uuid, p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v5 (2026-11-12) Fluxo de Expedição F5: com critério no nível CONFERENCIA, divide a SEP-CONF do item
--   por unidade (grupo de separação e/ou HU). Sem critério: idêntica à v4.
-- v4 (2026-11-11): R10 — etapa de conferência inativa conclui a onda; aplica a convocação do gestor.
DECLARE
  v_tipo_tarefa_id uuid;
  v_empresa_id uuid;
  v_status text;
  v_total_criadas integer;
  v_ativa boolean;
  v_aplicacao jsonb;
  v_crit text[];
  v_seq_base integer;
  v_unidades integer;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT empresa_id, ms.status
    INTO v_empresa_id, v_status
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'NAO_ENCONTRADO',
      'mensagem', 'Movimento de saída não encontrado.');
  END IF;

  IF v_status NOT IN ('SEPARADO', 'EM_CONFERENCIA') THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'IGNORADO',
      'mensagem', format('Status %s não requer geração de conferência.', v_status));
  END IF;

  SELECT id INTO v_tipo_tarefa_id
  FROM tipo_tarefa
  WHERE codigo = 'SEP-CONF' AND tenant_id = p_tenant_id;

  IF v_tipo_tarefa_id IS NULL THEN
    RAISE EXCEPTION 'Tipo tarefa SEP-CONF não encontrado para o tenant.';
  END IF;

  PERFORM public.fn_onda_snapshot_etapas(p_movimento_saida_id);
  SELECT i.ativa INTO v_ativa FROM public.fn_onda_etapa_info(p_movimento_saida_id, v_tipo_tarefa_id) i;

  IF NOT COALESCE(v_ativa, true) THEN
    IF NOT EXISTS (SELECT 1 FROM tarefa tc JOIN movimento_saida_item mi ON mi.id = tc.id_documento_origem
                   WHERE mi.movimento_saida_id = p_movimento_saida_id AND tc.tenant_id = p_tenant_id
                     AND tc.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)) THEN
      UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
       WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';
      RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONCLUIDA_SEM_CONFERENCIA',
        'mensagem', 'Tipo de saída sem conferência: onda concluída ao fim da separação.');
    END IF;
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'SEM_CONFERENCIA_PENDENCIAS',
      'mensagem', 'Tipo de saída sem conferência, mas a onda ainda tem tarefas abertas.');
  END IF;

  SELECT array_agg(rc.criterio::text ORDER BY rc.sequencia) INTO v_crit
  FROM roteiro_saida_criterio rc
  WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = v_empresa_id AND rc.nivel = 'CONFERENCIA';
  v_crit := COALESCE(v_crit, ARRAY[]::text[]);

  IF cardinality(v_crit) = 0 THEN
    -- v4: uma SEP-CONF por item
    WITH inserted AS (
      INSERT INTO tarefa (
        id, tenant_id, empresa_id, tipo_tarefa_id,
        id_documento_origem, tipo_documento_origem,
        produto_id, quantidade_requerida, armazem_id,
        status, criado_em
      )
      SELECT
        gen_random_uuid(), msi.tenant_id, v_empresa_id, v_tipo_tarefa_id,
        msi.id, 'MOVIMENTO_SAIDA_ITEM', msi.produto_id,
        SUM(t.quantidade_executada),
        (SELECT e.armazem_id FROM endereco e
         WHERE e.id = (array_agg(t.id_local_origem) FILTER (WHERE t.id_local_origem IS NOT NULL))[1]),
        'CRIADA', now()
      FROM movimento_saida_item msi
      JOIN tarefa t ON msi.id = t.id_documento_origem
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND msi.tenant_id = p_tenant_id
        AND msi.status <> 'CANCELADO'::enum_status_item_onda
        AND COALESCE(t.quantidade_executada, 0) > 0
        AND t.tipo_tarefa_id <> v_tipo_tarefa_id
        AND t.status <> 'CANCELADA'::enum_status_tarefa
        AND NOT EXISTS (
          SELECT 1 FROM tarefa tc
          WHERE tc.id_documento_origem = msi.id AND tc.tenant_id = p_tenant_id
            AND tc.tipo_tarefa_id = v_tipo_tarefa_id AND tc.status <> 'CANCELADA'::enum_status_tarefa)
      GROUP BY msi.id, msi.tenant_id, msi.produto_id
      RETURNING id
    )
    SELECT COUNT(*) INTO v_total_criadas FROM inserted;
  ELSE
    -- v5: uma SEP-CONF por item E unidade (grupo de separação e/ou HU)
    DROP TABLE IF EXISTS tmp_conf_base;
    CREATE TEMP TABLE tmp_conf_base ON COMMIT DROP AS
    WITH origem AS (
      SELECT msi.id AS msi_id, msi.produto_id, t.id AS tarefa_id, t.grupo_separacao_id, t.id_local_origem,
             x.hu, x.qtd
      FROM movimento_saida_item msi
      JOIN tarefa t ON t.id_documento_origem = msi.id
      CROSS JOIN LATERAL (
        -- por HU: soma das execuções por HU; sem HU no critério: quantidade da tarefa
        SELECT te.hu, SUM(te.quantidade_executada) AS qtd
        FROM tarefa_execucao te
        WHERE 'HU_VOLUME' = ANY (v_crit) AND te.tarefa_id = t.id
          AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
        GROUP BY te.hu
        UNION ALL
        SELECT NULL::uuid, t.quantidade_executada
        WHERE NOT ('HU_VOLUME' = ANY (v_crit))
      ) x
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND msi.tenant_id = p_tenant_id
        AND msi.status <> 'CANCELADO'::enum_status_item_onda
        AND COALESCE(t.quantidade_executada, 0) > 0
        AND t.tipo_tarefa_id <> v_tipo_tarefa_id
        AND t.status <> 'CANCELADA'::enum_status_tarefa
        AND NOT EXISTS (
          SELECT 1 FROM tarefa tc
          WHERE tc.id_documento_origem = msi.id AND tc.tenant_id = p_tenant_id
            AND tc.tipo_tarefa_id = v_tipo_tarefa_id AND tc.status <> 'CANCELADA'::enum_status_tarefa)
    )
    SELECT o.*,
           (SELECT string_agg(CASE c.crit
                     WHEN 'GRUPO_SEPARACAO' THEN 'G:' || COALESCE(o.grupo_separacao_id::text, 'SEM_GRUPO')
                     WHEN 'HU_VOLUME'       THEN 'H:' || COALESCE(o.hu::text, 'SEM_HU')
                   END, '|' ORDER BY c.ord)
            FROM unnest(v_crit) WITH ORDINALITY AS c(crit, ord)) AS chave
    FROM origem o
    WHERE COALESCE(o.qtd, 0) > 0;

    SELECT COALESCE(MAX(gc.sequencia), 0) INTO v_seq_base
    FROM grupo_conferencia gc WHERE gc.movimento_saida_id = p_movimento_saida_id;

    INSERT INTO grupo_conferencia (tenant_id, empresa_id, movimento_saida_id, chave, criterios,
                                   grupo_separacao_id, hu_id, sequencia, created_by)
    SELECT p_tenant_id, v_empresa_id, p_movimento_saida_id, u.chave, v_crit,
           CASE WHEN 'GRUPO_SEPARACAO' = ANY (v_crit) THEN u.grupo_separacao_id END,
           CASE WHEN 'HU_VOLUME' = ANY (v_crit) THEN u.hu END,
           v_seq_base + ROW_NUMBER() OVER (ORDER BY u.seq_grupo NULLS LAST, u.hu NULLS LAST, u.chave),
           public.fn_audit_usuario_atual()
    FROM (
      SELECT b.chave, MIN(b.grupo_separacao_id::text)::uuid AS grupo_separacao_id, MIN(b.hu::text)::uuid AS hu,
             MIN(gs.sequencia) AS seq_grupo
      FROM tmp_conf_base b LEFT JOIN grupo_separacao gs ON gs.id = b.grupo_separacao_id
      GROUP BY b.chave
    ) u
    WHERE NOT EXISTS (SELECT 1 FROM grupo_conferencia gc
                      WHERE gc.movimento_saida_id = p_movimento_saida_id AND gc.chave = u.chave);

    WITH inserted AS (
      INSERT INTO tarefa (
        id, tenant_id, empresa_id, tipo_tarefa_id,
        id_documento_origem, tipo_documento_origem,
        produto_id, quantidade_requerida, armazem_id,
        status, criado_em, grupo_conferencia_id
      )
      SELECT gen_random_uuid(), p_tenant_id, v_empresa_id, v_tipo_tarefa_id,
             b.msi_id, 'MOVIMENTO_SAIDA_ITEM', b.produto_id,
             SUM(b.qtd),
             (SELECT e.armazem_id FROM endereco e
              WHERE e.id = (array_agg(b.id_local_origem) FILTER (WHERE b.id_local_origem IS NOT NULL))[1]),
             'CRIADA', now(), gc.id
      FROM tmp_conf_base b
      JOIN grupo_conferencia gc ON gc.movimento_saida_id = p_movimento_saida_id AND gc.chave = b.chave
      GROUP BY b.msi_id, b.produto_id, gc.id
      RETURNING id
    )
    SELECT COUNT(*) INTO v_total_criadas FROM inserted;

    DROP TABLE IF EXISTS tmp_conf_base;

    -- com 2+ unidades a etapa de conferência passa a ser distribuída por unidade
    SELECT COUNT(*) INTO v_unidades FROM grupo_conferencia gc WHERE gc.movimento_saida_id = p_movimento_saida_id;
    IF v_unidades > 1 THEN
      UPDATE movimento_saida_etapa SET modo = 'COMPARTILHADA'
       WHERE movimento_saida_id = p_movimento_saida_id AND tipo_tarefa_id = v_tipo_tarefa_id AND modo <> 'COMPARTILHADA';
    END IF;
  END IF;

  IF v_total_criadas = 0 THEN
    IF EXISTS (SELECT 1 FROM movimento_saida_item mi
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND mi.tenant_id = p_tenant_id)
       AND NOT EXISTS (SELECT 1 FROM movimento_saida_item mi
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND mi.tenant_id = p_tenant_id
                  AND mi.status NOT IN ('CORTE_TOTAL'::enum_status_item_onda, 'CANCELADO'::enum_status_item_onda))
       AND NOT EXISTS (SELECT 1 FROM tarefa tc JOIN movimento_saida_item mi ON mi.id = tc.id_documento_origem
                WHERE mi.movimento_saida_id = p_movimento_saida_id AND tc.tenant_id = p_tenant_id
                  AND (tc.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)
                       OR (tc.status <> 'CANCELADA'::enum_status_tarefa AND COALESCE(tc.quantidade_executada, 0) > 0)))
    THEN
      UPDATE movimento_saida SET status = 'CONCLUIDA', finalizado_em = now()
       WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id AND status <> 'CONCLUIDA';
      RETURN jsonb_build_object('sucesso', true, 'codigo', 'CONCLUIDA_CORTE_TOTAL',
        'mensagem', 'Todos os itens foram cortados; movimento concluído sem conferência.');
    END IF;
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'JA_EXISTE',
      'mensagem', 'Tarefas de conferência já existem para este movimento.');
  END IF;

  v_aplicacao := public.fn_onda_aplicar_responsaveis(p_movimento_saida_id, v_tipo_tarefa_id);

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'CONFERENCIA_GERADA',
    'mensagem', v_total_criadas || ' tarefa(s) de conferência gerada(s).',
    'dados', jsonb_build_object(
      'movimento_saida_id', p_movimento_saida_id,
      'total_tarefas_criadas', v_total_criadas,
      'unidades_conferencia', (SELECT COUNT(*) FROM grupo_conferencia gc WHERE gc.movimento_saida_id = p_movimento_saida_id),
      'convocacao', v_aplicacao));
END;
$function$;

-- ---------------------------------------------------------------------
-- 4. Assumir: unidades valem para separação (grupo_separacao) e conferência (grupo_conferencia)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_onda_assumir(p_movimento_saida_id uuid, p_tipo_tarefa_id uuid, p_usuario_id uuid, p_tipo_convocacao enum_tipo_convocacao DEFAULT 'AUTO_CONVOCADO'::enum_tipo_convocacao)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v4 (2026-11-12) Fluxo de Expedição F5: a mesma regra de unidade vale para a conferência.
--   SEP      -> unidade = grupo_separacao,  reserva = tipo_saida.reserva_separacao_movimento
--   SEP-CONF -> unidade = grupo_conferencia, reserva = tipo_saida.reserva_conferencia_movimento
--   Com 2+ unidades: reserva TRUE = unidade inteira por operador; FALSE = tarefa a tarefa, ficando na unidade atual.
-- v3: só separação. v2: grupo sempre inteiro. v1: _fn_onda_assumir_bkp_20261112.
DECLARE
  v_tenant uuid; v_empresa uuid; v_modo text; v_por_zona boolean; v_zona uuid;
  v_ids uuid[]; v_n integer := 0; v_codigo text; v_unidade uuid; v_tem_unid boolean := false;
  v_qtd_unid integer := 0; v_reserva boolean; v_unid_atual uuid; v_res_sep boolean; v_res_conf boolean;
BEGIN
  SELECT ms.tenant_id, ms.empresa_id, COALESCE(ts.reserva_separacao_movimento, true), COALESCE(ts.reserva_conferencia_movimento, true)
    INTO v_tenant, v_empresa, v_res_sep, v_res_conf
  FROM movimento_saida ms LEFT JOIN tipo_saida ts ON ts.id = ms.tipo_saida
  WHERE ms.id = p_movimento_saida_id;
  SELECT i.modo, i.por_zona INTO v_modo, v_por_zona
  FROM public.fn_onda_etapa_info(p_movimento_saida_id, p_tipo_tarefa_id) i;
  SELECT u.zona_atividade_separacao INTO v_zona FROM usuario u WHERE u.id = p_usuario_id;
  SELECT tt.codigo INTO v_codigo FROM tipo_tarefa tt WHERE tt.id = p_tipo_tarefa_id;

  IF v_codigo = 'SEP' AND v_modo <> 'EXCLUSIVA' THEN
    PERFORM public.fn_montar_grupos_separacao(v_tenant, p_movimento_saida_id);
    SELECT COUNT(*) INTO v_qtd_unid FROM grupo_separacao g WHERE g.movimento_saida_id = p_movimento_saida_id;
    v_tem_unid := v_qtd_unid > 1 OR (COALESCE(v_por_zona, false) AND v_qtd_unid >= 1);
    v_reserva := v_res_sep;
  ELSIF v_codigo = 'SEP-CONF' AND v_modo <> 'EXCLUSIVA' THEN
    SELECT COUNT(*) INTO v_qtd_unid FROM grupo_conferencia g WHERE g.movimento_saida_id = p_movimento_saida_id;
    v_tem_unid := v_qtd_unid > 1;
    v_reserva := v_res_conf;
    v_por_zona := false;
  END IF;

  IF v_tem_unid THEN
    -- distribuição de unidades em fila por onda/etapa (também fora do caminho que trava a onda)
    PERFORM pg_advisory_xact_lock(hashtextextended('assumir:' || p_movimento_saida_id::text || ':' || p_tipo_tarefa_id::text, 0));
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

    IF v_tem_unid THEN
      DROP TABLE IF EXISTS tmp_assumir_unid;
      CREATE TEMP TABLE tmp_assumir_unid ON COMMIT DROP AS
      SELECT t.id AS tarefa_id, t.ordem_tarefa, t.status::text AS status,
             t.quantidade_requerida > COALESCE(t.quantidade_executada, 0) AS pendente,
             EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.liberado_em IS NULL) AS ocupada,
             u.id AS unidade_id, u.sequencia, u.zona_atividade_id
      FROM tarefa t
      JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem AND msi.movimento_saida_id = p_movimento_saida_id
      JOIN LATERAL (
        SELECT g.id, g.sequencia, g.zona_atividade_id FROM grupo_separacao g
        WHERE v_codigo = 'SEP' AND g.id = t.grupo_separacao_id
        UNION ALL
        SELECT c.id, c.sequencia, NULL::uuid FROM grupo_conferencia c
        WHERE v_codigo = 'SEP-CONF' AND c.id = t.grupo_conferencia_id
      ) u ON true
      WHERE t.tipo_tarefa_id = p_tipo_tarefa_id
        AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO', 'PAUSADA')
        AND (NOT COALESCE(v_por_zona, false) OR u.zona_atividade_id IS NULL OR u.zona_atividade_id = v_zona);

      IF v_reserva THEN
        -- unidade inteira, só se ninguém estiver nela
        SELECT x.unidade_id INTO v_unidade
        FROM tmp_assumir_unid x
        GROUP BY x.unidade_id, x.sequencia
        HAVING bool_or(x.pendente AND NOT x.ocupada) AND NOT bool_or(x.ocupada)
        ORDER BY x.sequencia
        LIMIT 1;

        IF v_unidade IS NOT NULL THEN
          SELECT array_agg(s.id) INTO v_ids FROM (
            SELECT t.id FROM tarefa t JOIN tmp_assumir_unid x ON x.tarefa_id = t.id
            WHERE x.unidade_id = v_unidade AND x.pendente AND NOT x.ocupada
            ORDER BY t.ordem_tarefa
            FOR UPDATE OF t SKIP LOCKED) s;
        END IF;
      ELSE
        -- tarefa a tarefa, ficando na unidade em que o operador trabalhou por último
        SELECT x.unidade_id INTO v_unid_atual
        FROM tarefa_atribuicao ta JOIN tmp_assumir_unid x ON x.tarefa_id = ta.tarefa_id
        WHERE ta.usuario_id = p_usuario_id
        ORDER BY ta.atribuido_em DESC LIMIT 1;
        IF v_unid_atual IS NULL THEN
          SELECT x.unidade_id INTO v_unid_atual
          FROM tarefa_atribuicao ta
          JOIN tarefa t ON t.id = ta.tarefa_id
          JOIN tmp_assumir_unid x ON x.unidade_id = CASE WHEN v_codigo = 'SEP-CONF' THEN t.grupo_conferencia_id ELSE t.grupo_separacao_id END
          WHERE ta.usuario_id = p_usuario_id AND t.tipo_tarefa_id = p_tipo_tarefa_id
          ORDER BY ta.atribuido_em DESC LIMIT 1;
        END IF;

        SELECT array_agg(s.id) INTO v_ids FROM (
          SELECT t.id FROM tarefa t JOIN tmp_assumir_unid x ON x.tarefa_id = t.id
          WHERE x.pendente AND NOT x.ocupada
          ORDER BY (x.unidade_id IS DISTINCT FROM v_unid_atual), x.sequencia, t.ordem_tarefa
          FOR UPDATE OF t SKIP LOCKED
          LIMIT 1) s;
      END IF;
      DROP TABLE IF EXISTS tmp_assumir_unid;

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
-- 5. Validação da onda de conferência: reserva por unidade
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_conferencia_validar_onda(p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- v2 (2026-11-12) Fluxo de Expedição F5: com 2+ unidades de conferência a reserva vale por unidade
--   (não bloqueia a onda inteira); devolve unidade_conferencia real.
DECLARE
  v_ms            record;
  v_realiza       boolean;
  v_reserva_mov   boolean;
  v_zona_usuario  uuid;
  v_outro_nome    text;
  v_docs_sem_nf   integer;
  v_agrupamento   text[];
  v_unidades      integer;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id);

  SELECT ms.id, ms.numero_onda, ms.status::text AS status, ms.tipo_saida
    INTO v_ms
  FROM movimento_saida ms
  WHERE ms.id = p_movimento_saida_id
    AND ms.tenant_id = p_tenant_id
    AND ms.empresa_id = p_empresa_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_ONDA_NAO_ENCONTRADA',
      'mensagem', 'Onda não encontrada nesta empresa.');
  END IF;

  IF v_ms.status NOT IN ('SEPARADO', 'EM_CONFERENCIA') THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_STATUS_ONDA',
      'mensagem', format('Onda #%s está %s e não pode ser conferida.', v_ms.numero_onda, v_ms.status));
  END IF;

  SELECT bool_or(ts.realiza_conferencia)
    INTO v_realiza
  FROM movimento_saida_documento msd
  JOIN documento_saida ds ON ds.id = msd.documento_saida_id
  JOIN tipo_saida ts      ON ts.id = ds.tipo_pedido_id
  WHERE msd.movimento_saida_id = v_ms.id AND msd.tenant_id = p_tenant_id;

  IF NOT COALESCE(v_realiza, false) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_SEM_CONFERENCIA',
      'mensagem', format('O tipo de saída da onda #%s não realiza conferência.', v_ms.numero_onda));
  END IF;

  SELECT COALESCE(ts_mov.reserva_conferencia_movimento, true)
    INTO v_reserva_mov
  FROM (SELECT 1) x
  LEFT JOIN tipo_saida ts_mov ON ts_mov.id = v_ms.tipo_saida;

  SELECT COUNT(*) INTO v_unidades FROM grupo_conferencia gc WHERE gc.movimento_saida_id = v_ms.id;

  IF v_reserva_mov AND v_unidades <= 1 THEN
    SELECT u.nome INTO v_outro_nome
    FROM movimento_saida_item msi
    JOIN tarefa t            ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt      ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.status = 'ATRIBUIDA'
    LEFT JOIN usuario u      ON u.id = ta.usuario_id
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO')
      AND ta.usuario_id <> p_usuario_id
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_ONDA_RESERVADA',
        'mensagem', format('Onda #%s já está em conferência com %s.', v_ms.numero_onda, COALESCE(v_outro_nome, 'outro operador')));
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.quantidade_requerida > COALESCE(t.quantidade_executada, 0)
      AND (
        t.status = 'CRIADA'
        OR (t.status IN ('ATRIBUIDA', 'EM_ANDAMENTO') AND (
              (v_reserva_mov AND v_unidades <= 1)
              OR EXISTS (SELECT 1 FROM tarefa_atribuicao ta WHERE ta.tarefa_id = t.id AND ta.usuario_id = p_usuario_id AND ta.status = 'ATRIBUIDA')
        ))
      )
  ) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_SEM_TAREFAS',
      'mensagem', format('Onda #%s não tem tarefas de conferência disponíveis para você.', v_ms.numero_onda));
  END IF;

  SELECT u.zona_atividade_separacao INTO v_zona_usuario
  FROM usuario u WHERE u.id = p_usuario_id AND u.tenant_id = p_tenant_id;

  IF v_zona_usuario IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = p_tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN endereco_zona_atividade eza
      ON eza.endereco_id = t.id_local_origem AND eza.tenant_id = p_tenant_id
    WHERE msi.movimento_saida_id = v_ms.id
      AND t.status IN ('CRIADA', 'ATRIBUIDA', 'EM_ANDAMENTO')
      AND eza.zona_atividade_id = v_zona_usuario
  ) THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_FORA_DA_ZONA',
      'mensagem', format('Onda #%s não tem itens na sua zona de atividade.', v_ms.numero_onda));
  END IF;

  v_docs_sem_nf := public.fn_conferencia_docs_sem_nf(p_tenant_id, v_ms.id);
  IF v_docs_sem_nf > 0 THEN
    RETURN jsonb_build_object('permitido', false, 'codigo', 'CONF_AGUARDANDO_NF',
      'mensagem', format('Onda #%s aguardando faturamento: %s pedido(s) sem NF autorizada.', v_ms.numero_onda, v_docs_sem_nf),
      'docs_sem_nf', v_docs_sem_nf);
  END IF;

  SELECT array_agg(rc.criterio::text ORDER BY rc.sequencia)
    INTO v_agrupamento
  FROM roteiro_saida_criterio rc
  WHERE rc.tenant_id = p_tenant_id AND rc.empresa_id = p_empresa_id AND rc.nivel = 'CONFERENCIA';

  RETURN jsonb_build_object('permitido', true, 'codigo', 'OK',
    'mensagem', 'Onda disponível para conferência.',
    'reserva_movimento', v_reserva_mov,
    'unidade_conferencia', CASE WHEN v_unidades > 1 THEN 'UNIDADE' ELSE 'ONDA' END,
    'unidades', v_unidades,
    'agrupamento_roteiro', to_jsonb(COALESCE(v_agrupamento, ARRAY[]::text[])));
END;
$function$;

-- ---------------------------------------------------------------------
-- 6. RPC: unidades de conferência de uma onda
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conferencia_buscar_unidades(p_tenant_id uuid, p_empresa_id uuid, p_movimento_saida_id uuid)
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
      'grupo_conferencia_id', gc.id,
      'sequencia', gc.sequencia,
      'criterios', to_jsonb(gc.criterios),
      'descricao', concat_ws(' · ',
                     CASE WHEN gc.grupo_separacao_id IS NOT NULL THEN 'Grupo de separação ' || gs.sequencia
                          WHEN 'GRUPO_SEPARACAO' = ANY (gc.criterios) THEN 'Sem grupo' END,
                     CASE WHEN gc.hu_id IS NOT NULL THEN 'HU ' || COALESCE(h.codigo_hu, gc.hu_id::text)
                          WHEN 'HU_VOLUME' = ANY (gc.criterios) THEN 'Sem HU' END),
      'grupo_separacao_id', gc.grupo_separacao_id,
      'hu_id', gc.hu_id,
      'tarefas', COUNT(t.id),
      'qtd_requerida', COALESCE(SUM(t.quantidade_requerida), 0),
      'qtd_conferida', COALESCE(SUM(t.quantidade_executada), 0),
      'situacao', CASE
          WHEN COUNT(t.id) FILTER (WHERE t.status NOT IN ('CONCLUIDA','CANCELADA')) = 0 THEN 'CONCLUIDA'
          WHEN bool_or(ta.id IS NOT NULL) THEN 'EM_CONFERENCIA'
          ELSE 'LIVRE' END,
      'conferentes', COALESCE(jsonb_agg(DISTINCT u.nome) FILTER (WHERE u.nome IS NOT NULL), '[]'::jsonb)
    ) AS x
    FROM grupo_conferencia gc
    LEFT JOIN grupo_separacao gs ON gs.id = gc.grupo_separacao_id
    LEFT JOIN hu h ON h.id = gc.hu_id
    LEFT JOIN tarefa t ON t.grupo_conferencia_id = gc.id AND t.status <> 'CANCELADA'
    LEFT JOIN tarefa_atribuicao ta ON ta.tarefa_id = t.id AND ta.liberado_em IS NULL
                                  AND t.status IN ('CRIADA','ATRIBUIDA','EM_ANDAMENTO','PAUSADA')
    LEFT JOIN usuario u ON u.id = ta.usuario_id
    WHERE gc.movimento_saida_id = p_movimento_saida_id AND gc.tenant_id = p_tenant_id
    GROUP BY gc.id, gs.sequencia, h.codigo_hu
  ) s;

  RETURN jsonb_build_object('sucesso', true, 'codigo', 'OK',
    'mensagem', CASE WHEN jsonb_array_length(v_lista) = 0 THEN 'Conferência pela onda inteira.'
                     ELSE jsonb_array_length(v_lista) || ' unidade(s) de conferência.' END,
    'dados', jsonb_build_object('unidade', CASE WHEN jsonb_array_length(v_lista) > 1 THEN 'UNIDADE' ELSE 'ONDA' END,
                                'unidades', v_lista));
END;
$$;
REVOKE ALL ON FUNCTION public.conferencia_buscar_unidades(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conferencia_buscar_unidades(uuid, uuid, uuid) TO authenticated, service_role;
