-- =====================================================================
-- Migration: 20261103180000_limpeza_total_onda_e_auditoria_cancelamento_tarefa
-- Data: 2026-11-03  (v2)
-- Objetivo:
--   1) Rastreabilidade de cancelamento em tarefa / tarefa_execucao
--      (cancelado_em / cancelado_por / cancelado_origem) via trigger.
--   2) Helper de status global da onda pós-limpeza.
--   3) separacao_limpar_item / separacao_conferencia_limpar_item revisadas:
--      - trava: separação não pode ser limpa se o item tem conferência ativa
--      - status global da onda recalculado (não só o item)
--      - corte da tarefa limpa é descontado de movimento_saida_item.qtde_cortada
--      - SEP-CONF do item cancelada na limpeza de separação (regerada depois)
--   4) RPCs separacao_limpar_total / separacao_conferencia_limpar_total.
--   5) fn_gerar_conferencia_saida: anti-duplicidade por item, ignorando
--      SEP-CONF canceladas.
--   6) fn_cancelar_onda_carregamento: ignora execuções CANCELADAS na trava
--      (viabiliza "limpar e depois cancelar").
-- =====================================================================

SET LOCAL lock_timeout = '5s';

-- ---------------------------------------------------------------------
-- 0. BACKUP das funções alteradas (padrão _bkp_AAAAMMDD do projeto)
-- ---------------------------------------------------------------------
DO $bkp$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('separacao_limpar_item', 'separacao_conferencia_limpar_item',
                        'fn_gerar_conferencia_saida', 'fn_cancelar_onda_carregamento')
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
                   WHERE n2.nspname = 'public' AND p2.proname = r.proname || '_bkp_20261103') THEN
      v_def := replace(pg_get_functiondef(r.oid),
                       'FUNCTION public.' || r.proname || '(',
                       'FUNCTION public.' || r.proname || '_bkp_20261103(');
      EXECUTE v_def;
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC, anon, authenticated', r.proname || '_bkp_20261103');
    END IF;
  END LOOP;
END
$bkp$;

-- ---------------------------------------------------------------------
-- 1. COLUNAS + TRIGGER DE AUDITORIA DE CANCELAMENTO
-- ---------------------------------------------------------------------
ALTER TABLE public.tarefa
  ADD COLUMN IF NOT EXISTS cancelado_em     timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por    uuid REFERENCES public.usuario(id),
  ADD COLUMN IF NOT EXISTS cancelado_origem text;

ALTER TABLE public.tarefa_execucao
  ADD COLUMN IF NOT EXISTS cancelado_em     timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por    uuid REFERENCES public.usuario(id),
  ADD COLUMN IF NOT EXISTS cancelado_origem text;

COMMENT ON COLUMN public.tarefa.cancelado_em     IS 'Momento em que a tarefa passou para CANCELADA (trigger).';
COMMENT ON COLUMN public.tarefa.cancelado_por    IS 'Usuário que cancelou (auth.uid() -> usuario.id; fallback app.usuario_id).';
COMMENT ON COLUMN public.tarefa.cancelado_origem IS 'Origem do cancelamento (app.cancelamento_origem; default USUARIO/SISTEMA).';
COMMENT ON COLUMN public.tarefa_execucao.cancelado_em     IS 'Momento em que a execução passou para CANCELADA (trigger).';
COMMENT ON COLUMN public.tarefa_execucao.cancelado_por    IS 'Usuário que cancelou a execução.';
COMMENT ON COLUMN public.tarefa_execucao.cancelado_origem IS 'Origem do cancelamento da execução.';

CREATE INDEX IF NOT EXISTS idx_tarefa_cancelado_em
  ON public.tarefa (tenant_id, cancelado_em) WHERE cancelado_em IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tarefa_execucao_cancelado_em
  ON public.tarefa_execucao (tenant_id, cancelado_em) WHERE cancelado_em IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_registrar_cancelamento_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status::text = 'CANCELADA'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'CANCELADA') THEN
    NEW.cancelado_em     := now();
    NEW.cancelado_por    := COALESCE(public.fn_audit_usuario_atual(), NEW.cancelado_por);
    NEW.cancelado_origem := COALESCE(
                              nullif(current_setting('app.cancelamento_origem', true), ''),
                              NEW.cancelado_origem,
                              CASE WHEN auth.uid() IS NULL THEN 'SISTEMA' ELSE 'USUARIO' END);
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.cancelado_em     := OLD.cancelado_em;
    NEW.cancelado_por    := OLD.cancelado_por;
    NEW.cancelado_origem := OLD.cancelado_origem;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tarefa_registrar_cancelamento ON public.tarefa;
CREATE TRIGGER trg_tarefa_registrar_cancelamento
  BEFORE INSERT OR UPDATE ON public.tarefa
  FOR EACH ROW EXECUTE FUNCTION public.tg_registrar_cancelamento_tarefa();

DROP TRIGGER IF EXISTS trg_tarefa_execucao_registrar_cancelamento ON public.tarefa_execucao;
CREATE TRIGGER trg_tarefa_execucao_registrar_cancelamento
  BEFORE INSERT OR UPDATE ON public.tarefa_execucao
  FOR EACH ROW EXECUTE FUNCTION public.tg_registrar_cancelamento_tarefa();

-- ---------------------------------------------------------------------
-- 2. HELPER: STATUS GLOBAL DA ONDA PÓS-LIMPEZA
--    SEP pendente + coleta ativa  -> EM_PICKING
--    SEP pendente + sem coleta    -> LIBERADO
--    SEP completa                 -> EM_CONFERENCIA
--    (nunca SEPARADO: evita reemitir saida.separacao_finalizada ao ERP)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._fn_mov_saida_status_pos_limpeza(
  p_tenant_id uuid, p_movimento_saida_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_atual    text;
  v_novo     text;
  v_sep_pend boolean;
  v_sep_exec boolean;
BEGIN
  SELECT status::text INTO v_atual
  FROM movimento_saida
  WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_atual IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND msi.tenant_id = p_tenant_id
      AND t.status NOT IN ('CONCLUIDA'::enum_status_tarefa, 'CANCELADA'::enum_status_tarefa)
  ) INTO v_sep_pend;

  IF v_sep_pend THEN
    SELECT EXISTS (
      SELECT 1
      FROM movimento_saida_item msi
      JOIN tarefa t           ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
      JOIN tipo_tarefa tt     ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
      JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.tenant_id = t.tenant_id
      WHERE msi.movimento_saida_id = p_movimento_saida_id
        AND msi.tenant_id = p_tenant_id
        AND t.status <> 'CANCELADA'::enum_status_tarefa
        AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
    ) INTO v_sep_exec;
    v_novo := CASE WHEN v_sep_exec THEN 'EM_PICKING' ELSE 'LIBERADO' END;
  ELSE
    v_novo := 'EM_CONFERENCIA';
  END IF;

  IF v_novo IS DISTINCT FROM v_atual THEN
    UPDATE movimento_saida
    SET status        = v_novo::enum_status_onda_carregamento,
        finalizado_em = CASE WHEN v_atual = 'CONCLUIDA' THEN NULL ELSE finalizado_em END
    WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN v_novo;
END;
$$;

REVOKE ALL ON FUNCTION public._fn_mov_saida_status_pos_limpeza(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3a. LIMPAR SEPARAÇÃO DO ITEM (revisada)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.separacao_limpar_item(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid,
  p_movimento_saida_id uuid, p_produto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_status                  text;
  v_status_final            text;
  v_movimento_saida_item_id uuid;
  v_armazem_id              uuid;
  v_endereco_cancelamento   uuid;
  r_exec                    record;
  v_total_estornos          int := 0;
  v_total_execucoes         int := 0;
  v_conf_canceladas         int := 0;
  v_corte_tarefas           numeric := 0;
  v_em_lote                 boolean := COALESCE(current_setting('logitrack.limpeza_total', true), '') = 'on';
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'TENANT_OBRIGATORIO',
      'mensagem', 'tenant_id é obrigatório.', 'dados', null);
  END IF;

  PERFORM set_config('app.usuario_id', p_usuario_id::text, true);
  IF COALESCE(current_setting('app.cancelamento_origem', true), '') = '' THEN
    PERFORM set_config('app.cancelamento_origem', 'LIMPEZA_SEPARACAO_ITEM', true);
  END IF;

  SELECT status::text INTO v_status
  FROM movimento_saida
  WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Movimento de saída não encontrado.', 'dados', null);
  END IF;

  IF v_status NOT IN ('SEPARADO', 'EM_PICKING', 'EM_CONFERENCIA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'LIMPEZA_NAO_PERMITIDA',
      'mensagem', format('Limpeza não permitida. Status atual do movimento: %s.', v_status),
      'dados', jsonb_build_object('status_atual', v_status));
  END IF;

  SELECT e.armazem_id INTO v_armazem_id
  FROM tarefa t
  JOIN movimento_saida_item msi ON msi.id = t.id_documento_origem
  JOIN endereco e ON e.id = t.id_local_origem
  LEFT JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
  WHERE msi.movimento_saida_id = p_movimento_saida_id
    AND tt.codigo = 'SEP' AND t.tenant_id = p_tenant_id
  LIMIT 1;

  IF v_armazem_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ARMAZEM_NAO_IDENTIFICADO',
      'mensagem', format('Não foi possível identificar o armazém do movimento %s. Verifique se existem tarefas de separação associadas.', p_movimento_saida_id),
      'dados', null);
  END IF;

  SELECT ac.endereco_cancelamento_id INTO v_endereco_cancelamento
  FROM armazem_config ac
  WHERE ac.armazem_id = v_armazem_id AND ac.tenant_id = p_tenant_id AND ac.ativo = true;

  IF v_endereco_cancelamento IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ENDERECO_CANCELAMENTO_NAO_CONFIGURADO',
      'mensagem', 'Endereço de cancelamento não configurado para este armazém. Configure em Parâmetros > Armazém.',
      'dados', null);
  END IF;

  SELECT id INTO v_movimento_saida_item_id
  FROM movimento_saida_item
  WHERE movimento_saida_id = p_movimento_saida_id
    AND produto_id = p_produto_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_movimento_saida_item_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ITEM_MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Item do movimento de saída não encontrado para o produto informado.',
      'dados', null);
  END IF;

  -- NOVO: trava — item com conferência ativa não pode ter a separação limpa
  IF EXISTS (
    SELECT 1
    FROM tarefa t
    JOIN tipo_tarefa tt     ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.tenant_id = t.tenant_id
    WHERE t.id_documento_origem = v_movimento_saida_item_id
      AND t.tenant_id = p_tenant_id
      AND t.status <> 'CANCELADA'::enum_status_tarefa
      AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
  ) THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'CONFERENCIA_EM_ANDAMENTO',
      'mensagem', 'Este item possui conferência registrada. Limpe a conferência antes de limpar a separação.',
      'dados', jsonb_build_object('produto_id', p_produto_id));
  END IF;

  -- NOVO: corte registrado nas tarefas SEP que serão zeradas
  SELECT COALESCE(SUM(COALESCE(t.quantidade_cortada, 0)), 0) INTO v_corte_tarefas
  FROM tarefa t
  JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
  WHERE t.id_documento_origem = v_movimento_saida_item_id
    AND t.produto_id = p_produto_id AND t.tenant_id = p_tenant_id;

  FOR r_exec IN
    SELECT DISTINCT
      te.id                 AS tarefa_execucao_id,
      te.tenant_id          AS tenant_id,
      em.produto_id         AS produto_id,
      em.quantidade         AS quantidade,
      em.endereco_origem_id AS endereco_origem_id,
      em.hu_id              AS hu_id,
      em.lote               AS lote,
      em.data_validade      AS data_validade,
      em.data_fabricacao    AS data_fabricacao
    FROM tarefa t
    JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.tenant_id = t.tenant_id
    LEFT JOIN estoque_movimento em ON em.tarefa_execucao_id = te.id AND em.tenant_id = p_tenant_id
    LEFT JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    WHERE t.id_documento_origem = v_movimento_saida_item_id
      AND t.produto_id = p_produto_id AND tt.codigo = 'SEP'
      AND t.tenant_id = p_tenant_id
      AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
  LOOP
    v_total_execucoes := v_total_execucoes + 1;

    IF r_exec.quantidade IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM estoque_movimento
        WHERE estorno_da_execucao_id = r_exec.tarefa_execucao_id
          AND tipo_movimento = 99 AND tenant_id = p_tenant_id
      ) THEN
        INSERT INTO estoque_movimento (
          tenant_id, empresa_id, produto_id, quantidade,
          endereco_destino_id, hu_id, lote, data_validade, data_fabricacao,
          tipo_movimento, usuario_id, tarefa_execucao_id, estorno_da_execucao_id
        ) VALUES (
          r_exec.tenant_id, p_empresa_id, r_exec.produto_id, r_exec.quantidade,
          v_endereco_cancelamento, r_exec.hu_id, r_exec.lote, r_exec.data_validade,
          r_exec.data_fabricacao, 99, p_usuario_id, NULL, r_exec.tarefa_execucao_id
        );

        INSERT INTO estoque_geral (
          id, tenant_id, empresa_id, produto_id, endereco_id, hu_id,
          lote, data_validade, data_fabricacao,
          quantidade_disponivel, quantidade_total, quantidade_bloqueada, atualizado_em
        ) VALUES (
          gen_random_uuid(), p_tenant_id, p_empresa_id, r_exec.produto_id,
          v_endereco_cancelamento, r_exec.hu_id, r_exec.lote, r_exec.data_validade,
          r_exec.data_fabricacao, r_exec.quantidade, r_exec.quantidade, 0, now()
        )
        ON CONFLICT (tenant_id, empresa_id, produto_id, endereco_id, hu_id, lote, data_validade, data_fabricacao)
        DO UPDATE SET
          quantidade_disponivel = estoque_geral.quantidade_disponivel + EXCLUDED.quantidade_disponivel,
          quantidade_total      = estoque_geral.quantidade_total + EXCLUDED.quantidade_total,
          atualizado_em         = now();

        v_total_estornos := v_total_estornos + 1;
      END IF;
    END IF;

    UPDATE tarefa_execucao
    SET status = 'CANCELADA'::enum_status_execucao_tarefa
    WHERE id = r_exec.tarefa_execucao_id AND tenant_id = r_exec.tenant_id;
  END LOOP;

  UPDATE tarefa t
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM tarefa_atribuicao ta
          WHERE ta.tarefa_id = t.id AND ta.tenant_id = p_tenant_id AND ta.status = 'ATRIBUIDA'
        ) THEN 'ATRIBUIDA'::enum_status_tarefa
        ELSE 'CRIADA'::enum_status_tarefa
      END,
      quantidade_executada = 0,
      quantidade_cortada   = 0
  WHERE id IN (
    SELECT t1.id FROM tarefa t1
    JOIN movimento_saida_item msi ON t1.id_documento_origem = msi.id
    LEFT JOIN tipo_tarefa tt ON t1.tipo_tarefa_id = tt.id
    WHERE tt.codigo = 'SEP' AND t1.produto_id = p_produto_id
      AND t1.tenant_id = p_tenant_id AND msi.movimento_saida_id = p_movimento_saida_id
  );

  -- NOVO: SEP-CONF do item (sem execução ativa) fica obsoleta -> cancelar.
  -- Será regerada por fn_gerar_conferencia_saida quando a onda voltar a SEPARADO.
  UPDATE tarefa_atribuicao ta
  SET status = 'CANCELADA', liberado_em = now()
  FROM tarefa t, tipo_tarefa tt
  WHERE ta.tarefa_id = t.id AND ta.tenant_id = p_tenant_id AND ta.liberado_em IS NULL
    AND tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    AND t.id_documento_origem = v_movimento_saida_item_id AND t.tenant_id = p_tenant_id
    AND t.status <> 'CANCELADA'::enum_status_tarefa;

  UPDATE tarefa t
  SET status = 'CANCELADA'::enum_status_tarefa
  FROM tipo_tarefa tt
  WHERE tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    AND t.id_documento_origem = v_movimento_saida_item_id
    AND t.tenant_id = p_tenant_id
    AND t.status <> 'CANCELADA'::enum_status_tarefa;
  GET DIAGNOSTICS v_conf_canceladas = ROW_COUNT;

  UPDATE movimento_saida_item
  SET status       = 'PENDENTE'::enum_status_item_onda,
      qtd_separada = 0,
      qtde_cortada = GREATEST(COALESCE(qtde_cortada, 0) - v_corte_tarefas, 0)
  WHERE id = v_movimento_saida_item_id AND tenant_id = p_tenant_id;

  -- NOVO: status global da onda (adiado quando chamado pela limpeza total)
  IF NOT v_em_lote THEN
    v_status_final := public._fn_mov_saida_status_pos_limpeza(p_tenant_id, p_movimento_saida_id);
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'ITEM_LIMPO',
    'mensagem', 'Separação do item limpa com sucesso.',
    'dados', jsonb_build_object(
      'movimento_saida_id', p_movimento_saida_id,
      'produto_id', p_produto_id,
      'total_execucoes_canceladas', v_total_execucoes,
      'total_estornos_estoque', v_total_estornos,
      'total_tarefas_conferencia_canceladas', v_conf_canceladas,
      'corte_removido', v_corte_tarefas,
      'status_movimento', v_status_final
    )
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('sucesso', false, 'codigo', 'ERRO_INTERNO',
    'mensagem', SQLERRM, 'dados', jsonb_build_object('detalhe', SQLSTATE));
END;
$$;

-- ---------------------------------------------------------------------
-- 3b. LIMPAR CONFERÊNCIA DO ITEM (revisada)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.separacao_conferencia_limpar_item(
  p_tenant_id uuid, p_movimento_saida_id uuid, p_produto_id uuid, p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_status                  text;
  v_status_final            text;
  r_exec                    record;
  v_movimento_saida_item_id uuid;
  v_total_execucoes         int := 0;
  v_em_lote                 boolean := COALESCE(current_setting('logitrack.limpeza_total', true), '') = 'on';
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  PERFORM set_config('app.usuario_id', p_usuario_id::text, true);
  IF COALESCE(current_setting('app.cancelamento_origem', true), '') = '' THEN
    PERFORM set_config('app.cancelamento_origem', 'LIMPEZA_CONFERENCIA_ITEM', true);
  END IF;

  SELECT status::text INTO v_status
  FROM movimento_saida
  WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Movimento de saída não encontrado.');
  END IF;

  IF v_status NOT IN ('EM_PICKING', 'SEPARADO', 'CONFERIDO', 'CONCLUIDA', 'EM_CONFERENCIA') THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'LIMPEZA_NAO_PERMITIDA',
      'mensagem', format('Limpeza não permitida. Status atual do movimento: %s.', v_status));
  END IF;

  SELECT id INTO v_movimento_saida_item_id
  FROM movimento_saida_item
  WHERE movimento_saida_id = p_movimento_saida_id
    AND produto_id = p_produto_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_movimento_saida_item_id IS NULL THEN
    RETURN jsonb_build_object('sucesso', false, 'codigo', 'ITEM_MOVIMENTO_NAO_ENCONTRADO',
      'mensagem', 'Item do movimento de saída não encontrado.');
  END IF;

  FOR r_exec IN
    SELECT DISTINCT te.id AS tarefa_execucao_id, t.tenant_id AS tenant_id
    FROM tarefa t
    JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.tenant_id = t.tenant_id
    LEFT JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id
    WHERE t.id_documento_origem = v_movimento_saida_item_id
      AND t.produto_id = p_produto_id AND tt.codigo = 'SEP-CONF'
      AND t.tenant_id = p_tenant_id
      AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
  LOOP
    v_total_execucoes := v_total_execucoes + 1;
    UPDATE tarefa_execucao
    SET status = 'CANCELADA'::enum_status_execucao_tarefa
    WHERE id = r_exec.tarefa_execucao_id AND tenant_id = r_exec.tenant_id;
  END LOOP;

  UPDATE tarefa t
  SET status = CASE
        WHEN EXISTS (
          SELECT 1 FROM tarefa_atribuicao ta
          WHERE ta.tarefa_id = t.id AND ta.tenant_id = p_tenant_id AND ta.status = 'ATRIBUIDA'
        ) THEN 'ATRIBUIDA'::enum_status_tarefa
        ELSE 'CRIADA'::enum_status_tarefa
      END,
      quantidade_executada = 0
  WHERE id IN (
    SELECT t1.id FROM tarefa t1
    JOIN movimento_saida_item msi ON t1.id_documento_origem = msi.id
    LEFT JOIN tipo_tarefa tt ON t1.tipo_tarefa_id = tt.id
    WHERE tt.codigo = 'SEP-CONF' AND t1.produto_id = p_produto_id
      AND t1.tenant_id = p_tenant_id AND msi.movimento_saida_id = p_movimento_saida_id
      AND t1.status <> 'CANCELADA'::enum_status_tarefa
  );

  -- Item volta para SEPARADO (separado, ainda não conferido)
  UPDATE movimento_saida_item
  SET status = 'SEPARADO'::enum_status_item_onda
  WHERE id = v_movimento_saida_item_id AND tenant_id = p_tenant_id;

  IF NOT v_em_lote THEN
    v_status_final := public._fn_mov_saida_status_pos_limpeza(p_tenant_id, p_movimento_saida_id);
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'LIMPEZA_CONCLUIDA',
    'mensagem', 'Conferência do item limpa com sucesso.',
    'dados', jsonb_build_object(
      'movimento_saida_id', p_movimento_saida_id,
      'produto_id', p_produto_id,
      'total_execucoes_canceladas', v_total_execucoes,
      'status_movimento', v_status_final
    )
  );
END;
$$;

-- ---------------------------------------------------------------------
-- 4a. LIMPAR SEPARAÇÃO TOTAL
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.separacao_limpar_total(
  p_tenant_id uuid, p_empresa_id uuid, p_usuario_id uuid, p_movimento_saida_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_status       text;
  v_status_final text;
  r_item         record;
  v_res          jsonb;
  v_itens        int := 0;
  v_execucoes    int := 0;
  v_estornos     int := 0;
  v_conf_cancel  int := 0;
  v_err_codigo   text;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  PERFORM set_config('app.usuario_id', p_usuario_id::text, true);
  PERFORM set_config('app.cancelamento_origem', 'LIMPEZA_SEPARACAO_TOTAL', true);
  PERFORM set_config('logitrack.limpeza_total', 'on', true);

  SELECT status::text INTO v_status
  FROM movimento_saida
  WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Movimento de saída não encontrado.' USING DETAIL = 'MOVIMENTO_NAO_ENCONTRADO';
  END IF;

  IF v_status NOT IN ('SEPARADO', 'EM_PICKING', 'EM_CONFERENCIA') THEN
    RAISE EXCEPTION 'Limpeza não permitida. Status atual do movimento: %.', v_status
      USING DETAIL = 'LIMPEZA_NAO_PERMITIDA';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM movimento_saida_item msi
    JOIN tarefa t           ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
    JOIN tipo_tarefa tt     ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    JOIN tarefa_execucao te ON te.tarefa_id = t.id AND te.tenant_id = t.tenant_id
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND msi.tenant_id = p_tenant_id
      AND t.status <> 'CANCELADA'::enum_status_tarefa
      AND te.status <> 'CANCELADA'::enum_status_execucao_tarefa
  ) THEN
    RAISE EXCEPTION 'Esta onda possui conferência registrada. Execute "Limpar Conferência Total" antes de limpar a separação.'
      USING DETAIL = 'CONFERENCIA_EM_ANDAMENTO';
  END IF;

  -- Somente itens com tarefa SEP ativa (preserva cortes feitos na liberação)
  FOR r_item IN
    SELECT DISTINCT msi.produto_id
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP'
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND msi.tenant_id = p_tenant_id
      AND msi.status <> 'CANCELADO'::enum_status_item_onda
      AND t.status <> 'CANCELADA'::enum_status_tarefa
    ORDER BY msi.produto_id
  LOOP
    v_res := public.separacao_limpar_item(
               p_tenant_id, p_empresa_id, p_usuario_id, p_movimento_saida_id, r_item.produto_id);

    IF NOT COALESCE((v_res->>'sucesso')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_res->>'mensagem', 'Falha ao limpar item.')
        USING DETAIL = COALESCE(v_res->>'codigo', 'ERRO_INTERNO');
    END IF;

    v_itens       := v_itens + 1;
    v_execucoes   := v_execucoes   + COALESCE((v_res->'dados'->>'total_execucoes_canceladas')::int, 0);
    v_estornos    := v_estornos    + COALESCE((v_res->'dados'->>'total_estornos_estoque')::int, 0);
    v_conf_cancel := v_conf_cancel + COALESCE((v_res->'dados'->>'total_tarefas_conferencia_canceladas')::int, 0);
  END LOOP;

  IF v_itens = 0 THEN
    RAISE EXCEPTION 'Nenhum item com separação encontrado nesta onda.' USING DETAIL = 'ITEM_MOVIMENTO_NAO_ENCONTRADO';
  END IF;

  v_status_final := public._fn_mov_saida_status_pos_limpeza(p_tenant_id, p_movimento_saida_id);
  PERFORM set_config('logitrack.limpeza_total', '', true);

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'SEPARACAO_TOTAL_LIMPA',
    'mensagem', format('Separação limpa: %s item(ns), %s execução(ões) cancelada(s), %s estorno(s) de estoque.',
                       v_itens, v_execucoes, v_estornos),
    'dados', jsonb_build_object(
      'movimento_saida_id', p_movimento_saida_id,
      'total_itens', v_itens,
      'total_execucoes_canceladas', v_execucoes,
      'total_estornos_estoque', v_estornos,
      'total_tarefas_conferencia_canceladas', v_conf_cancel,
      'status_movimento', v_status_final));

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_err_codigo = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('sucesso', false,
    'codigo', COALESCE(nullif(v_err_codigo, ''), 'ERRO_INTERNO'),
    'mensagem', SQLERRM, 'dados', jsonb_build_object('sqlstate', SQLSTATE));
END;
$$;

-- ---------------------------------------------------------------------
-- 4b. LIMPAR CONFERÊNCIA TOTAL
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.separacao_conferencia_limpar_total(
  p_tenant_id uuid, p_movimento_saida_id uuid, p_usuario_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_status       text;
  v_status_final text;
  r_item         record;
  v_res          jsonb;
  v_itens        int := 0;
  v_execucoes    int := 0;
  v_err_codigo   text;
BEGIN
  PERFORM public.assert_tenant_match(p_tenant_id);

  PERFORM set_config('app.usuario_id', p_usuario_id::text, true);
  PERFORM set_config('app.cancelamento_origem', 'LIMPEZA_CONFERENCIA_TOTAL', true);
  PERFORM set_config('logitrack.limpeza_total', 'on', true);

  SELECT status::text INTO v_status
  FROM movimento_saida
  WHERE id = p_movimento_saida_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Movimento de saída não encontrado.' USING DETAIL = 'MOVIMENTO_NAO_ENCONTRADO';
  END IF;

  IF v_status NOT IN ('EM_PICKING', 'SEPARADO', 'CONFERIDO', 'CONCLUIDA', 'EM_CONFERENCIA') THEN
    RAISE EXCEPTION 'Limpeza não permitida. Status atual do movimento: %.', v_status
      USING DETAIL = 'LIMPEZA_NAO_PERMITIDA';
  END IF;

  FOR r_item IN
    SELECT DISTINCT msi.produto_id
    FROM movimento_saida_item msi
    JOIN tarefa t       ON t.id_documento_origem = msi.id AND t.tenant_id = msi.tenant_id
    JOIN tipo_tarefa tt ON tt.id = t.tipo_tarefa_id AND tt.codigo = 'SEP-CONF'
    WHERE msi.movimento_saida_id = p_movimento_saida_id
      AND msi.tenant_id = p_tenant_id
      AND msi.status <> 'CANCELADO'::enum_status_item_onda
      AND t.status <> 'CANCELADA'::enum_status_tarefa
    ORDER BY msi.produto_id
  LOOP
    v_res := public.separacao_conferencia_limpar_item(
               p_tenant_id, p_movimento_saida_id, r_item.produto_id, p_usuario_id);

    IF NOT COALESCE((v_res->>'sucesso')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_res->>'mensagem', 'Falha ao limpar conferência do item.')
        USING DETAIL = COALESCE(v_res->>'codigo', 'ERRO_INTERNO');
    END IF;

    v_itens     := v_itens + 1;
    v_execucoes := v_execucoes + COALESCE((v_res->'dados'->>'total_execucoes_canceladas')::int, 0);
  END LOOP;

  IF v_itens = 0 THEN
    RAISE EXCEPTION 'Esta onda não possui tarefas de conferência para limpar.' USING DETAIL = 'CONFERENCIA_NAO_ENCONTRADA';
  END IF;

  v_status_final := public._fn_mov_saida_status_pos_limpeza(p_tenant_id, p_movimento_saida_id);
  PERFORM set_config('logitrack.limpeza_total', '', true);

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'CONFERENCIA_TOTAL_LIMPA',
    'mensagem', format('Conferência limpa: %s item(ns), %s execução(ões) cancelada(s).', v_itens, v_execucoes),
    'dados', jsonb_build_object(
      'movimento_saida_id', p_movimento_saida_id,
      'total_itens', v_itens,
      'total_execucoes_canceladas', v_execucoes,
      'status_movimento', v_status_final));

EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_err_codigo = PG_EXCEPTION_DETAIL;
  RETURN jsonb_build_object('sucesso', false,
    'codigo', COALESCE(nullif(v_err_codigo, ''), 'ERRO_INTERNO'),
    'mensagem', SQLERRM, 'dados', jsonb_build_object('sqlstate', SQLSTATE));
END;
$$;

REVOKE ALL ON FUNCTION public.separacao_limpar_total(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.separacao_limpar_total(uuid, uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.separacao_conferencia_limpar_total(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.separacao_conferencia_limpar_total(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------
-- 5. GERAÇÃO DE CONFERÊNCIA: anti-duplicidade por item, ignorando canceladas
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_gerar_conferencia_saida(p_movimento_saida_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tipo_tarefa_id uuid;
  v_empresa_id uuid;
  v_status text;
  v_total_criadas integer;
BEGIN
  PERFORM public.assert_tenant_access(p_tenant_id); -- seguranca 2026-10-12 L2

  -- 1. Lock do movimento
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

  -- 2. Buscar tipo tarefa conferência
  SELECT id INTO v_tipo_tarefa_id
  FROM tipo_tarefa
  WHERE codigo = 'SEP-CONF' AND tenant_id = p_tenant_id;

  IF v_tipo_tarefa_id IS NULL THEN
    RAISE EXCEPTION 'Tipo tarefa SEP-CONF não encontrado para o tenant.';
  END IF;

  -- 3+4. Criar SEP-CONF apenas para itens sem SEP-CONF ativa (canceladas são ignoradas)
  WITH inserted AS (
    INSERT INTO tarefa (
      id, tenant_id, empresa_id, tipo_tarefa_id,
      id_documento_origem, tipo_documento_origem,
      produto_id, quantidade_requerida, armazem_id,
      status, criado_em
    )
    SELECT
      gen_random_uuid(),
      msi.tenant_id,
      v_empresa_id,
      v_tipo_tarefa_id,
      msi.id,
      'MOVIMENTO_SAIDA_ITEM',
      msi.produto_id,
      SUM(t.quantidade_executada),
      (SELECT e.armazem_id FROM endereco e
       WHERE e.id = (array_agg(t.id_local_origem) FILTER (WHERE t.id_local_origem IS NOT NULL))[1]),
      'CRIADA',
      now()
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
        WHERE tc.id_documento_origem = msi.id
          AND tc.tenant_id = p_tenant_id
          AND tc.tipo_tarefa_id = v_tipo_tarefa_id
          AND tc.status <> 'CANCELADA'::enum_status_tarefa
      )
    GROUP BY msi.id, msi.tenant_id, msi.produto_id
    RETURNING id
  )
  SELECT COUNT(*) INTO v_total_criadas FROM inserted;

  IF v_total_criadas = 0 THEN
    RETURN jsonb_build_object('sucesso', true, 'codigo', 'JA_EXISTE',
      'mensagem', 'Tarefas de conferência já existem para este movimento.');
  END IF;

  RETURN jsonb_build_object(
    'sucesso', true,
    'codigo', 'CONFERENCIA_GERADA',
    'mensagem', v_total_criadas || ' tarefa(s) de conferência gerada(s).',
    'dados', jsonb_build_object(
      'movimento_saida_id', p_movimento_saida_id,
      'total_tarefas_criadas', v_total_criadas));
END;
$$;

-- ---------------------------------------------------------------------
-- 6. CANCELAR ONDA: execuções CANCELADAS (limpas) não bloqueiam
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_cancelar_onda_carregamento(p_movimento_saida_id uuid, p_tenant_id uuid)
RETURNS json
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
declare
    v_status text;
    v_existe_execucao boolean;
begin
    perform public.assert_tenant_access(p_tenant_id);
    perform set_config('app.cancelamento_origem', 'CANCELAR_ONDA', true);

    select status into v_status
    from movimento_saida
    where id = p_movimento_saida_id and tenant_id = p_tenant_id
    for update;

    if not found then
        return json_build_object('success', false, 'message', 'Onda não encontrada');
    end if;

    if v_status not in ('CRIADA', 'LIBERADO') then
        return json_build_object('success', false, 'message', 'A onda não pode ser cancelada neste status');
    end if;

    if v_status = 'LIBERADO' then
        select exists (
            select 1
            from tarefa_execucao te
            join tarefa t on t.id = te.tarefa_id
            where t.id_documento_origem in (
                select msi.id from movimento_saida_item msi
                where msi.movimento_saida_id = p_movimento_saida_id
            )
            and t.tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM'
            and te.tenant_id = p_tenant_id
            and te.status <> 'CANCELADA'::enum_status_execucao_tarefa
        ) into v_existe_execucao;

        if v_existe_execucao then
            return json_build_object('success', false,
                'message', 'Existem execuções em andamento. Tente limpar para cancelar o movimento');
        end if;
    end if;

    update tarefa
    set status = 'CANCELADA'
    where tenant_id = p_tenant_id
      and tipo_documento_origem = 'MOVIMENTO_SAIDA_ITEM'
      and status <> 'CANCELADA'
      and id_documento_origem in (
            select id from movimento_saida_item where movimento_saida_id = p_movimento_saida_id);

    update movimento_saida_item
    set status = 'CANCELADO'
    where tenant_id = p_tenant_id and movimento_saida_id = p_movimento_saida_id;

    update movimento_saida
    set status = 'CANCELADA'
    where id = p_movimento_saida_id and tenant_id = p_tenant_id;

    update documento_saida ds
    set status = 0
    where ds.id in (
        select msd.documento_saida_id from movimento_saida_documento msd
        where msd.movimento_saida_id = p_movimento_saida_id and msd.tenant_id = p_tenant_id)
    and ds.tenant_id = p_tenant_id;

    return json_build_object('success', true, 'message', 'Onda cancelada com sucesso');

exception
    when others then
        return json_build_object('success', false, 'message', 'Erro ao cancelar onda: ' || sqlerrm);
end;
$$;
